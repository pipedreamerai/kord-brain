/**
 * Per-page Claude vision extraction via Vercel AI Gateway.
 *
 * Replaces the previous Tesseract OCR path for raster engineering drawings.
 * The sidecar (services/pdf-extractor/) renders each page to JPEG; this module
 * sends one JPEG to Claude and gets back a typed list of engineering tags.
 */

import { gateway } from '@ai-sdk/gateway';
import { generateObject } from 'ai';
import { z } from 'zod';

const DEFAULT_MODEL = process.env.KORD_VISION_MODEL ?? 'anthropic/claude-sonnet-4-6';

const TAG_KIND = z.enum([
  'instrument',
  'valve',
  'pump',
  'vessel',
  'filter',
  'heat_exchanger',
  'piping_spec',
  'equipment',
  'other',
]);
export type TagKind = z.infer<typeof TAG_KIND>;

const TagSchema = z.object({
  tag: z
    .string()
    .min(1)
    .describe(
      'Engineering tag exactly as printed on the page. Original casing. ' +
        'Examples: "HV-201", "AE/TE-301", "FH-200", "CF-200/201".',
    ),
  kind: TAG_KIND.describe('Best-guess category for this tag.'),
  description: z
    .string()
    .optional()
    .describe(
      'If the page also shows a spec block, callout, or descriptive label for ' +
        'this tag (e.g. a key/legend, an equipment list at the bottom of the ' +
        'sheet, a sidebar note), copy the printed text verbatim into this field. ' +
        'Include sizes, materials, pressure/flow ratings, codes, and what the ' +
        'tag is. Omit if the page shows only the symbol with no surrounding ' +
        'description. Never invent text that is not visible on the page.',
    ),
});

const PageSchema = z.object({
  title: z
    .string()
    .optional()
    .describe('Title block / sheet name if visible (e.g. "Process and Instrumentation Diagram").'),
  summary: z
    .string()
    .describe(
      '1-2 sentence summary of what this page depicts. ' +
        'Name the dominant equipment and the process flow.',
    ),
  tags: z.array(TagSchema).describe('Every engineering tag visible on the page.'),
});

export type VisionPageResult = {
  page: number;
  title?: string;
  summary: string;
  tags: { tag: string; kind: TagKind; description?: string }[];
};

const SYSTEM_PROMPT = `You read engineering drawings: P&IDs, GA drawings, instrument lists, RFQs.

Your job is to extract every visible engineering tag from one page. An engineering tag is a short alphanumeric identifier that names a piece of equipment, instrument, valve, pump, vessel, or piping run. Tags typically follow a pattern like a 1-5 letter prefix, a dash, and 1-4 digits with an optional trailing letter:
- Instrument balloons (small circles with text): HV-201, PI-203, AE/TE-301, FT-101A
- Equipment tags (boxes/symbols with text): FH-200, CF-200/201, P-501A, RO-301
- Pump/vessel/exchanger tags: PU-03, V-101, E-202

Rules:
- Use the original casing exactly as printed. Do NOT normalize "hv-201" to "HV-201" yourself.
- If a tag spans two characters separated by a slash like "AE/TE-301", keep the slash.
- Skip line specs like \`3" PVC\`, \`1-1/2" FPT\`, \`SCH 80\` — those are piping specifications, not tags.
- Skip note callouts like "NOTE 4", revision letters, sheet numbers, scale labels.
- Skip the title block (company name, drawing number, sheet X of Y).
- If a tag is partially obscured or ambiguous, return your best guess.
- Tags can appear multiple times on a page; return each unique tag once.

For \`kind\`, pick the closest category. When unsure, use \`other\`.

For \`description\`, look around the page for blocks of text that describe a tag — equipment lists or spec blocks at the bottom of the sheet, callouts next to a balloon, sidebar notes, legend entries. When you find one, copy the printed text verbatim into the \`description\` of the matching tag. Include sizes, materials, pressure or flow ratings, code references, and a short phrase that names what the tag is. Example: for FH-200 on a P&ID with a spec block reading "FH-200 / PRE-TREATMENT CARTRIDGE FILTER / SIZE: 21RND x 30" / CARTRIDGE CODE: F(DOE) / PRESSURE RATING: 125 PSIG NON-CODE / RATING: 5.0 MICRON / MATERIALS: 316L SS", the description should reproduce those lines. If a tag has no nearby descriptive text, omit \`description\` — do NOT invent specs.

For \`summary\`, write 1-2 sentences naming the dominant equipment and the process flow. Example: "Pre-treatment cartridge filter (FH-200) feeding two carbon filters (CF-200/201) in series, processing 107 GPM softened water from a heat exchanger toward an RO unit."`;

export async function extractPageWithVision(args: {
  pageNumber: number;
  imageB64: string;
  imageMime: string;
  filename: string;
  totalPages: number;
}): Promise<VisionPageResult> {
  const { pageNumber, imageB64, imageMime, filename, totalPages } = args;

  const { object } = await generateObject({
    model: gateway(DEFAULT_MODEL),
    schema: PageSchema,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `File: ${filename}, page ${pageNumber} of ${totalPages}. Extract every engineering tag visible on this page.`,
          },
          {
            type: 'image',
            image: imageB64,
            mediaType: imageMime,
          },
        ],
      },
    ],
    maxRetries: 2,
  });

  return {
    page: pageNumber,
    title: object.title,
    summary: object.summary,
    tags: object.tags,
  };
}
