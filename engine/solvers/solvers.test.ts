import { describe, expect, it } from 'vitest';
import { lorentzSolver } from '@/engine/solvers/lorentz';
import { projectileSolver } from '@/engine/solvers/projectile';
import { thinLensSolver } from '@/engine/solvers/thinLens';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({
  params,
  options: {},
});

const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

/* ============================================================
   洛伦兹力
   ------------------------------------------------------------
   这一组断言是本项目"3D 不画错"的第一道防线：
   磁场不做功、r = mv⊥/(qB)、T = 2πm/(|q|B) 必须严格成立。
   ============================================================ */
describe('lorentz 求解器', () => {
  const c = ctx({ q: 1, m: 1, B: 2, v0: 10, theta: 90 });

  it('速率恒定（磁场不做功）', () => {
    for (const t of [0, 0.4, 1.1, 2.7, 5.0]) {
      const s = lorentzSolver.sample(t, c);
      expect(close(s.scalars.speed!, 10, 1e-9)).toBe(true);
    }
  });

  it('半径与周期符合公式', () => {
    const s = lorentzSolver.sample(1.2, c);
    // r = mv⊥/(|q|B) = 1*10/(1*2) = 5
    expect(close(s.scalars.r!, 5, 1e-9)).toBe(true);
    // T = 2πm/(|q|B) = π
    expect(close(s.scalars.T!, Math.PI, 1e-9)).toBe(true);
  });

  it('轨迹上每一点到圆心的距离等于半径', () => {
    const s = lorentzSolver.sample(3.3, c);
    const [cx, , cz] = s.points.center!;
    for (const p of s.lines.trail!) {
      const d = Math.hypot(p[0] - cx, p[2] - cz);
      expect(Math.abs(d - s.scalars.r!) < 1e-9).toBe(true);
    }
  });

  it('θ=90° 时 y 不增长（无平行分量）', () => {
    const s = lorentzSolver.sample(4, c);
    expect(Math.abs(s.points.pos![1])).toBeLessThan(1e-12);
  });

  it('θ=60° 时轨迹为螺旋线（y 线性增长、半径按 sinθ 缩小）', () => {
    const c2 = ctx({ q: 1, m: 1, B: 2, v0: 10, theta: 60 });
    const a = lorentzSolver.sample(1, c2);
    const b = lorentzSolver.sample(2, c2);
    expect(close((b.points.pos![1] - a.points.pos![1]) / 1, a.scalars.vPara!, 1e-9)).toBe(true);
    // v⊥ = 10·sin60°
    expect(close(a.scalars.r!, (10 * Math.sin(Math.PI / 3)) / 2, 1e-9)).toBe(true);
  });

  it('负电荷只反转旋转方向，半径不变', () => {
    const pos = ctx({ q: 1, m: 1, B: 2, v0: 10, theta: 90 });
    const neg = ctx({ q: -1, m: 1, B: 2, v0: 10, theta: 90 });
    const a = lorentzSolver.sample(0.8, pos);
    const b = lorentzSolver.sample(0.8, neg);
    // 半径只与 |q| 有关
    expect(close(a.scalars.r!, b.scalars.r!, 1e-9)).toBe(true);
    // 轨迹关于 x 轴对称（旋转方向反转）：x 相同、z 反号
    expect(close(a.points.pos![0], b.points.pos![0], 1e-9)).toBe(true);
    expect(close(a.points.pos![2], -b.points.pos![2], 1e-9)).toBe(true);
    expect(Math.abs(a.points.pos![2])).toBeGreaterThan(0.1);
  });

  it('invariants 自检通过', () => {
    const inv = lorentzSolver.invariants!(2.2, c);
    expect(Math.abs(inv.speedError!)).toBeLessThan(1e-9);
    expect(Math.abs(inv.rError!)).toBeLessThan(1e-9);
    expect(Math.abs(inv.forceError!)).toBeLessThan(1e-9);
  });
});

/* ============================================================
   抛体运动
   ============================================================ */
describe('projectile 求解器', () => {
  const c = ctx({ v0: 20, theta: 45, h0: 0, g: 9.8 });

  it('机械能守恒', () => {
    const inv = projectileSolver.invariants!(1.3, c);
    expect(Math.abs(inv.energy)).toBeLessThan(1e-9);
  });

  it('水平分速度恒定', () => {
    const a = projectileSolver.sample(0.4, c).scalars.vx!;
    const b = projectileSolver.sample(2.4, c).scalars.vx!;
    expect(close(a, b, 1e-12)).toBe(true);
  });

  it('最高点竖直分速度为零', () => {
    const tApex = (20 * Math.sin(Math.PI / 4)) / 9.8;
    const s = projectileSolver.sample(tApex, c);
    expect(Math.abs(s.scalars.vy!)).toBeLessThan(1e-9);
  });

  it('射程符合 R = v₀²sin2θ/g（h₀=0）', () => {
    const R = (20 * 20 * Math.sin(Math.PI / 2)) / 9.8;
    const s = projectileSolver.sample(0, c);
    expect(close(s.scalars.range!, R, 1e-6)).toBe(true);
  });

  it('45° 射程大于 60°（真空中 45° 最大）', () => {
    const a = projectileSolver.sample(0, ctx({ v0: 20, theta: 45, h0: 0, g: 9.8 })).scalars.range!;
    const b = projectileSolver.sample(0, ctx({ v0: 20, theta: 60, h0: 0, g: 9.8 })).scalars.range!;
    expect(a).toBeGreaterThan(b);
  });

  it('落到地面后不再下穿', () => {
    const s = projectileSolver.sample(999, c);
    expect(s.points.pos![1]).toBeGreaterThanOrEqual(0);
  });
});

/* ============================================================
   凸透镜
   ============================================================ */
describe('thinLens 求解器', () => {
  it('1/u + 1/v = 1/f（u=30, f=10 → v=15）', () => {
    const s = thinLensSolver.sample(0, ctx({ u: 30, f: 10, h: 4 }));
    expect(close(s.scalars.xi!, 15, 1e-9)).toBe(true);
    expect(close(1 / 30 + 1 / 15, 1 / 10, 1e-12)).toBe(true);
  });

  it('u = 2f 时成倒立等大实像', () => {
    const s = thinLensSolver.sample(0, ctx({ u: 20, f: 10, h: 4 }));
    expect(close(s.scalars.xi!, 20, 1e-9)).toBe(true);
    expect(close(s.scalars.mag!, -1, 1e-9)).toBe(true);
    expect(close(s.scalars.hi!, -4, 1e-9)).toBe(true);
  });

  it('u < f 时为虚像（v < 0），且正立放大', () => {
    const s = thinLensSolver.sample(0, ctx({ u: 6, f: 10, h: 4 }));
    expect(s.scalars.xi!).toBeLessThan(0);
    expect(s.scalars.mag!).toBeGreaterThan(1);
    expect(s.meta.kind).toBe('virtual');
  });

  it('u = f 时不成像', () => {
    const s = thinLensSolver.sample(0, ctx({ u: 10, f: 10, h: 4 }));
    expect(s.meta.kind).toBe('none');
  });

  it('实像时画三条特殊光线，虚像时只画两条 + 反向延长线', () => {
    const real = thinLensSolver.sample(0, ctx({ u: 30, f: 10, h: 4 }));
    expect(real.lines.ray2).toBeDefined();
    const virt = thinLensSolver.sample(0, ctx({ u: 6, f: 10, h: 4 }));
    expect(virt.lines.ray2).toBeUndefined();
    expect(virt.lines.virtual0).toBeDefined();
    expect(virt.lines.virtual1).toBeDefined();
  });

  it('invariants 自检通过', () => {
    const inv = thinLensSolver.invariants!(0, ctx({ u: 30, f: 10, h: 4 }));
    expect(Math.abs(inv.lensEquationResidual!)).toBeLessThan(1e-12);
    expect(Math.abs(inv.magnificationError!)).toBeLessThan(1e-12);
  });
});
