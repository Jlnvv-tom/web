'use client';

import { useRef, useState } from 'react';
import { Check, PlayCircle, RotateCcw, Target, X } from 'lucide-react';
import type { QuizDef } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';
import { getTelemetry } from '@/engine/telemetry';

/**
 * 预测 → 观察 → 解释（POE）
 *
 * 这是本产品与"看视频"的根本区别：学生必须先押一个答案，
 * 再让 3D 场景把参数改成他选的那一种，亲眼看到结果。
 */
export function QuizCard({
  quizzes,
  store,
  sceneId,
}: {
  quizzes: QuizDef[];
  store: PlayerStoreApi;
  sceneId: string;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  /**
   * 已经记过埋点的题号。
   * 只记**首次作答**：点「重做」时答案已经被看过，再选对不能算会了；
   * 用 ref 而不是 state，是因为它不该触发重渲染，也不该被「重做」清掉。
   */
  const logged = useRef<Set<number>>(new Set());

  if (!quizzes.length) return null;

  const choose = (qi: number, oi: number) => {
    const q = quizzes[qi]!;
    if (!logged.current.has(qi)) {
      logged.current.add(qi);
      getTelemetry().trackQuiz(sceneId, qi, oi, q.answer);
    }
    setAnswers((a) => ({ ...a, [qi]: oi }));
    setRevealed((r) => ({ ...r, [qi]: true }));
  };

  const verify = (q: QuizDef) => {
    if (!q.applyParams) return;
    store.getState().applyParams(q.applyParams);
    store.getState().setPlaying(true);
  };

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-center gap-2">
        <Target size={13} className="text-cyan-700" />
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-stone-700">预测与验证</h2>
        <span className="ml-1 rounded-full bg-cyan-600/10 px-2 py-0.5 text-[9.5px] font-semibold text-cyan-800/90">
          先猜，再看
        </span>
      </header>

      <div className="space-y-4">
        {quizzes.map((q, qi) => {
          const picked = answers[qi];
          const show = revealed[qi];
          const correct = picked === q.answer;

          return (
            <article key={qi} className="rounded-xl border border-stone-900/10 bg-white/[0.025] p-3.5">
              <p className="mb-2.5 text-[12.5px] leading-relaxed text-stone-800">
                <span className="mr-1.5 font-mono text-[11px] text-cyan-700/80">Q{qi + 1}</span>
                {q.prompt}
              </p>

              <div className="grid gap-1.5 sm:grid-cols-2">
                {q.options.map((opt, oi) => {
                  const isPicked = picked === oi;
                  const isAnswer = q.answer === oi;
                  let cls = 'border-stone-900/14 text-stone-700 hover:border-stone-900/20 hover:bg-stone-900/5';
                  if (show) {
                    if (isAnswer) cls = 'border-emerald-700/45 bg-emerald-600/12 text-emerald-800';
                    else if (isPicked) cls = 'border-red-700/40 bg-red-600/12 text-red-800';
                    else cls = 'border-stone-900/10 text-stone-600';
                  }
                  return (
                    <button
                      key={oi}
                      onClick={() => choose(qi, oi)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[11.5px] transition ${cls}`}
                    >
                      <span>{opt}</span>
                      {show && isAnswer ? <Check size={12} className="shrink-0" /> : null}
                      {show && isPicked && !isAnswer ? <X size={12} className="shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>

              {show ? (
                <div className="mt-2.5">
                  <p
                    className={`rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                      correct ? 'bg-emerald-600/10 text-emerald-800/85' : 'bg-amber-500/10 text-amber-800/85'
                    }`}
                  >
                    <b className="font-semibold">{correct ? '判断正确 · ' : '再看一眼 · '}</b>
                    {q.explain}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.applyParams ? (
                      <button onClick={() => verify(q)} className="btn btn-primary !px-2.5 !py-1 !text-[11px]">
                        <PlayCircle size={12} />
                        在 3D 里验证这个条件
                      </button>
                    ) : null}
                    <button
                      onClick={() => {
                        setRevealed((r) => ({ ...r, [qi]: false }));
                        setAnswers((a) => {
                          const n = { ...a };
                          delete n[qi];
                          return n;
                        });
                      }}
                      className="btn !px-2.5 !py-1 !text-[11px]"
                    >
                      <RotateCcw size={12} />
                      重做
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
