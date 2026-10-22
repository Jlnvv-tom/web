/**
 * 平行板电容器求解器
 *
 * 对应规格：docs/specs/features/005-capacitor.spec.md
 *
 * 两块竖直放置的方形极板（法向沿 z，间距 d），带电粒子沿 x 方向射入板间，
 * 在匀强电场 E = U/d 中偏转。
 *
 * 这个场景的 3D 价值在于「板间是匀强电场」是一个**空间**结论：
 * 极板之间任何一点的 E 大小方向都相同——只有把整个间隙当作一个体积来看，
 * 才能直观看到"偏转与入射高度无关"。
 */
import type { Vec3 } from '../vec';
import { len } from '../vec';
import type { ParamValues, SceneState } from '../spec';
import type { SolverCtx, SolverModule } from './types';
import { num } from './types';

/* ============================================================
   常量
   ============================================================ */

/** 真空介电常数 ε₀ */
export const EPS0 = 8.854e-12;
/** 示教粒子质量（kg），使 q/m ≈ 1 C/kg */
export const PROBE_MASS = 1e-9;
/** 认为"打到极板"的距离裕量 */
const HIT_MARGIN = 1e-4;
/** 极板厚度（m）。场景里 box 图元的 size[2] 必须与之一致 */
export const PLATE_T = 0.012;

/* ============================================================
   参数解析
   ============================================================ */

export type CapSetup = {
  U: number; // 电压 V
  d: number; // 板间距 m
  a: number; // 极板边长 m
  L: number; // 极板长度 m
  q: number; // 粒子电荷 C（含符号）
  v0: number; // 入射速率 m/s
};

/** 参数里的 cm → m，nC → C */
export function setupFromParams(params: ParamValues): CapSetup {
  return {
    U: num(params, 'U', 300),
    d: Math.max(0.002, num(params, 'd', 1) / 100),
    // 极板边长 / 长度固定为 30 cm：box 图元的尺寸是静态声明，
    // 若允许拖动就会和粒子轨迹不一致（视觉说谎比不画更糟）。
    a: 0.3,
    L: 0.3,
    q: num(params, 'q', 1) * 1e-9,
    v0: Math.max(10, num(params, 'v0', 600)),
  };
}

/** 电容 C = ε₀S/d（法拉） */
export function capacitance(s: CapSetup): number {
  return (EPS0 * s.a * s.L) / s.d;
}

/** 极板间匀强电场大小 E = U/d（V/m） */
export function fieldStrength(s: CapSetup): number {
  return s.U / s.d;
}

/** 粒子在板间的加速度大小 a = qE/m（m/s²） */
export function acceleration(s: CapSetup): number {
  return (s.q * fieldStrength(s)) / PROBE_MASS;
}

/* ============================================================
   轨迹
   ============================================================ */

export type CapTrajectory = {
  pts: Vec3[];
  speeds: number[];
  /** 粒子最终归宿：飞出极板 / 撞上极板 */
  end: 'exited' | 'hit' | 'running';
  /** 入射时刻 */
  t0: number;
  /** 飞行结束时刻（飞出或撞上） */
  tEnd: number;
};

/**
 * 预计算轨迹：x = v₀t，z = ½at²，y = 0。
 *
 * 匀强电场下运动是二次的，有闭式解；这里仍然逐点采样，
 * 是为了让 `sample(t)` 统一走"查表"路径（与其它求解器一致，便于任意跳帧）。
 */
export function buildTrajectory(s: CapSetup): CapTrajectory {
  const a = acceleration(s);
  const tExit = s.L / s.v0;
  // |½at²| = d/2 → 撞板时刻
  const tHit = Math.abs(a) < 1e-12 ? Infinity : Math.sqrt(s.d / Math.abs(a));
  const tEnd = Math.min(tExit, tHit);

  const end: CapTrajectory['end'] = tHit < tExit ? 'hit' : 'exited';

  const pts: Vec3[] = [];
  const speeds: number[] = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * tEnd;
    // 场强沿 -z，故正电荷的偏转也是 -z（a = qE/m 已含 q 的符号）
    pts.push([-s.L / 2 + s.v0 * t, 0, -0.5 * a * t * t]);
    speeds.push(Math.hypot(s.v0, a * t));
  }
  return { pts, speeds, end, t0: 0, tEnd };
}

/* ============================================================
   缓存
   ============================================================ */

type Entry = {
  s: CapSetup;
  traj: CapTrajectory;
  /** 与参数无关的常量几何，缓存引用，避免每帧重新分配 */
  platePos: Vec3;
  plateNeg: Vec3;
  entry: Vec3;
  straight: Vec3[];
  /** 极板几何中心（比内表面外移半个板厚，保证间距恰好是 d） */
  platePosC: Vec3;
  plateNegC: Vec3;
  labelPos: Vec3;
  labelNeg: Vec3;
};

const CACHE = new Map<string, Entry>();
const CACHE_MAX = 8;

export function capParamKey(p: ParamValues): string {
  return Object.keys(p)
    .sort()
    .map((k) => `${k}=${String(p[k])}`)
    .join('|');
}

function getEntry(params: ParamValues): Entry {
  const key = capParamKey(params);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const s = setupFromParams(params);
  const entry: Entry = {
    s,
    traj: buildTrajectory(s),
    platePos: [0, 0, s.d / 2],
    plateNeg: [0, 0, -s.d / 2],
    entry: [-s.L / 2, 0, 0],
    straight: [
      [-s.L / 2, 0, 0],
      [s.L / 2, 0, 0],
    ],
    platePosC: [0, 0, s.d / 2 + PLATE_T / 2],
    plateNegC: [0, 0, -s.d / 2 - PLATE_T / 2],
    labelPos: [0, s.a / 2 + 0.05, s.d / 2 + PLATE_T / 2],
    labelNeg: [0, -s.a / 2 - 0.05, -s.d / 2 - PLATE_T / 2],
  };
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, entry);
  return entry;
}

/** 测试用：清空缓存 */
export function _clearCache() {
  CACHE.clear();
}

/* ============================================================
   求解器
   ============================================================ */

/** 位置 z 处的电势（以负极板为 0 势点） */
export function potentialAt(z: number, s: CapSetup): number {
  return fieldStrength(s) * (z + s.d / 2);
}

/**
 * 板间匀强电场的示意箭头位置（5×3 = 15 个，铺满间隙）
 *
 * 数量刻意取多一点：让"场充满整个体积"这件事在视觉上成立，
 * 而不是只在中间画几根。
 */
export const FIELD_PROBE_COLS = 5;
export const FIELD_PROBE_ROWS = 3;

function fieldProbePoints(s: CapSetup): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < FIELD_PROBE_COLS; i++) {
    for (let j = 0; j < FIELD_PROBE_ROWS; j++) {
      out.push([
        (i - (FIELD_PROBE_COLS - 1) / 2) * (s.L * 0.24),
        (j - (FIELD_PROBE_ROWS - 1) / 2) * (s.a * 0.26),
        0,
      ]);
    }
  }
  return out;
}

export const capacitorSolver: SolverModule = {
  kind: 'capacitor',

  duration(ctx) {
    return Math.max(getEntry(ctx.params).traj.tEnd * 2.2, 0.05);
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const entry = getEntry(ctx.params);
    const { s, traj } = entry;
    const last = traj.pts.length - 1;
    const idx = Math.min(last, Math.max(0, Math.round((t / Math.max(traj.tEnd, 1e-9)) * last)));
    const p = traj.pts[idx]!;
    const v = traj.speeds[idx]!;

    const E = fieldStrength(s);
    // 箭头用"示意长度"：匀强电场画成等长，长度取间距的一半，任何参数下都不戳出极板。
    // 真实的 |E| 在 HUD 读数里，单位 V/m。
    const Evec: Vec3 = [0, 0, -s.d * 0.5];
    // 受力方向：正电荷与 E 同向，负电荷反向；长度略长于 E 便于区分
    const F: Vec3 = [0, 0, s.q >= 0 ? -s.d * 0.75 : s.d * 0.75];

    const V = potentialAt(p[2], s);
    const KE = 0.5 * PROBE_MASS * v * v;
    const PE = s.q * V;

    const C = capacitance(s);
    const Q = C * s.U;
    const W = 0.5 * C * s.U * s.U;

    // 示意箭头：等长 = 匀强电场。长度取间距的 40%，任何参数下都不会戳出极板
    const probes = fieldProbePoints(s);
    const vecs: Record<string, Vec3> = {};
    const pts: Record<string, Vec3> = {};
    probes.forEach((q, i) => {
      vecs[`E${i}`] = [0, 0, -s.d * 0.8];
      pts[`f${i}`] = q;
    });

    return {
      t,
      points: {
        pos: p,
        particle: p,
        platePos: entry.platePosC,
        plateNeg: entry.plateNegC,
        platePosFace: entry.platePos,
        plateNegFace: entry.plateNeg,
        entry: entry.entry,
        labelPos: entry.labelPos,
        labelNeg: entry.labelNeg,
        ...pts,
      },
      vectors: { E: Evec, F, ...vecs },
      lines: {
        trail: traj.pts.slice(0, idx + 1),
        // 入射方向的延长线：说明"没有电场时会怎样"
        straight: entry.straight,
        axis: entry.straight,
      },
      scalars: {
        E,
        C: C * 1e12, // pF
        Q: Q * 1e9, // nC
        W: W * 1e9, // nJ
        U: s.U,
        d: s.d * 100, // cm
        a: s.a * 100,
        L: s.L * 100,
        z: p[2] * 1000, // mm
        speed: v,
        v0: s.v0,
        KE: KE * 1e9, // nJ
        PE: PE * 1e9, // nJ
        ME: (KE + PE) * 1e9, // nJ
        sigma: Q / (s.a * s.L),
      },
      meta: {
        state: idx >= last ? traj.end : 'running',
        qSign: s.q >= 0 ? 'positive' : 'negative',
        hitsPlate: traj.end === 'hit',
      },
    };
  },

  /** 守恒量自检：机械能（动能 + 电势能）漂移 */
  invariants(t: number, ctx: SolverCtx) {
    const { s, traj } = getEntry(ctx.params);
    const last = traj.pts.length - 1;
    const i = Math.min(last, Math.max(0, Math.round((t / Math.max(traj.tEnd, 1e-9)) * last)));
    const p = traj.pts[i]!;
    const v = traj.speeds[i]!;
    const e = 0.5 * PROBE_MASS * v * v + s.q * potentialAt(p[2], s);
    const e0 = 0.5 * PROBE_MASS * s.v0 * s.v0 + s.q * potentialAt(0, s);
    const scale = Math.max(1e-30, Math.abs(e0));
    return { energyDrift: (e - e0) / scale, energy0: e0, energy1: e };
  },
};
