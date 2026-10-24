/**
 * 声学求解器 · 球面波前（声音的产生与传播）
 *
 * 对应规格：docs/specs/features/F-018-sound-propagation.spec.md
 *
 * 物理模型：点源在无限大均匀介质中产生的球面波。
 *
 *     r(t) = v · t            （波前半径，v 由介质决定）
 *     S(t) = 4π r²            （波前面积——能量摊薄的几何来源）
 *     A(r) ∝ 1/r              （球面波振幅衰减，能量守恒要求）
 *
 * 迁移自 lessons/初中物理实验/02-sound-propagation.html（物理已由 verify_junior.py
 * 手算期望值验证）。**迁移中修正了一处物理错误**：原页面
 * `amp = 1/min(r, 0.6)` 在 r > 0.6 m 后恒为 1.667（一条平台），
 * 与它自己标签上写的"∝ 1/r"自相矛盾。改为 `amp = A_REF / r`，
 * 参考距离取 A_REF = 340 m（= 默认声速 × 1 s，即默认 1 秒时波前到的位置），
 * 于是 amp·r ≡ 340 成为一条可断言的不变量。
 *
 * 为什么必须真 3D：波前是**球面**。2D 图里只能画一组同心圆，
 * 学生默认以为波前是"平面墙"推过来；3D 里三个互相垂直的圆同时存在，
 * 转一下视角才能看出它们共同织出一个球——这是"为什么站远处的人只收到
 * 很小一块"的唯一直观解释。
 */
import type { Vec3 } from '../vec';
import type { ParamValues, SceneState } from '../spec';
import type { SolverCtx, SolverModule } from './types';
import { num } from './types';

/* ============================================================
   常量
   ============================================================ */

/** 参考距离（m）：相对振幅以 r = A_REF 处为 1。取默认声速 × 1 s */
export const AMP_REFERENCE = 340;
/** 几何半径基值（m）：t=0 时声源本身的"起步半径" */
export const R_DISP_BASE = 0.28;
/** 几何缩放系数：真实半径 r（米）→ 显示半径 R = BASE + r × SCALE */
export const R_DISP_SCALE = 0.0022;
/** 每个圆的采样点数 */
export const RING_SEGMENTS = 72;
/** 当前波前上的珠点数（每个正交圆 6 个，共 18 个）。
 *  1px 细线在缩略图/投影里会发飘，珠点让"这是一个球"在任意尺寸下都读得出来。 */
export const BEAD_COUNT = 6;
/** 较早波前的半径比例（ lessons 原值：0.72 / 0.44） */
export const OLD_RATIOS = [1, 0.72, 0.44] as const;

/* ============================================================
   参数解析
   ============================================================ */

export type AcousticsSetup = {
  /** 传播时间（s）——滑块参数，**不是播放时间** */
  propT: number;
  /** 声速（m/s） */
  v: number;
};

export function setupFromParams(p: ParamValues): AcousticsSetup {
  return {
    propT: Math.max(0, num(p, 't', 0.4)),
    v: Math.max(1, num(p, 'v', 340)),
  };
}

/* ============================================================
   物理量（全部闭式）
   ============================================================ */

/** 波前半径（m）：r = v·t */
export const radiusOf = (s: AcousticsSetup) => s.v * s.propT;

/** 相对振幅：A_REF / r（球面波 A ∝ 1/r）。t=0 时 r=0 → 截断为 A_REF */
export function ampOf(s: AcousticsSetup): number {
  const r = radiusOf(s);
  return r < 1e-6 ? AMP_REFERENCE : AMP_REFERENCE / r;
}

/** 波前面积（m²）：S = 4πr² */
export const areaOf = (s: AcousticsSetup) => 4 * Math.PI * radiusOf(s) ** 2;

/**
 * 显示半径（m）：线性映射，把 0–1020 m 的真实半径压到 0.28–2.52 m 的取景范围。
 *
 * 这是产品既定模式——`induction.ts` 的 vectors 缩放 4e4 倍、`orbit.ts` 用 AU，
 * 都是"物理量一个单位、几何显示一个缩放"。诚实声明在 scene 的 assumptions 里。
 */
export const dispRadiusOf = (s: AcousticsSetup) => R_DISP_BASE + radiusOf(s) * R_DISP_SCALE;

/* ============================================================
   几何：三个正交平面上的圆（共同示意一个球面）
   ============================================================ */

export type Plane = 'xy' | 'xz' | 'yz';

/** 给定平面与半径，返回圆的采样点 */
export function ringPoints(plane: Plane, R: number, n = RING_SEGMENTS): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    const c = R * Math.cos(th);
    const s = R * Math.sin(th);
    if (plane === 'xy') out.push([c, s, 0]);
    else if (plane === 'xz') out.push([c, 0, s]);
    else out.push([0, c, s]);
  }
  return out;
}

/** 三个正交平面的圆（同一半径 → 视觉上织成一个球面） */
export function sphereRings(R: number): Record<'ringXY' | 'ringXZ' | 'ringYZ', Vec3[]> {
  return { ringXY: ringPoints('xy', R), ringXZ: ringPoints('xz', R), ringYZ: ringPoints('yz', R) };
}

/* ============================================================
   求解器
   ============================================================ */

/** 静态场景：时长只由讲解脚本决定（最后一步 at + 8） */
export const DURATION = 48;

export const acousticsSolver: SolverModule = {
  kind: 'acoustics',

  duration() {
    return DURATION;
  },

  sample(_playT: number, ctx: SolverCtx): SceneState {
    // 注意：播放时间只推进讲解脚本；**传播时间来自滑块参数**，
    // 所以本场景没有"自动播放的物理"——它是参数驱动的静态几何。
    const s = setupFromParams(ctx.params);
    const R = dispRadiusOf(s);

    const lines: Record<string, Vec3[]> = {};
    OLD_RATIOS.forEach((ratio, i) => {
      const rings = sphereRings(R * ratio);
      const suffix = i === 0 ? '' : i === 1 ? 'old' : 'older';
      lines[`${suffix}ringXY`] = rings.ringXY;
      lines[`${suffix}ringXZ`] = rings.ringXZ;
      lines[`${suffix}ringYZ`] = rings.ringYZ;
    });

    // 珠点：只加在当前波前（ratio=1）上，角度错开半个间隔
    const beads: Record<string, Vec3> = {};
    for (let k = 0; k < BEAD_COUNT; k++) {
      const th = ((k + 0.5) / BEAD_COUNT) * Math.PI * 2;
      const c = R * Math.cos(th);
      const sn = R * Math.sin(th);
      beads[`beadXY${k}`] = [c, sn, 0];
      beads[`beadXZ${k}`] = [c, 0, sn];
      beads[`beadYZ${k}`] = [0, c, sn];
    }

    return {
      t: _playT,
      points: { src: [0, 0, 0], ...beads },
      vectors: {},
      lines,
      scalars: {
        v: s.v,
        t: s.propT,
        r: radiusOf(s),
        amp: ampOf(s),
        S: areaOf(s),
        R,
      },
      meta: { planes: 3 },
    };
  },

  /**
   * 不变量自检
   *
   * 1. `rOverT`：r / v − t ≡ 0（定义恒等）
   * 2. `areaErr`：S − 4πr² ≡ 0（解析恒等）
   * 3. `ampR`：amp · r − A_REF ≡ 0 —— **球面波的不变量**：半径翻倍振幅减半，
   *    乘积恒定。这是"能量摊到 4πr² 的球面上"的定量形式。
   * 4. `ringErr`：三正交圆半径两两之差 ≡ 0（球面性：缺一个圆就不是球）
   */
  invariants(_t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const r = radiusOf(s);
    const R = dispRadiusOf(s);
    const rings = sphereRings(R);
    const rad = (pts: Vec3[]) => Math.hypot(...pts[0]!);
    return {
      rOverT: r / s.v - s.propT,
      areaErr: areaOf(s) - 4 * Math.PI * r * r,
      ampR: ampOf(s) * r - (r < 1e-6 ? 0 : AMP_REFERENCE),
      ringErr: Math.abs(rad(rings.ringXY) - rad(rings.ringXZ)) + Math.abs(rad(rings.ringXZ) - rad(rings.ringYZ)),
      // t=0（r=0）时 amp 走显示守卫值，与 1/r 闭式不可比，该项置 0
      ampDecay: r < 1e-6 ? 0 : ampOf(s) - AMP_REFERENCE / r,
    };
  },
};
