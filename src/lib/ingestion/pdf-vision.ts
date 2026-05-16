import { gateway } from '@ai-sdk/gateway';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { isLikelyTag } from '../tagRegex';

const VISION_MODEL =
  process.env.KORD_PDF_VISION_MODEL ?? 'anthropic/claude-sonnet-4.6';

// Claude's PDF document block tops out at 32 MB. Bigger PDFs would need
// page-by-page rasterization; we don't have anything that large yet.
const MAX_PDF_BYTES = 32 * 1024 * 1024;

const ResponseSchema = z.object({
  tags: z.array(
    z.object({
      name: z
        .string()
        .describe(
          'The exact tag as written on the drawing, uppercase. Examples: "M-101", "P-501A", "AE/TE-301", "MCC-1", "J-BOX"',
        ),
      page: z.number().int().min(1).describe('1-indexed page number'),
    }),
  ),
});

const SYSTEM_PROMPT = `You read engineering drawings (P&IDs, GAs, instrument lists, electrical schematics) and extract every instrument and equipment tag you can see.

A "tag" is a short alphanumeric label that identifies a physical component or instrument. The shape is: 1–5 uppercase letters (optionally a slashed prefix like AE/TE), a dash, then either 1–4 digits with an optional trailing letter (e.g. 501A) OR letters (e.g. J-BOX).

Examples by category:
- Pumps / fans / blowers: P-101, P-501A
- Motors: M-101
- Vessels / tanks / drums: T-101, V-202, D-303
- Heat exchangers / coolers / heaters: E-101, H-202
- Instruments (level / pressure / temp / flow / analyzer): LSL-201, PT-301, AE/TE-301, FT-401, IR-2
- Control valves / shutoffs: CV-301, SV-402, XV-501
- Electrical gear: MCC-1, CB-101, J-BOX, RO-308

Rules:
- Return tags exactly as written. Do not normalize "P 101" to "P-101" if you can't see the dash.
- Do not invent tags. If you are not sure you can read it, omit it.
- Report each tag once per page it appears on. If a tag appears on multiple pages, return one entry per page.
- Skip drawing numbers, sheet numbers, revision codes, and title-block metadata.
- Skip pipe line numbers like "4"-CS-101-AB" unless they clearly identify a tagged component.
- Be exhaustive — engineering drawings often have 50–200 tags per page. Do not stop early.`;

export type PdfVisionResult = {
  tags: string[];
  /** Per-page tag list, useful once we plumb bboxes. */
  byPage: Record<number, string[]>;
  /** How many raw items the model returned before regex filtering. */
  rawCount: number;
  model: string;
};

export async function extractPdfTagsWithVision(
  buf: Buffer,
  opts: { filename?: string } = {},
): Promise<PdfVisionResult> {
  if (buf.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `PDF too large for vision extraction: ${buf.byteLength} bytes (limit ${MAX_PDF_BYTES})`,
    );
  }

  const userPrompt = opts.filename
    ? `Extract every instrument and equipment tag from "${opts.filename}". Cover every page.`
    : 'Extract every instrument and equipment tag from this drawing. Cover every page.';

  let object: z.infer<typeof ResponseSchema>;
  try {
    const result = await generateObject({
      model: gateway(VISION_MODEL),
      schema: ResponseSchema,
      system: SYSTEM_PROMPT,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: buf,
              mediaType: 'application/pdf',
              filename: opts.filename,
            },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
    });
    object = result.object;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      throw new Error(`vision returned no object: ${err.message}`);
    }
    throw err;
  }

  const byPage: Record<number, Set<string>> = {};
  const tagSet = new Set<string>();
  for (const item of object.tags) {
    const name = item.name.trim().toUpperCase();
    if (!isLikelyTag(name)) continue;
    tagSet.add(name);
    (byPage[item.page] ??= new Set()).add(name);
  }

  return {
    tags: [...tagSet].sort(),
    byPage: Object.fromEntries(
      Object.entries(byPage).map(([p, s]) => [Number(p), [...s].sort()]),
    ),
    rawCount: object.tags.length,
    model: VISION_MODEL,
  };
}
