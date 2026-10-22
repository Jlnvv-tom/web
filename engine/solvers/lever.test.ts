import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/engine/vec';
import {
  FORCE_SCALE,
  G,
  MAX_TILT,
  armEff,
  armLine1,
  armLine2,
  armRes,
  barAxis,
  barCenter,
  effEnd,
  effForce,
  imbalance,
  leverSolver,
  omegaAt,
  pivotFrame,
  pivotReaction,
  resEnd,
  resistForce,
  setupFromParams,
  tauEff,
  tauNet,
  tauRes,
  tiltAmp,
  tiltAt,
} from '@/engine/solvers/lever';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/**
 * 默认：动力端 2 kg × 60 cm，阻力端 4 kg × 30 cm。
 *
 * 2 × 60 = 120 = 4 × 30，恰好平衡，所以默认摆幅为 0、杠杆停在水平。
 * 这两个数刻意取成整数——用 g=9.8 的力口径凑不出这么干净的默认值，
 * 而这正好引出本场景的一个考点：平衡条件里 g 是公因子，会被约掉。
 */
const BALANCED = { m1: 2, m2: 4, L1: 60, L2: 30, T: 5 };

/* ============================================================
   参数解析
   ============================================================ */

describe('杠杆 · 参数解析', () => {
  it('cm 输入被换算成 m', () => {
    const s = setupFromParams({ L1: 60, L2: 30 });
    expect(close(s.L1, 0.6)).toBe(true);
    expect(close(s.L2, 0.3)).toBe(true);
  });

  it('缺失参数走默认值', () => {
    const s = setupFromParams({});
    expect(s.m1).toBe(2);
    expect(s.m2).toBe(4);
    expect(s.T).toBe(5);
  });

  it('非法值被下限裁剪', () => {
    const s = setupFromParams({ m1: 0, m2: -3, L1: 0, L2: 0, T: 0 });
    expect(s.m1).toBeGreaterThan(0);
    expect(s.m2).toBeGreaterThan(0);
    expect(s.L1).toBeGreaterThan(0);
    expect(s.L2).toBeGreaterThan(0);
    expect(s.T).toBeGreaterThan(0);
  });

  it('NaN 参数被忽略而非污染全场', () => {
    const s = setupFromParams({ m1: NaN, m2: NaN });
    expect(Number.isFinite(s.m1)).toBe(true);
    expect(Number.isFinite(s.m2)).toBe(true);
  });
});

/* ============================================================
   力与力矩
   ============================================================ */

describe('杠杆 · 力与力矩', () => {
  it('动力与阻力都等于钩码重力', () => {
    const s = setupFromParams({ m1: 3, m2: 2.5 });
    expect(close(effForce(s), 3 * G)).toBe(true);
    expect(close(resistForce(s), 2.5 * G)).toBe(true);
  });

  it('力矩 = 力 × 力臂，力臂 = L·cosθ', () => {
    const s = setupFromParams({ m1: 12, m2: 3, L1: 50, L2: 20, T: 5 });
    for (const t of [0, 0.7, 1.9, 3.3, 4.4]) {
      const th = tiltAt(t, s);
      expect(close(tauEff(t, s), effForce(s) * s.L1 * Math.cos(th), 1e-12), `t=${t}`).toBe(true);
      expect(close(armEff(t, s), s.L1 * Math.cos(th), 1e-12), `t=${t}`).toBe(true);
      expect(close(tauRes(t, s), -resistForce(s) * s.L2 * Math.cos(th), 1e-12), `t=${t}`).toBe(true);
      expect(close(armRes(t, s), s.L2 * Math.cos(th), 1e-12), `t=${t}`).toBe(true);
    }
  });

  it('力矩等于 r × F 的 z 分量（叉积定义校验）', () => {
    const s = setupFromParams({ m1: 7, m2: 2, L1: 80, L2: 40, T: 4 });
    for (const t of [0.2, 1.4, 2.8]) {
      const r = effEnd(t, s);
      const F: Vec3 = [0, -effForce(s), 0];
      const crossZ = r[0] * F[1] - r[1] * F[0];
      expect(close(tauEff(t, s), crossZ, 1e-12), `t=${t}`).toBe(true);
    }
  });

  it('水平时力臂等于杆上那段长度', () => {
    const s = setupFromParams(BALANCED);
    expect(close(tiltAt(1.23, s), 0, 1e-12)).toBe(true);
    expect(close(armEff(1.23, s), 0.6, 1e-12)).toBe(true);
    expect(close(armRes(1.23, s), 0.3, 1e-12)).toBe(true);
  });

  it('倾斜时力臂严格小于杆上长度', () => {
    const s = setupFromParams({ m1: 8, m2: 1, L1: 60, L2: 30, T: 5 });
    expect(tiltAmp(s)).toBeGreaterThan(0);
    expect(armEff(0, s)).toBeLessThan(s.L1);
    expect(armRes(0, s)).toBeLessThan(s.L2);
  });

  it('力矩比值与倾角无关（cosθ 同步约掉）', () => {
    const s = setupFromParams({ m1: 24, m2: 3, L1: 45, L2: 25, T: 5 });
    const base = tauEff(0, s) / Math.abs(tauRes(0, s));
    for (const t of [0.6, 1.7, 2.9, 4.1]) {
      const r = tauEff(t, s) / Math.abs(tauRes(t, s));
      expect(close(r, base, 1e-12), `t=${t}`).toBe(true);
  }
  });
});

/* ============================================================
   平衡条件
   ============================================================ */

describe('杠杆 · 平衡条件', () => {
  it('m1·L1 = m2·L2 时不平衡度为 0', () => {
    const s = setupFromParams(BALANCED);
    expect(close(imbalance(s), 0, 1e-12)).toBe(true);
  });

  it('平衡时摆幅为 0，杠杆始终水平', () => {
    const s = setupFromParams(BALANCED);
    expect(close(tiltAmp(s), 0, 1e-12)).toBe(true);
    for (let i = 0; i <= 20; i++) {
      expect(Math.abs(tiltAt((i / 20) * s.T, s))).toBeLessThan(1e-12);
    }
  });

  it('平衡时净力矩为 0', () => {
    const s = setupFromParams(BALANCED);
    for (const t of [0.3, 1.5, 3.7]) {
      expect(Math.abs(tauNet(t, s))).toBeLessThan(1e-12);
    }
  });

  it('动力端重则动力端下沉，阻力端重则阻力端下沉', () => {
    // m1L1 = 8×0.6 = 4.8 > m2L2 = 1×0.3 = 0.3 → 动力端重
    const heavyEff = setupFromParams({ m1: 8, L1: 60, m2: 1, L2: 30, T: 5 });
    // m1L1 = 2×0.3 = 0.6 < m2L2 = 6×0.3 = 1.8 → 阻力端重
    const heavyRes = setupFromParams({ m1: 2, L1: 30, m2: 6, L2: 30, T: 5 });
    expect(tauNet(0, heavyEff)).toBeGreaterThan(0);
    expect(tauNet(0, heavyRes)).toBeLessThan(0);
  });

  it('不平衡度被裁剪到 [0, 1]，摆幅不超过 MAX_TILT', () => {
    const s = setupFromParams({ m1: 40, m2: 0.1, L1: 100, L2: 5, T: 5 });
    expect(imbalance(s)).toBeLessThanOrEqual(1);
    expect(tiltAmp(s)).toBeLessThanOrEqual(MAX_TILT + 1e-12);
  });

  it('支点支持力等于两力之和', () => {
    const s = setupFromParams({ m1: 15, m2: 3 });
    expect(close(pivotReaction(s), (15 + 3) * G)).toBe(true);
  });

  it('交换两侧质量与力臂，平衡性不变（杠杆对称性）', () => {
    const a = setupFromParams({ m1: 3, L1: 40, m2: 6, L2: 20, T: 5 }); // 120 = 120
    const b = setupFromParams({ m1: 6, L1: 20, m2: 3, L2: 40, T: 5 }); // 120 = 120
    expect(close(imbalance(a), 0, 1e-12)).toBe(true);
    expect(close(imbalance(b), 0, 1e-12)).toBe(true);
  });
});

/* ============================================================
   运动学
   ============================================================ */

describe('杠杆 · 运动学', () => {
  it('T 时刻回到初始倾角', () => {
    const s = setupFromParams({ m1: 6, m2: 1, L1: 60, L2: 30, T: 5 });
    expect(close(tiltAt(0, s), tiltAt(s.T, s), 1e-12)).toBe(true);
  });

  it('T/2 时刻摆到反向最大角', () => {
    const s = setupFromParams({ m1: 6, m2: 1, L1: 60, L2: 30, T: 5 });
    expect(close(tiltAt(s.T / 2, s), -tiltAt(0, s), 1e-12)).toBe(true);
  });

  it('最大摆角处角速度为 0', () => {
    const s = setupFromParams({ m1: 6, m2: 1, L1: 60, L2: 30, T: 5 });
    expect(Math.abs(omegaAt(0, s))).toBeLessThan(1e-12);
    expect(Math.abs(omegaAt(s.T / 2, s))).toBeLessThan(1e-12);
  });

  it('解析角速度与数值微分一致', () => {
    const s = setupFromParams({ m1: 6, m2: 1, L1: 60, L2: 30, T: 5 });
    for (const t of [0.4, 1.2, 2.6, 3.9]) {
      const h = 1e-5;
      const fd = (tiltAt(t + h, s) - tiltAt(t - h, s)) / (2 * h);
      expect(close(fd, omegaAt(t, s), 1e-4), `t=${t}`).toBe(true);
    }
  });

  it('两端到支点距离恒等于力臂值（刚体不变长）', () => {
    const s = setupFromParams({ m1: 5, m2: 2, L1: 70, L2: 35, T: 6 });
    for (let i = 0; i <= 50; i++) {
      const t = (i / 50) * s.T;
      const e = effEnd(t, s);
      const r = resEnd(t, s);
      expect(close(Math.hypot(e[0], e[1]), s.L1, 1e-12), `t=${t}`).toBe(true);
      expect(close(Math.hypot(r[0], r[1]), s.L2, 1e-12), `t=${t}`).toBe(true);
      // 两端与支点共线
      expect(close(e[0] * r[1] - e[1] * r[0], 0, 1e-12), `t=${t}`).toBe(true);
    }
  });
});

/* ============================================================
   几何
   ============================================================ */

describe('杠杆 · 几何', () => {
  it('杆的长度等于 L1 + L2', () => {
    const s = setupFromParams(BALANCED);
    const [a, b] = barAxis(0, s);
    expect(close(Math.hypot(b[0] - a[0], b[1] - a[1]), s.L1 + s.L2, 1e-12)).toBe(true);
  });

  it('杆中心到两端距离相等', () => {
    const s = setupFromParams(BALANCED);
    const c = barCenter(0.8, s);
    const e = effEnd(0.8, s);
    const r = resEnd(0.8, s);
    expect(close(Math.hypot(c[0] - e[0], c[1] - e[1]), Math.hypot(c[0] - r[0], c[1] - r[1]), 1e-12)).toBe(true);
  });

  it('力臂线段水平（y 恒为 0）且长度为 L·cosθ', () => {
    const s = setupFromParams({ m1: 6, m2: 1, L1: 60, L2: 30, T: 5 });
    for (const t of [0, 0.9, 2.3]) {
      const l1 = armLine1(t, s);
      const l2 = armLine2(t, s);
      for (const p of l1) expect(close(p[1], 0, 1e-12)).toBe(true);
      for (const p of l2) expect(close(p[1], 0, 1e-12)).toBe(true);
      expect(close(Math.abs(l1[1]![0]), armEff(t, s), 1e-12)).toBe(true);
      expect(close(Math.abs(l2[1]![0]), armRes(t, s), 1e-12)).toBe(true);
    }
  });

  it('支点三角架稳定返回 2 段折线', () => {
    expect(pivotFrame()).toHaveLength(2);
  });
});

/* ============================================================
   求解器契约
   ============================================================ */

describe('杠杆 · 求解器契约', () => {
  it('duration 跟随周期参数', () => {
    expect(leverSolver.duration(ctx({ T: 8 }))).toBe(8);
    expect(leverSolver.duration(ctx({ T: 0.2 }))).toBeGreaterThanOrEqual(2);
  });

  it('sample 是纯函数：同 t 同结果', () => {
    const a = leverSolver.sample(2.5, ctx(BALANCED));
    const b = leverSolver.sample(2.5, ctx(BALANCED));
    expect(a.points.effEnd).toEqual(b.points.effEnd);
    expect(a.scalars.tauNet).toBe(b.scalars.tauNet);
  });

  it('标量全部有限，无 NaN', () => {
    for (const p of [BALANCED, { m1: 40, m2: 0.1, L1: 100, L2: 5, T: 2 }]) {
      const st = leverSolver.sample(1.1, ctx(p));
      for (const [k, v] of Object.entries(st.scalars)) {
        expect(Number.isFinite(v), `${k} 非有限: ${v}`).toBe(true);
    }
    }
  });

  it('矢量读数与解析式一致', () => {
    const raw = { m1: 8, m2: 3, L1: 60, L2: 30, T: 5 };
    const st = leverSolver.sample(0, ctx(raw));
    expect(close(st.vectors.F1![1], -8 * G * FORCE_SCALE, 1e-12)).toBe(true);
    expect(close(st.vectors.F2![1], -3 * G * FORCE_SCALE, 1e-12)).toBe(true);
    expect(close(st.vectors.R![1], (8 + 3) * G * FORCE_SCALE, 1e-12)).toBe(true);
  });

  it('不变量全程趋零', () => {
    const raw = { m1: 18, m2: 2, L1: 55, L2: 40, T: 5 };
    for (let i = 0; i <= 30; i++) {
      const t = (i / 30) * 5;
      const inv = leverSolver.invariants!(t, ctx(raw));
      for (const [k, v] of Object.entries(inv)) {
        expect(Math.abs(v), `${k} @t=${t} = ${v}`).toBeLessThan(1e-9);
      }
    }
  });

  it('平衡判据：m1·L1 = m2·L2（g 被约掉）', () => {
    const s = setupFromParams(BALANCED);
    expect(close(effForce(s) * s.L1, resistForce(s) * s.L2, 1e-9)).toBe(true);
    expect(close(s.m1 * s.L1, s.m2 * s.L2, 1e-12)).toBe(true);
    const st = leverSolver.sample(0, ctx(BALANCED));
    expect(st.scalars.balanced).toBe(1);
    expect(st.scalars.ratio).toBeCloseTo(1, 9);
  });

  it('不平衡时 balanced 为 0', () => {
    const st = leverSolver.sample(0, ctx({ m1: 9, m2: 1, L1: 60, L2: 30, T: 5 }));
    expect(st.scalars.balanced).toBe(0);
  });

  it('平衡时摆角恒为 0（摆幅随不平衡度归零）', () => {
    for (let i = 0; i <= 12; i++) {
      const st = leverSolver.sample((i / 12) * 5, ctx(BALANCED));
      expect(Math.abs(st.scalars.tilt as number)).toBeLessThan(1e-12);
    }
  });
});
