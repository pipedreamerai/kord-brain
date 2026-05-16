#!/usr/bin/env tsx
/**
 * Vision extraction CLI — Worktree A.
 *
 * Walks every PDF in src/lib/docs.ts (bid + DD), runs the Claude Opus 4.7
 * vision extractor against each page in parallel, populates
 * samples/derived/vision-cache/<sha>.<promptVersion>.<modelId>.json, and
 * writes samples/derived/vision-recall.md so Chris can audit hero-tag recall
 * without opening the JSON.
 *
 * Usage:
 *   pnpm tsx scripts/extract-bid-bboxes.ts                  # full run
 *   pnpm tsx scripts/extract-bid-bboxes.ts --force          # invalidate cache
 *   pnpm tsx scripts/extract-bid-bboxes.ts --only=bid_pid   # one doc, fast iteration
 *
 * Exit codes:
 *   0 — all docs extracted, hero-tag recall ≥ 50% on bid_pid
 *   1 — recall too low; iterate prompt before merging
 *   2 — hard error (env missing, file not found)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DOCS, type DocSlug } from '../src/lib/docs';
import { extractDoc, PROMPT_VERSION, VISION_MODEL_ID } from '../src/lib/ingestion/vision';
import type { VisionDocResult } from '../src/lib/ingestion/vision-types';

// Node 22+: load .env.local into process.env if present (mirrors `next dev`).
try {
  process.loadEnvFile('.env.local');
} catch {
  /* file optional; fall through to shell env */
}

const DEMO_DOCS_DIR = path.join(process.cwd(), 'demo_docs');
const REPORT_PATH = path.join(process.cwd(), 'samples', 'derived', 'vision-recall.md');

// Hero tags for the RO skid page of the bid P&ID. PLAN.md/CLAUDE.md say "page 4";
// empirical first-run extraction shows the RO skid is actually on page 3 (page 4 is
// UV + DI polishing). Source of truth = the extracted JSON, not the plan.
const HERO_TAGS_BID_PID: string[] = [
  'PU-01', 'PU-02',
  'RO-01', 'RO-02', 'RO-03', 'RO-04', 'RO-05', 'RO-06', 'RO-07', 'RO-08',
  'RO-09', 'RO-10', 'RO-11',
  'F-01', 'TK-01',
];
const HERO_PAGE_BID_PID = 3;

type DocSummary = {
  slug: DocSlug;
  filePath: string;
  displayName: string;
  pages: number;
  totalEntries: number;
  validEntries: number;
  uniqueTags: number;
  uniqueRawTags: number;
  failedPages: number;
  cached: boolean;
  durationMs: number;
};

function parseFlags(argv: string[]): { force: boolean; only: DocSlug | null } {
  let force = false;
  let only: DocSlug | null = null;
  for (const arg of argv.slice(2)) {
    if (arg === '--force') force = true;
    else if (arg.startsWith('--only=')) {
      const v = arg.slice('--only='.length);
      if (DOCS.some((d) => d.slug === v)) only = v as DocSlug;
      else {
        console.error(`Unknown slug: ${v}`);
        process.exit(2);
      }
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return { force, only };
}

function summarize(slug: DocSlug, filePath: string, displayName: string, result: VisionDocResult, durationMs: number, cached: boolean): DocSummary {
  const allEntries = result.pages.flatMap((p) => p.entries);
  const valid = allEntries.filter((e) => e.tag !== null);
  const uniqueTags = new Set(valid.map((e) => e.tag));
  const uniqueRaw = new Set(allEntries.map((e) => e.rawTag));
  const failedPages = result.pages.filter((p) => p.note === 'extraction-failed').length;
  return {
    slug,
    filePath,
    displayName,
    pages: result.pages.length,
    totalEntries: allEntries.length,
    validEntries: valid.length,
    uniqueTags: uniqueTags.size,
    uniqueRawTags: uniqueRaw.size,
    failedPages,
    cached,
    durationMs,
  };
}

function computeRecall(result: VisionDocResult, pageNumber: number, expected: string[]): { found: string[]; missing: string[]; recall: number } {
  const page = result.pages.find((p) => p.pageNumber === pageNumber);
  const foundSet = new Set<string>();
  if (page) {
    for (const e of page.entries) {
      const t = e.tag ?? e.rawTag;
      if (expected.includes(t)) foundSet.add(t);
    }
  }
  const found = expected.filter((t) => foundSet.has(t));
  const missing = expected.filter((t) => !foundSet.has(t));
  return { found, missing, recall: expected.length === 0 ? 1 : found.length / expected.length };
}

async function writeRecallReport(
  summaries: DocSummary[],
  bidPidRecall: { found: string[]; missing: string[]; recall: number } | null,
): Promise<void> {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  const lines: string[] = [];
  lines.push('# Vision extraction recall report');
  lines.push('');
  lines.push(`- Model: \`${VISION_MODEL_ID}\``);
  lines.push(`- Prompt version: \`${PROMPT_VERSION}\``);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Per-doc summary');
  lines.push('');
  lines.push('| Slug | Doc | Pages | Tags found | Valid (isTag) | Unique | Failed pages | Cached | Time (s) |');
  lines.push('|---|---|---:|---:|---:|---:|---:|:---:|---:|');
  for (const s of summaries) {
    lines.push(
      `| \`${s.slug}\` | ${s.displayName} | ${s.pages} | ${s.totalEntries} | ${s.validEntries} | ${s.uniqueTags} | ${s.failedPages} | ${s.cached ? '✓' : ''} | ${(s.durationMs / 1000).toFixed(1)} |`,
    );
  }
  lines.push('');
  if (bidPidRecall) {
    lines.push(`## Hero-tag recall (Bid P&ID, page ${HERO_PAGE_BID_PID})`);
    lines.push('');
    lines.push(`Expected: ${HERO_TAGS_BID_PID.length} tags. Found: ${bidPidRecall.found.length}. Recall: **${Math.round(bidPidRecall.recall * 100)}%**.`);
    lines.push('');
    lines.push('| Tag | Found? |');
    lines.push('|---|:---:|');
    for (const t of HERO_TAGS_BID_PID) {
      lines.push(`| \`${t}\` | ${bidPidRecall.found.includes(t) ? '✓' : '✗'} |`);
    }
    lines.push('');
    if (bidPidRecall.missing.length > 0) {
      lines.push(`Misses: ${bidPidRecall.missing.map((t) => `\`${t}\``).join(', ')}.`);
      lines.push('');
    }
  }
  await writeFile(REPORT_PATH, lines.join('\n'));
}

async function main(): Promise<void> {
  const { force, only } = parseFlags(process.argv);

  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error('AI_GATEWAY_API_KEY not set. Run `vercel env pull` first.');
    process.exit(2);
  }

  const pdfDocs = DOCS.filter((d) => d.kind === 'pdf' && (!only || d.slug === only));
  if (pdfDocs.length === 0) {
    console.error('No PDFs to extract.');
    process.exit(2);
  }

  console.log(`Vision pipeline — ${pdfDocs.length} doc(s), model=${VISION_MODEL_ID}, prompt=${PROMPT_VERSION}${force ? ', --force' : ''}`);

  const summaries: DocSummary[] = [];
  let bidPidResult: VisionDocResult | null = null;

  for (const d of pdfDocs) {
    const abs = path.join(DEMO_DOCS_DIR, d.filePath);
    const t0 = Date.now();
    process.stdout.write(`  ${d.slug.padEnd(20)} ${d.displayName} ... `);
    let result: VisionDocResult;
    try {
      result = await extractDoc(abs, d.slug, { force });
    } catch (err) {
      console.error(`\n  ✗ ${d.slug}: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    }
    const durationMs = Date.now() - t0;
    const cached = durationMs < 250; // heuristic: a cache HIT is instant
    process.stdout.write(`${result.pages.length} pages, ${result.pages.flatMap((p) => p.entries).length} entries${cached ? ' [cached]' : ''} (${(durationMs / 1000).toFixed(1)}s)\n`);
    summaries.push(summarize(d.slug, d.filePath, d.displayName, result, durationMs, cached));
    if (d.slug === 'bid_pid') bidPidResult = result;
  }

  let bidPidRecall: ReturnType<typeof computeRecall> | null = null;
  if (bidPidResult) {
    bidPidRecall = computeRecall(bidPidResult, HERO_PAGE_BID_PID, HERO_TAGS_BID_PID);
    console.log('');
    console.log(`Hero-tag recall (bid_pid p${HERO_PAGE_BID_PID}): ${bidPidRecall.found.length}/${HERO_TAGS_BID_PID.length} (${Math.round(bidPidRecall.recall * 100)}%)`);
    if (bidPidRecall.missing.length > 0) {
      console.log(`  misses: ${bidPidRecall.missing.join(', ')}`);
    }
  }

  await writeRecallReport(summaries, bidPidRecall);
  console.log('');
  console.log(`Report: ${path.relative(process.cwd(), REPORT_PATH)}`);

  if (bidPidRecall && bidPidRecall.recall < 0.5) {
    console.log('');
    console.log('❌ RECALL TOO LOW — iterate prompt before merging.');
    process.exit(1);
  }
  console.log('');
  console.log('✅ Vision extraction complete.');

  // Verify whitelist coverage: warn if we returned any rawTags that look like real tags but failed isTag().
  const orphans = new Set<string>();
  for (const d of pdfDocs) {
    const abs = path.join(DEMO_DOCS_DIR, d.filePath);
    // Re-read from cache for the orphan scan (no extra LLM cost).
    try {
      const result = await extractDoc(abs, d.slug, { force: false });
      for (const p of result.pages) {
        for (const e of p.entries) {
          if (!e.tag && /^[A-Z]{1,4}[/-]/.test(e.rawTag)) orphans.add(e.rawTag);
        }
      }
    } catch {
      /* already reported above */
    }
  }
  if (orphans.size > 0) {
    console.log('');
    console.log(`ℹ️  ${orphans.size} rawTags didn't match TAGS.md but look real: ${Array.from(orphans).slice(0, 12).join(', ')}${orphans.size > 12 ? ', …' : ''}`);
    console.log('   Consider auditing — these may be missing tags in src/lib/tags.ts.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
