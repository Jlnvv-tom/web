/**
 * 简谐运动求解器（单摆 / 弹簧振子）
 *
 * 对应规格：docs/specs/features/006-shm.spec.md
 *
 * 为什么值得 3D：简谐运动最抽象的一步是"它是匀速圆周运动在直径上的投影"。
 * 参考圆 + 投影线 + 实际振子三者同时在场，转动视角才能看清这个对应关系——
 * 这是任何平面图都讲不清的（课本只能画一张示意图让学生自己想象）。
 */
import type { Vec3 } from '../vec';
import { len } from '../vec';
import type { ParamValues, SceneState } from '@/engine/spec';
import type { SolverCtx, SolverModule } from './types';
import { num, str } from './types';

/* ============================================================
   常量与参数
   ============================================================ */

/** 弹簧自然长度与墙的位置（m） */
export const SPRING_WALL_X = -0.7;
export const SPRING_NATURAL = 0.55;
/** 参考圆半径 = 振幅，圆所在平面为 xz */
const REF_CIRCLE_R = 1;

export type ShmSetup = {
  mode: 'pendulum' | 'spring';
  L: number; // 摆长 m
  k: number; // 劲度系数 N/m
  m: number; // 质量 kg
  A: number; // 振幅 m
  g: number; // 重力加速度 m/s²
};

export function setupFromParams(p: ParamValues): ShmSetup {
  const mode = str(p, 'mode', 'pendulum') === 'spring' ? 'spring' : 'pendulum';
  const L = num(p, 'L', 1);
  const A = num(p, 'A', 0.25);
  return {
    mode,
    L,
    k: num(p, 'k', 5),
    m: num(p, 'm', 0.5),
    // 小角近似只在角度振幅 < 0.35 rad 时可信，超出就压回去
    A: mode === 'pendulum' ? Math.min(A, 0.35 * L) : A,
    g: num(p, 'g', 9.8),
  };
}

/** 角频率 ω：单摆 √(g/L)，弹簧振子 √(k/m) */
export function omega(s: ShmSetup): number {
  return s.mode === 'pendulum' ? Math.sqrt(s.g / s.L) : Math.sqrt(s.k / s.m);
}

/** 周期 T = 2π/ω */
export function period(s: ShmSetup): number {
  return (2 * Math.PI) / omega(s);
}

/* ============================================================
   运动学
   ============================================================ */

/** 摆角（rad），θ = (A/L)cos(ωt) */
export function angleAt(t: number, s: ShmSetup): number {
  return (s.A / s.L) * Math.cos(omega(s) * t);
}

/** 偏离平衡位置的位移 x（m） */
export function displacement(t: number, s: ShmSetup): number {
  return s.A * Math.cos(omega(s) * t);
}

/** 速率 v = Aω|sin(ωt)| 的方向由位移导数给出 */
export function velocity(t: number, s: ShmSetup): number {
  return -s.A * omega(s) * Math.sin(omega(s) * t);
}

/**
 * 振子位置（世界坐标，y 向上）。
 *
 * 单摆：悬点固定在 (0, L, 0)，杆长恒为 L，摆在 xy 平面内摆动，
 *       bob = 悬点 + L·(sinθ, −cosθ, 0)。平衡位置（θ=0）在悬点正下方 y=0。
 * 弹簧：沿 x 轴，墙在 SPRING_WALL_X，平衡位置在 x = 墙 + 自然长度。
 */
export function bobPosition(t: number, s: ShmSetup): Vec3 {
  if (s.mode === 'pendulum') {
    const th = angleAt(t, s);
    return [s.L * Math.sin(th), s.L - s.L * Math.cos(th), 0];
  }
  return [SPRING_WALL_X + SPRING_NATURAL + displacement(t, s), 0, 0];
}

/** 参考圆上的点（xz 平面，半径 = 振幅） */
export function refPoint(t: number, s: ShmSetup): Vec3 {
  const w = omega(s) * t;
  return [s.A * Math.cos(w), 0, s.A * Math.sin(w)];
}

/** 能量：动能 + 势能（J） */
export function energyAt(t: number, s: ShmSetup): { KE: number; PE: number } {
  const v = velocity(t, s);
  const KE = 0.5 * s.m * v * v;
  if (s.mode === 'pendulum') {
    const th = angleAt(t, s);
    const PE = s.m * s.g * s.L * (1 - Math.cos(th));
    return { KE, PE };
  }
  const x = displacement(t, s);
  const PE = 0.5 * s.k * x * x;
  return { KE, PE };
}

/* ============================================================
   求解器
   ============================================================ */

export const shmSolver: SolverModule = {
  kind: 'shm',

  duration(ctx) {
    return period(setupFromParams(ctx.params)) * 4;
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const w = omega(s);
    const bob = bobPosition(t, s);
    const v = velocity(t, s);
    const x = displacement(t, s);
    const a = -w * w * x;
    const { KE, PE } = energyAt(t, s);
    const T = period(s);

    // 恢复力：弹簧 −kx；单摆 −mg sinθ（切向）
    const F: Vec3 =
      s.mode === 'spring'
        ? [-s.k * x, 0, 0]
        : (() => {
            const th = angleAt(t, s);
            const fMag = -s.m * s.g * Math.sin(th);
            return [fMag * Math.cos(th), fMag * Math.sin(th), 0];
          })();

    const rp = refPoint(t, s);
    const trail: Vec3[] = [];
    const N = 96;
    for (let i = 0; i <= N; i++) {
      trail.push(bobPosition((i / N) * T, s));
    }

    return {
      t,
      points: {
        pos: bob,
        bob,
        ref: rp,
        // 参考圆上那一点在振动方向上的投影
        proj: [rp[0], 0, 0],
        // 单摆悬点 / 弹簧墙
        pivot: [0, s.L, 0],
        wall: [SPRING_WALL_X, 0, 0],
        equilibrium: s.mode === 'pendulum' ? [0, s.L, 0] : [SPRING_WALL_X + SPRING_NATURAL, 0, 0],
      },
      vectors: {
        v: s.mode === 'spring' ? [v, 0, 0] : (() => {
          const th = angleAt(t, s);
          const dir = [Math.cos(th), Math.sin(th), 0] as Vec3;
          return [v * dir[0], v * dir[1], 0] as Vec3;
        })(),
        a: s.mode === 'spring' ? [a, 0, 0] : (() => {
          const th = angleAt(t, s);
          return [a * Math.cos(th), a * Math.sin(th), 0] as Vec3;
        })(),
        F,
      },
      lines: {
        trail,
        // 弹簧的螺旋线（仅在弹簧模式有值；单摆模式下为空数组，渲染层自动隐藏）
        spring: (() => {
          if (s.mode !== 'spring') return [];
          const from = SPRING_WALL_X;
          const to = bob[0];
          const coils = 9;
          const N = coils * 8;
          const out: Vec3[] = [];
          for (let i = 0; i <= N; i++) {
            const u = i / N;
            const a = u * coils * Math.PI * 2;
            // 两端收紧，中间饱满
            const env = Math.sin(Math.PI * u) * 0.9 + 0.1;
            out.push([from + (to - from) * u, Math.cos(a) * 0.035 * env, Math.sin(a) * 0.035 * env]);
          }
          return out;
        })(),
        // 摆杆（单摆模式）
        rod: s.mode === 'pendulum' ? [[0, s.L, 0], bob] : [],
        // 参考圆（xz 平面，半径 = 振幅）：必须由求解器给出，
        // 否则 disc 图元的静态半径会和滑块里的振幅对不上。
        refCircle: (() => {
          const out: Vec3[] = [];
          const N = 72;
          for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            out.push([s.A * Math.cos(a), 0, s.A * Math.sin(a)]);
          }
          return out;
        })(),
        // 参考圆半径：从圆心指向圆上的点
        refRadius: [
          [0, 0, 0],
          rp,
        ],
        // 投影线：圆上的点 → 振动轴上的投影点
        projection: [rp, [rp[0], 0, 0]],
      },
      scalars: {
        T,
        f: 1 / T,
        w,
        x,
        v,
        a,
        KE,
        PE,
        ME: KE + PE,
        // 单摆：角度振幅（度）；弹簧：位移
        thetaDeg: (s.mode === 'pendulum' ? (s.A / s.L) * (180 / Math.PI) : 0),
        amp: s.A,
        g: s.g,
        k: s.k,
        m: s.m,
        L: s.L,
        vMax: s.A * w,
        aMax: s.A * w * w,
      },
      meta: {
        mode: s.mode,
        // 小角近似是否还站得住（>15° 就该提醒了）
        smallAngleOk: s.mode !== 'pendulum' || s.A / s.L <= 0.262,
      },
    };
  },

  /** 守恒量自检：机械能 */
  invariants(t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const { KE, PE } = energyAt(t, s);
    const e0 = 0.5 * s.m * (s.A * omega(s)) ** 2;
    return { energyDrift: (KE + PE - e0) / Math.max(1e-12, e0), energy: KE + PE };
  },

  /** 保证小角近似成立：摆的振幅不超过 0.35L */
  clampParams(ctx) {
    const s = setupFromParams(ctx.params);
    if (s.mode === 'pendulum' && ctx.params.A !== undefined) {
      const raw = num(ctx.params, 'A', 0.25);
      if (raw > 0.35 * s.L) return { ...ctx.params, A: 0.35 * s.L };
    }
    return ctx.params;
  },
};

export { REF_CIRCLE_R };
