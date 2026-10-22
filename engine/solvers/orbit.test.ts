import { describe, expect, it } from 'vitest';
import {
  AU,
  G,
  YEAR,
  areaRate,
  gmOf,
  orbitPath,
  orbitSolver,
  periodOf,
  periodYears,
  positionAt,
  radiusAt,
  setupFromParams,
  solveKepler,
  speedAt,
} from '@/engine/solvers/orbit';
import type { SolverCtx } from '@/engine/solvers/types';
import { len } from '@/engine/vec';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const EARTH = { a: 1, e: 0.0167, M: 1.989, a2: 2.2, e2: 0.1 };

/* ============================================================
   开普勒方程与轨道几何
   ============================================================ */

describe('天体运动 · 开普勒方程', () => {
  it('牛顿迭代解开普勒方程：E − e·sinE = M', () => {
    for (const e of [0, 0.1, 0.35, 0.7, 0.85]) {
      for (const M of [0.3, 1.7, 3.9, 6.0]) {
        const E = solveKepler(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12);
      }
    }
  });

  it('轨道上任意点到两焦点距离之和 = 2a（椭圆的定义）', () => {
    const a = 1.5 * AU;
    const e = 0.35;
    const f2 = [-2 * a * e, 0, 0] as [number, number, number];
    for (let i = 0; i < 40; i++) {
      const p = positionAt((i / 40) * 2 * Math.PI, a, e);
      const d1 = Math.hypot(p[0], p[1]);
      const d2 = Math.hypot(p[0] - f2[0], p[1] - f2[1]);
      expect(close(d1 + d2, 2 * a, 1e-3)).toBe(true);
    }
  });

  it('近日点 r = a(1−e)，远日点 r = a(1+e)', () => {
    const a = 1.5 * AU;
    const e = 0.35;
    expect(close(radiusAt(0, a, e), a * (1 - e), 1e-6)).toBe(true);
    expect(close(radiusAt(Math.PI, a, e), a * (1 + e), 1e-6)).toBe(true);
  });

  it('e = 0 时退化为圆：r 与 v 都恒定', () => {
    const a = AU;
    const gm = gmOf(1.989);
    for (const M of [0, 1, 2.5, 4.7, 6.2]) {
      expect(close(radiusAt(M, a, 0), a, 1e-9)).toBe(true);
      expect(close(speedAt(M, a, 0, gm), speedAt(0, a, 0, gm), 1e-9)).toBe(true);
    }
  });

  it('轨道始终在同一平面（z = 0）', () => {
    const path = orbitPath(1.5 * AU, 0.4);
    for (const p of path) expect(Math.abs(p[2])).toBeLessThan(1e-9);
  });
});

/* ============================================================
   开普勒三大定律
   ============================================================ */

describe('天体运动 · 三大定律', () => {
  it('第三定律：T = 2π√(a³/GM)，地球约 1 年', () => {
    const gm = gmOf(1.989);
    expect(periodOf(AU, gm) / YEAR).toBeCloseTo(1, 2);
    expect(periodYears(AU, gm)).toBeCloseTo(1, 2);
  });

  it('第三定律：a 变 4 倍 → T 变 8 倍', () => {
    const gm = gmOf(1.989);
    const t1 = periodOf(AU, gm);
    const t2 = periodOf(4 * AU, gm);
    expect(t2 / t1).toBeCloseTo(8, 6);
  });

  it('第三定律：T 与偏心率无关', () => {
    const gm = gmOf(1.989);
    expect(close(periodOf(AU, gm), periodOf(AU, gm), 1e-12)).toBe(true);
    const s = setupFromParams({ ...EARTH, e: 0.6 });
    // 直接比较求解器在两个偏心率下给出的周期读数
    const a = orbitSolver.sample(0, ctx({ ...EARTH, e: 0.017 })).scalars.T!;
    const b = orbitSolver.sample(0, ctx({ ...EARTH, e: 0.6 })).scalars.T!;
    expect(close(a, b, 1e-6)).toBe(true);
    void s;
  });

  it('第一定律：轨道是椭圆，中心天体在一个焦点上', () => {
    const params = { ...EARTH, e: 0.5 };
    const st = orbitSolver.sample(0, ctx(params));
    const r0 = st.scalars.r!;
    // 用求解器自己的周期取半周期点（不要用常量 YEAR，会引入 0.15% 偏差）
    const st2 = orbitSolver.sample(st.scalars.T! / 2, ctx(params));
    // 近日点 → 远日点，日心距从 a(1−e) 变成 a(1+e)
    expect(st2.scalars.r! / r0).toBeCloseTo(1.5 / 0.5, 6);
    expect(st.points.star).toEqual([0, 0, 0]); // 中心天体在原点（焦点）
    expect(st.points.emptyFocus![0]).toBeLessThan(0); // 另一个焦点在左侧
  });

  it('第二定律：相等时间扫过相等面积（近日点 vs 远日点）', () => {
    // 512 段折线的离散化误差约 1e-6，阈值取 1e-5
    const inv = orbitSolver.invariants!(0.3, ctx({ ...EARTH, e: 0.5 }));
    expect(Math.abs(inv.areaRateError!)).toBeLessThan(1e-5);
    expect(Math.abs(inv.areaRateErrorFar!)).toBeLessThan(1e-5);
    // 两处扫过的面积读数必须相等
    const near = orbitSolver.sample(0, ctx({ ...EARTH, e: 0.5 })).scalars;
    expect(close(near.areaNow!, near.areaRef!, 1e-6)).toBe(true);
  });

  it('第二定律：面积速率 = ½√(GM·a(1−e²))（读数单位 AU²/年）', () => {
    const gm = gmOf(1.989);
    const a = 1.5 * AU;
    const e = 0.35;
    const st = orbitSolver.sample(0, ctx({ ...EARTH, a: 1.5, e }));
    const expectAU = (areaRate(a, e, gm) * YEAR) / (AU * AU);
    expect(close(st.scalars.areaRate!, expectAU, 1e-6)).toBe(true);
    // 扫过面积读数 = 速率 × 时间（1/8 周期）
    expect(close(st.scalars.areaNow!, expectAU * (st.scalars.T! / 8), 1e-6)).toBe(true);
  });

  it('活力公式：近日点速率 / 远日点速率 = (1+e)/(1−e)', () => {
    const gm = gmOf(1.989);
    const st = orbitSolver.sample(0, ctx({ ...EARTH, e: 0.5 }));
    expect(close(st.scalars.vPeri! / st.scalars.vAp!, 1.5 / 0.5, 1e-9)).toBe(true);
    void gm;
  });

  it('比耐能量守恒：v²/2 − GM/r = −GM/(2a)', () => {
    for (const t of [0, 0.3, 1.1, 2.4]) {
      const inv = orbitSolver.invariants!(t, ctx({ ...EARTH, e: 0.4 }));
      expect(Math.abs(inv.energyDrift!)).toBeLessThan(1e-12);
    }
  });
});

/* ============================================================
   工程性质
   ============================================================ */

describe('天体运动 · 工程性质', () => {
  it('sample 是纯函数', () => {
    const c = ctx(EARTH);
    const a = orbitSolver.sample(0.7, c);
    orbitSolver.sample(0.2, c);
    const b = orbitSolver.sample(0.7, c);
    expect(a.points.planet).toEqual(b.points.planet);
    expect(a.scalars).toEqual(b.scalars);
  });

  it('边界参数（大偏心率、小质量）不出 NaN', () => {
    const combos: Record<string, number | boolean>[] = [
      { a: 0.05, e: 0.85, M: 0.02, a2: 5, e2: 0.85 },
      { a: 5, e: 0, M: 3, a2: 0.3, e2: 0 },
      { a: 1, e: 0.35, M: 1.989, a2: 2.2, e2: 0.1, showSecond: false },
    ];
    for (const p of combos) {
      for (const t of [0, 0.5, 2]) {
        const st = orbitSolver.sample(t, ctx(p));
        for (const [k, v] of Object.entries(st.scalars)) {
          expect(Number.isFinite(v), `${JSON.stringify(p)} ${k}=${v}`).toBe(true);
        }
        expect(st.points.planet!.every(Number.isFinite)).toBe(true);
        expect(st.lines.orbit!.length).toBeGreaterThan(100);
      }
    }
  });

  it('每个参数都有可见影响（无死值）', () => {
    const base = orbitSolver.sample(0.5, ctx(EARTH));
    for (const [key, value] of [
      ['a', 2],
      ['e', 0.6],
      ['M', 3],
      ['a2', 0.5],
      ['e2', 0.5],
      ['showSecond', false],
    ] as const) {
      const s = orbitSolver.sample(0.5, ctx({ ...EARTH, [key]: value }));
      const diff = Object.keys(s.scalars).some((k) => s.scalars[k] !== base.scalars[k]);
      const lineDiff = (s.lines.orbit2?.[10]?.[0] ?? 0) !== (base.lines.orbit2?.[10]?.[0] ?? 0);
      expect(diff || lineDiff, `参数 ${key} 无可见影响`).toBe(true);
    }
  });

  it('duration > 0，且一整周期后回到出发点', () => {
    const dur = orbitSolver.duration(ctx(EARTH));
    expect(dur).toBeGreaterThan(1); // 单位：地球年
    const a = orbitSolver.sample(0, ctx(EARTH));
    const b = orbitSolver.sample(dur / 4, ctx(EARTH)); // 半个周期（dur = 2T）
    expect(a.points.planet).not.toEqual(b.points.planet);
    const c = orbitSolver.sample(periodYears(AU, gmOf(1.989)), ctx(EARTH));
    // 场景输出单位是 AU（1 AU 量级），容差用 1e-6 AU
    expect(close(a.points.planet![0], c.points.planet![0], 1e-6)).toBe(true);
  });

  it('场景长度单位是 AU：几何输出不出现 1e11 量级', () => {
    const st = orbitSolver.sample(0, ctx({ ...EARTH, a: 1, e: 0 }));
    // 圆轨道 a = 1 AU → 行星到原点距离恰好 1 个世界单位
    expect(st.points.planet![0]).toBeCloseTo(1, 9);
    expect(Math.abs(st.points.planet![0])).toBeLessThan(10);
    for (const p of st.lines.orbit!) {
      expect(Math.abs(p[0])).toBeLessThan(10);
      expect(Math.abs(p[1])).toBeLessThan(10);
    }
    // scalars 里的 r 仍是 SI（m），不能被一起缩放
    expect(st.scalars.r!).toBeGreaterThan(1e10);
    expect(st.scalars.rAU!).toBeCloseTo(1, 9);
    // HUD 标 AU 的量必须真的是 AU
    expect(st.scalars.perihelion!).toBeCloseTo(1, 6);
    expect(st.scalars.aphelion!).toBeCloseTo(1, 6);
  });

  it('showSecond 开关落到 scalars（visible 绑定只认 scalars）', () => {
    expect(orbitSolver.sample(0, ctx({ ...EARTH, showSecond: true })).scalars.showSecond).toBe(1);
    expect(orbitSolver.sample(0, ctx({ ...EARTH, showSecond: false })).scalars.showSecond).toBe(0);
  });

  it('GM 与质量换算正确（G·M）', () => {
    // 量级 1e20，必须用相对容差（绝对容差会被 1 ulp 的舍入差骗到）
    const expected = G * 1.989e30;
    expect(Math.abs(gmOf(1.989) - expected) / expected).toBeLessThan(1e-12);
  });
});
