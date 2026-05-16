import type { Tag } from '../tags';
import type { DocSlug } from '../docs';

export type TagCategory = 'equipment' | 'instrument' | 'valve' | 'control' | 'unknown';

export type VisionTagEntry = {
  rawTag: string;
  tag: Tag | null;
  bbox: [number, number, number, number];
  category: TagCategory;
  confidence: number;
  note?: string;
};

export type VisionPageResult = {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  entries: VisionTagEntry[];
  note?: string;
};

export type VisionDocResult = {
  filePath: string;
  fileSha: string;
  slug: DocSlug | null;
  pages: VisionPageResult[];
  extractedAt: number;
  promptVersion: string;
  modelId: string;
};
