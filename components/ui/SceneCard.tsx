import Link from 'next/link';
import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import type { SceneSummary } from '@/content/scenes';
import { DIFFICULTY_LABEL, STAGE_LABEL } from '@/engine/spec';

export function SceneCard({ s }: { s: SceneSummary }) {

  return (
    <Link
      href={`/topics/${s.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-stone-900/12 bg-white/[0.022] p-4 transition hover:border-cyan-700/35 hover:bg-cyan-600/[0.045]"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-600/8 blur-2xl transition group-hover:bg-cyan-600/12" />

      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="chip !px-2 !py-[2px] !text-[9.5px]">{STAGE_LABEL[s.stage]}</span>
        <span className="rounded-full border border-stone-900/14 px-2 py-[2px] text-[9.5px] text-stone-600">
          {DIFFICULTY_LABEL[s.difficulty]}
        </span>
      </div>

      <h3 className="text-[14.5px] font-bold leading-snug text-stone-900 transition group-hover:text-stone-900">
        {s.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-stone-600">{s.pitch}</p>

      {/* 只留"决策信息"：要花多少时间、讲解有多细。
          章节归属删掉了 —— 点进去面包屑就有，在这里重复一遍只是噪声。
          字号从 10px 提到 11px：这是老师决定"点不点"的依据，不该是几乎看不见的字。 */}
      <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-3 text-[11px] text-stone-600">
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> {s.minutes} 分钟
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles size={11} /> {s.demoCount} 步讲解
        </span>
        <ArrowRight
          size={12}
          className="ml-auto shrink-0 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-700"
        />
      </div>
    </Link>
  );
}
