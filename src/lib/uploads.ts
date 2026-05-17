import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  loadPdf,
  type PdfPageInfo,
  type PdfPageEvent,
  type PdfTagLocations,
} from './ingestion/pdf';
import type { TagKind } from './ingestion/vision-extractor';
import { loadDocx } from './ingestion/docx';
import { loadXlsx, type XlsxSheet, type XlsxTagRow } from './ingestion/xlsx';
import * as gbrain from './gbrain';
import { tagToSlug } from './tagRegex';

export type UploadKind = 'pdf' | 'docx' | 'xlsx';

export type UploadPdfPayload = {
  kind: 'pdf';
  pages: PdfPageInfo[];
  tagLocations: PdfTagLocations;
  kindsByTag?: Record<string, TagKind>;
  descriptionsByTag?: Record<string, string>;
  summaryByPage?: Record<number, string>;
};
export type UploadDocxPayload = {
  kind: 'docx';
  html: string;
  text: string;
};
export type UploadXlsxPayload = {
  kind: 'xlsx';
  sheets: XlsxSheet[];
  tagRows: XlsxTagRow[];
};
export type UploadPayload = UploadPdfPayload | UploadDocxPayload | UploadXlsxPayload;

export type UploadedDoc = {
  slug: string;
  filename: string;
  displayName: string;
  kind: UploadKind;
  uploadedAt: number;
  bytes: number;
  tags: string[];
  payload: UploadPayload;
};

/**
 * Progress events emitted as `ingestUpload` runs. The route handler forwards
 * each event to the client over NDJSON so the upload progress feed can show
 * what's happening live.
 *
 * `gbrain-tag` events use cumulative counts that grow as pages stream in
 * (vision runs in parallel; `of` is the running total of distinct tags seen
 * so far). The UI's fraction will occasionally tick down when a new page
 * adds many fresh tags — that's expected with parallel discovery.
 */
export type IngestProgress =
  | { type: 'parse-start'; filename: string; kind: UploadKind }
  | { type: 'page-vision'; filename: string; page: number; tags: string[]; summary: string; source: PdfPageEvent['source'] }
  | { type: 'gbrain-doc'; filename: string; slug: string }
  | { type: 'gbrain-tag'; filename: string; tag: string; tagSlug: string; i: number; of: number }
  | { type: 'parsed'; filename: string; tags: string[]; pageCount?: number };

type ProgressFn = (ev: IngestProgress) => void;

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const META_FILE = path.join(UPLOADS_DIR, '.meta.json');

type MetaFile = {
  docs: Array<{
    slug: string;
    filename: string;
    displayName: string;
    kind: UploadKind;
    uploadedAt: number;
    bytes: number;
    tags: string[];
  }>;
};

let cache: Map<string, UploadedDoc> | null = null;
let cacheLoaded = false;

async function ensureDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

async function loadMeta(): Promise<MetaFile> {
  try {
    const raw = await readFile(META_FILE, 'utf8');
    return JSON.parse(raw) as MetaFile;
  } catch {
    return { docs: [] };
  }
}

async function saveMeta(meta: MetaFile) {
  await writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

function kindFromFilename(filename: string): UploadKind | null {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx') return 'xlsx';
  return null;
}

function slugFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'doc';
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = await getAllDocs();
  const used = new Set(existing.map((d) => d.slug));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function parseFile(
  kind: UploadKind,
  buf: Buffer,
  filename: string,
  opts: {
    onPageDone?: (ev: PdfPageEvent) => void | Promise<void>;
    /** Skip vision for cache-reload paths so server restart doesn't re-pay
     *  Claude vision for every cached PDF. Tags survive in meta.json. */
    skipVision?: boolean;
  } = {},
): Promise<{ payload: UploadPayload; tags: string[] }> {
  if (kind === 'pdf') {
    const info = await loadPdf(buf, {
      filename,
      onPageDone: opts.onPageDone,
      skipVision: opts.skipVision,
    });
    return {
      payload: {
        kind: 'pdf',
        pages: info.pages,
        tagLocations: info.tagLocations,
        kindsByTag: info.kindsByTag,
        descriptionsByTag: info.descriptionsByTag,
        summaryByPage: info.summaryByPage,
      },
      tags: info.tags,
    };
  }
  if (kind === 'docx') {
    const info = await loadDocx(buf);
    return { payload: { kind: 'docx', html: info.html, text: info.text }, tags: info.tags };
  }
  const info = await loadXlsx(buf);
  return { payload: { kind: 'xlsx', sheets: info.sheets, tagRows: info.tagRows }, tags: info.tags };
}

function buildDocMarkdown(
  displayName: string,
  kind: UploadKind,
  tags: string[],
  summaryByPage: Record<number, string> = {},
): string {
  const tagList = tags.map((t) => `- [[${tagToSlug(t)}]] — ${t}`).join('\n');
  const pageNums = Object.keys(summaryByPage)
    .map((n) => parseInt(n, 10))
    .filter((n) => !Number.isNaN(n) && summaryByPage[n])
    .sort((a, b) => a - b);
  const pageSummaries = pageNums.map((n) => `### Page ${n}\n\n${summaryByPage[n]}`).join('\n\n');
  return `---
title: ${displayName}
type: document
kind: ${kind}
---

# ${displayName}

Uploaded ${kind.toUpperCase()} document.

${pageSummaries ? `## Page summaries\n\n${pageSummaries}\n\n` : ''}## Tags

${tagList || '_no tags detected_'}
`;
}

function buildTagMarkdown(
  tag: string,
  mentionedBy: string[],
  tagKind?: TagKind,
  description?: string,
): string {
  const list = mentionedBy.map((m) => `- [[${m}]]`).join('\n');
  const descSection = description?.trim()
    ? `\n## Description\n\n${description.trim()}\n`
    : '';
  return `---
title: ${tag}
type: tag
${tagKind ? `tag_kind: ${tagKind}\n` : ''}---

# ${tag}

${tagKind ? `Engineering tag (${tagKind.replace(/_/g, ' ')}) discovered in uploaded documents.` : 'Engineering tag discovered in uploaded documents.'}
${descSection}
## Mentioned in

${list || '_no documents_'}
`;
}

async function upsertTagPage(
  docSlug: string,
  tag: string,
  tagKind: TagKind | undefined,
  description?: string,
): Promise<void> {
  const tagSlug = tagToSlug(tag);
  let mentions: string[] = [];
  let existingDescription: string | undefined;
  const existing = await gbrain.getPage(tagSlug);
  if (existing) {
    const m = existing.markdown.match(/## Mentioned in\n+([\s\S]*)$/);
    if (m) {
      mentions = [...m[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[1]);
    }
    const d = existing.markdown.match(/## Description\n+([\s\S]*?)\n+## /);
    if (d) existingDescription = d[1].trim();
  }
  if (!mentions.includes(docSlug)) mentions.push(docSlug);
  // Keep an existing description if the current page didn't surface one.
  const finalDescription = description ?? existingDescription;
  await gbrain.putPage(
    tagSlug,
    buildTagMarkdown(tag, mentions, tagKind, finalDescription),
  );
  await gbrain.link(docSlug, tagSlug, 'mentions');
}

async function writeDocPage(
  slug: string,
  displayName: string,
  kind: UploadKind,
  tags: string[],
  summaryByPage: Record<number, string>,
): Promise<void> {
  await gbrain.putPage(slug, buildDocMarkdown(displayName, kind, tags, summaryByPage));
}

export async function loadCache(): Promise<Map<string, UploadedDoc>> {
  if (cacheLoaded && cache) return cache;
  await ensureDir();
  const meta = await loadMeta();
  cache = new Map();
  for (const entry of meta.docs) {
    try {
      const buf = await readFile(path.join(UPLOADS_DIR, entry.filename));
      // skipVision: vision was already paid for at upload time; tags survive
      // in meta.json. Server restart should not re-trigger Claude vision.
      const { payload } = await parseFile(entry.kind, buf, entry.filename, {
        skipVision: true,
      });
      cache.set(entry.slug, { ...entry, payload });
    } catch {
      // Stale meta entry — skip.
    }
  }
  cacheLoaded = true;
  return cache;
}

export async function getAllDocs(): Promise<UploadedDoc[]> {
  const c = await loadCache();
  return [...c.values()].sort((a, b) => a.uploadedAt - b.uploadedAt);
}

export async function ingestUpload(
  filename: string,
  buf: Buffer,
  onProgress?: ProgressFn,
): Promise<UploadedDoc> {
  const kind = kindFromFilename(filename);
  if (!kind) throw new Error(`Unsupported file type: ${filename}`);

  await ensureDir();
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  await writeFile(path.join(UPLOADS_DIR, safeName), buf);

  const baseSlug = slugFromFilename(safeName);
  const slug = await uniqueSlug(baseSlug);

  onProgress?.({ type: 'parse-start', filename, kind });

  // Incremental gbrain push: as each page returns, push its tags into gbrain
  // BEFORE the next page does, so the client's graph view animates as Claude
  // works. Vision calls run in parallel (Promise.all in pdf.ts); the gbrain
  // pushes serialise via a promise chain so concurrent same-slug writes don't
  // race each other.
  const seenTags = new Set<string>();
  const summaryByPage: Record<number, string> = {};
  const kindsByTag: Record<string, TagKind> = {};
  const descriptionsByTag: Record<string, string> = {};
  let docWritten = false;
  let cumulativePushed = 0;
  let pushQueue: Promise<unknown> = Promise.resolve();

  const internalOnPageDone = (ev: PdfPageEvent): Promise<void> => {
    const stash = ev as PdfPageEvent & {
      kinds?: Record<string, TagKind>;
      descriptions?: Record<string, string>;
    };
    const pageKinds = stash.kinds ?? {};
    const pageDescriptions = stash.descriptions ?? {};
    // Accumulate state synchronously so the queued work uses the latest set.
    summaryByPage[ev.page] = ev.summary;
    for (const t of ev.tags) {
      seenTags.add(t);
      if (pageKinds[t] && !kindsByTag[t]) kindsByTag[t] = pageKinds[t];
      if (pageDescriptions[t] && !descriptionsByTag[t]) {
        descriptionsByTag[t] = pageDescriptions[t];
      }
    }
    onProgress?.({
      type: 'page-vision',
      filename,
      page: ev.page,
      tags: ev.tags,
      summary: ev.summary,
      source: ev.source,
    });
    pushQueue = pushQueue.then(async () => {
      await writeDocPage(slug, filename, kind, [...seenTags], summaryByPage);
      if (!docWritten) {
        onProgress?.({ type: 'gbrain-doc', filename, slug });
        docWritten = true;
      }
      for (const t of ev.tags) {
        const tagSlug = tagToSlug(t);
        cumulativePushed += 1;
        onProgress?.({
          type: 'gbrain-tag',
          filename,
          tag: t,
          tagSlug,
          i: cumulativePushed,
          of: seenTags.size,
        });
        await upsertTagPage(slug, t, kindsByTag[t], descriptionsByTag[t]);
      }
    });
    return pushQueue as Promise<void>;
  };

  const { payload, tags } = await parseFile(kind, buf, filename, {
    onPageDone: internalOnPageDone,
  });

  // Belt-and-suspenders: DOCX/XLSX (and PDFs whose every page failed vision)
  // don't fire onPageDone, so make sure the doc page and any remaining tags
  // land in gbrain regardless.
  if (!docWritten) {
    await writeDocPage(slug, filename, kind, tags, summaryByPage);
    onProgress?.({ type: 'gbrain-doc', filename, slug });
    docWritten = true;
  }
  const total = tags.length;
  for (let i = 0; i < total; i++) {
    const t = tags[i];
    if (seenTags.has(t)) continue;
    seenTags.add(t);
    const tagSlug = tagToSlug(t);
    cumulativePushed += 1;
    onProgress?.({
      type: 'gbrain-tag',
      filename,
      tag: t,
      tagSlug,
      i: cumulativePushed,
      of: total,
    });
    await upsertTagPage(slug, t, kindsByTag[t], descriptionsByTag[t]);
  }

  // Final doc-page rewrite so it carries the complete tag set + summaries.
  await writeDocPage(slug, filename, kind, tags, summaryByPage);

  const pageCount =
    payload.kind === 'pdf'
      ? payload.pages.length
      : payload.kind === 'xlsx'
        ? payload.sheets.length
        : undefined;
  onProgress?.({ type: 'parsed', filename, tags, pageCount });

  const doc: UploadedDoc = {
    slug,
    filename: safeName,
    displayName: filename,
    kind,
    uploadedAt: Date.now(),
    bytes: buf.byteLength,
    tags,
    payload,
  };

  const c = await loadCache();
  c.set(slug, doc);
  const meta = await loadMeta();
  meta.docs = [...c.values()].map(({ payload: _payload, ...rest }) => rest);
  await saveMeta(meta);

  return doc;
}

export type TagIndexEntry = { docSlug: string; displayName: string; kind: UploadKind };
export type TagIndex = Record<string, TagIndexEntry[]>;

export async function getTagIndex(): Promise<TagIndex> {
  const docs = await getAllDocs();
  const index: TagIndex = {};
  for (const d of docs) {
    for (const t of d.tags) {
      (index[t] ??= []).push({ docSlug: d.slug, displayName: d.displayName, kind: d.kind });
    }
  }
  return index;
}

export async function readUploadedFile(filename: string): Promise<Buffer> {
  return readFile(path.join(UPLOADS_DIR, filename));
}

export async function deleteUpload(slug: string): Promise<void> {
  const c = await loadCache();
  const doc = c.get(slug);
  if (!doc) return;

  await rm(path.join(UPLOADS_DIR, doc.filename), { force: true });

  c.delete(slug);
  const meta = await loadMeta();
  meta.docs = [...c.values()].map(({ payload: _payload, ...rest }) => rest);
  await saveMeta(meta);

  await gbrain.deletePage(slug);

  // For each tag the deleted doc carried, recompute the tag page from the
  // remaining docs. If no doc still mentions it, drop the tag page entirely.
  const remaining = [...c.values()];
  for (const tag of doc.tags) {
    const tagSlug = tagToSlug(tag);
    const stillMentionedBy = remaining
      .filter((d) => d.tags.includes(tag))
      .map((d) => d.slug);
    if (stillMentionedBy.length === 0) {
      await gbrain.deletePage(tagSlug);
    } else {
      await gbrain.putPage(tagSlug, buildTagMarkdown(tag, stillMentionedBy));
    }
  }
}

export async function findSlugByFilename(filename: string): Promise<string | null> {
  const c = await loadCache();
  for (const d of c.values()) {
    if (d.filename === filename) return d.slug;
  }
  return null;
}

export async function nukeAll(): Promise<{ pagesDeleted: number; filesDeleted: number }> {
  // Hard-wipe gbrain's PGLite DB rather than looping `gbrain delete` — the CLI
  // only soft-deletes, so orphan links/chunks would still pollute stats and
  // the graph traversal in /api/graph.
  await gbrain.wipeAndInit();

  let filesDeleted = 0;
  try {
    const names = await readdir(UPLOADS_DIR);
    for (const n of names) {
      await rm(path.join(UPLOADS_DIR, n), { force: true });
      filesDeleted += 1;
    }
  } catch {
    // Dir doesn't exist — nothing to wipe.
  }

  cache = new Map();
  cacheLoaded = true;
  return { pagesDeleted: 0, filesDeleted };
}

export async function scanUploadsDir(): Promise<string[]> {
  await ensureDir();
  const names = await readdir(UPLOADS_DIR);
  const out: string[] = [];
  for (const n of names) {
    if (n.startsWith('.')) continue;
    const s = await stat(path.join(UPLOADS_DIR, n));
    if (s.isFile()) out.push(n);
  }
  return out;
}
