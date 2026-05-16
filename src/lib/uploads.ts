import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadPdf, type PdfPageInfo } from './ingestion/pdf';
import { loadDocx } from './ingestion/docx';
import { loadXlsx, type XlsxSheet, type XlsxTagRow } from './ingestion/xlsx';
import * as gbrain from './gbrain';
import { tagToSlug } from './tagRegex';

export type UploadKind = 'pdf' | 'docx' | 'xlsx';

export type UploadPdfPayload = {
  kind: 'pdf';
  pages: PdfPageInfo[];
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
): Promise<{ payload: UploadPayload; tags: string[] }> {
  if (kind === 'pdf') {
    const info = await loadPdf(buf, { filename });
    return { payload: { kind: 'pdf', pages: info.pages }, tags: info.tags };
  }
  if (kind === 'docx') {
    const info = await loadDocx(buf);
    return { payload: { kind: 'docx', html: info.html, text: info.text }, tags: info.tags };
  }
  const info = await loadXlsx(buf);
  return { payload: { kind: 'xlsx', sheets: info.sheets, tagRows: info.tagRows }, tags: info.tags };
}

function buildDocMarkdown(displayName: string, kind: UploadKind, tags: string[]): string {
  const tagList = tags.map((t) => `- [[${tagToSlug(t)}]] — ${t}`).join('\n');
  return `---
title: ${displayName}
type: document
kind: ${kind}
---

# ${displayName}

Uploaded ${kind.toUpperCase()} document.

## Tags

${tagList || '_no tags detected_'}
`;
}

function buildTagMarkdown(tag: string, mentionedBy: string[]): string {
  const list = mentionedBy.map((m) => `- [[${m}]]`).join('\n');
  return `---
title: ${tag}
type: tag
---

# ${tag}

Engineering tag discovered in uploaded documents.

## Mentioned in

${list || '_no documents_'}
`;
}

async function pushToGbrain(doc: UploadedDoc) {
  await gbrain.putPage(doc.slug, buildDocMarkdown(doc.displayName, doc.kind, doc.tags));
  // Upsert each tag page with a mention back to this doc.
  for (const tag of doc.tags) {
    const tagSlug = tagToSlug(tag);
    // Read existing mentions if any so we don't clobber.
    let mentions: string[] = [];
    const existing = await gbrain.getPage(tagSlug);
    if (existing) {
      const m = existing.markdown.match(/## Mentioned in\n+([\s\S]*)$/);
      if (m) {
        mentions = [...m[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[1]);
      }
    }
    if (!mentions.includes(doc.slug)) mentions.push(doc.slug);
    await gbrain.putPage(tagSlug, buildTagMarkdown(tag, mentions));
    await gbrain.link(doc.slug, tagSlug, 'mentions');
  }
}

export async function loadCache(): Promise<Map<string, UploadedDoc>> {
  if (cacheLoaded && cache) return cache;
  await ensureDir();
  const meta = await loadMeta();
  cache = new Map();
  for (const entry of meta.docs) {
    try {
      const buf = await readFile(path.join(UPLOADS_DIR, entry.filename));
      const { payload } = await parseFile(entry.kind, buf, entry.filename);
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

export async function ingestUpload(filename: string, buf: Buffer): Promise<UploadedDoc> {
  const kind = kindFromFilename(filename);
  if (!kind) throw new Error(`Unsupported file type: ${filename}`);

  await ensureDir();
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  await writeFile(path.join(UPLOADS_DIR, safeName), buf);

  const baseSlug = slugFromFilename(safeName);
  const slug = await uniqueSlug(baseSlug);
  const { payload, tags } = await parseFile(kind, buf, filename);

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

  await pushToGbrain(doc);

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
  const meta = await loadMeta();
  const slugs = new Set<string>();
  for (const d of meta.docs) {
    slugs.add(d.slug);
    for (const t of d.tags) slugs.add(tagToSlug(t));
  }

  let pagesDeleted = 0;
  for (const slug of slugs) {
    await gbrain.deletePage(slug);
    pagesDeleted += 1;
  }

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
  return { pagesDeleted, filesDeleted };
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
