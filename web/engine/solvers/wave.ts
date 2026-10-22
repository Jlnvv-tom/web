/**
 * 机械波求解器（行波 / 驻波）
 *
 * 对应规格：docs/specs/features/009-wave.spec.md
 *
 * 为什么必须真 3D：波动最大的误解是"波把质点搬走了"。
 * 把绳子上每个质点的振动轨迹画出来、再让整条波形在 3D 空间里平移，
 * 转动视角才能看清"波形在走、质点只在原地上下"——这是平面图做不到的。
 */
import type { Vec3 } from '../vec';
import { len } from '../vec';
import type { ParamValues, SceneState } from '@/engine/spec';
import type { SolverCtx, SolverModule } from './types';
import { num, str } from './types';

/* ============================================================
   参数
   ============================================================ */

/** 绳子的显示长度（m） */
export const STRING_LENGTH = 4;
/** 质点个数 */
export const PARTICLE_COUNT = 25;

export type WaveSetup = {
  mode: 'travel' | 'standing';
  lambda: number; // 波长 m
  A: number; // 单列波振幅 m
  f: number; // 频率 Hz
};

export function setupFromParams(p: ParamValues): WaveSetup {
  return {
    mode: str(p, 'mode', 'travel') === 'standing' ? 'standing' : 'travel',
    lambda: Math.max(0.4, num(p, 'lambda', 2)),
    A: Math.max(0.02, num(p, 'A', 0.3)),
    f: Math.max(0.05, num(p, 'f', 0.5)),
  };
}

export const omegaOf = (s: WaveSetup) => 2 * Math.PI * s.f;
export const kOf = (s: WaveSetup) => (2 * Math.PI) / s.lambda;
/** 波速 v = λf */
export const speedOf = (s: WaveSetup) => s.lambda * s.f;
export const periodOf = (s: WaveSetup) => 1 / s.f;

/** 行波位移 */
export function travelY(x: number, t: number, s: WaveSetup): number {
  return s.A * Math.sin(kOf(s) * x - omegaOf(s) * t);
}

/** 反向行波：y = A·sin(kx + ωt) */
export function reverseY(x: number, t: number, s: WaveSetup): number {
  return s.A * Math.sin(kOf(s) * x + omegaOf(s) * t);
}

/** 驻波位移 = 两列反向行波叠加（波腹振幅 2A） */
export function standingY(x: number, t: number, s: WaveSetup): number {
  return travelY(x, t, s) + reverseY(x, t, s);
}

export function displacement(x: number, t: number, s: WaveSetup): number {
  return s.mode === 'travel' ? travelY(x, t, s) : standingY(x, t, s);
}

/** 质点位置（世界坐标：绳子沿 x，振动沿 y） */
export function particlePos(i: number, t: number, s: WaveSetup): Vec3 {
  const x = (i / (PARTICLE_COUNT - 1)) * STRING_LENGTH;
  return [x, displacement(x, t, s), 0];
}

/* ============================================================
   求解器
   ============================================================ */

export const waveSolver: SolverModule = {
  kind: 'wave',

  duration(ctx) {
    return periodOf(setupFromParams(ctx.params)) * 3;
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const w = omegaOf(s);
    const k = kOf(s);

    const pts: Vec3[] = [];
    const trail: Vec3[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) pts.push(particlePos(i, t, s));

    // 波形曲线（细采样，用于画"绳子的形状"）
    const curve: Vec3[] = [];
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * STRING_LENGTH;
      curve.push([x, displacement(x, t, s), 0]);
    }

    // 驻波的包络（±2A sin(kx)）：拆成上下两条折线，才能各自渲染
    const envUp: Vec3[] = [];
    const envDown: Vec3[] = [];
    if (s.mode === 'standing') {
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * STRING_LENGTH;
        const a = Math.abs(2 * s.A * Math.sin(k * x));
        envUp.push([x, a, 0]);
        envDown.push([x, -a, 0]);
      }
    }

    // 中点质点（用于展示"质点只在原地上下"）
    const mid = Math.floor(PARTICLE_COUNT / 2);
    const midPos = pts[mid]!;
    const midX = (mid / (PARTICLE_COUNT - 1)) * STRING_LENGTH;
    // 中点在整段时间里的运动范围（一条竖直线段）
    const midTrack: Vec3[] = [
      [midX, -2 * s.A, 0],
      [midX, 2 * s.A, 0],
    ];

    // 波形在下一个时刻的形状（用于说明"波形在平移"）
    const shifted: Vec3[] = [];
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * STRING_LENGTH;
      shifted.push([x, displacement(x, t + 0.25 / s.f, s), 0]);
    }

    const nodes: Vec3[] = [];
    if (s.mode === 'standing') {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = (i / (PARTICLE_COUNT - 1)) * STRING_LENGTH;
        if (Math.abs(Math.sin(k * x)) < 1e-6) nodes.push([x, 0, 0]);
      }
    }

    return {
      t,
      points: {
        pos: midPos,
        mid: midPos,
        node0: nodes[0] ?? [0, 0, 0],
        // 每个质点的位置（p0…p24），场景里逐个渲染
        ...Object.fromEntries(pts.map((p, i) => [`p${i}`, p])),
      },
      vectors: {
        // 中点质点的速度方向（沿 y）
        v: (() => {
          const dt = 1e-3;
          const dy = displacement(midX, t + dt, s) - displacement(midX, t - dt, s);
          return [0, dy / (2 * dt) * 0.25, 0] as Vec3;
        })(),
      },
      lines: {
        curve,
        shifted,
        envUp,
        envDown,
        midTrack,
        // 单个质点的振动轨迹（一个周期内采样）
        midTrail: (() => {
          const T = periodOf(s);
          const out: Vec3[] = [];
          for (let i = 0; i <= 60; i++) out.push([midX, displacement(midX, (i / 60) * T, s), 0]);
          return out;
        })(),
      },
      scalars: {
        lambda: s.lambda,
        f: s.f,
        T: 1 / s.f,
        v: speedOf(s),
        A: s.A,
        amp: s.mode === 'travel' ? s.A : 2 * s.A,
        w,
        k,
        midDisp: midPos[1],
        midSpeed: Math.abs(
          (displacement(midX, t + 1e-3, s) - displacement(midX, t - 1e-3, s)) / 2e-3
        ),
        vMax: s.mode === 'travel' ? s.A * w : 2 * s.A * w,
        nodeCount: nodes.length,
        wavelengthInParticles: s.lambda / (STRING_LENGTH / (PARTICLE_COUNT - 1)),
      },
      meta: {
        mode: s.mode,
        isStanding: s.mode === 'standing',
      },
    };
  },
};
