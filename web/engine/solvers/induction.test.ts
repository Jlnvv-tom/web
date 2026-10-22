import { describe, expect, it } from 'vitest';
import {
  COIL_R,
  MAG_LEN,
  MU0,
  X_NEAR,
  currentSense,
  dFluxPerTurn,
  emfAt,
  fluxPerTurn,
  inductionSolver,
  magnetV,
  magnetX,
  momentAlongNormal,
  setupFromParams,
  xFarOf,
} from '@/engine/solvers/induction';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const BASE = { N: 200, R: 20, m: 5, pole: 'N', amp: 16, T: 3 };

/* ============================================================
   运动学
   ============================================================ */

describe('电磁感应 · 运动学', () => {
  it('t=0 在最远点，t=T/2 在最近点', () => {
    const s = setupFromParams(BASE);
    expect(close(magnetX(0, s), xFarOf(s), 1e-12)).toBe(true);
    expect(close(magnetX(s.T / 2, s), X_NEAR, 1e-12)).toBe(true);
  });

  it('周期位置可重复', () => {
    const s = setupFromParams(BASE);
    expect(close(magnetX(1.1, s), magnetX(1.1 + s.T, s), 1e-12)).toBe(true);
  });

  it('端点是速度为 0 的折返点', () => {
    const s = setupFromParams(BASE);
    expect(Math.abs(magnetV(0, s))).toBeLessThan(1e-12);
    expect(Math.abs(magnetV(s.T / 2, s))).toBeLessThan(1e-12);
  });

  it('数值微分与解析速度一致', () => {
    const s = setupFromParams(BASE);
    for (const t of [0.3, 0.9, 1.7, 2.4]) {
      const h = 1e-5;
      const fd = (magnetX(t + h, s) - magnetX(t - h, s)) / (2 * h);
      expect(close(fd, magnetV(t, s), 1e-4), `t=${t}`).toBe(true);
    }
  });
});

/* ============================================================
   磁通量闭式解
   ============================================================ */

describe('电磁感应 · 磁通量', () => {
  it('Φ₁(x) 与 A⃗ 环积分的定义一致（数值积分核对）', () => {
    const s = setupFromParams(BASE);
    const m = momentAlongNormal(s); // 带符号的轴向磁矩
    const x = 0.3;

    // Φ = ∮A⃗·dl⃗，A⃗ = μ₀/(4π)·(m⃗ × r̂)/r²
    // 取圆环 r(φ) = (x, a cosφ, a sinφ)，dl = (−a sinφ, a cosφ, 0)·... 沿 φ 切向
    const a = COIL_R;
    const n = 4000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const ph = (2 * Math.PI * i) / n;
      const px = x;
      const py = a * Math.cos(ph);
      const pz = a * Math.sin(ph);
      const r = Math.hypot(px, py, pz);
      // m⃗ = (m, 0, 0)
      // m⃗ × r̂ = (m,0,0) × (px,py,pz)/r = (0·pz − 0·py, 0·px − m·pz, m·py − 0·px)/r
      //        = (0, −m·pz, m·py)/r
      const ax = 0;
      const ay = (-m * pz) / r;
      const az = (m * py) / r;
      const A2 = (MU0 / (4 * Math.PI)) / (r * r);
      const Ax = ax * A2;
      const Ay = ay * A2;
      const Az = az * A2;
      // dl = (0, −a sinφ, a cosφ) dφ
      const dx = 0;
      const dy = -a * Math.sin(ph);
      const dz = a * Math.cos(ph);
      sum += Ax * dx + Ay * dy + Az * dz;
    }
    const dphi = (2 * Math.PI) / n;
    const numeric = sum * dphi;
    expect(close(numeric, fluxPerTurn(x, s), Math.abs(fluxPerTurn(x, s)) * 1e-4)).toBe(true);
  });

  it('远离时磁通量趋于 0', () => {
    const s = setupFromParams(BASE);
    expect(Math.abs(fluxPerTurn(50, s))).toBeLessThan(1e-12);
  });

  it('N 极朝向线圈时磁通为负，S 极朝向时为正（右手定则约定）', () => {
    const sn = setupFromParams({ ...BASE, pole: 'N' });
    const ss = setupFromParams({ ...BASE, pole: 'S' });
    expect(fluxPerTurn(0.3, sn)).toBeLessThan(0);
    expect(fluxPerTurn(0.3, ss)).toBeGreaterThan(0);
    expect(close(fluxPerTurn(0.3, sn), -fluxPerTurn(0.3, ss), 1e-18)).toBe(true);
  });

  it('dΦ₁/dx 与 Φ₁ 的数值微分一致', () => {
    const s = setupFromParams(BASE);
    for (const x of [0.18, 0.3, 0.6]) {
      const h = 1e-6;
      const fd = (fluxPerTurn(x + h, s) - fluxPerTurn(x - h, s)) / (2 * h);
      const ref = Math.max(1e-18, Math.abs(dFluxPerTurn(x, s)));
      expect(close(fd, dFluxPerTurn(x, s), ref * 1e-4), `x=${x}`).toBe(true);
    }
  });

  it('Φ₁ 在 x>0 上单调（离得越近 |Φ| 越大）', () => {
    const s = setupFromParams({ ...BASE, pole: 'S' }); // 取正磁通便于比较
    let prev = Infinity;
    for (let x = 0.6; x > 0.17; x -= 0.01) {
      const f = fluxPerTurn(x, s);
      expect(f).toBeGreaterThan(prev === Infinity ? -Infinity : prev - 1e-12);
      prev = f;
    }
  });
});

/* ============================================================
   楞次定律
   ============================================================ */

describe('电磁感应 · 楞次定律', () => {
  it('ε 与 dΦ/dt 反号（任意时刻）', () => {
    const s = setupFromParams(BASE);
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * s.T;
      const x = magnetX(t, s);
      const xdot = magnetV(t, s);
      const emf = emfAt(x, xdot, s);
      const dPsi = s.N * dFluxPerTurn(x, s) * xdot;
      expect(emf * dPsi, `t=${t.toFixed(2)}`).toBeLessThanOrEqual(1e-18);
    }
  });

  it('靠近时排斥、远离时吸引（阻力与速度反号）', () => {
    const s = setupFromParams(BASE);
    for (let i = 1; i < 60; i++) {
      const t = (i / 60) * s.T;
      const x = magnetX(t, s);
      const xdot = magnetV(t, s);
      const I = emfAt(x, xdot, s) / s.R;
      const F = s.N * I * dFluxPerTurn(x, s);
      if (Math.abs(xdot) > 1e-3) {
        expect(F * xdot, `t=${t.toFixed(2)}`).toBeLessThan(0);
      }
    }
  });

  it('最近点磁通最大但电动势为零（关键误区）', () => {
    const s = setupFromParams(BASE);
    const tNear = s.T / 2;
    const emfNear = emfAt(magnetX(tNear, s), magnetV(tNear, s), s);
    expect(Math.abs(emfNear)).toBeLessThan(1e-12);

    // 最近点的 |Φ| 是整个行程里最大的
    let maxFlux = 0;
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * s.T;
      maxFlux = Math.max(maxFlux, Math.abs(fluxPerTurn(magnetX(t, s), s)));
    }
    expect(close(Math.abs(fluxPerTurn(magnetX(tNear, s), s)), maxFlux, maxFlux * 1e-9)).toBe(true);
  });

  it('换向：靠近与远离的电流方向相反', () => {
    const s = setupFromParams(BASE);
    // t ∈ (0, T/2) 靠近，t ∈ (T/2, T) 远离
    const emfApproach = emfAt(magnetX(s.T * 0.25, s), magnetV(s.T * 0.25, s), s);
    const emfRecede = emfAt(magnetX(s.T * 0.75, s), magnetV(s.T * 0.75, s), s);
    expect(emfApproach * emfRecede).toBeLessThan(0);
  });

  it('感应磁场总是反对磁通变化：增则反、减则同', () => {
    const s = setupFromParams(BASE);
    for (let i = 1; i < 60; i++) {
      const t = (i / 60) * s.T;
      const x = magnetX(t, s);
      const xdot = magnetV(t, s);
      const emf = emfAt(x, xdot, s);
      const I = emf / s.R;
      const bInd = (MU0 * s.N * I) / (2 * COIL_R);
      const dPhi = dFluxPerTurn(x, s) * xdot;
      if (Math.abs(dPhi) > 1e-12) {
        // bInd 与 dΦ/dt 必须反号
        expect(bInd * dPhi, `t=${t.toFixed(2)}`).toBeLessThan(0);
      }
    }
  });

  it('能量账：机械功率 F·v = −I²R', () => {
    const s = setupFromParams(BASE);
    for (let i = 1; i < 60; i++) {
      const t = (i / 60) * s.T;
      const x = magnetX(t, s);
      const xdot = magnetV(t, s);
      const emf = emfAt(x, xdot, s);
      const I = emf / s.R;
      const F = s.N * I * dFluxPerTurn(x, s);
      const mech = F * xdot;
      const joule = I * I * s.R;
      expect(close(mech, -joule, Math.max(1e-30, joule * 1e-9))).toBe(true);
    }
  });

  it('电流绕向与楞次定律一致（N 极靠近 → 近端成 N 极）', () => {
    const s = setupFromParams({ ...BASE, pole: 'N' });
    const t = s.T * 0.25; // 靠近中
    const x = magnetX(t, s);
    const emf = emfAt(x, magnetV(t, s), s);
    // 原磁通沿 −x 且绝对值增大 → ε > 0 → 感应磁场应沿 +x
    expect(emf).toBeGreaterThan(0);

    const I = emf / s.R;
    const bInd = (MU0 * s.N * I) / (2 * COIL_R);
    expect(bInd).toBeGreaterThan(0);

    // 绕向：ε>0 时电流沿 −ringTangent
    expect(currentSense(emf)).toBe(-1);
  });
});

/* ============================================================
   量纲 / 量级
   ============================================================ */

describe('电磁感应 · 量级', () => {
  it('μ₀ 数值正确', () => {
    expect(close(MU0, 1.2566370614359173e-6, 1e-20)).toBe(true);
  });

  it('磁铁全程不穿过线圈中心', () => {
    const s = setupFromParams(BASE);
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * s.T;
      expect(magnetX(t, s)).toBeGreaterThan(MAG_LEN / 2);
    }
  });

  it('感应电流量级在 µA（真实实验量级）', () => {
    const s = setupFromParams(BASE);
    let peak = 0;
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * s.T;
      const x = magnetX(t, s);
      const I = emfAt(x, magnetV(t, s), s) / s.R;
      peak = Math.max(peak, Math.abs(I));
    }
    expect(peak).toBeGreaterThan(1e-7);
    expect(peak).toBeLessThan(1e-2);
  });
});

/* ============================================================
   求解器契约
   ============================================================ */

describe('电磁感应 · 求解器', () => {
  it('duration 为两个周期', () => {
    const s = setupFromParams(BASE);
    expect(close(inductionSolver.duration(ctx(BASE)), s.T * 2, 1e-12)).toBe(true);
  });

  it('sample 是纯函数：同一 t 结果一致', () => {
    const a = inductionSolver.sample(1.2, ctx(BASE));
    const b = inductionSolver.sample(1.2, ctx(BASE));
    expect(a.points.magC).toEqual(b.points.magC);
    expect(a.scalars.emf).toBe(b.scalars.emf);
  });

  it('输出的量与 scalars 一致', () => {
    const t = 0.8;
    const st = inductionSolver.sample(t, ctx(BASE));
    const s = setupFromParams(BASE);
    const x = magnetX(t, s);
    expect(close(st.scalars.x, x * 100, 1e-9)).toBe(true);
    expect(close(st.scalars.flux, fluxPerTurn(x, s) * 1e6, 1e-9)).toBe(true);
  });

  it('8 个电流箭头大小一致、方向同向绕行', () => {
    const st = inductionSolver.sample(0.6, ctx(BASE));
    const lens = Array.from({ length: 8 }, (_, i) => {
      const v = st.vectors[`I${i}`]!;
      return Math.hypot(v[0], v[1], v[2]);
    });
    for (const l of lens) expect(close(l, lens[0], 1e-12)).toBe(true);
    expect(lens[0]).toBeGreaterThan(0);
  });

  it('场线围绕磁铁闭合（首尾回到轴附近）', () => {
    const st = inductionSolver.sample(0, ctx(BASE));
    const lines = st.linesets!.bLines!;
    for (const line of lines) {
      const first = line[0]!;
      const last = line[line.length - 1]!;
      // 两端都应在磁矩轴附近（相对磁铁中心的横向偏移很小）
      expect(Math.abs(first[1] - 0)).toBeLessThan(0.05);
      expect(Math.abs(last[1] - 0)).toBeLessThan(0.05);
    }
  });
});
