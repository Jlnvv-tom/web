/**
 * 电磁感应求解器 · 导体棒切割磁感线（初中：磁生电）
 *
 * 对应规格：docs/specs/features/F-019-em-induction.spec.md
 *
 * 物理模型：匀强磁场区（x ∈ [0, FIELD_HALF]，B 竖直向下 −y），导体棒垂直放置在
 * 两条平行导轨上（棒沿 y），以速度 v 沿 +x 匀速切割磁感线。
 *
 *     ε = B·L·v        （只在磁场中成立；离开磁场 inF=0 → ε=0）
 *     I = ε / R        （闭合回路欧姆定律）
 *     F = B·I·L        （安培力，沿 −x，阻碍相对运动）
 *     F·v = I²R        （机械功率全部变成焦耳热——楞次定律的定量形式）
 *
 * 迁移自 lessons/初中物理实验/05-electromagnetic-induction.html（数值已由
 * verify_junior.py 手算验证）。**迁移中修正了一处方向错误**：原页面把感应电流
 * 画成 +z，但 v=+x、B=−y 时 v×B = −z；且 I 沿 +z 时安培力 L×B = +x 会**顺着**
 * 运动方向给棒助力，违反能量守恒与楞次定律。修正为 I 沿 −z（垂直纸面向里），
 * 此时 L×B = −x̂，安培力阻碍运动 ✓。lessons 只验了数值大小，方向从未被验证过。
 *
 * 为什么必须真 3D：感应电流的方向**垂直导轨平面**（−z）。平面图里第三维只能
 * 画成"点/叉"，学生背口诀"内容外叉"却不知道反的是哪根轴；3D 里把 B（下）、
 * v（右）、I（里）三根箭头同时立起来，转视角才能看清右手定则到底在 orthogonality
 * 三个方向之间建立了什么关系。dimension 因此标 hybrid：主体是平面装置，
 * 但核心矢量离开该平面。
 *
 * 与高中 `induction`（F-010，磁铁插线圈·楞次定律）的边界：初中只讲
 * "条件 / 方向 / 大小"，BLv 作为读数出现；高中讲磁通量与磁通变化。两份场景。
 */
import type { Vec3 } from '../vec';
import type { ParamValues, SceneState } from '../spec';
import type { SolverCtx, SolverModule } from './types';
import { num } from './types';

/* ============================================================
   常量
   ============================================================ */

/** 磁场区右边界（m）：棒 x < 3 在磁场中，x ≥ 3 离开 */
export const FIELD_HALF = 3;
/** 导轨半间距（m，显示值；物理量 L 另见参数） */
export const RAIL_HALF = 0.85;
/** 磁场区上下边界（m） */
export const ZONE_HALF = 0.9;
/** 导轨绘制范围（m） */
export const RAIL_SPAN: [number, number] = [-0.3, 4.4];
/** v 箭头缩放：v=1.5 m/s → 0.75 m 长 */
export const V_ARROW_SCALE = 0.5;
/** I 箭头缩放：I=0.15 A → 0.375 m 长 */
export const I_ARROW_SCALE = 2.5;
/** B 箭头长度（m，固定） */
export const B_ARROW_LEN = 1.4;
/** 导轨采样点数 */
export const RAIL_SEGMENTS = 24;

/* ============================================================
   参数解析
   ============================================================ */

export type RodSetup = {
  /** 棒位置 x（m） */
  x: number;
  /** 磁感应强度 B（T） */
  B: number;
  /** 有效切割长度 L（m） */
  L: number;
  /** 棒速度 v（m/s，沿 +x；0 = 静止） */
  v: number;
  /** 回路电阻 R（Ω） */
  R: number;
};

export function setupFromParams(p: ParamValues): RodSetup {
  return {
    x: Math.min(4, Math.max(0, num(p, 'x', 1.2))),
    B: Math.max(0, num(p, 'B', 0.5)),
    L: Math.max(0, num(p, 'L', 0.4)),
    v: Math.max(0, num(p, 'v', 1.5)),
    R: Math.max(0.1, num(p, 'R', 2)),
  };
}

/* ============================================================
   物理量（全部闭式）
   ============================================================ */

/** 是否在磁场中：x < 3 → 1，否则 0（ lessons 原式 1−floor(x/3) 的等价写法） */
export const inField = (s: RodSetup) => (s.x < FIELD_HALF ? 1 : 0);

/** 感应电动势（V）：ε = B·L·v·inF */
export const emfOf = (s: RodSetup) => s.B * s.L * s.v * inField(s);

/** 感应电流（A）：I = ε/R */
export const currentOf = (s: RodSetup) => emfOf(s) / s.R;

/** 电流（mA）——读数口径 */
export const currentMAOf = (s: RodSetup) => currentOf(s) * 1000;

/** "磁场中的电流" I₀ = BLv/R（mA）：与位置无关的守恒读数 */
export const i0MAOf = (s: RodSetup) => (s.B * s.L * s.v * 1000) / s.R;

/** 安培力（N）：F = B·I·L，沿 −x */
export const forceOf = (s: RodSetup) => s.B * currentOf(s) * s.L;

/* ============================================================
   几何
   ============================================================ */

/** 采样一条沿 x 的线段（导轨 / 磁场区前后边界） */
export function xLine(y: number, z = 0, from = RAIL_SPAN[0], to = RAIL_SPAN[1], n = RAIL_SEGMENTS): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) out.push([from + ((to - from) * i) / n, y, z]);
  return out;
}

/** 采样一条沿 y 的线段（棒 / 磁场区左右边界） */
export function yLine(x: number, half: number, z = 0, n = 12): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) out.push([x, -half + (2 * half * i) / n, z]);
  return out;
}

/** B 箭头锚点（磁场区内两个固定位置） */
export const bAnchors = (): { b1: Vec3; b2: Vec3 } => ({ b1: [0.8, 0.7, 0], b2: [2.2, 0.7, 0] });

/* ============================================================
   求解器
   ============================================================ */

/** 静态场景：时长由讲解脚本决定（最后一步 at + 8） */
export const DURATION = 48;

export const rodInductionSolver: SolverModule = {
  kind: 'rodInduction',

  duration() {
    return DURATION;
  },

  sample(_playT: number, ctx: SolverCtx): SceneState {
    // 播放时间只推进讲解脚本；棒的位置来自滑块参数 x（参数驱动的静态几何）
    const s = setupFromParams(ctx.params);
    const inF = inField(s);
    const I = currentOf(s);
    const { b1, b2 } = bAnchors();

    // I 的方向：v(+x) × B(−y) = −z。eps 恒 ≥ 0（参数域全非负），故 z 分量 ≤ 0。
    const iVec: Vec3 = [0, 0, -I_ARROW_SCALE * I];

    return {
      t: _playT,
      points: {
        rodC: [s.x, 0, 0],
        rodTop: [s.x, RAIL_HALF + 0.3, 0],
        b1,
        b2,
      },
      vectors: {
        // 运动方向：+x
        v: [V_ARROW_SCALE * s.v, 0, 0],
        // 感应电流方向：−z（见文件头修正说明）
        I: iVec,
        // 磁场方向：−y（竖直向下），固定长度
        B1: [0, -B_ARROW_LEN, 0],
        B2: [0, -B_ARROW_LEN, 0],
      },
      lines: {
        // 棒本体是 box 图元（position 绑 rodC），这里只留导轨与磁场区
        railF: xLine(RAIL_HALF),
        railB: xLine(-RAIL_HALF),
        zoneL: yLine(0, ZONE_HALF),
        zoneR: yLine(FIELD_HALF, ZONE_HALF),
        zoneF: xLine(ZONE_HALF, 0, 0, FIELD_HALF),
        zoneB: xLine(-ZONE_HALF, 0, 0, FIELD_HALF),
      },
      scalars: {
        x: s.x,
        B: s.B,
        L: s.L,
        v: s.v,
        R: s.R,
        inF,
        eps: emfOf(s),
        cur: currentOf(s),
        curmA: currentMAOf(s),
        I0: i0MAOf(s),
        F: forceOf(s),
      },
      meta: { inField: inF > 0.5 },
    };
  },

  /**
   * 不变量自检
   *
   * 1. `fluxCut`：ε − B·L·v·inF ≡ 0（定义恒等）
   * 2. `ohm`：I·R − ε ≡ 0（闭合回路欧姆定律）
   * 3. `energy`：F·v − I²R ≡ 0 —— **能量平衡**：机械功率全部转化为焦耳热。
   *    这是楞次定律"阻碍"的定量含义，也是本场景最值得讲的一条。
   * 4. `i0Const`：I₀ − BLv/R×1000 ≡ 0（守恒读数定义）
   */
  invariants(_t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const I = currentOf(s);
    return {
      fluxCut: emfOf(s) - s.B * s.L * s.v * inField(s),
      ohm: I * s.R - emfOf(s),
      energy: forceOf(s) * s.v - I * I * s.R,
      i0Const: i0MAOf(s) - (s.B * s.L * s.v * 1000) / s.R,
    };
  },
};
