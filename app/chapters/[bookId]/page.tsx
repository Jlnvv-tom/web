import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, CircleDot, CircleSlash2, Boxes } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/ui/SiteHeader';
import { BOOKS, findBook } from '@/content/chapters';
import { getScene } from '@/content/scenes';
import { STAGE_LABEL } from '@/engine/spec';

export function generateStaticParams() {
  return BOOKS.map((b) => ({ bookId: b.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ bookId: string }> }): Promise<Metadata> {
  const { bookId } = await params;
  const book = findBook(bookId);
  if (!book) return { title: '未找到该教材' };
  return {
    title: `${STAGE_LABEL[book.stage]}物理 ${book.title} · 知识点目录`,
    description: `${book.subtitle}。按章节查看看哪些知识点已提供可交互 3D 场景。`,
  };
}

export default async function ChapterPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const book = findBook(bookId);
  if (!book) notFound();

  const other = BOOKS.filter((b) => b.stage === book.stage && b.id !== book.id);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1100px] px-4 pb-4 sm:px-6">
        <nav className="flex items-center gap-1 py-4 text-[11px] text-stone-500">
          <Link href="/" className="transition hover:text-stone-700">
            首页
          </Link>
          <ChevronRight size={11} />
          <span className="text-stone-600">
            {STAGE_LABEL[book.stage]} · {book.title}
          </span>
        </nav>

        <header className="mb-5">
          <h1 className="text-[22px] font-black text-stone-900 sm:text-[26px]">
            {STAGE_LABEL[book.stage]}物理 · {book.title}
          </h1>
          <p className="mt-1.5 text-[12px] text-stone-600">{book.subtitle}</p>
        </header>

        {/* 同册切换 */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {other.map((b) => (
            <Link
              key={b.id}
              href={`/chapters/${b.id}`}
              className="rounded-full border border-stone-900/14 px-2.5 py-1 text-[10.5px] text-stone-600 transition hover:border-cyan-700/40 hover:text-cyan-800"
            >
              {b.title}
            </Link>
          ))}
        </div>

        <div className="space-y-2.5">
          {book.chapters.map((c) => {
            const ready = c.points.filter((p) => p.sceneId).length;
            return (
              <section key={c.id} className="panel overflow-hidden">
                <header className="flex items-center gap-2.5 border-b border-stone-900/10 px-4 py-2.5">
                  <span className="font-mono text-[10px] text-stone-500">{c.no}</span>
                  <h2 className="text-[13px] font-bold text-stone-900">{c.title}</h2>
                  {ready > 0 ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-cyan-600/10 px-2 py-[2px] text-[9.5px] font-semibold text-cyan-800">
                      <Boxes size={9} /> {ready} 个 3D 场景
                    </span>
                  ) : (
                    <span className="ml-auto text-[9.5px] text-stone-500">规划中</span>
                  )}
                </header>

                <ul className="divide-y divide-stone-300/[0.04]">
                  {c.points.map((p) => {
                    const scene = p.sceneId ? getScene(p.sceneId) : undefined;
                    const content = (
                      <div className="flex items-center gap-2.5 px-4 py-2.5">
                        {scene ? (
                          <CircleDot size={11} className="shrink-0 text-cyan-700" />
                        ) : (
                          <CircleSlash2 size={11} className="shrink-0 text-stone-500" />
                        )}
                        <span className={`text-[12px] ${scene ? 'text-stone-800' : 'text-stone-600'}`}>
                          {p.title}
                        </span>
                        {p.needs3d && !scene ? (
                          <span className="rounded border border-stone-900/12 px-1.5 py-[1px] text-[9px] text-stone-500">
                            需要 3D
                          </span>
                        ) : null}
                        {scene ? (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-cyan-700/90">
                            打开场景
                            <ChevronRight size={11} />
                          </span>
                        ) : null}
                      </div>
                    );

                    return (
                      <li key={p.id}>
                        {scene ? (
                          <Link href={`/topics/${scene.meta.id}`} className="block transition hover:bg-white/[0.035]">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
