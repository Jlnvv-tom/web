'use client';

import type { ParamDef } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';

export function ParamPanel({ spec, store }: { spec: { params: ParamDef[] }; store: PlayerStoreApi }) {
  const params = store((s) => s.params);
  const setParam = store((s) => s.setParam);
  const reset = store((s) => s.resetParams);

  return (
    <section className="panel p-3">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold tracking-[0.18em] text-slate-300">参数</h3>
        <button
          onClick={reset}
          className="text-[10px] text-slate-500 transition hover:text-cyan-300"
          title="恢复默认参数"
        >
          重置
        </button>
      </header>

      <div className="space-y-3.5">
        {spec.params.map((p) => {
          if (p.type === 'slider') {
            const v = typeof params[p.key] === 'number' ? (params[p.key] as number) : p.default;
            const display = p.displayScale ? v * p.displayScale : v;
            return (
              <div key={p.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <label htmlFor={`p-${p.key}`} className="text-[11.5px] text-slate-300">
                    {p.label}
                  </label>
                  <span className="font-mono text-[11.5px] font-semibold tabular-nums text-cyan-300">
                    {formatNum(display)}
                    {p.unit ? <span className="ml-0.5 text-[10px] text-slate-500">{p.unit}</span> : null}
                  </span>
                </div>
                <input
                  id={`p-${p.key}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={v}
                  onChange={(e) => setParam(p.key, Number(e.target.value))}
                  className="range-input w-full"
                />
                {p.hint ? <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{p.hint}</p> : null}
              </div>
            );
          }

          if (p.type === 'toggle') {
            const v = typeof params[p.key] === 'boolean' ? (params[p.key] as boolean) : p.default;
            return (
              <label key={p.key} className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-[11.5px] text-slate-300">{p.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={v}
                  onClick={() => setParam(p.key, !v)}
                  className={`relative h-[18px] w-[34px] rounded-full transition ${
                    v ? 'bg-cyan-400/80' : 'bg-white/12'
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
                      v ? 'left-[18px]' : 'left-[2px]'
                    }`}
                  />
                </button>
              </label>
            );
          }

          const v = typeof params[p.key] === 'string' ? (params[p.key] as string) : p.default;
          return (
            <div key={p.key}>
              <div className="mb-1.5 text-[11.5px] text-slate-300">{p.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {p.options.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setParam(p.key, o.value)}
                    className={`rounded-full border px-2.5 py-1 text-[10.5px] transition ${
                      v === o.value
                        ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/10 text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatNum(x: number): string {
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) >= 1000) return x.toFixed(0);
  if (Math.abs(x) >= 100) return x.toFixed(1);
  return x.toFixed(2).replace(/\.?0+$/, '');
}
