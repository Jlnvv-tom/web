'use client';

import { Pause, Play, RotateCcw, SkipBack, SkipForward, Gauge } from 'lucide-react';
import type { SceneSpec } from '@/engine/spec';
import { sceneDuration } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';

export function Transport({ spec, store }: { spec: SceneSpec; store: PlayerStoreApi }) {
  const time = store((s) => s.time);
  const playing = store((s) => s.playing);
  const speed = store((s) => s.speed);
  const stepIndex = store((s) => s.stepIndex);
  const waiting = store((s) => s.waiting);

  const duration = sceneDuration(spec);
  const step = stepIndex >= 0 ? spec.script[stepIndex] : undefined;

  const toggle = () => {
    const st = store.getState();
    if (st.waiting) st.setWaiting(false);
    st.togglePlaying();
  };

  const gotoStep = (i: number) => {
    const s = spec.script[i];
    if (!s) return;
    store.getState().requestSeek(s.at);
    store.getState().setWaiting(false);
    store.getState().setPlaying(true);
  };

  return (
    <section className="panel px-4 pb-3 pt-3">
      {/* 字幕 */}
      <div className="mb-3 flex min-h-[52px] items-start gap-3">
        <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-cyan-400/15 text-[10px] font-bold text-cyan-300">
            {stepIndex >= 0 ? stepIndex + 1 : '·'}
          </span>
          <span className="text-[10px] text-slate-600">/{spec.script.length}</span>
        </div>
        <p className="flex-1 text-[12.5px] leading-relaxed text-slate-200">
          {step?.text ?? '按播放开始讲解，或拖动时间轴自由探索。'}
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => gotoStep(Math.max(stepIndex - 1, 0))}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/6 hover:text-slate-200"
            title="上一步"
          >
            <SkipBack size={13} />
          </button>
          <button
            onClick={() => gotoStep(Math.min(stepIndex + 1, spec.script.length - 1))}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/6 hover:text-slate-200"
            title="下一步"
          >
            <SkipForward size={13} />
          </button>
        </div>
      </div>

      {/* 进度条 */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.02}
          value={Math.min(time, duration)}
          onChange={(e) => store.getState().requestSeek(Number(e.target.value))}
          className="range-input w-full"
          aria-label="时间轴"
        />
        {/* 讲解节点刻度 */}
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-1">
          {spec.script.map((s, i) => (
            <span
              key={i}
              className={`absolute top-0 h-1 w-1 -translate-x-1/2 rounded-full ${
                i <= stepIndex ? 'bg-cyan-400' : 'bg-slate-700'
              }`}
              style={{ left: `${(s.at / duration) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* 控制 */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="btn btn-primary !px-3 !py-1.5" title="播放 / 暂停（空格）">
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span className="text-[11.5px]">{playing ? '暂停' : '播放'}</span>
          </button>
          <button
            onClick={() => {
              store.getState().requestSeek(0);
              store.getState().setPlaying(true);
              store.getState().setWaiting(false);
            }}
            className="btn !px-2.5 !py-1.5"
            title="从头播放"
          >
            <RotateCcw size={13} />
          </button>
          <span className="font-mono text-[11px] tabular-nums text-slate-500">
            {time.toFixed(1)}
            <span className="text-slate-700"> / {duration.toFixed(0)}s</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Gauge size={12} className="text-slate-600" />
          {[0.25, 0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => store.getState().setSpeed(s)}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition ${
                speed === s ? 'bg-cyan-400/20 text-cyan-300' : 'text-slate-600 hover:text-slate-300'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {waiting && (
        <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-1.5 text-[10.5px] text-amber-200/90">
          讲解在此处暂停，观察画面后点「播放」继续。
        </div>
      )}
    </section>
  );
}
