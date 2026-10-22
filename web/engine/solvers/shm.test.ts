import { beforeEach, describe, expect, it } from 'vitest';
import {
  SPRING_NATURAL,
  SPRING_WALL_X,
  angleAt,
  bobPosition,
  displacement,
  energyAt,
  omega,
  period,
  refPoint,
  setupFromParams,
  shmSolver,
  velocity,
} from '@/engine/solvers/shm';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const PENDULUM: Record<string, number | string> = { mode: 'pendulum', L: 1, A: 0.25, m: 0.5, g: 9.8 };
const SPRING: Record<string, number | string> = { mode: 'spring', k: 5, A: 0.25, m: 0.5 };

beforeEach(() => undefined);

/* ============================================================
   周期
   ============================================================ */

describe('简谐运动 · 周期', () => {
  it('单摆 T = 2π√(L/g)', () => {
    const s = setupFromParams(PENDULUM);
    expect(close(period(s), 2 * Math.PI * Math.sqrt(1 / 9.8), 1e-12)).toBe(true);
  });

  it('弹簧振子 T = 2π√(m/k)', () => {
    const s = setupFromParams(SPRING);
    expect(close(period(s), 2 * Math.PI * Math.sqrt(0.5 / 5), 1e-12)).toBe(true);
  });

  it('周期与振幅无关（这是"简谐"的定义性特征）', () => {
    const a = period(setupFromParams({ ...PENDULUM, A: 0.05 }));
    const b = period(setupFromParams({ ...PENDULUM, A: 0.3 }));
    expect(close(a, b, 1e-12)).toBe(true);

    const c = period(setupFromParams({ ...SPRING, A: 0.1 }));
    const d = period(setupFromParams({ ...SPRING, A: 0.5 }));
    expect(close(c, d, 1e-12)).toBe(true);
  });

  it('月球上（g=1.6）单摆周期变成地球的 √(9.8/1.6) 倍', () => {
    const earth = period(setupFromParams(PENDULUM));
    const moon = period(setupFromParams({ ...PENDULUM, g: 1.6 }));
    expect(moon / earth).toBeCloseTo(Math.sqrt(9.8 / 1.6), 9);
    expect(moon).toBeGreaterThan(earth);
  });

  it('重力加速度不影响弹簧振子周期', () => {
    const a = period(setupFromParams({ ...SPRING, g: 9.8 }));
    const b = period(setupFromParams({ ...SPRING, g: 1.6 }));
    expect(close(a, b, 1e-12)).toBe(true);
  });
});

/* ============================================================
   运动学
   ============================================================ */

describe('简谐运动 · 运动学', () => {
  it('位移满足 ẍ = −ω²x（用数值二阶导验证）', () => {
    const s = setupFromParams(PENDULUM);
    const h = 1e-4;
    for (const t of [0.3, 1.1, 2.7]) {
      const d2 = (displacement(t + h, s) - 2 * displacement(t, s) + displacement(t - h, s)) / (h * h);
      expect(close(d2, -(omega(s) ** 2) * displacement(t, s), 1e-4)).toBe(true);
    }
  });

  it('最大速率 v_max = Aω，出现在平衡位置', () => {
    const s = setupFromParams(SPRING);
    const T = period(s);
    // T/4 时经过平衡位置
    expect(Math.abs(velocity(T / 4, s))).toBeCloseTo(s.A * omega(s), 9);
    // 端点速度为 0
    expect(Math.abs(velocity(0, s))).toBeLessThan(1e-12);
  });

  it('参考圆的 x 投影就是振子的位移（3D  insight 的数学依据）', () => {
    const s = setupFromParams(PENDULUM);
    for (const t of [0, 0.4, 1.3, 2.2]) {
      expect(close(refPoint(t, s)[0], displacement(t, s), 1e-12)).toBe(true);
    }
  });

  it('单摆摆角振幅 = A/L（弧度）', () => {
    const s = setupFromParams(PENDULUM);
    expect(close(angleAt(0, s), 0.25, 1e-12)).toBe(true); // A/L = 0.25 rad
  });

  it('单摆悬点在上方，振子永远在悬点下方', () => {
    const s = setupFromParams(PENDULUM);
    for (const t of [0, 0.3, 0.8, 1.5, 2.4]) {
      const bob = bobPosition(t, s);
      expect(bob[1]).toBeLessThan(s.L); // 低于悬点 y=L
      expect(bob[1]).toBeGreaterThan(0);
      expect(Math.hypot(bob[0], bob[1] - s.L)).toBeCloseTo(s.L, 9); // 绳长不变
    }
  });

  it('弹簧振子被墙约束在墙右侧', () => {
    const s = setupFromParams(SPRING);
    for (const t of [0, 0.1, 0.3, 0.6]) {
      expect(bobPosition(t, s)[0]).toBeGreaterThan(SPRING_WALL_X);
      expect(bobPosition(t, s)[0]).toBeGreaterThanOrEqual(SPRING_WALL_X + SPRING_NATURAL - s.A - 1e-9);
    }
  });
});

/* ============================================================
   能量
   ============================================================ */

describe('简谐运动 · 能量', () => {
  it('机械能守恒（单摆，小角近似内）', () => {
    // 注意：这里测的是"线性化动力学 + 精确势能"的组合。
    // 漂移不是数值误差，而是小角近似本身的 O(θ³) 误差，
    // 因此阈值是 2e-3 而不是 1e-12——并且它必须随 θ₀² 缩小（下一条测试）。
    const inv = shmSolver.invariants!(0.7, ctx(PENDULUM));
    expect(Math.abs(inv.energyDrift!)).toBeLessThan(2e-3);
  });

  it('单摆能量漂移随振幅平方缩小（证明它是近似误差，不是 bug）', () => {
    const big = Math.abs(shmSolver.invariants!(0.7, ctx({ ...PENDULUM, A: 0.3 })).energyDrift!);
    const small = Math.abs(shmSolver.invariants!(0.7, ctx({ ...PENDULUM, A: 0.05 })).energyDrift!);
    expect(small).toBeLessThan(big / 20);
  });

  it('机械能守恒（弹簧）', () => {
    const inv = shmSolver.invariants!(0.2, ctx(SPRING));
    expect(Math.abs(inv.energyDrift!)).toBeLessThan(1e-12);
  });

  it('总能量 = ½m(Aω)²', () => {
    const s = setupFromParams(SPRING);
    const e = 0.5 * s.m * (s.A * omega(s)) ** 2;
    for (const t of [0, 0.1, 0.25, 0.4]) {
      const { KE, PE } = energyAt(t, s);
      expect(close(KE + PE, e, 1e-9)).toBe(true);
    }
  });

  it('端点动能为零、平衡位置势能为零', () => {
    const s = setupFromParams(SPRING);
    expect(energyAt(0, s).KE).toBeLessThan(1e-12); // 端点
    expect(energyAt(period(s) / 4, s).PE).toBeLessThan(1e-12); // 平衡位置
  });

  it('动能与势能此消彼长，一个周期内互换两次', () => {
    const s = setupFromParams(SPRING);
    const T = period(s);
    const k0 = energyAt(0, s).KE;
    const k1 = energyAt(T / 2, s).KE;
    expect(close(k0, k1, 1e-9)).toBe(true); // 半个周期后回到同样状态
    const kmax = energyAt(T / 4, s).KE;
    expect(kmax).toBeGreaterThan(k0);
  });
});

/* ============================================================
   工程性质
   ============================================================ */

describe('简谐运动 · 工程性质', () => {
  it('sample 是纯函数', () => {
    const c = ctx(PENDULUM);
    const a = shmSolver.sample(1.2, c);
    shmSolver.sample(0.3, c);
    const b = shmSolver.sample(1.2, c);
    expect(a.points.bob).toEqual(b.points.bob);
    expect(a.scalars).toEqual(b.scalars);
  });

  it('边界参数组合不出 NaN', () => {
    const combos: Record<string, number | string>[] = [
      { mode: 'pendulum', L: 0.2, A: 0.5, m: 0.1, g: 1.6 },
      { mode: 'pendulum', L: 2, A: 0.05, m: 2, g: 12 },
      { mode: 'spring', k: 1, A: 0.5, m: 2, g: 9.8 },
      { mode: 'spring', k: 20, A: 0.05, m: 0.1, g: 1.6 },
    ];
    for (const p of combos) {
      for (const t of [0, 0.5, 3]) {
        const st = shmSolver.sample(t, ctx(p));
        for (const [k, v] of Object.entries(st.scalars)) {
          expect(Number.isFinite(v), `${JSON.stringify(p)} ${k}=${v}`).toBe(true);
        }
        expect(st.points.bob!.every(Number.isFinite)).toBe(true);
        expect(st.lines.trail!.length).toBeGreaterThan(10);
      }
    }
  });

  it('每个参数都有可见影响（无死值）', () => {
    const base = shmSolver.sample(0.5, ctx(PENDULUM));
    for (const [key, value] of [
      ['L', 1.5],
      ['A', 0.15],
      ['m', 1],
      ['g', 3.7],
    ] as const) {
      const s = shmSolver.sample(0.5, ctx({ ...PENDULUM, [key]: value }));
      const diff = Object.keys(s.scalars).some((k) => s.scalars[k] !== base.scalars[k]);
      const posDiff = s.points.bob![1] !== base.points.bob![1];
      expect(diff || posDiff, `参数 ${key} 无可见影响`).toBe(true);
    }
    const sp = shmSolver.sample(0.5, ctx({ ...SPRING, k: 10 }));
    expect(sp.scalars.T!).not.toBe(base.scalars.T);
  });

  it('模式切换会切换整套几何（单摆/弹簧）', () => {
    const a = shmSolver.sample(0.2, ctx(PENDULUM));
    const b = shmSolver.sample(0.2, ctx(SPRING));
    expect(a.meta.mode).toBe('pendulum');
    expect(b.meta.mode).toBe('spring');
    expect(a.points.bob).not.toEqual(b.points.bob);
  });

  it('大振幅单摆被 clampParams 压回小角近似范围', () => {
    const out = shmSolver.clampParams!({ params: { ...PENDULUM, L: 0.5, A: 0.4 }, options: {} });
    expect(out.A).toBeLessThanOrEqual(0.35 * 0.5);
  });

  it('duration > 0 且随时间轴推进', () => {
    const dur = shmSolver.duration(ctx(PENDULUM));
    expect(dur).toBeGreaterThan(1);
    const a = shmSolver.sample(0, ctx(PENDULUM));
    const b = shmSolver.sample(dur / 8, ctx(PENDULUM)); // 避开整周期相位
    expect(a.points.bob).not.toEqual(b.points.bob);
  });
});
