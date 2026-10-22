import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PlayerProvider } from '@/components/player/PlayerContext';
import { ScenePlayer } from '@/components/player/ScenePlayer';
import { SCENES, getScene } from '@/content/scenes';

export function generateStaticParams() {
  return SCENES.map((s) => ({ id: s.meta.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const spec = getScene(id);
  return { title: spec ? `${spec.meta.title}（嵌入视图）` : '未找到', robots: { index: false } };
}

/**
 * 嵌入视图：给 PPT / 公众号 / 学校平台用 iframe 引用
 * 只保留播放器，去掉站点头尾与内容卡片
 */
export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spec = getScene(id);
  if (!spec) notFound();

  return (
    <main className="min-h-screen bg-[#f6f3ee] p-2">
      <PlayerProvider spec={spec}>
        <ScenePlayer />
      </PlayerProvider>
    </main>
  );
}
