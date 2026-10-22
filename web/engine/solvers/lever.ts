/**
 * 杠杆求解器（动力 × 动力臂 = 阻力 × 阻力臂）
 *
 * 对应规格：docs/specs/features/012-lever.spec.md
 *
 * 物理模型：一根无质量的刚性杆绕支点 O 在竖直平面内转动。
 * 支点左侧 L1 处挂质量为 m1 的钩码（动力 F1 = m1·g），
 * 右侧 L2 处挂质量为 m2 的钩码（阻力 F2 = m2·g），两力均竖直向下。
 *
 * 核心关系（全部闭式解）：
 *
 *     倾角       θ(t) = θ_amp · cos(2π t / T)
 *     作用点     r_1 = (−L1·cosθ, −L1·sinθ, 0),  r_2 = (L2·cosθ, L2·sinθ, 0)
 *     力矩       τ = (r × F)_z = −F · r_x
 *                τ_1 = +F1·L1·cosθ      （逆时针，动力端下沉）
 *                τ_2 = −F2·L2·cosθ      （顺时针，阻力端下沉）
 *     平衡条件   F1·L1 = F2·L2  ⇔  m1·L1 = m2·L2   ← g 被约掉
 *
 * 本场景要打破的两个顽固误解：
 *
 * 1. **力臂 ≠ 杆上从支点到挂点的那段长度**。
 *    力臂是「支点到力的作用线的垂直距离」。力竖直向下时这条垂线是水平的，
 *    所以杠杆一倾斜，力臂就从 L 缩短成 L·cosθ。课本永远画水平杠杆，
 *    这个差别就被藏起来了。3D 里把斜的杆和水平的臂同时画出来，一比就见。
 *
 * 2. **平衡跟 g 无关**。
 *    两端都是重力，g 是公因子，约掉之后只剩 m·L 的平衡。
 *    所以"在月球上杠杆还平不平衡"的答案是：照样平衡。
 *
 * 摆幅设计：θ_amp ∝ 不平衡度 |m1L1 − m2L2| / max(m1L1, m2L2)。
 * 完全平衡时摆幅为 0，杠杆静静停在水平位置——这本身就是最强的视觉信号。
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
/**
 * 最大摆角（rad ≈ 25.8°）。
 *
 * 这个值不能太小：力臂 = L·cosθ 在 θ 小时几乎不变（cos 10° = 0.985），
 * 「力臂 ≠ 杆长」这件事就看不出来。取到 25° 时 cos = 0.90，差 10%，
 * 配上下面 `dropLine` 画出的竖直落差，对比才成立。
 */
export const MAX_TILT = 0.45;
/** 杆的半厚 / 半深（m） */
export const BAR_HALF_H = 0.016;
export const BAR_HALF_D = 0.03;
/** 牛顿 → 世界长度（m）。杆长约 0.9 m，典型合力 30–60 N → 箭头 0.15–0.3 m */
export const FORCE_SCALE = 0.004;

/* ============================================================
   参数解析
   ============================================================ */

export type LeverSetup = {
  /** 动力端钩码质量（kg） */
  m1: number;
  /** 阻力端钩码质量（kg） */
  m2: number;
  /** 动力臂 L1（m） */
  L1: number;
  /** 阻力臂 L2（m） */
  L2: number;
  /** 摆动周期（s） */
  T: number;
};

export function setupFromParams(p: ParamValues): LeverSetup {
  return {
    m1: Math.max(0.1, num(p, 'm1', 2)),
    m2: Math.max(0.1, num(p, 'm2', 4)),
    L1: Math.max(0.1, num(p, 'L1', 60) / 100),
    L2: Math.max(0.1, num(p, 'L2', 30) / 100),
    T: Math.max(1.5, num(p, 'T', 5)),
  };
}

/* ============================================================
   力
   ============================================================ */

/** 动力（N）= m1·g */
export const effForce = (s: LeverSetup) => s.m1 * G;
/** 阻力（N）= m2·g */
export const resistForce = (s: LeverSetup) => s.m2 * G;
/** 支点承担的支持力（N）= F1 + F2 */
export const pivotReaction = (s: LeverSetup) => effForce(s) + resistForce(s);

/* ============================================================
   倾角与力矩
   ============================================================ */

/**
 * 不平衡度 ∈ [0, 1]：|m1L1 − m2L2| / max(m1L1, m2L2)。
 * 完全平衡时为 0。注意这里用质量而不是力——g 已经约掉。
 */
export function imbalance(s: LeverSetup): number {
  const a = s.m1 * s.L1;
  const b = s.m2 * s.L2;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-30) return 0;
  return Math.min(1, Math.abs(a - b) / denom);
}

/** 摆幅（rad）：不平衡度越大摆得越厉害 */
export const tiltAmp = (s: LeverSetup) => MAX_TILT * imbalance(s);

/** 倾角 θ(t)（rad）。约定 θ > 0 表示**左端（动力端）下沉**。 */
export function tiltAt(t: number, s: LeverSetup): number {
  return tiltAmp(s) * Math.cos((2 * Math.PI * t) / s.T);
}

/** 角速度（rad/s） */
export function omegaAt(t: number, s: LeverSetup): number {
  return -tiltAmp(s) * ((2 * Math.PI) / s.T) * Math.sin((2 * Math.PI * t) / s.T);
}

/** 动力作用点（左端） */
export function effEnd(t: number, s: LeverSetup): Vec3 {
  const th = tiltAt(t, s);
  return [-s.L1 * Math.cos(th), -s.L1 * Math.sin(th), 0];
}

/** 阻力作用点（右端） */
export function resEnd(t: number, s: LeverSetup): Vec3 {
  const th = tiltAt(t, s);
  return [s.L2 * Math.cos(th), s.L2 * Math.sin(th), 0];
}

/** 杆的中心（支点把杆分成 L1 / L2 两段，所以中心一般不在支点上） */
export function barCenter(t: number, s: LeverSetup): Vec3 {
  const th = tiltAt(t, s);
  const d = (s.L2 - s.L1) / 2;
  return [d * Math.cos(th), d * Math.sin(th), 0];
}

/** 动力矩（绕 z 轴，逆时针为正） */
export function tauEff(t: number, s: LeverSetup): number {
  return effForce(s) * s.L1 * Math.cos(tiltAt(t, s));
}

/** 阻力矩（顺时针，返回负值） */
export function tauRes(t: number, s: LeverSetup): number {
  return -resistForce(s) * s.L2 * Math.cos(tiltAt(t, s));
}

/** 净力矩 */
export function tauNet(t: number, s: LeverSetup): number {
  return tauEff(t, s) + tauRes(t, s);
}

/**
 * 动力臂的真实长度（m）= 支点到动力作用线的垂直距离 = L1·cosθ。
 *
 * 注意：这不是杆上从支点到挂点的长度 L1！只有杠杆水平（θ=0）时两者才相等。
 */
export const armEff = (t: number, s: LeverSetup) => s.L1 * Math.cos(tiltAt(t, s));

/** 阻力臂的真实长度（m）= L2·cosθ */
export const armRes = (t: number, s: LeverSetup) => s.L2 * Math.cos(tiltAt(t, s));

/* ============================================================
   几何
   ============================================================ */

/** 杆的中轴线：从动力端到阻力端 */
export function barAxis(t: number, s: LeverSetup): Vec3[] {
  return [effEnd(t, s), resEnd(t, s)];
}

/** 动力臂：支点到动力作用线的水平垂线段 */
export function armLine1(t: number, s: LeverSetup): Vec3[] {
  return [
    [0, 0, 0],
    [-armEff(t, s), 0, 0],
  ];
}

/** 阻力臂：支点到阻力作用线的水平垂线段 */
export function armLine2(t: number, s: LeverSetup): Vec3[] {
  return [
    [0, 0, 0],
    [armRes(t, s), 0, 0],
  ];
}

/** 动力作用线（过挂点的竖直线，虚线示意） */
export function forceLine1(t: number, s: LeverSetup): Vec3[] {
  const p = effEnd(t, s);
  return [
    [p[0], p[1] + 0.06, 0],
    [p[0], p[1] - 0.3, 0],
  ];
}

/** 阻力作用线 */
export function forceLine2(t: number, s: LeverSetup): Vec3[] {
  const p = resEnd(t, s);
  return [
    [p[0], p[1] + 0.06, 0],
    [p[0], p[1] - 0.3, 0],
  ];
}

/**
 * 动力端的竖直落差线：从杆端垂直落到力臂端点。
 *
 * 这条线是「力臂直角三角形」的另一条直角边，长度 L1·sinθ。
 * 有了它，斜边（杆）、直角边（力臂）、另一条直角边（落差）三者同框，
 * 即使 θ 只有十几度，也能一眼看出杆比力臂长——这是本场景的核心视觉。
 */
export function dropLine1(t: number, s: LeverSetup): Vec3[] {
  const p = effEnd(t, s);
  return [p, [p[0], 0, 0]];
}

/** 阻力端的竖直落差线 */
export function dropLine2(t: number, s: LeverSetup): Vec3[] {
  const p = resEnd(t, s);
  return [p, [p[0], 0, 0]];
}

/**
 * 支点三角架：两条折线（三角两条边 + 底边）。
 *
 * 返回模块级常量而非每次新建：`polylines` 图元只在数组引用变化时重建几何，
 * 每帧返回新数组会让三角形被无谓地重建 60 次/秒。
 */
const PIVOT_FRAME: Vec3[][] = [
  [
    [-0.08, -0.18, 0],
    [0, 0, 0],
    [0.08, -0.18, 0],
  ],
  [
    [-0.08, -0.18, 0],
    [0.08, -0.18, 0],
  ],
];

export function pivotFrame(): Vec3[][] {
  return PIVOT_FRAME;
}

/* ============================================================
   求解器
   ============================================================ */

export const leverSolver: SolverModule = {
  kind: 'lever',

  duration(ctx) {
    return Math.max(setupFromParams(ctx.params).T, 2);
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const th = tiltAt(t, s);
    const F1 = effForce(s);
    const F2 = resistForce(s);

    const pe = effEnd(t, s);
    const pr = resEnd(t, s);
    const pc = barCenter(t, s);

    return {
      t,
      points: {
        pos: pc,
        pivot: [0, 0, 0],
        effEnd: pe,
        resEnd: pr,
        barC: pc,
      },
      vectors: {
        F1: [0, -F1 * FORCE_SCALE, 0],
        F2: [0, -F2 * FORCE_SCALE, 0],
        R: [0, pivotReaction(s) * FORCE_SCALE, 0],
      },
      lines: {
        bar: barAxis(t, s),
        arm1: armLine1(t, s),
        arm2: armLine2(t, s),
        fline1: forceLine1(t, s),
        fline2: forceLine2(t, s),
        drop1: dropLine1(t, s),
        drop2: dropLine2(t, s),
      },
      linesets: { pivot: pivotFrame() },
      scalars: {
        m1: s.m1,
        m2: s.m2,
        F1,
        F2,
        L1: s.L1 * 100,
        L2: s.L2 * 100,
        arm1: armEff(t, s) * 100,
        arm2: armRes(t, s) * 100,
        tau1: tauEff(t, s),
        tau2: Math.abs(tauRes(t, s)),
        tauNet: tauNet(t, s),
        ratio: (s.m1 * s.L1) / Math.max(1e-30, s.m2 * s.L2),
        support: pivotReaction(s),
        tilt: (th * 180) / Math.PI,
        balanced: imbalance(s) < 1e-9 ? 1 : 0,
      },
      meta: {
        tilt: th,
        tiltDeg: (th * 180) / Math.PI,
        balanced: imbalance(s) < 1e-9,
        heavier: s.m1 * s.L1 > s.m2 * s.L2 ? 'eff' : 'res',
      },
    };
  },

  /**
   * 不变量自检
   *
   * 1. `momentArm`：τ = F ×（支点到作用线的垂直距离）。力臂是 L·cosθ 而不是 L，
   *    这条断言等价于验证"力臂定义没写歪"。
   * 2. `ratioInvariant`：τ_1/τ_2 = m1L1/(m2L2)，**与倾角无关**——
   *    因为两边的 cosθ 同步约掉。这正是"平衡判据不受倾角影响"的原因。
   * 3. `gCancels`：力矩比恰好等于质量比（g 是公因子被约掉），
   *    所以换个重力环境不改变平衡与否。
   * 4. `balance`：m1L1 = m2L2 时净力矩为 0。
   * 5. `support`：支点支持力 = F1 + F2（竖直方向平衡）。
   */
  invariants(t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const F1 = effForce(s);
    const F2 = resistForce(s);

    // 1) τ = F × 力臂（力臂 = L·cosθ）
    const momentArm = tauEff(t, s) - F1 * armEff(t, s);

    // 2) 比值与倾角无关：取两个不同倾角比较
    const t2 = t + s.T / 4;
    const r1 = tauEff(t, s) / Math.max(1e-30, Math.abs(tauRes(t, s)));
    const r2 = tauEff(t2, s) / Math.max(1e-30, Math.abs(tauRes(t2, s)));

    // 3) 力矩比 = 质量比（g 约掉）
    const gCancels = r1 - (s.m1 * s.L1) / Math.max(1e-30, s.m2 * s.L2);

    // 4) 平衡：令 m1 取平衡值，净力矩应为 0
    const balanced = { ...s, m1: (s.m2 * s.L2) / s.L1 };
    const balance = tauNet(t, balanced);

    // 5) 竖直方向平衡
    const support = pivotReaction(s) - (F1 + F2);

    return {
      momentArm,
      ratioInvariant: r1 - r2,
      gCancels,
      balance,
      support,
    };
  },
};
