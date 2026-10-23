import Link from 'next/link';
import { ArrowRight, Compass, MousePointerClick, Move3d, Orbit, SlidersHorizontal } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/ui/SiteHeader';
import { SceneCard } from '@/components/ui/SceneCard';
import { HeroOrbit } from '@/components/ui/HeroOrbit';
import { sceneSummaries } from '@/content/scenes';
import { BOOKS } from '@/content/chapters';

export default function HomePage() {
  const scenes = sceneSummaries();
  const juniorBooks = BOOKS.filter((b) => b.stage === 'junior');
  const seniorBooks = BOOKS.filter((b) => b.stage === 'senior');

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
        {/* ============ Hero ============
            参照 Sentry 的做法：一句大标题 + 一句副标题 + 两个 CTA + 一个会动的画面。
            不放版本号、不放统计数字 —— 那些东西只会让人觉得"这是个半成品"。 */}
        <section className="grid-bg relative -mx-4 overflow-hidden px-4 pb-14 pt-12 sm:-mx-6 sm:px-6 sm:pt-16">
          <div className="relative mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6">
            <div className="text-center lg:text-left">
              <span className="chip mx-auto mb-5 lg:mx-0">
                <Orbit size={11} /> 人教版教材同步 · 初高中全覆盖
              </span>
              <h1 className="text-balance text-[30px] font-black leading-[1.15] tracking-tight text-stone-900 sm:text-[44px]">
                把抽象的物理规律
                <br className="sm:hidden" />
                变成<span className="bg-gradient-to-r from-cyan-700 to-sky-700 bg-clip-text text-transparent">能转、能调、能讲透</span>的画面
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-[13px] leading-[1.9] text-stone-600 sm:text-[14px] lg:mx-0">
                不做"实验操作模拟"，只做一件事：把学生脑子里那团想不清楚的三维图景，
                摆到屏幕上让他自己转着看。每个知识点 = 一个真 3D 场景 + 分步讲解 + 易错点 + 预测验证。
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                <Link href={`/topics/${scenes[0]!.id}`} className="btn btn-primary !px-5 !py-2.5 !text-[13px]">
                  先看「洛伦兹力」
                  <ArrowRight size={14} />
                </Link>
                <Link href="/chapters/g2" className="btn !px-5 !py-2.5 !text-[13px]">
                  按教材章节浏览
                </Link>
              </div>

              <ul className="mx-auto mt-9 flex max-w-lg flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-stone-600 lg:mx-0 lg:justify-start">
                <li className="flex items-center gap-1.5">
                  <Move3d size={12} className="text-cyan-700/80" /> 真 3D 自由视角
                </li>
                <li className="flex items-center gap-1.5">
                  <SlidersHorizontal size={12} className="text-cyan-700/80" /> 参数实时可调
                </li>
                <li className="flex items-center gap-1.5">
                  <MousePointerClick size={12} className="text-cyan-700/80" /> 点击对象可高亮
                </li>
              </ul>
            </div>

            <HeroOrbit />
          </div>
        </section>

        {/* ============ 已上线场景 ============ */}
        <section className="mt-4">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-stone-900">先转起来，再听我讲</h2>
              <p className="mt-1 text-[11.5px] text-stone-600">
                每个场景都通过求解器的守恒量自检，并由物理教师审校
              </p>
            </div>
            <Link href="/search" className="hidden text-[11.5px] text-cyan-700/90 hover:text-cyan-800 sm:block">
              查看全部 →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((s) => (
              <SceneCard key={s.id} s={s} />
            ))}
          </div>
        </section>

        {/* ============ 章节体系 ============
            原来这里是「人教版 8 册 · 34 章 · 121 个知识点（初中 43 / 高中 78）」——
            一串小字数字，读起来像报表。改成一句人话 + 定性标签。 */}
        <section className="mt-14">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-stone-900">按教材章节走，讲到哪里点哪里</h2>
            <p className="mt-1 text-[11.5px] text-stone-600">
              从八年级声现象到选择性必修二，跟着课时进度找知识点；标了「已上线」的册子现在就能转着看。
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: '初中', books: juniorBooks, accent: 'from-emerald-600/15' },
              { title: '高中', books: seniorBooks, accent: 'from-cyan-600/15' },
            ].map((group) => (
              <div key={group.title} className="panel overflow-hidden">
                <div className={`border-b border-stone-900/10 bg-gradient-to-r ${group.accent} to-transparent px-4 py-2.5`}>
                  <h3 className="text-[12px] font-bold tracking-[0.16em] text-stone-800">{group.title}</h3>
                </div>
                <div className="divide-y divide-stone-900/10">
                  {group.books.map((b) => {
                    const ready = b.chapters.reduce(
                      (n, c) => n + c.points.filter((p) => p.sceneId).length,
                      0
                    );
                    return (
                      <Link
                        key={b.id}
                        href={`/chapters/${b.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-cyan-600/[0.05]"
                      >
                        <span className="w-[86px] shrink-0 text-[11.5px] font-medium text-stone-700">{b.title}</span>
                        <span className="flex-1 truncate text-[10.5px] text-stone-500">{b.subtitle}</span>
                        {/* 定性标签代替「N 个场景」：读者要的是"这里有没有东西"，不是精确到个位数 */}
                        {ready > 0 ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-600/10 px-2 py-[2px] text-[9.5px] font-semibold text-cyan-800">
                            <Compass size={9} /> 已上线
                          </span>
                        ) : (
                          <span className="shrink-0 text-[9.5px] text-stone-500">规划中</span>
                        )}
                        <ArrowRight size={12} className="shrink-0 text-stone-500" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============ 方法与诚实 ============ */}
        <section className="mt-14 grid gap-3 sm:grid-cols-3">
          {[
            {
              t: '只做"真的需要 3D"的知识点',
              d: '受力分析图 2D 更清楚，就不做 3D。只有洛伦兹力、等势面、天体轨道这类"平面图讲不明白"的才上三维。',
            },
            {
              t: '参数可调，结论可验证',
              d: '每个场景的参数都由解析解驱动，调完立刻重算。看到的现象和教材公式严丝合缝，不是预渲染动画。',
            },
            {
              t: '先预测，再看结果',
              d: '练习采用 POE 结构：押一个答案，再一键把参数改成你选的那个条件，亲眼验证——错一次比看十遍有用。',
            },
          ].map((x) => (
            <div key={x.t} className="panel p-4">
              <h3 className="text-[12.5px] font-semibold text-stone-900">{x.t}</h3>
              <p className="mt-2 text-[11px] leading-[1.85] text-stone-600">{x.d}</p>
            </div>
          ))}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
