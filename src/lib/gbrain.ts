import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';

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

export async function getPage(slug: string): Promise<Page> {
  const raw = await runGbrain(['get', slug]);
  return parseMarkdown(slug, raw);
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
  const [root, ...neighbors] = await Promise.all([
    getPage(slug),
    ...Array.from(slugs).map(s => getPage(s)),
  ]);
  return { root, neighbors, graph: graphData };
}
