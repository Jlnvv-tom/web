'use client';

import { PlayerProvider } from '@/components/player/PlayerContext';
import { ScenePlayer } from '@/components/player/ScenePlayer';
import { FormulaCard } from '@/components/content/FormulaCard';
import { PitfallCard } from '@/components/content/PitfallCard';
import { QuizSection } from '@/components/content/QuizSection';
import type { SceneSpec } from '@/engine/spec';
import { DIFFICULTY_LABEL, STAGE_LABEL } from '@/engine/spec';

/**
 * 离线单文件版的知识点页
 *
 * 与线上 `/topics/[id]` 的差别，都是**为了脱离服务器**：
 * - 没有页头/面包屑/上下篇/搜索（那些都要站内其它页面，离线时点了是死链）
 * - 公式用 MathML 而不是 KaTeX-HTML（省掉字体，见 FormulaCard 注释）
 * - 不写 localStorage（`window.__NO_TELEMETRY__` 由 HTML 模板注入）
 * - 不留任何 http(s) 外链
 */
export function StandaloneApp({ spec }: { spec: SceneSpec }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-[1400px] px-4 pb-8 pt-6 sm:px-6">
        <header className="mb-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="chip !text-[10px]">{STAGE_LABEL[spec.meta.stage]}</span>
            <span className="rounded-full border border-white/10 px-2 py-[3px] text-[10px] text-slate-400">
              {DIFFICULTY_LABEL[spec.meta.difficulty]}
            </span>
            {spec.meta.dimension === '3d' ? (
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-[3px] text-[10px] text-cyan-300">
                真 3D
              </span>
            ) : null}
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-[3px] text-[10px] text-emerald-300">
              离线版
            </span>
          </div>

          <h1 className="text-balance text-[22px] font-black leading-tight text-white sm:text-[28px]">
            {spec.meta.title}
          </h1>
          {spec.meta.subtitle ? (
            <p className="mt-1.5 text-[12.5px] text-slate-500">{spec.meta.subtitle}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-slate-600">{spec.meta.pitch}</p>
        </header>

        <PlayerProvider spec={spec}>
          <ScenePlayer />

          <div className="mt-4 grid items-start gap-3 lg:grid-cols-3">
            <FormulaCard formulas={spec.formulas ?? []} mathml />
            <PitfallCard pitfalls={spec.pitfalls ?? []} />
            <div className="space-y-3">
              <QuizSection />

              {spec.assumptions?.length ? (
                <section className="panel p-4">
                  <h2 className="mb-2 text-[11px] font-bold tracking-[0.18em] text-slate-300">
                    理想化假设
                  </h2>
                  <ul className="space-y-1.5">
                    {spec.assumptions.map((a, i) => (
                      <li
                        key={i}
                        className="flex gap-1.5 text-[11px] leading-relaxed text-slate-500"
                      >
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-700" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </PlayerProvider>

        <section className="panel mt-4 p-5">
          <header className="mb-4 flex items-center gap-2">
            <h2 className="text-[12px] font-bold tracking-[0.16em] text-slate-200">讲解全文</h2>
            <span className="ml-1 text-[10px] text-slate-600">共 {spec.script.length} 步</span>
          </header>
          <ol className="space-y-3">
            {spec.script.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-[1px] w-8 shrink-0 font-mono text-[10.5px] tabular-nums text-slate-600">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] leading-[1.9] text-slate-300">{s.text}</p>
                  {s.note ? <p className="mt-1 text-[11px] text-slate-600">{s.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
          <span>离线单文件版 · 双击即可使用，不联网</span>
          <span>·</span>
          <span>快捷键：空格播放/暂停，← → 前后一秒</span>
          <span>·</span>
          <span className="font-mono">{spec.meta.id}</span>
        </footer>
      </main>
    </div>
  );
}
