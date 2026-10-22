import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { FormulaDef } from '@/engine/spec';

/**
 * 公式卡：KaTeX 在服务端渲染成静态 HTML，零客户端 JS
 *
 * `mathml` 是给**离线单文件**用的。KaTeX 的 HTML 输出要靠自己的 CSS 和
 * 一整套 woff2 字体（内联进单文件要额外 600 KB+），而 MathML 由浏览器
 * 原生渲染，零额外资源。代价是字形略逊，离线场景下这个交换是值的。
 */
export function FormulaCard({ formulas, mathml = false }: { formulas: FormulaDef[]; mathml?: boolean }) {
  if (!formulas.length) return null;

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-[11px] font-bold tracking-[0.18em] text-slate-300">核心公式</h2>
        <span className="h-px flex-1 bg-gradient-to-r from-cyan-400/30 to-transparent" />
      </header>

      <div className="space-y-3">
        {formulas.map((f, i) => (
          <div key={i} className="rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5">
            <div
              className="formula text-[15px] text-slate-100"
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(f.tex, {
                  displayMode: true,
                  throwOnError: false,
                  strict: false,
                  output: mathml ? 'mathml' : 'html',
                }),
              }}
            />
            {f.caption ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{f.caption}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
