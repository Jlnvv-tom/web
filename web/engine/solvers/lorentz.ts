import type { SceneState } from '../spec';
import type { SolverModule } from './types';
import { num, samplePath } from './types';
import { DEG } from '../vec';

/**
 * 带电粒子在匀强磁场中的运动（洛伦兹力）
 *
 * 坐标约定：B 沿 +Y（世界里"向上"），因此圆周运动落在水平的 XZ 平面里，
 * 从斜上方观察时是一个真正的三维圆——这是 2D 图形讲不清楚的地方。
 *
 * 解析解（B = B·ŷ，ω = qB/m）：
 *   vₓ(t) = v₀sinθ·cos(ωt) − v₀cosθ·sin(ωt)
 *   v_z(t) = v₀sinθ·sin(ωt) + v₀cosθ·cos(ωt)
 *   v_y    = v₀cosθ                     （平行分量，不受力）
 *   x(t) = [v₀sinθ·sin(ωt) + v₀cosθ(1−cos(ωt))] / ω
 *   z(t) = [−v₀sinθ(cos(ωt)−1) + v₀cosθ·sin(ωt)] / ω
 *   y(t) = v₀cosθ·t
 *
 * 关键结论（HUD 直接展示）：
 *   r = m·v⊥ / (|q|B)    T = 2πm / (|q|B)    速率与 |F| 恒定（磁场不做功）
 */
export const lorentzSolver: SolverModule = {
  kind: 'lorentz',

  duration({ params }) {
    const { q, m, B, v0, theta } = read(params);
    const omega = Math.abs((q * B) / m);
    if (omega < 1e-9) return 6;
    const T = (2 * Math.PI) / omega;
    const vy = v0 * Math.cos(theta * DEG);
    const tExit = Math.abs(vy) > 1e-6 ? 9 / Math.abs(vy) : Infinity;
    return Math.max(2, Math.min(3.2 * T, tExit, 14));
  },

  sample(t, { params }) {
    const { q, m, B, v0, theta } = read(params);
    const omega = (q * B) / m;
    const th = theta * DEG;
    const vPerpMag = Math.abs(v0 * Math.sin(th));
    const vParaMag = v0 * Math.cos(th);
    const vx0 = v0 * Math.sin(th);
    const vz0 = v0 * Math.cos(th);

    /* ---- 退化情形：B 与 v 平行或 B=0，匀速直线 ---- */
    if (Math.abs(omega) < 1e-9) {
      const px = vx0 * t;
      const py = vParaMag * t;
      const straight: SceneState = {
        t,
        points: { pos: [px, py, 0], start: [0, 0, 0] },
        vectors: {
          v: [vx0, vParaMag, 0],
          F: [0, 0, 0],
          vPerp: [vx0, 0, 0],
          vPara: [0, vParaMag, 0],
          B: [0, Math.sign(B) || 1, 0],
        },
        lines: { trail: [[0, 0, 0], [px, py, 0]] },
        scalars: {
          speed: v0, vPerp: vPerpMag, vPara: Math.abs(vParaMag),
          F: 0, r: 0, T: 0, turns: 0, pitch: 0, omega: 0, bSign: Math.sign(B) || 1,
        },
        meta: { circular: false, helical: false, straight: true },
      };
      return straight;
    }

    const w = omega;
    const c = Math.cos(w * t);
    const sn = Math.sin(w * t);

    /* ---- 速度 ---- */
    const vx = vx0 * c - vz0 * sn;
    const vz = vx0 * sn + vz0 * c;
    const vy = vParaMag;

    /* ---- 位置 ---- */
    const x = (vx0 * sn + vz0 * (1 - c)) / w;
    const z = (-vx0 * (c - 1) + vz0 * sn) / w;
    const y = vy * t;

    const r = vPerpMag / Math.abs(w);
    const T = (2 * Math.PI) / Math.abs(w);

    /* ---- F = q v × B，B = (0, B, 0) → F = q(−v_z·B, 0, v_x·B) ---- */
    const Fx = -q * vz * B;
    const Fz = q * vx * B;
    const Fmag = Math.hypot(Fx, Fz);

    /* ---- 圆心：向心加速度方向即 F 的方向，center = pos + r·F̂ ---- */
    const centerX = Fmag > 1e-12 ? x + (r * Fx) / Fmag : x;
    const centerZ = Fmag > 1e-12 ? z + (r * Fz) / Fmag : z;

    /* ---- 轨迹 ---- */
    const trail = samplePath(t, 240, (s) => {
      const cc = Math.cos(w * s);
      const ss = Math.sin(w * s);
      return [
        (vx0 * ss + vz0 * (1 - cc)) / w,
        vy * s,
        (-vx0 * (cc - 1) + vz0 * ss) / w,
      ] as [number, number, number];
    });

    return {
      t,
      points: {
        pos: [x, y, z],
        center: [centerX, y, centerZ],
        start: [0, 0, 0],
      },
      vectors: {
        v: [vx, vy, vz],
        F: [Fx, 0, Fz],
        vPerp: [vx, 0, vz],
        vPara: [0, vy, 0],
        B: [0, Math.sign(B) || 1, 0],
      },
      lines: {
        trail,
        circle: Array.from({ length: 97 }, (_, i) => {
          const a = (i / 96) * Math.PI * 2;
          return [centerX + r * Math.cos(a), y, centerZ + r * Math.sin(a)] as [number, number, number];
        }),
        radiusLine: [
          [x, y, z],
          [centerX, y, centerZ],
        ] as [number, number, number][],
      },
      scalars: {
        speed: Math.hypot(vx, vy, vz),
        x, y, z,
        vPerp: vPerpMag,
        vPara: Math.abs(vParaMag),
        F: Fmag,
        r,
        T,
        turns: Math.abs((w * t) / (2 * Math.PI)),
        pitch: Math.abs(vParaMag) * T,
        omega: Math.abs(w),
        bSign: Math.sign(B) || 1,
      },
      meta: {
        circular: Math.abs(Math.sin(th)) > 0.999,
        helical: Math.abs(Math.sin(th)) < 0.999 && Math.abs(Math.sin(th)) > 0.001,
        straight: Math.abs(Math.sin(th)) < 0.001,
      },
    };
  },

  /** 磁场不做功 → 速率恒定；r = mv⊥/(|q|B) */
  invariants(t, ctx) {
    const { q, m, B, v0, theta } = read(ctx.params);
    const s = this.sample(t, ctx);
    const expectR = (m * Math.abs(v0 * Math.sin(theta * DEG))) / (Math.abs(q * B) || 1);
    return {
      speedError: s.scalars.speed! - v0,
      rError: (s.scalars.r ?? 0) - expectR,
      forceError: (s.scalars.F ?? 0) - Math.abs(q) * Math.abs(v0 * Math.sin(theta * DEG)) * Math.abs(B),
    };
  },
};

function read(p: Record<string, number | boolean | string>) {
  return {
    q: num(p, 'q', 1),
    m: num(p, 'm', 1),
    B: num(p, 'B', 2),
    v0: num(p, 'v0', 10),
    theta: num(p, 'theta', 90),
  };
}
