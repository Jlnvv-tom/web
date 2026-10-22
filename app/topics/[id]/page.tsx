import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, Clock, Info, Layers3, ListOrdered } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/ui/SiteHeader';
import { PlayerProvider } from '@/components/player/PlayerContext';
import { ScenePlayer } from '@/components/player/ScenePlayer';
import { FormulaCard } from '@/components/content/FormulaCard';
import { PitfallCard } from '@/components/content/PitfallCard';
import { QuizSection } from '@/components/content/QuizSection';
import { TelemetryPanel } from '@/components/player/TelemetryPanel';
import { ExportButton } from '@/components/player/ExportButton';
import { SCENES, getScene } from '@/content/scenes';
import { findChapter, findBook } from '@/content/chapters';
import { DIFFICULTY_LABEL, STAGE_LABEL } from '@/engine/spec';

export function generateStaticParams() {
  return SCENES.map((s) => ({ id: s.meta.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const spec = getScene(id);
  if (!spec) return { title: '未找到该知识点' };

  const chapter = findChapter(spec.meta.chapterId);
  const title = `${spec.meta.title}｜${STAGE_LABEL[spec.meta.stage]}物理 3D 演示`;
  const description = `${spec.meta.pitch}。${chapter ? `${chapter.no}${chapter.title} · ` : ''}可旋转、可调参的三维交互场景，含分步讲解、易错点与预测验证。`;

  return {
    title,
    description,
    keywords: spec.meta.tags,
    openGraph: { title, description, type: 'article' },
  };
}

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spec = getScene(id);
  if (!spec) notFound();

  const chapter = findChapter(spec.meta.chapterId);
  const book = chapter ? findBook(chapter.bookId) : undefined;

  const idx = SCENES.findIndex((s) => s.meta.id === id);
  const prev = idx > 0 ? SCENES[idx - 1] : undefined;
  const next = idx < SCENES.length - 1 ? SCENES[idx + 1] : undefined;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1400px] px-4 pb-4 sm:px-6">
        {/* ============ 面包屑 ============ */}
        <nav className="flex flex-wrap items-center gap-1 py-4 text-[11px] text-stone-500">
          <Link href="/" className="transition hover:text-stone-700">
            首页
          </Link>
          <ChevronRight size={11} />
          {book ? (
            <>
              <Link href={`/chapters/${book.id}`} className="transition hover:text-stone-700">
                {STAGE_LABEL[book.stage]} · {book.title}
              </Link>
              <ChevronRight size={11} />
            </>
          ) : null}
          {chapter ? <span className="text-stone-600">{chapter.title}</span> : null}
          <ChevronRight size={11} />
          <span className="text-stone-600">三维场景</span>
        </nav>

        {/* ============ 标题区 ============ */}
        <header className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="chip !text-[10px]">{STAGE_LABEL[spec.meta.stage]}</span>
            <span className="rounded-full border border-stone-900/14 px-2 py-[3px] text-[10px] text-stone-600">
              {DIFFICULTY_LABEL[spec.meta.difficulty]}
            </span>
            {spec.meta.dimension === '3d' ? (
              <span className="rounded-full border border-cyan-700/25 bg-cyan-600/10 px-2 py-[3px] text-[10px] text-cyan-800">
                真 3D
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-[10px] text-stone-500">
              <Clock size={10} /> 约 {spec.meta.minutes} 分钟
            </span>
            {chapter ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-stone-500">
                <Layers3 size={10} /> {chapter.no} {chapter.title}
              </span>
            ) : null}
          </div>

          <h1 className="text-balance text-[22px] font-black leading-tight text-stone-900 sm:text-[28px]">
            {spec.meta.title}
          </h1>
          {spec.meta.subtitle ? (
            <p className="mt-1.5 text-[12.5px] text-stone-600">{spec.meta.subtitle}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ExportButton spec={spec} />
            <span className="text-[10px] text-stone-500">
              导出成单个 HTML 文件，双击即用，完全离线
            </span>
          </div>
        </header>

        {/* ============ 播放器 + 内容 ============ */}
        <PlayerProvider spec={spec}>
          <ScenePlayer />

          <div className="mt-4 grid items-start gap-3 lg:grid-cols-3">
            <FormulaCard formulas={spec.formulas ?? []} />
            <PitfallCard pitfalls={spec.pitfalls ?? []} />
            <div className="space-y-3">
              <QuizSection />

              {/* 理想化假设 */}
              {spec.assumptions?.length ? (
                <section className="panel p-4">
                  <header className="mb-2 flex items-center gap-2">
                    <Info size={12} className="text-stone-600" />
                    <h2 className="text-[11px] font-bold tracking-[0.18em] text-stone-700">理想化假设</h2>
                  </header>
                  <ul className="space-y-1.5">
                    {spec.assumptions.map((a, i) => (
                      <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-stone-600">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-stone-200" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </PlayerProvider>

        {/* ============ 讲解全文（同时服务于 SEO 与"想读文字"的用户） ============ */}
        <section className="panel mt-4 p-5">
          <header className="mb-4 flex items-center gap-2">
            <ListOrdered size={13} className="text-cyan-700" />
            <h2 className="text-[12px] font-bold tracking-[0.16em] text-stone-800">讲解全文</h2>
            <span className="ml-1 text-[10px] text-stone-500">共 {spec.script.length} 步</span>
          </header>

          <ol className="space-y-3">
            {spec.script.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-[1px] w-8 shrink-0 font-mono text-[10.5px] tabular-nums text-stone-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-[1.9] text-stone-700">{s.text}</p>
                  {s.note ? <p className="mt-1 text-[11px] text-stone-500">{s.note}</p> : null}
                  {s.params ? (
                    <p className="mt-1 text-[10.5px] text-cyan-700/70">
                      自动调参：{Object.entries(s.params).map(([k, v]) => `${k} = ${v}`).join('，')}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-stone-900/10 pt-3">
            {spec.meta.tags.map((t) => (
              <span key={t} className="rounded-full border border-stone-900/12 px-2 py-[3px] text-[10px] text-stone-600">
                #{t}
              </span>
            ))}
          </div>
        </section>

        <TelemetryPanel sceneId={spec.meta.id} />

        {/* ============ 上下篇 ============ */}
        <nav className="mt-4 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/topics/${prev.meta.id}`}
              className="panel group flex items-center gap-3 p-3.5 transition hover:border-cyan-700/30"
            >
              <ChevronRight size={14} className="rotate-180 text-stone-500" />
              <div className="min-w-0">
                <div className="text-[9.5px] text-stone-500">上一个场景</div>
                <div className="truncate text-[12px] font-medium text-stone-700 group-hover:text-stone-900">
                  {prev.meta.title}
                </div>
              </div>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/topics/${next.meta.id}`}
              className="panel group flex items-center gap-3 p-3.5 text-right transition hover:border-cyan-700/30 sm:justify-end"
            >
              <div className="min-w-0">
                <div className="text-[9.5px] text-stone-500">下一个场景</div>
                <div className="truncate text-[12px] font-medium text-stone-700 group-hover:text-stone-900">
                  {next.meta.title}
                </div>
              </div>
              <ChevronRight size={14} className="text-stone-500" />
            </Link>
          ) : null}
        </nav>
      </main>

      <SiteFooter />
    </>
  );
}
