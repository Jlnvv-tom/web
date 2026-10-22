import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/ui/SiteHeader';
import { SearchClient, type SearchItem } from '@/components/ui/SearchClient';
import { sceneSummaries } from '@/content/scenes';
import { ALL_CHAPTERS, findChapter } from '@/content/chapters';
import { DIFFICULTY_LABEL, STAGE_LABEL } from '@/engine/spec';

export const metadata: Metadata = {
  title: '搜索知识点',
  description: '按关键词搜索初高中物理知识点与可交互 3D 场景。',
};

export default function SearchPage() {
  const sceneItems: SearchItem[] = sceneSummaries().map((s) => {
    const ch = findChapter(s.chapterId);
    return {
      kind: 'scene',
      title: s.title,
      sub: `${STAGE_LABEL[s.stage]} · ${ch ? `${ch.no}${ch.title}` : ''} · ${DIFFICULTY_LABEL[s.difficulty]}`,
      href: `/topics/${s.id}`,
      tags: s.tags,
      stage: s.stage,
    };
  });

  const pointItems: SearchItem[] = ALL_CHAPTERS.flatMap((c) =>
    c.points
      .filter((p) => !p.sceneId)
      .map((p) => ({
        kind: 'point' as const,
        title: p.title,
        sub: `${c.no}${c.title}`,
        tags: [p.title],
        stage: c.stage,
      }))
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-[20px] font-bold text-stone-900">搜索</h1>
        <SearchClient items={[...sceneItems, ...pointItems]} />
      </main>
      <SiteFooter />
    </>
  );
}
