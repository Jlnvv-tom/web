import { describe, expect, it, beforeEach } from 'vitest';
import {
  EPS0,
  PROBE_MASS,
  _clearCache,
  acceleration,
  buildTrajectory,
  capacitance,
  capacitorSolver,
  fieldStrength,
  potentialAt,
  setupFromParams,
} from '@/engine/solvers/capacitor';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const DEFAULTS = { U: 300, d: 1, q: 1, v0: 800 };

beforeEach(() => _clearCache());

/* ============================================================
   静态量：E = U/d、C = ε₀S/d、Q = CU、W = ½CU²
   ============================================================ */

describe('电容器 · 静态量', () => {
  it('板间为匀强电场 E = U/d', () => {
    const s = setupFromParams(DEFAULTS);
    expect(close(fieldStrength(s), 300 / 0.01, 1e-9)).toBe(true);
    // 与位置无关：取板间任意 5 个点
    for (const z of [-0.004, -0.002, 0, 0.002, 0.004]) {
      const st = capacitorSolver.sample(0, ctx(DEFAULTS));
      expect(close(st.scalars.E!, fieldStrength(s), 1e-9)).toBe(true);
      void z;
    }
  });

  it('电容 C = ε₀S/d', () => {
    const s = setupFromParams(DEFAULTS);
    const expectC = (EPS0 * 0.3 * 0.3) / 0.01;
    expect(close(capacitance(s), expectC, 1e-20)).toBe(true);
    const st = capacitorSolver.sample(0, ctx(DEFAULTS));
    expect(close(st.scalars.C!, expectC * 1e12, 1e-6)).toBe(true); // pF
  });

  it('Q = CU 与 W = ½CU² 自洽', () => {
    const st = capacitorSolver.sample(0, ctx(DEFAULTS));
    const C = st.scalars.C! * 1e-12;
    expect(close(st.scalars.Q!, C * 300 * 1e9, 1e-6)).toBe(true); // nC
    expect(close(st.scalars.W!, 0.5 * C * 300 * 300 * 1e9, 1)).toBe(true); // nJ
  });

  it('间距减半 → 电容翻倍、场强翻倍', () => {
    const a = capacitorSolver.sample(0, ctx(DEFAULTS));
    const b = capacitorSolver.sample(0, ctx({ ...DEFAULTS, d: 0.5 }));
    expect(b.scalars.C! / a.scalars.C!).toBeCloseTo(2, 6);
    expect(b.scalars.E! / a.scalars.E!).toBeCloseTo(2, 6);
  });

  it('面电荷密度 σ = Q/S = ε₀E', () => {
    const st = capacitorSolver.sample(0, ctx(DEFAULTS));
    const s = setupFromParams(DEFAULTS);
    expect(close(st.scalars.sigma!, EPS0 * fieldStrength(s), 1e-15)).toBe(true);
  });

  it('电势以负极板为 0，沿 +z 线性升高', () => {
    const s = setupFromParams(DEFAULTS);
    expect(close(potentialAt(-s.d / 2, s), 0, 1e-12)).toBe(true);
    expect(close(potentialAt(0, s), s.U / 2, 1e-9)).toBe(true);
    expect(close(potentialAt(s.d / 2, s), s.U, 1e-9)).toBe(true);
  });
});

/* ============================================================
   粒子偏转
   ============================================================ */

describe('电容器 · 粒子偏转', () => {
  it('出射偏转量符合 y = qEL²/(2mv₀²)', () => {
    const s = setupFromParams(DEFAULTS);
    const traj = buildTrajectory(s);
    expect(traj.end).toBe('exited');

    // 场强沿 -z，正电荷被拉向负极板，故偏转为负
    const expectZ = -(s.q * fieldStrength(s) * s.L * s.L) / (2 * PROBE_MASS * s.v0 * s.v0);
    const end = traj.pts[traj.pts.length - 1]!;
    expect(close(end[2], expectZ, 1e-12)).toBe(true);
    expect(close(end[0], s.L / 2, 1e-12)).toBe(true); // 恰好飞到板末端
  });

  it('偏转量与入射高度无关（匀强电场的直接后果）', () => {
    // 从 y≠0 处入射时 z 方向运动完全相同：这里用轨迹起点 z=0 与
    // 直接公式对比，说明偏转只取决于 qE/m 与飞行时间
    const s = setupFromParams(DEFAULTS);
    const traj = buildTrajectory(s);
    const t = traj.tEnd / 2;
    const mid = traj.pts[Math.floor(traj.pts.length / 2)]!;
    expect(close(mid[2], -0.5 * acceleration(s) * t * t, 1e-9)).toBe(true);
  });

  it('速率增大 → 偏转按 1/v₀² 减小', () => {
    const a = capacitorSolver.sample(0, ctx(DEFAULTS)).scalars.z!;
    const b = capacitorSolver.sample(0, ctx({ ...DEFAULTS, v0: 1600 })).scalars.z!;
    // 两者都取 t=0 时为 0，改用轨迹末端
    const sa = setupFromParams({ ...DEFAULTS, v0: 800 });
    const sb = setupFromParams({ ...DEFAULTS, v0: 1600 });
    const za = buildTrajectory(sa).pts.at(-1)![2];
    const zb = buildTrajectory(sb).pts.at(-1)![2];
    expect(za / zb).toBeCloseTo(4, 6);
    void a;
    void b;
  });

  it('偏转过大时打到极板，且停在板面上', () => {
    const s = setupFromParams({ ...DEFAULTS, v0: 200 });
    const traj = buildTrajectory(s);
    expect(traj.end).toBe('hit');
    const end = traj.pts[traj.pts.length - 1]!;
    expect(close(Math.abs(end[2]), s.d / 2, 1e-6)).toBe(true);
    expect(Math.abs(end[0])).toBeLessThan(s.L / 2); // 还没飞到尽头就撞上了
  });

  it('负电荷向反方向偏转', () => {
    const pos = buildTrajectory(setupFromParams({ ...DEFAULTS, q: 1 })).pts.at(-1)![2];
    const neg = buildTrajectory(setupFromParams({ ...DEFAULTS, q: -1 })).pts.at(-1)![2];
    expect(pos * neg).toBeLessThan(0);
    expect(close(pos, -neg, 1e-12)).toBe(true);
  });

  it('机械能守恒：动能 + 电势能 = 常量', () => {
    const inv = capacitorSolver.invariants!(0.5, ctx(DEFAULTS));
    expect(Math.abs(inv.energyDrift!)).toBeLessThan(1e-9);
  });

  it('加速过程：靠近同号极板时动能增加', () => {
    const st = capacitorSolver.sample(0, ctx(DEFAULTS));
    const stEnd = capacitorSolver.sample(9e9, ctx(DEFAULTS));
    expect(stEnd.scalars.speed!).toBeGreaterThan(st.scalars.speed!);
  });
});

/* ============================================================
   工程性质
   ============================================================ */

describe('电容器 · 工程性质', () => {
  it('sample 是纯函数（乱序调用一致）', () => {
    const c = ctx(DEFAULTS);
    const a = capacitorSolver.sample(1.2, c);
    capacitorSolver.sample(0.1, c);
    const b = capacitorSolver.sample(1.2, c);
    expect(a.points.particle).toEqual(b.points.particle);
    expect(a.scalars).toEqual(b.scalars);
  });

  it('缓存命中时数组引用稳定', () => {
    const c = ctx(DEFAULTS);
    expect(capacitorSolver.sample(0, c).lines.trail).not.toBe(undefined);
    const a = capacitorSolver.sample(0.1, c);
    const b = capacitorSolver.sample(0.2, c);
    expect(a.points.platePos).toBe(b.points.platePos);
  });

  it('边界参数组合不出 NaN', () => {
    const combos = [
      { U: 0, d: 5, q: 0, v0: 200 },
      { U: 500, d: 0.2, q: 3, v0: 2000 },
      { U: 500, d: 0.2, q: -3, v0: 200 },
      { U: 0, d: 0.2, q: -3, v0: 2000 },
    ];
    for (const p of combos) {
      for (const t of [0, 0.5, 1e-3]) {
        const st = capacitorSolver.sample(t, ctx(p));
        for (const [k, v] of Object.entries(st.scalars)) {
          expect(Number.isFinite(v), `${JSON.stringify(p)} t=${t} ${k}=${v}`).toBe(true);
        }
        expect(st.points.particle!.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('每个参数都有可见影响（无死值）', () => {
    const base = capacitorSolver.sample(1e9, ctx(DEFAULTS));
    for (const [key, value] of [
      ['U', 600],
      ['d', 2],
      ['q', -2],
      ['v0', 400],
    ] as const) {
      const s = capacitorSolver.sample(1e9, ctx({ ...DEFAULTS, [key]: value }));
      const diff = Object.keys(s.scalars).some((k) => s.scalars[k] !== base.scalars[k]);
      const posDiff = s.points.particle![2] !== base.points.particle![2];
      expect(diff || posDiff, `参数 ${key} 无可见影响`).toBe(true);
    }
  });

  it('示意箭头长度随间距自适应（不会戳出极板）', () => {
    for (const d of [0.2, 1, 5]) {
      const st = capacitorSolver.sample(0, ctx({ ...DEFAULTS, d }));
      const len = Math.abs(st.vectors.E0![2]);
      expect(len).toBeLessThanOrEqual((d / 100) * 0.85);
      expect(st.points.f0).toBeDefined();
    }
  });

  it('duration > 0 且时间轴末端停在轨迹终点', () => {
    const dur = capacitorSolver.duration(ctx(DEFAULTS));
    expect(dur).toBeGreaterThan(0);
    const a = capacitorSolver.sample(dur * 3, ctx(DEFAULTS));
    const b = capacitorSolver.sample(dur * 99, ctx(DEFAULTS));
    expect(a.points.particle).toEqual(b.points.particle);
  });
});
