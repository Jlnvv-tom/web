import { describe, expect, it } from 'vitest';
import {
  angles,
  mirrorNormal,
  mirrorPoint,
  reflectDirection,
  reflectionPoint,
  reflectionSolver,
  setupFromParams,
} from '@/engine/solvers/reflection';
import type { SolverCtx } from '@/engine/solvers/types';
import { dot, len, normalize, sub } from '@/engine/vec';
import type { Vec3 } from '@/engine/vec';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const BASE = { u: 2, h: 1, eyeX: 2.5, eyeY: 1.2, phi: 0, mirrorH: 1.6 };

/* ============================================================
   反射定律
   ============================================================ */

describe('光的反射 · 反射定律', () => {
  it('入射角 = 反射角', () => {
    for (const phi of [0, 15, 30, 45]) {
      const s = setupFromParams({ ...BASE, phi });
      const n = mirrorNormal(s.phi);
      const p: Vec3 = [-s.u, s.h, 0];
      const eye: Vec3 = [-s.eyeX, s.eyeY, 0];
      const r = reflectionPoint(p, eye, n)!;
      expect(r).not.toBeNull();
      const a = angles(p, r, eye, n);
      expect(close(a.incidence, a.reflection, 1e-9)).toBe(true);
    }
  });

  it('入射光线与反射光线和法向共面', () => {
    const s = setupFromParams({ ...BASE, phi: 25 });
    const n = mirrorNormal(s.phi);
    const p: Vec3 = [-s.u, s.h, 0];
    const eye: Vec3 = [-s.eyeX, s.eyeY, 0];
    const r = reflectionPoint(p, eye, n)!;
    const inProp = normalize(sub(r, p));
    const outProp = normalize(sub(eye, r));
    // 共面 = 混合积 (in × out)·n = 0
    const cross: Vec3 = [
      inProp[1] * outProp[2] - inProp[2] * outProp[1],
      inProp[2] * outProp[0] - inProp[0] * outProp[2],
      inProp[0] * outProp[1] - inProp[1] * outProp[0],
    ];
    expect(Math.abs(dot(cross, n))).toBeLessThan(1e-9);
  });

  it('反射点落在镜面上（到镜面距离为 0）', () => {
    const s = setupFromParams({ ...BASE, phi: 20 });
    const n = mirrorNormal(s.phi);
    const r = reflectionPoint([-s.u, s.h, 0], [-s.eyeX, s.eyeY, 0], n)!;
    expect(Math.abs(dot(r, n))).toBeLessThan(1e-9);
  });

  it('光路可逆：物体与眼睛互换后反射点不变', () => {
    const s = setupFromParams({ ...BASE, phi: 30 });
    const n = mirrorNormal(s.phi);
    const p: Vec3 = [-s.u, s.h, 0];
    const eye: Vec3 = [-s.eyeX, s.eyeY, 0];
    const r1 = reflectionPoint(p, eye, n)!;
    const r2 = reflectionPoint(eye, p, n)!;
    expect(len(sub(r1, r2))).toBeLessThan(1e-9);
  });
});

/* ============================================================
   平面镜成像
   ============================================================ */

describe('光的反射 · 平面镜成像', () => {
  it('像距 = 物距，像在镜后', () => {
    const s = setupFromParams(BASE);
    const st = reflectionSolver.sample(0, ctx(BASE));
    expect(close(st.scalars.imgDist!, s.u, 1e-9)).toBe(true);
    expect(st.points.imgTip![0]).toBeGreaterThan(0); // 镜后
  });

  it('像高 = 物高，像正立', () => {
    const st = reflectionSolver.sample(0, ctx(BASE));
    expect(close(st.scalars.imgHeight!, 1, 1e-9)).toBe(true);
    expect(st.points.imgTip![1]).toBeGreaterThan(0);
  });

  it('像与物关于镜面对称（中点在中面上、连线平行法向）', () => {
    for (const phi of [0, 20, 45]) {
      const s = setupFromParams({ ...BASE, phi });
      const n = mirrorNormal(s.phi);
      const p: Vec3 = [-s.u, s.h, 0];
      const img = mirrorPoint(p, n);
      const mid: Vec3 = [(p[0] + img[0]) / 2, (p[1] + img[1]) / 2, (p[2] + img[2]) / 2];
      expect(Math.abs(dot(mid, n))).toBeLessThan(1e-9);
      const d = normalize(sub(img, p));
      // 连线与法向平行（叉积为 0）
      const cross = len([
        d[1] * n[2] - d[2] * n[1],
        d[2] * n[0] - d[0] * n[2],
        d[0] * n[1] - d[1] * n[0],
      ]);
      expect(cross).toBeLessThan(1e-9);
    }
  });

  it('镜面是虚像之源：像永远在镜后（物在镜前）', () => {
    for (const phi of [0, 10, 35, 60]) {
      const st = reflectionSolver.sample(0, ctx({ ...BASE, phi }));
      const n = mirrorNormal((phi * Math.PI) / 180);
      expect(dot(st.points.imgTip as Vec3, n)).toBeGreaterThan(0); // 法向正侧 = 镜后
      expect(dot(st.points.objTip as Vec3, n)).toBeLessThan(0);
    }
  });
});

/* ============================================================
   转动镜面：2θ 定律
   ============================================================ */

describe('光的反射 · 镜面转动', () => {
  it('镜面转 φ，反射光线转 2φ（入射方向固定）', () => {
    // 2θ 定律的前提是"入射光线不动"。若同时移动物体或眼睛，反射点会变，
    // 定律就不严格成立了——本场景的滑块正是后者，脚本里要讲清这个区别。
    // 入射光必须垂直于转轴（y 轴）：y 分量在反射中不变，不参与 2θ 旋转
    const d = normalize([-1, 0, 0.25]);
    const out0 = reflectDirection(d, mirrorNormal(0));
    for (const phi of [10, 20, 30]) {
      const out = reflectDirection(d, mirrorNormal((phi * Math.PI) / 180));
      const turned = Math.acos(Math.min(1, Math.max(-1, dot(out0, out)))) * (180 / Math.PI);
      expect(turned).toBeCloseTo(2 * phi, 6);
    }
  });

  it('镜面倾斜后反射点跑出原来的竖直平面（z ≠ 0）', () => {
    const flat = reflectionSolver.sample(0, ctx(BASE));
    expect(Math.abs(flat.scalars.rOffset!)).toBeLessThan(1e-9);

    const tilted = reflectionSolver.sample(0, ctx({ ...BASE, phi: 40 }));
    expect(Math.abs(tilted.scalars.rOffset!)).toBeGreaterThan(0.1);
  });
});

/* ============================================================
   工程性质
   ============================================================ */

describe('光的反射 · 工程性质', () => {
  it('边界参数（大转角、近物距）不出 NaN', () => {
    const combos = [
      { u: 0.3, h: 0.05, eyeX: 0.3, eyeY: 0.05, phi: 60, mirrorH: 0.3 },
      { u: 4, h: 2, eyeX: 4, eyeY: 2, phi: 0, mirrorH: 3 },
      { u: 2, h: 1, eyeX: 2.5, eyeY: 1.2, phi: 30, mirrorH: 1.6 },
    ];
    for (const p of combos) {
      const st = reflectionSolver.sample(0, ctx(p));
      for (const [k, v] of Object.entries(st.scalars)) {
        expect(Number.isFinite(v), `${JSON.stringify(p)} ${k}=${v}`).toBe(true);
      }
      expect(st.lines.mirror!.length).toBe(2);
      expect(st.lines.rayTipIn!.length).toBe(2);
    }
  });

  it('每个参数都有可见影响（无死值）', () => {
    const base = reflectionSolver.sample(0, ctx(BASE));
    for (const [key, value] of [
      ['u', 3],
      ['h', 1.5],
      ['eyeX', 1.5],
      ['eyeY', 0.8],
      ['phi', 25],
    ] as const) {
      const s = reflectionSolver.sample(0, ctx({ ...BASE, [key]: value }));
      const diff = Object.keys(s.scalars).some((k) => s.scalars[k] !== base.scalars[k]);
      const posDiff = JSON.stringify(s.points) !== JSON.stringify(base.points);
      expect(diff || posDiff, `参数 ${key} 无可见影响`).toBe(true);
    }
  });

  it('sample 是纯函数', () => {
    const c = ctx(BASE);
    const a = reflectionSolver.sample(3, c);
    reflectionSolver.sample(9, c);
    const b = reflectionSolver.sample(3, c);
    expect(a.points).toEqual(b.points);
    expect(a.scalars).toEqual(b.scalars);
  });

  it('duration > 0', () => {
    expect(reflectionSolver.duration(ctx(BASE))).toBeGreaterThan(0);
  });
});
