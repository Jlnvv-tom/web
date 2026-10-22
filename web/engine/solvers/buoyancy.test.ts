import { describe, expect, it } from 'vitest';
import {
  G,
  TANK_DEPTH,
  apparentWeight,
  bottomV,
  bottomY,
  buoyancyForce,
  buoyancySolver,
  displacedVolume,
  equilibriumDepth,
  floatRatio,
  massOf,
  lowPoint,
  phaseOffset,
  setupFromParams,
  submergedDepth,
  waterlineRect,
  weightOf,
} from '@/engine/solvers/buoyancy';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

/** 木块：ρ=600 kg/m³，边长 20 cm，液体为水 1000 kg/m³ */
const WOOD = { rhoB: 600, rhoL: 1000, L: 20, T: 6 };

/* ============================================================
   运动学
   ============================================================ */

describe('浮力 · 运动学', () => {
  it('t=T 回到原位（周期性）', () => {
    const s = setupFromParams(WOOD);
    expect(close(bottomY(0, s), bottomY(s.T, s), 1e-12)).toBe(true);
  });

  it('t=0 恰好半浸没（取景需要，见 phaseOffset 注释）', () => {
    const s = setupFromParams(WOOD);
    // 底面在 -L/2，浸入深度 h = L/2
    expect(close(bottomY(0, s), -s.L / 2, 1e-12)).toBe(true);
    expect(close(submergedDepth(bottomY(0, s), s), s.L / 2, 1e-12)).toBe(true);
  });

  it('整周期内确实能到全露出与全浸没两个极端', () => {
    const s = setupFromParams(WOOD);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const y = bottomY((i / 400) * s.T, s);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    }
    // 最高时底面高于液面 → 完全露出；最低时底面低于 -L → 完全浸没
    expect(yMax).toBeGreaterThan(0);
    expect(yMin).toBeLessThan(-s.L);
  });

  it('折返点（cos = ±1 处）速度为 0', () => {
    const s = setupFromParams(WOOD);
    const w = (2 * Math.PI) / s.T;
    const f0 = phaseOffset(s);
    for (const k of [0, 1, 2]) {
      const t = ((k * Math.PI - f0) / w + s.T) % s.T;
      expect(Math.abs(bottomV(t, s)), `k=${k} t=${t}`).toBeLessThan(1e-10);
    }
  });

  it('初相让 t=0 的速度非零（不是停在折返点上）', () => {
    const s = setupFromParams(WOOD);
    expect(Math.abs(bottomV(0, s))).toBeGreaterThan(1e-3);
  });

  it('数值微分与解析速度一致', () => {
    const s = setupFromParams(WOOD);
    for (const t of [0.4, 1.3, 2.8, 4.6]) {
      const h = 1e-5;
      const fd = (bottomY(t + h, s) - bottomY(t - h, s)) / (2 * h);
      expect(close(fd, bottomV(t, s), 1e-4), `t=${t}`).toBe(true);
    }
  });

  it('物体不会撞到水槽底部', () => {
    const s = setupFromParams(WOOD);
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * s.T;
      expect(bottomY(t, s)).toBeGreaterThan(-TANK_DEPTH + 0.05);
    }
  });
});

/* ============================================================
   浸入深度与排开体积
   ============================================================ */

describe('浮力 · 浸入体积', () => {
  it('完全露出时浸入深度为 0', () => {
    const s = setupFromParams(WOOD);
    expect(submergedDepth(0.5, s)).toBe(0);
    expect(submergedDepth(0, s)).toBe(0);
  });

  it('完全浸没时浸入深度等于边长', () => {
    const s = setupFromParams(WOOD);
    expect(close(submergedDepth(-s.L, s), s.L, 1e-12)).toBe(true);
    expect(close(submergedDepth(-5, s), s.L, 1e-12)).toBe(true);
  });

  it('部分浸入时深度等于液面以下的高度', () => {
    const s = setupFromParams(WOOD);
    expect(close(submergedDepth(-0.07, s), 0.07, 1e-12)).toBe(true);
  });

  it('排开体积 = 底面积 × 浸入深度', () => {
    const s = setupFromParams(WOOD);
    const yb = -0.05;
    expect(close(displacedVolume(yb, s), s.L * s.L * 0.05, 1e-15)).toBe(true);
  });

  it('排开体积不超过物体总体积', () => {
    const s = setupFromParams(WOOD);
    expect(displacedVolume(-100, s)).toBeLessThanOrEqual(s.L ** 3 + 1e-15);
  });
});

/* ============================================================
   阿基米德原理
   ============================================================ */

describe('浮力 · 阿基米德原理', () => {
  it('F_浮 = ρ_液 · g · V_排（任意深度）', () => {
    const s = setupFromParams(WOOD);
    for (const yb of [0.1, 0, -0.03, -0.1, -0.2, -0.5]) {
      expect(close(buoyancyForce(yb, s), s.rhoL * G * displacedVolume(yb, s), 1e-12)).toBe(true);
    }
  });

  it('完全浸没后浮力不再随深度变化', () => {
    const s = setupFromParams(WOOD);
    const f1 = buoyancyForce(-s.L, s);
    const f2 = buoyancyForce(-s.L - 0.4, s);
    expect(close(f1, f2, 1e-12)).toBe(true);
  });

  it('完全浸没时浮力 = ρ_液 g L³（数值核对）', () => {
    const s = setupFromParams(WOOD);
    expect(close(buoyancyForce(-s.L, s), 1000 * 9.8 * 0.2 ** 3, 1e-12)).toBe(true);
    expect(close(buoyancyForce(-s.L, s), 78.4, 1e-9)).toBe(true);
  });

  it('部分浸入时浮力与浸入深度成正比', () => {
    const s = setupFromParams(WOOD);
    const k1 = buoyancyForce(-0.04, s) / 0.04;
    const k2 = buoyancyForce(-0.11, s) / 0.11;
    expect(close(k1, k2, Math.abs(k1) * 1e-12)).toBe(true);
    expect(close(k1, s.rhoL * G * s.L * s.L, Math.abs(k1) * 1e-12)).toBe(true);
  });

  it('视重 = 重力 − 浮力，且不为负', () => {
    const s = setupFromParams(WOOD);
    for (const yb of [0.1, 0, -0.05, -0.2, -0.6]) {
      const N = apparentWeight(yb, s);
      expect(close(N, Math.max(0, weightOf(s) - buoyancyForce(yb, s)), 1e-12)).toBe(true);
      expect(N).toBeGreaterThanOrEqual(0);
    }
  });

  it('完全露出时视重等于重力', () => {
    const s = setupFromParams(WOOD);
    expect(close(apparentWeight(0.3, s), weightOf(s), 1e-12)).toBe(true);
  });
});

/* ============================================================
   浮沉判据
   ============================================================ */

describe('浮力 · 浮沉判据', () => {
  it('漂浮：平衡时浸入比例 = ρ_物 / ρ_液', () => {
    const s = setupFromParams({ rhoB: 600, rhoL: 1000, L: 20, T: 6 });
    expect(close(floatRatio(s), 0.6, 1e-12)).toBe(true);
    expect(close(equilibriumDepth(s), 0.12, 1e-12)).toBe(true);
  });

  it('漂浮平衡时浮力恰好等于重力', () => {
    const s = setupFromParams({ rhoB: 600, rhoL: 1000, L: 20, T: 6 });
    const eq = equilibriumDepth(s);
    expect(close(s.rhoL * G * s.L * s.L * eq, weightOf(s), 1e-9)).toBe(true);
  });

  it('悬浮：ρ_物 = ρ_液 时整体没入且视重为 0', () => {
    const s = setupFromParams({ rhoB: 1000, rhoL: 1000, L: 20, T: 6 });
    expect(close(floatRatio(s), 1, 1e-12)).toBe(true);
    expect(close(equilibriumDepth(s), s.L, 1e-12)).toBe(true);
    expect(close(apparentWeight(-s.L, s), 0, 1e-9)).toBe(true);
  });

  it('下沉：ρ_物 > ρ_液 时完全浸没后浮力仍小于重力', () => {
    const s = setupFromParams({ rhoB: 7800, rhoL: 1000, L: 20, T: 6 });
    expect(buoyancyForce(-s.L, s)).toBeLessThan(weightOf(s));
    expect(apparentWeight(-s.L, s)).toBeGreaterThan(0);
  });

  it('浸入比例随密度单调：ρ_物 越大浸入越深', () => {
    let prev = -1;
    for (const rhoB of [200, 500, 800, 1000]) {
      const s = setupFromParams({ rhoB, rhoL: 1000, L: 20, T: 6 });
      const r = equilibriumDepth(s) / s.L;
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });

  it('完全浸没后视重与深度无关（沉底前）', () => {
    const s = setupFromParams({ rhoB: 7800, rhoL: 1000, L: 20, T: 6 });
    expect(close(apparentWeight(-s.L, s), apparentWeight(-s.L - 0.3, s), 1e-9)).toBe(true);
  });
});

/* ============================================================
   求解器契约
   ============================================================ */

describe('浮力 · 求解器', () => {
  it('duration 为一个周期', () => {
    expect(close(buoyancySolver.duration(ctx(WOOD)), 6, 1e-12)).toBe(true);
  });

  it('sample 是纯函数', () => {
    const a = buoyancySolver.sample(2.5, ctx(WOOD));
    const b = buoyancySolver.sample(2.5, ctx(WOOD));
    expect(a.points.blockC).toEqual(b.points.blockC);
    expect(a.scalars.Fb).toBe(b.scalars.Fb);
  });

  it('任意参数组合都不出 NaN', () => {
    for (const rhoB of [10, 500, 1000, 13000]) {
      for (const rhoL of [10, 1000, 13000]) {
        for (const L of [3, 20, 30]) {
          for (const t of [0, 1.5, 3, 6]) {
            const st = buoyancySolver.sample(t, ctx({ rhoB, rhoL, L, T: 6 }));
            for (const v of Object.values(st.scalars)) {
              expect(Number.isFinite(v), `rhoB=${rhoB} rhoL=${rhoL} L=${L} t=${t}`).toBe(true);
            }
            for (const p of Object.values(st.points)) {
              for (const c of p) expect(Number.isFinite(c)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('水线矩形只在部分浸入时存在', () => {
    const s = setupFromParams(WOOD);
    // t=0 是半浸没（初相刻意如此）→ 水线存在，且是一个闭合的 5 点矩形
    const half = buoyancySolver.sample(0, ctx(WOOD));
    expect(half.lines.waterline!.length).toBe(5);
    expect(half.meta!.state).toBe('partial');
    // T/2 落在最低处附近 → 完全浸没，水线消失
    expect(buoyancySolver.sample(s.T / 2, ctx(WOOD)).lines.waterline!.length).toBe(0);
    // 部分浸入：找一个中间时刻
    let found = false;
    for (let i = 0; i <= 200 && !found; i++) {
      const st = buoyancySolver.sample((i / 200) * s.T, ctx(WOOD));
      if (st.lines.waterline!.length > 0) found = true;
    }
    expect(found).toBe(true);
  });
});
