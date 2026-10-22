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
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-stone-900/12 bg-white/[0.022] p-4 transition hover:border-cyan-700/35 hover:bg-cyan-600/[0.045]"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-600/8 blur-2xl transition group-hover:bg-cyan-600/12" />

      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="chip !px-2 !py-[2px] !text-[9.5px]">{STAGE_LABEL[s.stage]}</span>
        <span className="rounded-full border border-stone-900/14 px-2 py-[2px] text-[9.5px] text-stone-600">
          {DIFFICULTY_LABEL[s.difficulty]}
        </span>
        <span className="ml-auto font-mono text-[10px] text-stone-500">
          {index != null ? String(index + 1).padStart(2, '0') : ''}
        </span>
      </div>

      <h3 className="text-[14.5px] font-bold leading-snug text-stone-900 transition group-hover:text-stone-900">
        {s.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-stone-600">{s.pitch}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[10px] text-stone-500">
        <span className="inline-flex items-center gap-1">
          <Clock size={10} /> {s.minutes} 分钟
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles size={10} /> {s.demoCount} 步讲解
        </span>
        {chapter ? (
          <span className="truncate text-stone-500">
            {chapter.no} {chapter.title}
          </span>
        ) : null}
        <ArrowRight
          size={12}
          className="ml-auto shrink-0 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-700"
        />
      </div>
    </Link>
  );
}
