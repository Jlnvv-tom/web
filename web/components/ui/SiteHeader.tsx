import Link from 'next/link';
import { Boxes, BookOpen, Layers } from 'lucide-react';
import { STATS } from '@/content/chapters';
import { SCENES } from '@/content/scenes';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-[#04070d]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-sky-500 text-[13px] font-black text-[#03121a]">
            3D
          </span>
          <span className="text-[13.5px] font-bold tracking-wide text-slate-100">
            物理 3D
            <span className="ml-1.5 hidden text-[11px] font-normal text-slate-500 sm:inline">
              初高中物理概念讲解库
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          <Link href="/chapters/g2" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-400 transition hover:bg-white/5 hover:text-slate-100">
            高中
          </Link>
          <Link href="/chapters/j8a" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-400 transition hover:bg-white/5 hover:text-slate-100">
            初中
          </Link>
          <Link href="/search" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-400 transition hover:bg-white/5 hover:text-slate-100">
            搜索
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[10.5px] text-slate-500">
          <span className="hidden items-center gap-1 sm:flex">
            <Layers size={11} /> {STATS.chapters} 章
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <BookOpen size={11} /> {STATS.points} 知识点
          </span>
          <span className="flex items-center gap-1 text-cyan-400/90">
            <Boxes size={11} /> {SCENES.length} 个 3D 场景
          </span>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/6 py-8">
      <div className="mx-auto max-w-[1400px] px-4 text-[11px] leading-relaxed text-slate-600 sm:px-6">
        <p>
          物理 3D · 可旋转、可调参、有讲解的初高中物理概念库。所有三维场景由代码实时生成，
          参数以人教版教材与新课标为准。
        </p>
        <p className="mt-1.5">
          场景内含理想化假设声明（如忽略空气阻力、薄透镜近似），实际实验现象可能不同——这是物理模型的本分。
        </p>
      </div>
    </footer>
  );
}
