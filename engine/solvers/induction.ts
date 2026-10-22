/**
 * 电磁感应求解器（法拉第电磁感应定律 + 楞次定律）
 *
 * 对应规格：docs/specs/features/010-induction.spec.md
 *
 * 物理模型：条形磁铁用**磁偶极子**近似，沿线圈轴线（x 轴）往复运动。
 * 线圈是 N 匝、半径 a 的圆环，圆环平面为 y-z 平面，法向 n̂ = +x̂。
 *
 * 闭式解：轴线上距偶极子 x 处、半径 a 的圆面上的磁通量为
 *
 *     Φ₁(x) = μ₀ a² (m⃗·n̂) / (2 (a² + x²)^{3/2})
 *
 * （由 A⃗ = μ₀/(4π)·(m⃗ × r̂)/r² 沿圆周积分 ∮A⃗·dl⃗ 得到。）
 * 代入法拉第定律：
 *
 *     ε = −N dΦ₁/dt = (3/2) N μ₀ a² (m⃗·n̂) x ẋ / (a² + x²)^{5/2}
 *
 * 楞次定律不需要额外规则——它就藏在 ε 的负号里：
 *
 *     I = ε / R，  B_ind = μ₀ N I / (2a)，  F = N I dΦ₁/dx
 *
 * 可以验证 F·ẋ = −I²R ≤ 0，即机械功全部变成焦耳热，这正是"阻碍"的定量含义。
 *
 * 为什么必须真 3D：
 *   楞次定律的难点是**连续两次右手定则**——先由原磁场判断磁通方向，
 *   再由"磁通怎么变"判断感应电流方向。平面图上这两步都退化成"顺时针/逆时针"，
 *   学生只能背口诀。在 3D 里可以把线圈法向、原磁场矢量、感应磁场矢量同时立起来，
 *   转一下视角就看清"增则反之、减则同之"到底反的是哪根箭头。
 */
import type { Vec3 } from '../vec';
import type { ParamValues, SceneState } from '../spec';
import type { SolverCtx, SolverModule } from './types';
import { num, str } from './types';

/* ============================================================
   常量
   ============================================================ */

/** 真空磁导率 μ₀（H/m） */
export const MU0 = 4 * Math.PI * 1e-7;
/** 线圈半径 a（m） */
export const COIL_R = 0.1;
/** 磁铁总长（m），半长 = MAG_LEN/2 */
export const MAG_LEN = 0.24;
/** 磁铁截面半宽（m） */
export const MAG_HALF_W = 0.045;
/** 磁铁最近能推到的位置（m）。再近偶极近似就不可靠了 */
export const X_NEAR = 0.16;

/* ============================================================
   参数解析
   ============================================================ */

export type InductionSetup = {
  /** 匝数 */
  N: number;
  /** 回路电阻（Ω） */
  R: number;
  /** 磁矩大小（A·m²） */
  m: number;
  /** 朝向线圈的磁极：'N' 表示 N 极正对线圈 */
  pole: 'N' | 'S';
  /** 往复行程（m） */
  amp: number;
  /** 往复周期（s） */
  T: number;
};

export function setupFromParams(p: ParamValues): InductionSetup {
  return {
    N: Math.max(1, num(p, 'N', 200)),
    R: Math.max(0.1, num(p, 'R', 20)),
    m: Math.max(0.1, num(p, 'm', 5)),
    pole: str(p, 'pole', 'N') === 'S' ? 'S' : 'N',
    amp: Math.max(0.02, num(p, 'amp', 16) / 100),
    T: Math.max(0.5, num(p, 'T', 3)),
  };
}

/** 磁矩在法向上的投影 s = m⃗·n̂（带符号） */
export function momentAlongNormal(s: InductionSetup): number {
  // N 极朝向线圈 → 磁矩指向 −x̂（磁矩由 S 指向 N）
  return s.pole === 'N' ? -s.m : s.m;
}

/* ============================================================
   运动学
   ============================================================ */

/** 磁铁中心位置（m）：X(t) = x_c + A·cos(ωt) */
export function magnetX(t: number, s: InductionSetup): number {
  const xc = X_NEAR + s.amp / 2;
  const w = (2 * Math.PI) / s.T;
  return xc + (s.amp / 2) * Math.cos(w * t);
}

/** 磁铁速度（m/s）：Ẋ(t) = −A·ω·sin(ωt) */
export function magnetV(t: number, s: InductionSetup): number {
  const w = (2 * Math.PI) / s.T;
  return -(s.amp / 2) * w * Math.sin(w * t);
}

/** 行程的两个端点 */
export const xFarOf = (s: InductionSetup) => X_NEAR + s.amp;

/* ============================================================
   电磁学闭式解
   ============================================================ */

/** 单匝磁通量 Φ₁(x)（Wb） */
export function fluxPerTurn(x: number, s: InductionSetup): number {
  const sgn = momentAlongNormal(s);
  return (MU0 * sgn * COIL_R * COIL_R) / (2 * Math.pow(COIL_R * COIL_R + x * x, 1.5));
}

/** dΦ₁/dx（Wb/m） */
export function dFluxPerTurn(x: number, s: InductionSetup): number {
  const sgn = momentAlongNormal(s);
  return (-1.5 * MU0 * sgn * COIL_R * COIL_R * x) / Math.pow(COIL_R * COIL_R + x * x, 2.5);
}

/** 感应电动势 ε（V）。磁铁在 x 处以速率 ẋ 运动 */
export function emfAt(x: number, xdot: number, s: InductionSetup): number {
  return -s.N * dFluxPerTurn(x, s) * xdot;
}

/** 感应电流（A） */
export const currentOf = (emf: number, s: InductionSetup) => emf / s.R;

/** 感应磁场（T），沿法向，正号表示与 n̂ 同向 */
export const inducedB = (I: number, s: InductionSetup) => (MU0 * s.N * I) / (2 * COIL_R);

/** 磁铁受到的阻力（N），沿 x 轴 */
export function dragForce(I: number, x: number, s: InductionSetup): number {
  return s.N * I * dFluxPerTurn(x, s);
}

/** 磁铁轴线上距中心 x 处的磁感应强度（T），带符号（+ 表示沿 +x） */
export function bOnAxis(x: number, s: InductionSetup): number {
  const sgn = momentAlongNormal(s);
  return (MU0 * 2 * sgn) / (4 * Math.PI * Math.max(x, 1e-6) ** 3);
}

/* ============================================================
   几何
   ============================================================ */

/** 线圈上第 i 个取样点的角度（共 n 个） */
export const ringAngle = (i: number, n: number) => (2 * Math.PI * i) / n;

/** 线圈圆环上的点（y-z 平面） */
export function ringPoint(theta: number, r = COIL_R): Vec3 {
  return [0, r * Math.sin(theta), r * Math.cos(theta)];
}

/** 圆环切向单位矢量（θ 增大方向）。该方向的环流产生 **−x̂** 的磁场 */
export function ringTangent(theta: number): Vec3 {
  return [0, Math.cos(theta), -Math.sin(theta)];
}

/**
 * 感应电流的绕行方向：+1 表示沿 `ringTangent` 方向，−1 表示反向。
 *
 * 约定：ε > 0 时电流沿法向 n̂ 的右手螺旋方向，而 `ringTangent` 对应的是
 * **左手** 螺旋（见上方推导），因此要取 −sign(ε)。
 *
 * 验证：N 极靠近线圈 → 穿过线圈的磁通沿 −x̂ 且越来越负 → ε > 0 →
 * 电流绕向使线圈朝向磁铁的一面变成 N 极 → 排斥。符合楞次定律。
 */
export function currentSense(emf: number): 1 | -1 {
  return emf >= 0 ? -1 : 1;
}

/* ============================================================
   偶极子场线（用于渲染磁感线）
   ============================================================ */

/** 场线条数（每个平面） */
export const FIELD_LINE_COUNT = 5;
/** 每条场线的采样点数 */
export const FIELD_LINE_SAMPLES = 34;

/**
 * 单个平面内的偶极子场线族。
 *
 * 偶极子场线满足 r = r₀ sin²θ（θ 自磁矩方向起算），
 * 这里在「含磁矩轴的平面」内按此式取点，得到经典的闭合回路形状。
 *
 * @param axis 磁矩单位矢量（场线从这里"射出"）
 * @param perp 平面内与 axis 垂直的单位矢量
 */
export function fieldLines(s: InductionSetup, axis: Vec3, perp: Vec3): Vec3[][] {
  const out: Vec3[][] = [];
  const eps = 0.14;
  for (let k = 0; k < FIELD_LINE_COUNT; k++) {
    const r0 = 0.13 + k * 0.135;
    const line: Vec3[] = [];
    for (let i = 0; i <= FIELD_LINE_SAMPLES; i++) {
      const th = eps + (i / FIELD_LINE_SAMPLES) * (Math.PI - 2 * eps);
      const r = r0 * Math.sin(th) ** 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      line.push([
        r * c * axis[0] + r * sn * perp[0],
        r * c * axis[1] + r * sn * perp[1],
        r * c * axis[2] + r * sn * perp[2],
      ]);
    }
    out.push(line);
  }
  return out;
}

/** 把场线族整体平移到磁铁中心 X */
export function translateLines(lines: Vec3[][], dx: number): Vec3[][] {
  return lines.map((l) => l.map((p) => [p[0] + dx, p[1], p[2]] as Vec3));
}

/* ============================================================
   求解器
   ============================================================ */

export const inductionSolver: SolverModule = {
  kind: 'induction',

  duration(ctx) {
    return setupFromParams(ctx.params).T * 2;
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const x = magnetX(t, s);
    const xdot = magnetV(t, s);

    const phi1 = fluxPerTurn(x, s);
    const linkage = s.N * phi1;
    const emf = emfAt(x, xdot, s);
    const I = currentOf(emf, s);
    const bInd = inducedB(I, s);
    const F = dragForce(I, x, s);
    const bAxis = bOnAxis(x, s);

    const half = MAG_LEN / 2;
    const nearEnd = x - half; // 靠近线圈的一端
    const farEnd = x + half;

    // 8 个电流箭头，绕线圈均匀分布
    const N_ARROW = 8;
    const sense = currentSense(emf);
    const pts: Record<string, Vec3> = {};
    const vecs: Record<string, Vec3> = {};
    for (let i = 0; i < N_ARROW; i++) {
      const th = ringAngle(i, N_ARROW);
      const p = ringPoint(th);
      const tg = ringTangent(th);
      pts[`c${i}`] = p;
      vecs[`I${i}`] = [0, sense * tg[1] * 0.06, sense * tg[2] * 0.06];
    }

    // 场线：两个互相垂直的含轴平面，让磁感线在 3D 里有体积感
    const axisX: Vec3 = s.pole === 'N' ? [-1, 0, 0] : [1, 0, 0];
    const linesXY = translateLines(fieldLines(s, axisX, [0, 1, 0]), x);
    const linesXZ = translateLines(fieldLines(s, axisX, [0, 0, 1]), x);

    return {
      t,
      points: {
        pos: [0, 0, 0],
        coilCenter: [0, 0, 0],
        magC: [x, 0, 0],
        // 朝向线圈的那一极 / 背向线圈的那一极
        poleNear: [nearEnd, 0, 0],
        poleFar: [farEnd, 0, 0],
        nearC: [x - half / 2, 0, 0],
        farC: [x + half / 2, 0, 0],
        ...pts,
      },
      vectors: {
        // 磁铁在线圈中心处产生的原磁场（沿 ±x）
        B: [bAxis * 4e4, 0, 0],
        // 感应电流产生的磁场（沿 ±x）
        Bind: [bInd * 4e4, 0, 0],
        // 磁铁受到的阻力
        F: [F * 1e7, 0, 0],
        // 磁铁速度
        v: [xdot * 0.5, 0, 0],
        ...vecs,
      },
      lines: {
        axis: [
          [-0.24, 0, 0],
          [0.44, 0, 0],
        ],
        coil: Array.from({ length: 65 }, (_, i) => ringPoint((i / 64) * 2 * Math.PI)),
      },
      linesets: { bLines: linesXY, bLines2: linesXZ },
      scalars: {
        x: x * 100,
        v: xdot * 100,
        flux: phi1 * 1e6,
        linkage: linkage * 1e6,
        emf: emf * 1e3,
        current: I * 1e6,
        bInd: bInd * 1e6,
        force: F * 1e6,
        N: s.N,
        R: s.R,
        T: s.T,
        vMax: (s.amp / 2) * ((2 * Math.PI) / s.T) * 100,
        // 磁极显隐开关：contract 里 `visible` 绑定的是 scalars 中的数（> 0.5 显示），
        // 所以布尔要落成 0/1
        nearIsN: s.pole === 'N' ? 1 : 0,
        farIsN: s.pole === 'N' ? 0 : 1,
      },
      meta: {
        // approaching / receding / nearest：楞次定律的三种关键状态
        state: Math.abs(xdot) < 1e-4 ? 'nearest' : xdot < 0 ? 'approaching' : 'receding',
        sense: sense > 0 ? 'ccw-from-plus-x' : 'cw-from-plus-x',
        poleFacing: s.pole,
      },
    };
  },

  /**
   * 不变量自检
   *
   * 1. `lenzProduct = ε · dΦ/dt`：楞次定律要求它 **≤ 0**（感应电动势总是反对磁通变化）。
   * 2. `emfFdiff`：解析的 ε 与 Φ 的有限差分之差（相对量级），应远小于 1。
   * 3. `powerBalance = F·ẋ + I²R`：机械功率与焦耳热之和应为 0。
   */
  invariants(t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const x = magnetX(t, s);
    const xdot = magnetV(t, s);

    const emf = emfAt(x, xdot, s);
    const I = currentOf(emf, s);
    const F = dragForce(I, x, s);

    // 用有限差分求 d(NΦ)/dt
    const h = Math.max(1e-4, s.T * 1e-4);
    const dPsi = (s.N * (fluxPerTurn(magnetX(t + h, s), s) - fluxPerTurn(magnetX(t - h, s), s))) / (2 * h);
    const dPsiAnalytic = s.N * dFluxPerTurn(x, s) * xdot;

    const scale = Math.max(1e-12, Math.abs(dPsiAnalytic));
    return {
      lenzProduct: emf * dPsiAnalytic,
      lenzNormalized: (emf * dPsiAnalytic) / Math.max(1e-30, Math.abs(emf) * Math.abs(dPsiAnalytic) + 1e-30),
      emfFdiff: (dPsi - dPsiAnalytic) / scale,
      powerBalance: (F * xdot + I * I * s.R) / Math.max(1e-30, Math.abs(I * I * s.R) + 1e-30),
    };
  },
};
