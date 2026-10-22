import Link from 'next/link';
import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import type { SceneSummary } from '@/content/scenes';
import { DIFFICULTY_LABEL, STAGE_LABEL } from '@/engine/spec';
import { findChapter } from '@/content/chapters';

export function SceneCard({ s, index }: { s: SceneSummary; index?: number }) {
  const chapter = findChapter(s.chapterId);

  return (
    <Link
      href={`/topics/${s.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.022] p-4 transition hover:border-cyan-400/35 hover:bg-cyan-400/[0.045]"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/8 blur-2xl transition group-hover:bg-cyan-400/16" />

      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="chip !px-2 !py-[2px] !text-[9.5px]">{STAGE_LABEL[s.stage]}</span>
        <span className="rounded-full border border-white/10 px-2 py-[2px] text-[9.5px] text-slate-400">
          {DIFFICULTY_LABEL[s.difficulty]}
        </span>
        <span className="ml-auto font-mono text-[10px] text-slate-600">
          {index != null ? String(index + 1).padStart(2, '0') : ''}
        </span>
      </div>

      <h3 className="text-[14.5px] font-bold leading-snug text-slate-100 transition group-hover:text-white">
        {s.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">{s.pitch}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <Clock size={10} /> {s.minutes} 分钟
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles size={10} /> {s.demoCount} 步讲解
        </span>
        {chapter ? (
          <span className="truncate text-slate-600">
            {chapter.no} {chapter.title}
          </span>
        ) : null}
        <ArrowRight
          size={12}
          className="ml-auto shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-400"
        />
      </div>
    </Link>
  );
}
