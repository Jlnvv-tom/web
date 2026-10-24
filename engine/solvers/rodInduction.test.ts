import { describe, expect, it } from 'vitest';
import {
  FIELD_HALF,
  I_ARROW_SCALE,
  V_ARROW_SCALE,
  currentMAOf,
  emfOf,
  forceOf,
  i0MAOf,
  inField,
  rodInductionSolver,
  setupFromParams,
} from '@/engine/solvers/rodInduction';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/* ============================================================
   参数解析
   ============================================================ */

describe('电磁感应 · 参数解析', () => {
  it('默认值 = lessons 常量（x=1.2, B=0.5, L=0.4, v=1.5, R=2）', () => {
    const s = setupFromParams({});
    expect(close(s.x, 1.2)).toBe(true);
    expect(close(s.B, 0.5)).toBe(true);
    expect(close(s.L, 0.4)).toBe(true);
    expect(close(s.v, 1.5)).toBe(true);
    expect(close(s.R, 2)).toBe(true);
  });

  it('v 可以为 0（静止），位置被裁剪在 [0,4]', () => {
    const s = setupFromParams({ v: 0, x: -1 });
    expect(s.v).toBe(0);
    expect(s.x).toBe(0);
    const s2 = setupFromParams({ x: 9 });
    expect(s2.x).toBe(4);
  });

  it('R 下限 0.1 Ω（防除零）', () => {
    expect(setupFromParams({ R: 0 }).R).toBeGreaterThan(0);
  });
});

/* ============================================================
   lessons 手算期望值（独立推得）
   ============================================================ */

describe('电磁感应 · lessons 迁移期望值', () => {
  it('x=1.2（磁场中）：ε=0.300 V、I=150 mA', () => {
    const s = setupFromParams({ x: 1.2 });
    expect(close(emfOf(s), 0.3, 1e-12)).toBe(true); // 0.5·0.4·1.5
    expect(close(currentMAOf(s), 150, 1e-9)).toBe(true); // 0.3/2 A
  });

  it('x=3.5（离开磁场）：ε=0、I=0，但 I₀ 仍为 150 mA（守恒读数）', () => {
    const s = setupFromParams({ x: 3.5 });
    expect(inField(s)).toBe(0);
    expect(close(emfOf(s), 0, 1e-12)).toBe(true);
    expect(close(currentMAOf(s), 0, 1e-12)).toBe(true);
    expect(close(i0MAOf(s), 150, 1e-9)).toBe(true);
  });

  it('I₀ 与位置无关：x=1.2 与 x=3.5 都是 150 mA', () => {
    expect(i0MAOf(setupFromParams({ x: 1.2 }))).toBe(i0MAOf(setupFromParams({ x: 3.5 })));
  });

  it('磁场边界 x=3：3.0 算离开，2.99 算在内', () => {
    expect(inField(setupFromParams({ x: 2.99 }))).toBe(1);
    expect(inField(setupFromParams({ x: 3 }))).toBe(0);
    expect(FIELD_HALF).toBe(3);
  });

  it('v=0（静止）：无电流，虽然棒仍在磁场中', () => {
    const s = setupFromParams({ x: 1.2, v: 0 });
    expect(inField(s)).toBe(1);
    expect(close(emfOf(s), 0, 1e-12)).toBe(true);
  });
});

/* ============================================================
   方向（修正 lessons 的错误：I 必须沿 −z）
   ============================================================ */

describe('电磁感应 · 矢量方向', () => {
  it('I 沿 −z：v(+x) × B(−y) = −z，安培力阻碍运动', () => {
    const st = rodInductionSolver.sample(0, ctx({ x: 1.2 }));
    const I = st.vectors.I!;
    expect(I[2]).toBeLessThan(0); // 向里
    expect(I[0]).toBe(0);
    expect(I[1]).toBe(0);
  });

  it('安培力沿 −x（与运动方向相反）', () => {
    // F = B·I·L，方向由 L̂ × B̂ 定：L̂=−ẑ、B̂=−ŷ → (−ẑ)×(−ŷ) = −x̂
    const s = setupFromParams({ x: 1.2 });
    const F = forceOf(s);
    expect(F).toBeGreaterThan(0); // 大小
    expect(close(F, s.B * currentMAOf(s) / 1000 * s.L, 1e-12)).toBe(true);
    // 默认参数：0.5 × 0.15 × 0.4 = 0.03 N
    expect(close(F, 0.03, 1e-12)).toBe(true);
  });

  it('v 箭头 +x、B 箭头 −y、长度按缩放系数', () => {
    const st = rodInductionSolver.sample(0, ctx({ x: 1.2 }));
    expect(st.vectors.v![0]).toBeCloseTo(V_ARROW_SCALE * 1.5, 12);
    expect(st.vectors.B1![1]).toBeLessThan(0);
    expect(st.vectors.I![2]).toBeCloseTo(-I_ARROW_SCALE * 0.15, 12);
  });
});

/* ============================================================
   不变量
   ============================================================ */

describe('电磁感应 · 不变量', () => {
  it('能量平衡 F·v = I²R（机械功率 = 焦耳热）', () => {
    // 默认：F=0.03 N, v=1.5 → 0.045 W；I=0.15 A, R=2 → 0.045 W
    const s = setupFromParams({});
    expect(close(forceOf(s) * s.v, 0.045, 1e-12)).toBe(true);
    expect(close(currentMAOf(s) / 1000 * currentMAOf(s) / 1000 * s.R, 0.045, 1e-12)).toBe(true);
  });

  it('欧姆定律 I·R = ε（磁场中与离开磁场后都成立）', () => {
    for (const x of [0, 1.2, 2.99, 3, 4]) {
      const s = setupFromParams({ x });
      expect(close(currentMAOf(s) / 1000 * s.R, emfOf(s), 1e-12)).toBe(true);
    }
  });

  it('invariants() 全部接近 0（跨参数扫描）', () => {
    for (const x of [0, 1.2, 3.5]) {
      for (const v of [0, 1.5, 3]) {
        const inv = rodInductionSolver.invariants!(0, ctx({ x, v }));
        for (const [k, val] of Object.entries(inv)) {
          expect(Math.abs(val), `x=${x} v=${v} 时 ${k}=${val}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('增大 B/L/v 或减小 R 都让电流变大（四个因子）', () => {
    const base = currentMAOf(setupFromParams({}));
    expect(currentMAOf(setupFromParams({ B: 1.0 }))).toBeGreaterThan(base);
    expect(currentMAOf(setupFromParams({ L: 0.8 }))).toBeGreaterThan(base);
    expect(currentMAOf(setupFromParams({ v: 3 }))).toBeGreaterThan(base);
    expect(currentMAOf(setupFromParams({ R: 0.5 }))).toBeGreaterThan(base);
    expect(currentMAOf(setupFromParams({ R: 10 }))).toBeLessThan(base);
  });
});

/* ============================================================
   纯函数性
   ============================================================ */

describe('电磁感应 · 纯度', () => {
  it('sample 是纯函数：同参数两次调用深相等', () => {
    const a = rodInductionSolver.sample(2.5, ctx({ x: 1.2 }));
    const b = rodInductionSolver.sample(2.5, ctx({ x: 1.2 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('播放时间不进入读数（参数驱动的静态场景）', () => {
    const a = rodInductionSolver.sample(0, ctx({ x: 1.2 }));
    const b = rodInductionSolver.sample(7.7, ctx({ x: 1.2 }));
    expect(a.scalars).toEqual(b.scalars);
  });

  it('棒随 x 移动：rodC 同步（棒本体是 box 图元，position 绑 rodC）', () => {
    const st = rodInductionSolver.sample(0, ctx({ x: 2.5 }));
    expect(st.points.rodC![0]).toBe(2.5);
    expect(st.lines.rod).toBeUndefined();
  });

  it('duration 固定 48 s', () => {
    expect(rodInductionSolver.duration(ctx({}))).toBe(48);
  });
});
