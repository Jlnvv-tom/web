import Link from 'next/link';
import { ArrowRight, Boxes } from 'lucide-react';
import { SCENES } from '@/content/scenes';

export function SiteHeader() {
  const nav = [
    { href: '/chapters/g2', label: '高中' },
    { href: '/chapters/j8a', label: '初中' },
    { href: '/search', label: '搜索' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-stone-900/10 bg-[#f6f3ee]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-700 to-sky-800 text-[13px] font-black text-white">
            3D
          </span>
          <span className="text-[13.5px] font-bold tracking-wide text-stone-900">
            物理 3D
            <span className="ml-1.5 hidden text-[11px] font-normal text-stone-600 sm:inline">
              初高中物理概念讲解库
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-stone-600 transition hover:bg-stone-900/5 hover:text-stone-900"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* 右侧只放一个主 CTA。参照 Sentry：头部不堆统计数字，
            也不要并排放三个功能相同的入口。 */}
        <Link
          href={`/topics/${SCENES[0]!.meta.id}`}
          className="btn btn-primary ml-auto !px-3.5 !py-1.5 !text-[12px]"
        >
          <Boxes size={13} />
          开始体验
          <ArrowRight size={13} />
        </Link>

        {/* 窄屏：导航收成一个搜索入口，避免和主 CTA 抢位 */}
        <Link href="/search" className="btn !px-3 !py-1.5 !text-[12px] md:hidden">
          搜索
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-stone-900/10 py-8">
      <div className="mx-auto max-w-[1400px] px-4 text-[11px] leading-relaxed text-stone-500 sm:px-6">
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
