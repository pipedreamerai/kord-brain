import { NextResponse } from 'next/server';
import * as gbrain from '@/lib/gbrain';
import { getAllDocs } from '@/lib/uploads';
import { tagToSlug } from '@/lib/tagRegex';

export const dynamic = 'force-dynamic';

export async function GET() {
  const docs = await getAllDocs();
  const slugs = new Set<string>();

  for (const doc of docs) {
    slugs.add(doc.slug);
    for (const tag of doc.tags) slugs.add(tagToSlug(tag));
  }

  const listed = await gbrain.list(500);
  for (const slug of listed) slugs.add(slug);

  const pages = (await Promise.all([...slugs].map((slug) => gbrain.getPage(slug))))
    .filter((page): page is gbrain.Page => page !== null)
    .map((page) => ({
      slug: page.slug,
      title: page.frontmatter.title ?? page.slug,
      type: page.frontmatter.type ?? 'page',
      markdown: page.markdown,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'document' ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  return NextResponse.json({ pages });
}
