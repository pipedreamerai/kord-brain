import { DemoLayout } from '@/components/DemoLayout';
import { getTagIndex } from '@/lib/tagIndex';

export default async function Home() {
  const { tagIndex, docs } = await getTagIndex();
  return <DemoLayout tagIndex={tagIndex} docs={docs} />;
}
