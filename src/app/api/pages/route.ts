import { NextRequest, NextResponse } from 'next/server';
import * as gbrain from '@/lib/gbrain';
import { getAllDocs } from '@/lib/uploads';
import { tagToSlug } from '@/lib/tagRegex';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');

  if (slug) {
    const page = await gbrain.getPage(slug);
    if (!page) return NextResponse.json({ page: null }, { status: 404 });
    return NextResponse.json({
      page: {
        slug: page.slug,
        title: page.frontmatter.title ?? page.slug,
        type: page.frontmatter.type ?? 'page',
        markdown: page.markdown,
      },
    });
  }

  const docs = await getAllDocs();
  const slugs = new Set<string>();

  for (const doc of docs) {
    slugs.add(doc.slug);
    for (const tag of doc.tags) slugs.add(tagToSlug(tag));
  }

  const listed = await gbrain.list(500);
  for (const s of listed) slugs.add(s);

  const pages = (await Promise.all([...slugs].map((s) => gbrain.getPage(s))))
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
