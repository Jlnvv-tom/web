'use client';

import type { ParamDef } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';
import { getTelemetry, type ParamValue } from '@/engine/telemetry';

export function ParamPanel({
  spec,
  store,
}: {
  spec: { meta: { id: string }; params: ParamDef[] };
  store: PlayerStoreApi;
}) {
  const params = store((s) => s.params);
  const setParam = store((s) => s.setParam);
  const reset = store((s) => s.resetParams);

  /**
   * 改参数的唯一入口。埋点在这里而不是 store 里，是因为：
   * 脚本自动调参（applyScriptParams）和练习「验证」（applyParams）不算用户调参，
   * 混进来会把「平均调参次数」这个核心指标稀释掉。
   */
  const change = (key: string, from: ParamValue, to: ParamValue) => {
    getTelemetry().trackParam(spec.meta.id, key, from, to);
    setParam(key, to);
  };

  return (
    <section className="panel p-3">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold tracking-[0.18em] text-stone-700">参数</h3>
        <button
          onClick={reset}
          className="text-[10px] text-stone-600 transition hover:text-cyan-800"
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
                  <label htmlFor={`p-${p.key}`} className="text-[11.5px] text-stone-700">
                    {p.label}
                  </label>
                  <span className="font-mono text-[11.5px] font-semibold tabular-nums text-cyan-800">
                    {formatNum(display)}
                    {p.unit ? <span className="ml-0.5 text-[10px] text-stone-600">{p.unit}</span> : null}
                  </span>
                </div>
                <input
                  id={`p-${p.key}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={v}
                  onChange={(e) => change(p.key, v, Number(e.target.value))}
                  className="range-input w-full"
                />
                {p.hint ? <p className="mt-1 text-[10px] leading-relaxed text-stone-500">{p.hint}</p> : null}
              </div>
            );
          }

          if (p.type === 'toggle') {
            const v = typeof params[p.key] === 'boolean' ? (params[p.key] as boolean) : p.default;
            return (
              <label key={p.key} className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-[11.5px] text-stone-700">{p.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={v}
                  onClick={() => change(p.key, v, !v)}
                  className={`relative h-[18px] w-[34px] rounded-full transition ${
                    v ? 'bg-cyan-600/80' : 'bg-stone-900/8'
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
              <div className="mb-1.5 text-[11.5px] text-stone-700">{p.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {p.options.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => change(p.key, v, o.value)}
                    className={`rounded-full border px-2.5 py-1 text-[10.5px] transition ${
                      v === o.value
                        ? 'border-cyan-700/55 bg-cyan-600/12 text-cyan-800'
                        : 'border-stone-900/14 text-stone-600 hover:border-stone-900/20'
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
