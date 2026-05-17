import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const execFileP = promisify(execFile);

const GBRAIN_BIN = process.env.GBRAIN_BIN ?? 'gbrain';
const BUN_BIN_DIR = process.env.BUN_BIN_DIR ?? `${homedir()}/.bun/bin`;

const SPAWN_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: `${BUN_BIN_DIR}:${process.env.PATH ?? ''}`,
};

async function runGbrain(args: string[]): Promise<string> {
  const { stdout } = await execFileP(GBRAIN_BIN, args, {
    env: SPAWN_ENV,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stripGatewayNoise(stdout);
}

/** Write a markdown page (pipes content via stdin to `gbrain put <slug>`). */
export async function putPage(slug: string, markdown: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(GBRAIN_BIN, ['put', slug], { env: SPAWN_ENV });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gbrain put ${slug} exited ${code}: ${stderr.slice(0, 300)}`));
    });
    child.stdin.end(markdown);
  });
}

export async function deletePage(slug: string): Promise<void> {
  try {
    await runGbrain(['delete', slug]);
  } catch {
    // Ignore — deleting a non-existent page is fine.
  }
}

export async function link(from: string, to: string, type = 'mentions'): Promise<void> {
  try {
    await runGbrain(['link', from, to, '--type', type]);
  } catch {
    // Idempotent best-effort.
  }
}

function stripGatewayNoise(s: string): string {
  return s
    .split('\n')
    .filter(line => !line.startsWith('[ai.gateway]'))
    .join('\n');
}

export type GraphLink = { to_slug: string; link_type: string };
export type GraphNode = {
  slug: string;
  title: string;
  type: string;
  depth: number;
  links: GraphLink[];
};

export async function graph(slug: string, depth = 1): Promise<GraphNode[]> {
  const out = await runGbrain(['graph', slug, '--depth', String(depth)]);
  const start = out.indexOf('[');
  if (start === -1) return [];
  return JSON.parse(out.slice(start)) as GraphNode[];
}

export type Backlink = {
  from_slug: string;
  to_slug: string;
  link_type: string;
  context: string;
  link_source: string;
};

export async function backlinks(slug: string): Promise<Backlink[]> {
  const out = await runGbrain(['backlinks', slug]);
  const start = out.indexOf('[');
  if (start === -1) return [];
  return JSON.parse(out.slice(start)) as Backlink[];
}

export type SearchHit = { slug: string; score: number; snippet: string };

const SEARCH_LINE = /^\[([\d.]+)\]\s+(\S+)\s+--\s+(.+)$/;

export async function search(query: string, limit = 10): Promise<SearchHit[]> {
  const out = await runGbrain(['search', query, '--limit', String(limit)]);
  const hits: SearchHit[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(SEARCH_LINE);
    if (!m) continue;
    hits.push({ score: parseFloat(m[1]), slug: m[2], snippet: m[3] });
  }
  return hits;
}

export type Page = {
  slug: string;
  frontmatter: Record<string, string>;
  markdown: string;
};

export async function getPage(slug: string): Promise<Page | null> {
  try {
    const raw = await runGbrain(['get', slug]);
    return parseMarkdown(slug, raw);
  } catch {
    return null;
  }
}

function parseMarkdown(slug: string, raw: string): Page {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { slug, frontmatter: {}, markdown: raw.trim() };
  const frontmatter: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { slug, frontmatter, markdown: m[2].trim() };
}

export type GbrainStats = { pages: number; links: number };

export async function stats(): Promise<GbrainStats> {
  const out = await runGbrain(['stats']);
  const pages = parseInt(out.match(/pages[:\s]+(\d+)/i)?.[1] ?? '0', 10);
  const links = parseInt(out.match(/links[:\s]+(\d+)/i)?.[1] ?? '0', 10);
  return { pages, links };
}

/**
 * Hard-wipe the local PGLite database and reinitialize. `gbrain delete` is a
 * soft-delete with a 72h purge window, so a list+delete loop leaks orphan
 * pages/links across sessions. For a hackathon-style reset we want stats
 * back to zero, which requires nuking the DB directory itself.
 */
export async function wipeAndInit(): Promise<void> {
  const configPath = path.join(homedir(), '.gbrain', 'config.json');
  let dbPath = path.join(homedir(), '.gbrain', 'brain.pglite');
  let engine: string | undefined;
  try {
    const cfg = JSON.parse(await readFile(configPath, 'utf8')) as {
      engine?: string;
      database_path?: string;
    };
    engine = cfg.engine;
    if (cfg.database_path) dbPath = cfg.database_path;
  } catch {
    // No config — assume default PGLite path.
  }
  if (engine && engine !== 'pglite') {
    throw new Error(`Refusing to wipe non-PGLite gbrain engine: ${engine}`);
  }
  await rm(dbPath, { recursive: true, force: true });
  await runGbrain(['init']);
}

export async function list(limit = 200): Promise<string[]> {
  try {
    const out = await runGbrain(['list', '-n', String(limit)]);
    return out
      .split('\n')
      .map(l => l.trim().split(/\s+/)[0])
      .filter(s => s.length > 0 && /^[a-z0-9_/-]+$/.test(s));
  } catch {
    return [];
  }
}

export async function getRelatedContext(slug: string, depth = 1): Promise<{
  root: Page;
  neighbors: Page[];
  graph: GraphNode[];
}> {
  const graphData = await graph(slug, depth);
  const slugs = new Set<string>();
  for (const node of graphData) {
    if (node.depth === 0) continue;
    slugs.add(node.slug);
  }
  const slugArr = Array.from(slugs);
  const [root, ...neighborPages] = await Promise.all([
    getPage(slug),
    ...slugArr.map(s => getPage(s)),
  ]);
  const neighbors = neighborPages.filter((p): p is Page => p !== null);
  return { root: root ?? { slug, frontmatter: {}, markdown: '' }, neighbors, graph: graphData };
}
