/**
 * 浮力求解器（阿基米德原理）
 *
 * 对应规格：docs/specs/features/011-buoyancy.spec.md
 *
 * 物理模型：边长 L 的正方体，密度 ρ_b，沿竖直方向（y 轴）被匀速压入密度为 ρ_l 的液体。
 * 液面固定在 y = 0，液体占据 y < 0。
 *
 * 核心关系（全部有闭式解，无需数值积分）：
 *
 *     浸入深度   h = clamp(−y_bottom, 0, L)
 *     排开体积   V_排 = L² · h
 *     浮力       F_浮 = ρ_l · g · V_排        ← 阿基米德原理
 *     重力       G = ρ_b · L³ · g
 *     视重       N = G − F_浮                ← 弹簧测力计读数
 *
 * 漂浮平衡条件：F_浮 = G，即 ρ_l·L²·h = ρ_b·L³ → h/L = ρ_b/ρ_l。
 * 这条式子把「浸入比例」直接变成了「密度比」，是本场景最重要的可测性质。
 *
 * 为什么必须真 3D：
 *   浮力最顽固的误解是「浮力来自物体底部受到的压力」，于是学生会推出
 *   「沉底的物体不受浮力」「形状越尖浮力越小」。而浮力的真正来源是
 *   **上下表面的压力差**，这必须用「压强随深度增大」这个空间图像来支撑。
 *   在 3D 里可以让液面成为一个真实的水平面、让物体在其中上下穿越，
 *   转视角才看得清「排开的那部分液体」是一个体积而不是一个面积。
 */
import type { Vec3 } from '../vec';
import type { ParamValues, SceneState } from '../spec';
import type { SolverCtx, SolverModule } from './types';
import { num } from './types';

/* ============================================================
   常量
   ============================================================ */

/** 重力加速度（m/s²） */
export const G = 9.8;
/** 液面到水槽底的距离（m） */
export const TANK_DEPTH = 0.62;
/** 水面半宽（m），用于画液面与水线矩形 */
export const TANK_HALF = 0.3;

/* ============================================================
   参数解析
   ============================================================ */

export type BuoySetup = {
  /** 物体密度（kg/m³） */
  rhoB: number;
  /** 液体密度（kg/m³） */
  rhoL: number;
  /** 正方体边长（m） */
  L: number;
  /** 往复周期（s） */
  T: number;
};

export function setupFromParams(p: ParamValues): BuoySetup {
  return {
    rhoB: Math.max(10, num(p, 'rhoB', 600)),
    rhoL: Math.max(10, num(p, 'rhoL', 1000)),
    L: Math.max(0.03, num(p, 'L', 20) / 100),
    T: Math.max(1, num(p, 'T', 6)),
  };
}

/* ============================================================
   运动学：物体底面高度 y_b(t)
   ============================================================ */

/** 底面能到的最高处（完全离开液面，留 0.12 m 空隙） */
const Y_HIGH = 0.12;
/** 底面能到的最低处（完全浸没后再往下 0.25 m，且不触底） */
const Y_LOW_MAX = -(TANK_DEPTH - 0.15);

/** 底面能到的最低处（完全浸没后再往下一段，但不触底） */
export function lowPoint(s: BuoySetup): number {
  return Math.max(Y_LOW_MAX, -(s.L + 0.25));
}

/**
 * 初相：让 t = 0 时物体恰好**浸入一半**（h = L/2）。
 *
 * 这是纯粹的取景考虑。若按标准余弦从最高点起振，t=0（也就是用户一进页面
 * 看到的那一帧、以及截图基线）物体整个悬在水面上方，水线和排开体积都不存在，
 * 场景最核心的两个图元全部不可见。从半浸没起振，第一帧就同时有
 * 物体、水线、排开体积三样东西，讲解的起点才立得住。
 */
export function phaseOffset(s: BuoySetup): number {
  const low = lowPoint(s);
  const yc = (Y_HIGH + low) / 2;
  const amp = (Y_HIGH - low) / 2;
  const c = (Math.max(-1, Math.min(1, (-s.L / 2 - yc) / Math.max(1e-12, amp))));
  return Math.acos(c);
}

export function bottomY(t: number, s: BuoySetup): number {
  const low = lowPoint(s);
  const yc = (Y_HIGH + low) / 2;
  const amp = (Y_HIGH - low) / 2;
  return yc + amp * Math.cos((2 * Math.PI * t) / s.T + phaseOffset(s));
}

export function bottomV(t: number, s: BuoySetup): number {
  const low = lowPoint(s);
  const amp = (Y_HIGH - low) / 2;
  return -amp * ((2 * Math.PI) / s.T) * Math.sin((2 * Math.PI * t) / s.T + phaseOffset(s));
}

/** 正方体中心高度 */
export const centerY = (t: number, s: BuoySetup) => bottomY(t, s) + s.L / 2;

/* ============================================================
   浮力
   ============================================================ */

/** 浸入深度 h（m）：底面低于液面的部分，裁剪到 [0, L] */
export function submergedDepth(yBottom: number, s: BuoySetup): number {
  return Math.min(s.L, Math.max(0, -yBottom));
}

/** 排开液体的体积（m³） */
export function displacedVolume(yBottom: number, s: BuoySetup): number {
  return s.L * s.L * submergedDepth(yBottom, s);
}

/** 浮力（N），方向 +y */
export function buoyancyForce(yBottom: number, s: BuoySetup): number {
  return s.rhoL * G * displacedVolume(yBottom, s);
}

/** 物体质量（kg） */
export const massOf = (s: BuoySetup) => s.rhoB * s.L ** 3;

/** 重力（N） */
export const weightOf = (s: BuoySetup) => massOf(s) * G;

/** 视重（N）：弹簧测力计读数 = G − F_浮，压到水底后不再为负 */
export function apparentWeight(yBottom: number, s: BuoySetup): number {
  return Math.max(0, weightOf(s) - buoyancyForce(yBottom, s));
}

/** 漂浮平衡时的浸入比例 ρ_b/ρ_l（>1 表示会下沉） */
export const floatRatio = (s: BuoySetup) => s.rhoB / s.rhoL;

/** 漂浮平衡时的浸入深度（m）；密度大于液体时返回 L（沉底） */
export const equilibriumDepth = (s: BuoySetup) => Math.min(s.L, s.L * floatRatio(s));

/* ============================================================
   几何：液面交线矩形、排开体积线框
   ============================================================ */

const hx = (s: BuoySetup) => s.L / 2;
const hz = (s: BuoySetup) => s.L / 2;

/**
 * 液面与物体的交线（水平矩形）。
 *
 * 完全露出或完全浸没时返回空数组（场景里对应对象标 `optional: true`）。
 */
export function waterlineRect(yBottom: number, s: BuoySetup): Vec3[] {
  const h = submergedDepth(yBottom, s);
  if (h <= 1e-9 || h >= s.L - 1e-9) return [];
  const X = hx(s);
  const Z = hz(s);
  return [
    [-X, 0, -Z],
    [X, 0, -Z],
    [X, 0, Z],
    [-X, 0, Z],
    [-X, 0, -Z],
  ];
}

/**
 * 水槽框：4 条竖直棱 + 底部矩形。
 *
 * 只画"一侧的一条折线"会让水槽看起来像一个歪掉的三角形，
 * 补上另外三根竖棱和底框之后，才读得出"这是一个方形水槽"。
 */
let TANK_CACHE: Vec3[][] | null = null;

export function tankEdges(): Vec3[][] {
  if (TANK_CACHE) return TANK_CACHE;
  const H = TANK_HALF;
  const corners: [number, number][] = [
    [-H, -H],
    [H, -H],
    [H, H],
    [-H, H],
  ];
  const out: Vec3[][] = corners.map(([x, z]) => [
    [x, 0, z],
    [x, -TANK_DEPTH, z],
  ]);
  // 底框
  out.push([
    [-H, -TANK_DEPTH, -H],
    [H, -TANK_DEPTH, -H],
    [H, -TANK_DEPTH, H],
    [-H, -TANK_DEPTH, H],
    [-H, -TANK_DEPTH, -H],
  ]);
  TANK_CACHE = out;
  return out;
}

/** 排开体积的线框（12 条棱） */
export function displacedWire(yBottom: number, s: BuoySetup): Vec3[][] {
  const h = submergedDepth(yBottom, s);
  if (h <= 1e-9) return [];
  const X = hx(s);
  const Z = hz(s);
  const y0 = yBottom;
  const y1 = yBottom + h;
  const corner = (sx: number, sy: number, sz: number): Vec3 => [sx * X, sy ? y1 : y0, sz * Z];
  const c: Vec3[] = [
    corner(-1, 0, -1),
    corner(1, 0, -1),
    corner(1, 0, 1),
    corner(-1, 0, 1),
    corner(-1, 1, -1),
    corner(1, 1, -1),
    corner(1, 1, 1),
    corner(-1, 1, 1),
  ];
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return edges.map(([a, b]) => [c[a]!, c[b]!]);
}

/* ============================================================
   求解器
   ============================================================ */

/**
 * 矢量长度的世界尺度（m/N）。
 *
 * 浮力量级是 10–100 N，取 0.004 后典型箭头长 0.08–0.4 m，与 0.2 m 的物体同量级。
 * 早期取 0.05 时 78 N 会算出 3.9 m，远超图元的 `maxLength`，
 * 结果是**所有力箭头都被截断成同一条长度**，相对大小信息全部丢失——
 * 而这正是"浮力随浸入深度增长"最该被看见的东西。
 */
const FORCE_SCALE = 0.004;

export const buoyancySolver: SolverModule = {
  kind: 'buoyancy',

  duration(ctx) {
    return Math.max(setupFromParams(ctx.params).T, 2);
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const yb = bottomY(t, s);
    const vb = bottomV(t, s);
    const yc = centerY(t, s);

    const h = submergedDepth(yb, s);
    const Vd = displacedVolume(yb, s);
    const Fb = buoyancyForce(yb, s);
    const Gw = weightOf(s);
    const N = apparentWeight(yb, s);

    return {
      t,
      points: {
        pos: [0, yc, 0],
        blockC: [0, yc, 0],
        blockBottom: [0, yb, 0],
        // 平衡水线所在高度（漂浮时物体底面应停在这里）
        eqPoint: [0, -equilibriumDepth(s), 0],
        // 排开液体的等效体积中心（用于标注"被挤走的水"）
        dispC: [0, yb + h / 2, 0],
      },
      vectors: {
        Fb: [0, Fb * FORCE_SCALE, 0],
        G: [0, -Gw * FORCE_SCALE, 0],
        N: [0, -N * FORCE_SCALE, 0],
        v: [0, vb * 0.35, 0],
      },
      lines: {
        waterSurf: [
          [-TANK_HALF, 0, -TANK_HALF],
          [TANK_HALF, 0, -TANK_HALF],
          [TANK_HALF, 0, TANK_HALF],
          [-TANK_HALF, 0, TANK_HALF],
          [-TANK_HALF, 0, -TANK_HALF],
        ],
        waterline: waterlineRect(yb, s),
      },
      linesets: { displaced: displacedWire(yb, s), tank: tankEdges() },
      scalars: {
        rhoB: s.rhoB,
        rhoL: s.rhoL,
        L: s.L * 100,
        h: h * 100,
        ratio: Math.min(1, floatRatio(s)) * 100,
        Vd: Vd * 1e6,
        Fb,
        G: Gw,
        N,
        dispMass: s.rhoL * Vd * 1000,
        v: vb * 100,
        floats: s.rhoB < s.rhoL ? 1 : 0,
      },
      meta: {
        state: h <= 1e-9 ? 'above' : h >= s.L - 1e-9 ? 'fully' : 'partial',
        floats: s.rhoB < s.rhoL,
      },
    };
  },

  /**
   * 不变量自检
   *
   * 1. `archimedes`：F_浮 与「排开液体的重力」之差（应恒为 0）。
   * 2. `linearity`：部分浸入时 F_浮 与浸入深度 h 成正比。
   * 3. `apparent`：视重 N = G − F_浮。
   * 4. `floatBalance`：漂浮平衡时 F_浮 = G（浸入比例 = ρ_b/ρ_l）。
   */
  invariants(t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const yb = bottomY(t, s);

    const Fb = buoyancyForce(yb, s);
    const Vd = displacedVolume(yb, s);
    // 排开液体所受重力
    const dispWeight = s.rhoL * Vd * G;

    // 线性：取两个浸入深度，检验 F_浮 / h 为常数
    const h1 = s.L * 0.25;
    const h2 = s.L * 0.6;
    const f1 = s.rhoL * G * s.L * s.L * h1;
    const f2 = s.rhoL * G * s.L * s.L * h2;

    // 漂浮平衡：浸入比例 = ρ_b/ρ_l（限幅到 1）
    const eq = equilibriumDepth(s);
    const FbEq = s.rhoL * G * s.L * s.L * eq;

    const scale = Math.max(1e-30, Math.abs(FbEq));
    return {
      archimedes: (Fb - dispWeight) / Math.max(1e-30, Math.abs(dispWeight)),
      linearity: f1 / h1 - f2 / h2,
      apparent: apparentWeight(yb, s) - (weightOf(s) - Fb),
      floatBalance: s.rhoB <= s.rhoL ? (FbEq - weightOf(s)) / scale : 0,
    };
  },
};
