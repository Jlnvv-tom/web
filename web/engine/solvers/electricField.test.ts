import { beforeEach, describe, expect, it } from 'vitest';
import {
  K_E,
  SOFT,
  _clearCache,
  buildEquipotentials,
  buildFieldLines,
  buildTrajectory,
  chargesFromParams,
  contoursAtLevel,
  electricFieldSolver,
  fieldAt,
  joinSegments,
  paramKey,
  potentialAt,
  PROBE_MASS,
  traceFieldLine,
  PLANE_SEEDS,
  SPHERE_SEEDS,
} from '@/engine/solvers/electricField';
import type { Charge } from '@/engine/solvers/electricField';
import type { SolverCtx } from '@/engine/solvers/types';
import type { Vec3 } from '@/engine/vec';
import { cross, len, normalize, sub } from '@/engine/vec';

/* ============================================================
   工具
   ============================================================ */

const NC = 1e-9;
const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });

/** 两个点电荷：q₁ 在 -d/2，q₂ 在 +d/2 */
function dipole(q1 = 3, q2 = -3, d = 6): Charge[] {
  return chargesFromParams({ q1, q2, d }).charges;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** 数值梯度 ∇V（中心差分） */
function gradV(p: Vec3, charges: Charge[], eps = 0.02): Vec3 {
  const d = (axis: number) => {
    const a: Vec3 = [p[0], p[1], p[2]];
    const b: Vec3 = [p[0], p[1], p[2]];
    a[axis] = a[axis]! + eps;
    b[axis] = b[axis]! - eps;
    return (potentialAt(a, charges) - potentialAt(b, charges)) / (2 * eps);
  };
  return [d(0), d(1), d(2)];
}

beforeEach(() => _clearCache());

/* ============================================================
   REQ-E-001 / 静场解析解
   ============================================================ */

describe('电场与电势 · 解析式', () => {
  it('单点电荷电势 V = kq/r', () => {
    const charges: Charge[] = [{ p: [0, 0, 0], q: 2 * NC, id: 'c1' }];
    for (const r of [0.5, 1, 2.5, 7]) {
      const expectV = (K_E * 2 * NC) / Math.sqrt(r * r + SOFT * SOFT);
      expect(near(potentialAt([r, 0, 0], charges), expectV, 1e-9)).toBe(true);
    }
  });

  it('单点电荷场强 E = kq/r²，方向沿径向', () => {
    const charges: Charge[] = [{ p: [0, 0, 0], q: 3 * NC, id: 'c1' }];
    const p: Vec3 = [0, 0, 2];
    const e = fieldAt(p, charges);
    const expectE = (K_E * 3 * NC) / (4 + SOFT * SOFT);
    expect(near(len(e), expectE, 1e-6)).toBe(true);
    // 与径向同向
    expect(near(e[0], 0, 1e-12)).toBe(true);
    expect(near(e[1], 0, 1e-12)).toBe(true);
    expect(e[2]).toBeGreaterThan(0);
  });

  it('电势满足叠加原理', () => {
    const charges = dipole();
    const p: Vec3 = [1.3, 0.4, -2.1];
    const sum =
      (K_E * 3 * NC) / Math.hypot(1.3 + 3, 0.4, -2.1) +
      (K_E * -3 * NC) / Math.hypot(1.3 - 3, 0.4, -2.1);
    expect(near(potentialAt(p, charges), sum, 1e-6)).toBe(true);
  });
});

/* ============================================================
   REQ-E-007 / REQ-E-008 · 两个经典"反直觉"结论
   ============================================================ */

describe('电场与电势 · 反直觉结论', () => {
  it('等量异号的中垂面上 V=0，但 E≠0（REQ-E-007）', () => {
    const charges = dipole(3, -3, 6);
    for (const z of [1.5, 3, 5, 8]) {
      const p: Vec3 = [0, 0, z];
      expect(Math.abs(potentialAt(p, charges))).toBeLessThan(1e-12);
      const e = len(fieldAt(p, charges));
      expect(e).toBeGreaterThan(0.1);
      // E 指向 +x（从正电荷指向负电荷）
      expect(fieldAt(p, charges)[0]).toBeGreaterThan(0);
    }
  });

  it('等量同号的中点上 E=0，但 V>0（REQ-E-008）', () => {
    const charges = dipole(3, 3, 6);
    const e = fieldAt([0, 0, 0], charges);
    expect(len(e)).toBeLessThan(1e-9);
    expect(potentialAt([0, 0, 0], charges)).toBeGreaterThan(10);
  });

  it('负电荷把场强方向反转（同一点，反号）', () => {
    const pos = fieldAt([0, 0, 3], dipole(3, 0.0001, 6));
    const neg = fieldAt([0, 0, 3], dipole(-3, 0.0001, 6));
    expect(pos[0]).toBeGreaterThan(0);
    expect(neg[0]).toBeLessThan(0);
  });
});

/* ============================================================
   REQ-E-001 / REQ-E-002 / REQ-E-003 · 场线
   ============================================================ */

describe('电场与电势 · 场线', () => {
  it('场线上任意点的切向与 E 平行（REQ-E-001）', () => {
    const charges = dipole();
    const line = traceFieldLine([-3 + 0.45, 0, 0], 1, charges);
    expect(line.length).toBeGreaterThan(20);

    let checked = 0;
    // 隔点取样，避免相邻点方向噪声
    for (let i = 2; i < line.length - 2; i += 2) {
      const tangent = normalize(sub(line[i + 2]!, line[i - 2]!));
      const ehat = normalize(fieldAt(line[i]!, charges));
      const cos = tangent[0] * ehat[0] + tangent[1] * ehat[1] + tangent[2] * ehat[2];
      expect(cos).toBeGreaterThan(0.999);
      checked++;
    }
    expect(checked).toBeGreaterThan(8);
  });

  it('从正电荷出发的场线终止于负电荷或走出计算域（REQ-E-001）', () => {
    const charges = dipole();
    const line = traceFieldLine([-3 + 0.45, 0, 0], 1, charges);
    const end = line[line.length - 1]!;
    const atNegative = len(sub(end, [3, 0, 0])) < 0.6;
    const outside = len(end) > 20;
    expect(atNegative || outside).toBe(true);
  });

  it('平面模式与立体模式的场线条数符合预期（REQ-E-002）', () => {
    const plane = buildFieldLines(dipole(), 'plane');
    // 32 条从正电荷出发；负电荷的 32 条反向追踪后与正向线重复 → 全部丢弃
    expect(plane.length).toBe(PLANE_SEEDS);

    const solid = buildFieldLines(dipole(), '3d');
    expect(solid.length).toBe(SPHERE_SEEDS);
    // 立体模式的场线确实离开了 y=0 平面
    const offPlane = solid.some((l) => l.some((p) => Math.abs(p[1]) > 0.5));
    expect(offPlane).toBe(true);
  });

  it('负电荷反向追踪会去重（REQ-E-003）', () => {
    const lines = buildFieldLines(dipole(), 'plane');
    for (const l of lines) {
      const start = l[0]!;
      const end = l[l.length - 1]!;
      // 不存在"两端都在负电荷"的线
      const bothAtNeg = len(sub(start, [3, 0, 0])) < 0.6 && len(sub(end, [3, 0, 0])) < 0.6;
      expect(bothAtNeg).toBe(false);
    }
  });

  it('同号电荷：场线要么走向无穷远，要么停在中性点', () => {
    const charges = dipole(3, 3, 6);
    const lines = buildFieldLines(charges, 'plane');
    // 两个正电荷各自 32 条
    expect(lines.length).toBe(PLANE_SEEDS * 2);
    for (const l of lines) {
      const end = l[l.length - 1]!;
      const far = len(end) > 6;
      const stalled = len(fieldAt(end, charges)) < 0.5; // 被中性点"吸住"
      expect(far || stalled).toBe(true);
    }
  });
});

/* ============================================================
   REQ-E-004 / REQ-E-005 · 等势线
   ============================================================ */

describe('电场与电势 · 等势线', () => {
  it('等势线上的电位等于标称电平（REQ-E-004）', () => {
    const charges = dipole();
    const sets = buildEquipotentials(charges, 6);
    expect(sets.length).toBeGreaterThan(8);

    let maxRel = 0;
    let samples = 0;
    for (const s of sets) {
      if (Math.abs(s.level) < 1e-9) continue; // V=0 单独处理
      for (const line of s.lines) {
        for (let i = 0; i < line.length; i += 3) {
          const v = potentialAt(line[i]!, charges);
          const rel = Math.abs(v - s.level) / Math.abs(s.level);
          if (rel > maxRel) maxRel = rel;
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(200);
    // 线性插值 + 0.21 m 网格：最内圈（曲率最大）误差最大，整体应远小于 5%
    expect(maxRel).toBeLessThan(0.05);
  });

  it('V=0 等势线就是中垂面（x=0）', () => {
    const charges = dipole(3, -3, 6);
    const lines = contoursAtLevel(charges, 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      for (const p of l) expect(Math.abs(p[0])).toBeLessThan(0.02);
    }
  });

  it('场线与等势线处处垂直（REQ-E-005）', () => {
    const charges = dipole();
    const sets = buildEquipotentials(charges, 6);
    const target = sets.find((s) => s.level > 0 && Math.abs(s.level) < 20);
    expect(target).toBeDefined();

    let checked = 0;
    for (const line of target!.lines) {
      for (let i = 5; i < line.length - 5; i += 12) {
        const p = line[i]!;
        // 跳过电荷附近的强曲率区（数值梯度在这里本身就不准）
        if (len(sub(p, charges[0]!.p)) < 0.8 || len(sub(p, charges[1]!.p)) < 0.8) continue;
        const g = normalize(gradV(p, charges));
        const e = normalize(fieldAt(p, charges));
        const c = Math.abs(cross(g, e)[1] ?? 0) + Math.abs(cross(g, e)[0] ?? 0) + Math.abs(cross(g, e)[2] ?? 0);
        expect(c).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });

  it('线段拼接：闭合环能被还原成一条折线', () => {
    // 手工构造一个正方形的 4 条边
    const a: Vec3 = [0, 0, 0];
    const b: Vec3 = [1, 0, 0];
    const c: Vec3 = [1, 0, 1];
    const d: Vec3 = [0, 0, 1];
    const lines = joinSegments([
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ]);
    expect(lines.length).toBe(1);
    expect(lines[0]!.length).toBe(5); // 首点重复一次，形成闭环
  });
});

/* ============================================================
   REQ-E-006 · 试探电荷动力学
   ============================================================ */

describe('电场与电势 · 试探电荷', () => {
  it('机械能守恒（REQ-E-006）', () => {
    const charges = dipole(3, -3, 6);
    const tr = buildTrajectory([0, 0, 5], 1 * NC, charges);
    expect(tr.pts.length).toBeGreaterThan(50);

    const energy = (i: number) =>
      0.5 * PROBE_MASS * tr.speeds[i]! ** 2 + 1 * NC * potentialAt(tr.pts[i]!, charges);
    const e0 = energy(0);
    let maxDrift = 0;
    for (let i = 0; i < tr.pts.length; i++) {
      const drift = Math.abs(energy(i) - e0) / Math.max(1e-12, Math.abs(e0));
      if (drift > maxDrift) maxDrift = drift;
    }
    expect(maxDrift).toBeLessThan(1e-3);
  });

  it('单电荷情形下轨迹沿场线走（直觉成立的那一半）', () => {
    const charges: Charge[] = [{ p: [0, 0, 0], q: 3 * NC, id: 'c1' }];
    const tr = buildTrajectory([0, 0, 3], 1 * NC, charges);
    // 场线是径向直线；轨迹也应保持在同一方向上
    for (const p of tr.pts) {
      expect(Math.hypot(p[0], p[1])).toBeLessThan(0.02);
      expect(p[2]).toBeGreaterThan(0); // 同号电荷被推开（远离原点）
    }
  });

  it('双电荷情形下轨迹偏离场线（必须纠正的误解）', () => {
    const charges = dipole(3, -3, 6);
    const start: Vec3 = [0, 0, 5];
    const tr = buildTrajectory(start, 1 * NC, charges);
    const fieldLine = traceFieldLine([start[0], start[1], start[2] + 0.45], 1, charges);

    // 取轨迹终点，找场线上最近点，应有可观偏离
    const end = tr.pts[tr.pts.length - 1]!;
    let minD = Infinity;
    for (const p of fieldLine) minD = Math.min(minD, len(sub(end, p)));
    expect(minD).toBeGreaterThan(0.15);
  });

  it('同号被推开：中垂面上的试探电荷向外飞走', () => {
    const same = dipole(3, 3, 6);
    const away = buildTrajectory([0, 0, 3], 1 * NC, same);
    expect(len(away.pts[away.pts.length - 1]!)).toBeGreaterThan(4);
    expect(away.speeds[away.speeds.length - 1]!).toBeGreaterThan(1);
  });

  it('异号被吸引：朝负电荷方向加速', () => {
    const opp = dipole(3, -3, 6);
    const tr = buildTrajectory([0, 0, 3], 1 * NC, opp);
    const end = tr.pts[tr.pts.length - 1]!;
    expect(end[0]).toBeGreaterThan(1); // 从 x=0 出发，被拉向 +x 的负电荷
    expect(tr.speeds[tr.speeds.length - 1]!).toBeGreaterThan(1);
  });

  it('正对负电荷会落到电荷上（captured）', () => {
    const charges: Charge[] = [{ p: [0, 0, 0], q: -3 * NC, id: 'c1' }];
    const tr = buildTrajectory([0, 0, 2], 1 * NC, charges);
    expect(tr.end).toBe('captured');
  });
});

/* ============================================================
   REQ-E-009 / REQ-SV-004 / REQ-E-012 · 工程性质
   ============================================================ */

describe('电场与电势 · 工程性质', () => {
  const defaults = { q1: 3, q2: -3, d: 6, mode: '3d', pr: 5, pa: 90, qt: 1 };

  it('sample 是纯函数：乱序调用结果一致（REQ-SV-001）', () => {
    const c = ctx(defaults);
    const a = electricFieldSolver.sample(1.2, c);
    electricFieldSolver.sample(0.3, c);
    const b = electricFieldSolver.sample(1.2, c);
    expect(a.points.probe).toEqual(b.points.probe);
    expect(a.scalars).toEqual(b.scalars);
  });

  it('缓存命中时数组引用稳定（REQ-SV-004）', () => {
    const c = ctx(defaults);
    const a = electricFieldSolver.sample(0, c);
    const b = electricFieldSolver.sample(0.5, c);
    expect(a.linesets!.fieldLines).toBe(b.linesets!.fieldLines);
    expect(a.linesets!.equipPos).toBe(b.linesets!.equipPos);
  });

  it('参数变化会失效缓存（REQ-SV-004 完备性）', () => {
    const a = electricFieldSolver.sample(0, ctx(defaults));
    const b = electricFieldSolver.sample(0, ctx({ ...defaults, d: 8 }));
    expect(a.linesets!.fieldLines).not.toBe(b.linesets!.fieldLines);
    // 几何真的变了（电荷拉远，场线的形状不同）
    expect(a.linesets!.fieldLines[0]![10]).not.toEqual(b.linesets!.fieldLines[0]![10]);
  });

  it('边界参数组合不出 NaN（REQ-E-009）', () => {
    const combos = [
      { q1: 5, q2: -5, d: 2, mode: '3d', pr: 1, pa: 0, qt: 3 },
      { q1: 5, q2: 5, d: 2, mode: 'plane', pr: 1, pa: 180, qt: -3 },
      { q1: -5, q2: -5, d: 10, mode: '3d', pr: 12, pa: 270, qt: 3 },
      { q1: 0, q2: 0, d: 6, mode: 'plane', pr: 5, pa: 90, qt: 1 },
      { q1: 0.5, q2: -0.5, d: 10, mode: '3d', pr: 12, pa: 45, qt: -1 },
      { q1: -5, q2: 5, d: 2, mode: 'plane', pr: 12, pa: 315, qt: 3 },
    ];
    for (const p of combos) {
      for (const t of [0, 1.5, 3.2]) {
        const s = electricFieldSolver.sample(t, ctx(p));
        for (const [k, v] of Object.entries(s.scalars)) {
          expect(Number.isFinite(v), `${JSON.stringify(p)} t=${t} ${k}=${v}`).toBe(true);
        }
        expect(s.points.probe!.every((x) => Number.isFinite(x))).toBe(true);
      }
    }
  });

  it('每个滑块都有可见影响（REQ-E-012 参数无死值）', () => {
    const base = electricFieldSolver.sample(0, ctx(defaults));
    for (const [key, value] of [
      ['q1', 4],
      ['q2', -4],
      ['d', 8],
      ['mode', 'plane'],
      ['pr', 8],
      ['pa', 30],
      ['qt', 2],
    ] as const) {
      const s = electricFieldSolver.sample(0, ctx({ ...defaults, [key]: value }));
      const lineDiff = s.linesets!.fieldLines.length !== base.linesets!.fieldLines.length;
      const scalarDiff = Object.keys(s.scalars).some((k) => s.scalars[k] !== base.scalars[k]);
      const probeDiff = s.points.probe![0] !== base.points.probe![0] || s.points.probe![2] !== base.points.probe![2];
      expect(lineDiff || scalarDiff || probeDiff, `参数 ${key} 无可见影响`).toBe(true);
    }
  });

  it('参数 key 与键顺序无关', () => {
    expect(paramKey({ a: 1, b: 2 })).toBe(paramKey({ b: 2, a: 1 }));
  });

  it('duration > 0，超出时长后钳在轨迹末端', () => {
    const dur = electricFieldSolver.duration(ctx(defaults));
    expect(dur).toBeGreaterThan(1);
    const a = electricFieldSolver.sample(dur * 1.5, ctx(defaults));
    const b = electricFieldSolver.sample(dur * 9, ctx(defaults));
    expect(a.points.probe).toEqual(b.points.probe);
  });
});
