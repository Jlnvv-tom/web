import { AlertTriangle, X, Check } from 'lucide-react';
import type { PitfallDef } from '@/engine/spec';

/**
 * 破误区卡
 *
 * 产品调研里发现的关键差异点：国内仅 physics-viz 一家在做"易错点"，
 * 而这是学生真正的痛点所在（老师讲对了，学生还是想错）。
 */
export function PitfallCard({ pitfalls }: { pitfalls: PitfallDef[] }) {
  if (!pitfalls.length) return null;

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-center gap-2">
        <AlertTriangle size={13} className="text-amber-700" />
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-stone-700">破误区</h2>
        <span className="ml-1 rounded-full bg-amber-500/14 px-2 py-0.5 text-[9.5px] font-semibold text-amber-700/90">
          {pitfalls.length} 个常见错因
        </span>
      </header>

      <div className="space-y-2.5">
        {pitfalls.map((p, i) => (
          <article key={i} className="rounded-xl border border-stone-900/10 bg-white/[0.025] p-3">
            <h3 className="flex items-start gap-1.5 text-[12.5px] font-semibold text-stone-900">
              <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              {p.title}
            </h3>

            {(p.wrong || p.right) && (
              <div className="mt-2 space-y-1.5">
                {p.wrong ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-red-600/10 px-2 py-1.5 text-[11px] leading-relaxed text-red-800/80">
                    <X size={11} className="mt-[3px] shrink-0 text-red-700" />
                    <span>{p.wrong}</span>
                  </p>
                ) : null}
                {p.right ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-emerald-600/10 px-2 py-1.5 text-[11px] leading-relaxed text-emerald-800/85">
                    <Check size={11} className="mt-[3px] shrink-0 text-emerald-700" />
                    <span>{p.right}</span>
                  </p>
                ) : null}
              </div>
            )}

            <p className="mt-2 text-[11px] leading-relaxed text-stone-600">{p.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
