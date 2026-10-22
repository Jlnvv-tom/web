import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayerProvider } from '@/components/player/PlayerContext';
import { ScenePlayer } from '@/components/player/ScenePlayer';
import { PitfallCard } from '@/components/content/PitfallCard';
import { QuizSection } from '@/components/content/QuizSection';
import { SCENES } from '@/content/scenes';
import { findChapter } from '@/content/chapters';
import { STAGE_LABEL } from '@/engine/spec';

function Harness() {
  const [idx, setIdx] = useState(0);
  const spec = SCENES[idx]!;
  const chapter = findChapter(spec.meta.chapterId);

  return (
    <div className="min-h-screen bg-[#04070d] text-slate-200">
      {/* 场景切换条（仅预览壳有） */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/6 px-4 py-2">
        <span className="mr-2 font-mono text-[10px] text-slate-500">HARNESS</span>
        {SCENES.map((s, i) => (
          <button
            key={s.meta.id}
            onClick={() => setIdx(i)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
              i === idx
                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                : 'border-white/10 text-slate-500 hover:border-white/25'
            }`}
          >
            {s.meta.title}
          </button>
        ))}
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="chip !text-[10px]">{STAGE_LABEL[spec.meta.stage]}</span>
          {chapter ? (
            <span className="text-[10px] text-slate-600">
              {chapter.no} {chapter.title}
            </span>
          ) : null}
          <span className="text-[10px] text-slate-600">· {spec.meta.pitch}</span>
        </div>

        <h1 className="mb-4 text-[22px] font-black text-white">{spec.meta.title}</h1>

        <PlayerProvider key={spec.meta.id} spec={spec}>
          <ScenePlayer />
          <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
            <PitfallCard pitfalls={spec.pitfalls ?? []} />
            <QuizSection />
          </div>
        </PlayerProvider>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
