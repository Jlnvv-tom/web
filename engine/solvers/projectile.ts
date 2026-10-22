import type { SceneState } from '../spec';
import type { SolverModule, SolverCtx } from './types';
import { num, samplePath } from './types';
import { DEG } from '../vec';

/**
 * 抛体运动（平抛 / 斜抛）
 *
 * 解析解，忽略空气阻力：
 *   x(t) = v₀·cosθ·t
 *   y(t) = h₀ + v₀·sinθ·t − ½·g·t²
 *
 * 为什么要解析解：讲解脚本需要跳到"最高点""落地"这些精确时刻，
 * 数值积分做不到帧级可复现。
 */
export const projectileSolver: SolverModule = {
  kind: 'projectile',

  duration({ params }) {
    const { g, h0, v0, theta } = read(params);
    const tLand = (v0 * Math.sin(theta * DEG) + Math.sqrt((v0 * Math.sin(theta * DEG)) ** 2 + 2 * g * Math.max(h0, 0))) / g;
    return Math.max(2, Math.min(tLand, 12));
  },

  sample(t, { params }) {
    const { g, h0, v0, theta, showComponents } = read(params);
    const th = theta * DEG;
    const vx0 = v0 * Math.cos(th);
    const vy0 = v0 * Math.sin(th);

    const tFlight = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * Math.max(h0, 0))) / g;
    const tt = Math.min(t, tFlight);

    const x = vx0 * tt;
    const y = Math.max(0, h0 + vy0 * tt - 0.5 * g * tt * tt);
    const vx = vx0;
    const vy = vy0 - g * tt;
    const speed = Math.hypot(vx, vy);

    const apexT = vy0 / g;
    const apexY = h0 + (vy0 * vy0) / (2 * g);
    const range = vx0 * tFlight;

    const state: SceneState = {
      t: tt,
      points: {
        pos: [x, y, 0],
        origin: [0, h0, 0],
        apex: [vx0 * apexT, apexY, 0],
        land: [range, 0, 0],
      },
      vectors: {
        v: [vx, vy, 0],
        vx: [vx, 0, 0],
        vy: [0, vy, 0],
        g: [0, -g, 0],
      },
      lines: {
        trail: samplePath(tt, 160, (s) => [
          vx0 * s,
          Math.max(0, h0 + vy0 * s - 0.5 * g * s * s),
          0,
        ]),
        // 理想轨迹（灰色参考，始终完整）
        ghost: samplePath(tFlight, 120, (s) => [
          vx0 * s,
          Math.max(0, h0 + vy0 * s - 0.5 * g * s * s),
          0,
        ]),
        height: [
          [x, 0, 0],
          [x, y, 0],
        ],
      },
      scalars: {
        speed,
        vx,
        vy,
        x,
        y,
        t: tt,
        apexY,
        range,
        flight: tFlight,
        angle: (Math.atan2(vy, vx) / DEG + 360) % 360,
      },
      meta: {
        landed: t >= tFlight - 1e-6,
        showComponents,
      },
    };
    return state;
  },

  invariants(t, { params }) {
    const { g, h0, v0 } = read(params);
    const th = (params.theta as number) * DEG;
    const vx0 = v0 * Math.cos(th);
    const vy0 = v0 * Math.sin(th);
    const s = this.sample(t, { params, options: {} });
    const y = s.points.pos![1];
    const vy = s.vectors.v![1];
    // 机械能守恒（以地面为零势能面）
    const energy = 0.5 * (vx0 * vx0 + vy * vy) + g * y;
    const energy0 = 0.5 * (vx0 * vx0 + vy0 * vy0) + g * h0;
    return {
      energy: energy - energy0,
      speed0: Math.hypot(vx0, vy0),
      speed: Math.hypot(vx0, vy),
    };
  },
};

function read(p: Record<string, number | boolean | string>) {
  return {
    v0: num(p, 'v0', 20),
    theta: num(p, 'theta', 45),
    g: num(p, 'g', 9.8),
    h0: num(p, 'h0', 0),
    showComponents: p.showComponents !== false,
  };
}
