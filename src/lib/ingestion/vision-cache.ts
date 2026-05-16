import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VisionDocResult } from './vision-types';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'vision-cache');

function modelIdSlug(modelId: string): string {
  return modelId.replace(/\//g, '__');
}

function cachePath(sha: string, promptVersion: string, modelId: string): string {
  return path.join(CACHE_DIR, `${sha}.${promptVersion}.${modelIdSlug(modelId)}.json`);
}

export async function sha256OfFile(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

export async function getCached(
  sha: string,
  promptVersion: string,
  modelId: string,
): Promise<VisionDocResult | null> {
  try {
    const raw = await readFile(cachePath(sha, promptVersion, modelId), 'utf8');
    return JSON.parse(raw) as VisionDocResult;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Atomic write (tmp + rename). Refuses to write if > 50% of pages have zero
 * entries — that's a sentinel for a botched extraction (auth fail, gateway
 * outage) and caching it would poison subsequent runs.
 */
export async function putCached(sha: string, result: VisionDocResult): Promise<void> {
  if (result.pages.length > 0) {
    const empty = result.pages.filter((p) => p.entries.length === 0).length;
    if (empty / result.pages.length > 0.5) {
      // eslint-disable-next-line no-console
      console.warn(
        `[vision-cache] Refusing to cache ${result.filePath}: ${empty}/${result.pages.length} pages empty (likely botched run).`,
      );
      return;
    }
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const dest = cachePath(sha, result.promptVersion, result.modelId);
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmp, JSON.stringify(result, null, 2));
    await rename(tmp, dest);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[vision-cache] write failed for ${dest}:`, err);
  }
}
