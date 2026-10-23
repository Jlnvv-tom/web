'use client';

import type { ChartDef, ReadoutDef } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';
import { SeriesChart } from './SeriesChart';
import { EasedNumber } from './EasedNumber';

export function Hud({ readouts, charts, store }: { readouts: ReadoutDef[]; charts?: ChartDef[]; store: PlayerStoreApi }) {
  const hud = store((s) => s.hud);

  return (
    <section className="panel p-3">
      <header className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[11px] font-bold tracking-[0.18em] text-stone-700">实时读数</h3>
        <span className="h-1 w-1 rounded-full bg-cyan-600 shadow-none" />
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {readouts.map((r) => {
          const isMeta = r.bind.startsWith('meta.');
          const raw = isMeta ? hud.meta[r.bind.slice(5)] : hud.scalars[r.bind];
          return (
            <div key={r.bind} title={r.hint} className={isMeta ? 'col-span-2 min-w-0' : 'min-w-0'}>
              <dt className="truncate text-[10.5px] text-stone-600">{r.label}</dt>
              <dd
                className={`font-mono text-[14px] font-bold tabular-nums ${
                  r.constant ? 'text-emerald-700' : 'text-stone-900'
                }`}
              >
                {typeof raw === 'number' ? (
                  // 数字走补间：滑块一动，读数是"滚"过去的，不是"跳"过去的
                  <EasedNumber value={raw} digits={r.digits ?? 2} />
                ) : typeof raw === 'string' ? (
                  raw
                ) : (
                  '—'
                )}
                {r.unit ? <span className="ml-0.5 text-[10.5px] font-medium text-stone-600">{r.unit}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>

      {charts?.length ? (
        <div className="mt-3 space-y-3">
          {charts.map((c) => (
            <SeriesChart key={c.title} chart={c} all={hud.series} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
