/**
 * 天体运动求解器（开普勒轨道）
 *
 * 对应规格：docs/specs/features/007-orbit.spec.md
 *
 * 为什么必须真 3D：开普勒三定律里最反直觉的是**面积定律**——
 * "相等时间扫过相等面积"在平面图上只是一个扇形示意图，
 * 而在 3D 里可以把两个不同位置的扇形同时摆在眼前，直接比大小。
 * 轨道平面、焦点、径向矢量在空间中的关系也只有转着看才清楚。
 */
import type { Vec3 } from '../vec';
import { len, sub } from '../vec';
import type { ParamValues, SceneState } from '@/engine/spec';
import type { SolverCtx, SolverModule } from './types';
import { num, bool } from './types';

/* ============================================================
   常数与单位
   ============================================================ */

/** 天文单位（m） */
export const AU = 1.496e11;
/**
 * 本求解器的场景时间单位：地球年。
 *
 * 物理周期以秒算是 3.16e7，直接放进时间轴会让读数变成一长串数字。
 * 每个求解器都可以定义自己的场景时钟口径，但必须写进规格（见 F-007）。
 */
export const YEAR = 365.25 * 86400;
/**
 * 本求解器的场景长度单位：天文单位 AU（时间与长度口径保持一致）。
 *
 * 所有 `points` / `lines` / `vectors` 输出都除以 AU，场景里 1 个世界单位 = 1 AU。
 * 不这么做的话，坐标会是 1e11 量级，相机近远裁剪面、雾、缩放步长全部失效。
 *
 * 例外：`scalars` 里的 `r` / `E` / `specificEnergy` 保持 SI（m、J/kg），
 *       HUD 上另有 `rAU` / `vKms` 这类可读单位，两者不混用。
 */
function toAU(p: Vec3): Vec3 {
  return [p[0] / AU, p[1] / AU, p[2] / AU];
}
/** 万有引力常数 */
export const G = 6.674e-11;
/** 引力参数 GM（m³/s²），M 以 10^30 kg 计 */
export function gmOf(massE30: number): number {
  return G * massE30 * 1e30;
}

export type OrbitSetup = {
  a: number; // 半长轴 m
  e: number; // 偏心率
  gm: number; // GM m³/s²
  a2: number; // 对比行星半长轴 m
  e2: number;
  showSecond: boolean;
};

export function setupFromParams(p: ParamValues): OrbitSetup {
  return {
    a: Math.max(0.05, num(p, 'a', 1)) * AU,
    e: Math.min(0.85, Math.max(0, num(p, 'e', 0.35))),
    gm: gmOf(Math.max(0.02, num(p, 'M', 1.989))),
    a2: Math.max(0.05, num(p, 'a2', 2.2)) * AU,
    e2: Math.min(0.85, Math.max(0, num(p, 'e2', 0.1))),
    showSecond: bool(p, 'showSecond', true),
  };
}

/** 开普勒第三定律 T = 2π√(a³/GM)（秒） */
export function periodOf(a: number, gm: number): number {
  return 2 * Math.PI * Math.sqrt((a * a * a) / gm);
}

/** 同一周期，换算成地球年 */
export function periodYears(a: number, gm: number): number {
  return periodOf(a, gm) / YEAR;
}

/* ============================================================
   开普勒方程
   ============================================================ */

/**
 * 解开普勒方程 M = E − e·sinE（牛顿迭代）
 *
 * 偏心率大时初值 E₀ = M 收敛仍足够快（e < 0.85 时 12 次内收敛到 1e-14）。
 */
export function solveKepler(M: number, e: number, iterations = 24): number {
  const m = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < iterations; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-15) break;
  }
  return E;
}

/** 轨道平面内位置（原点在中心天体 = 椭圆焦点），平面为 xy */
export function positionAt(M: number, a: number, e: number): Vec3 {
  const E = solveKepler(M, e);
  return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), 0];
}

/** 日心距 r = a(1 − e·cosE) */
export function radiusAt(M: number, a: number, e: number): number {
  const E = solveKepler(M, e);
  return a * (1 - e * Math.cos(E));
}

/** 活力公式 v = √(GM(2/r − 1/a)) */
export function speedAt(M: number, a: number, e: number, gm: number): number {
  const r = radiusAt(M, a, e);
  return Math.sqrt(gm * (2 / r - 1 / a));
}

/** 面积定律：dA/dt = ½√(GM·a(1−e²))，恒定 */
export function areaRate(a: number, e: number, gm: number): number {
  return 0.5 * Math.sqrt(gm * a * (1 - e * e));
}

/** 一整条轨道的采样点（用于画椭圆） */
export function orbitPath(a: number, e: number, n = 220): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) out.push(positionAt((i / n) * 2 * Math.PI, a, e));
  return out;
}

/* ============================================================
   求解器
   ============================================================ */

/** 扇形扫过的固定时间占比（用于"相等时间扫过相等面积"的可视化） */
const SECTOR_SPAN = 1 / 8;

export const orbitSolver: SolverModule = {
  kind: 'orbit',

  duration(ctx) {
    // 单位：地球年。返回两个轨道周期，保证时间轴至少跑完一整圈。
    return periodYears(setupFromParams(ctx.params).a, setupFromParams(ctx.params).gm) * 2;
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const T = periodYears(s.a, s.gm);
    // 平近点角：连续值，不能取整（取整会让行星以 1 弧度为步长跳变）
    const n = (((t / T) * 2 * Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    // 场景长度单位是 AU：几何量输出前统一换算（见 toAU 的说明）
    const pos = toAU(positionAt(n, s.a, s.e));
    const r = radiusAt(n, s.a, s.e); // SI：读数用 rAU 输出
    const v = speedAt(n, s.a, s.e, s.gm);

    // 当前扫过的扇形：从 M(t) 到 M(t) + 2π/8
    const span = 2 * Math.PI * SECTOR_SPAN;
    const arc: Vec3[] = [];
    const ARC_N = 18;
    for (let i = 0; i <= ARC_N; i++) arc.push(toAU(positionAt(n + (i / ARC_N) * span, s.a, s.e)));
    // 面积读数换算成 AU²（否则是 1e22 这种数量级，没法读）
    const rateAU = (areaRate(s.a, s.e, s.gm) * YEAR) / (AU * AU);
    const areaNow = rateAU * T * SECTOR_SPAN;

    // 对照扇形：固定放在远日点附近（半个周期后）
    const refStart = Math.PI;
    const refArc: Vec3[] = [];
    for (let i = 0; i <= ARC_N; i++)
      refArc.push(toAU(positionAt(refStart + (i / ARC_N) * span, s.a, s.e)));

    // 第二颗行星
    const T2 = periodYears(s.a2, s.gm);
    const n2 = (((t / T2) * 2 * Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const pos2 = toAU(positionAt(n2, s.a2, s.e2));

    // 比耐公式椭圆（用于画出轨道本身）
    const path = orbitPath(s.a, s.e).map(toAU);
    const path2 = s.showSecond ? orbitPath(s.a2, s.e2).map(toAU) : [];

    const E = solveKepler(n, s.e);
    const perihelion = s.a * (1 - s.e);
    const aphelion = s.a * (1 + s.e);

    return {
      t,
      points: {
        pos,
        planet: pos,
        planet2: pos2,
        star: [0, 0, 0],
        emptyFocus: toAU([-2 * s.a * s.e, 0, 0]), // 椭圆的另一个焦点
      },
      vectors: {
        // 速度沿轨道切向：用相邻点差分求方向，长度按"与同半径圆轨道速率之比"缩放。
        // 不能直接拿 v（m/s，~3e4）当长度——那会画出一根戳穿场景的箭头。
        v: (() => {
          const q = toAU(positionAt(n + 1e-4, s.a, s.e));
          const d = sub(q, pos);
          const l = len(d) || 1;
          const vCirc = Math.sqrt(s.gm / s.a); // 同半长轴圆轨道速率
          const k = (0.8 * (v / vCirc)) / l;
          return [d[0] * k, d[1] * k, d[2] * k];
        })(),
        // 径向矢量（焦点 → 行星）
        r: [pos[0], pos[1], 0],
      },
      lines: {
        orbit: path,
        orbit2: path2,
        radius: [
          [0, 0, 0],
          pos,
        ],
        // 扫过的扇形轮廓（由 sector 图元填充）
        sector: arc,
        sectorRef: refArc,
      },
      scalars: {
        r,
        v,
        T,
        T2,
        a: s.a / AU,
        e: s.e,
        // HUD 上标的是 AU，这里必须跟着换算（早先直接输出 m，读数差 11 个数量级）
        perihelion: perihelion / AU,
        aphelion: aphelion / AU,
        vPeri: speedAt(0, s.a, s.e, s.gm) / 1000, // km/s
        vAp: speedAt(Math.PI, s.a, s.e, s.gm) / 1000,
        vKms: v / 1000,
        rAU: r / AU,
        areaRate: rateAU, // AU²/年
        areaNow,
        areaRef: rateAU * T * SECTOR_SPAN,
        // 比耐能量（单位质量）：v²/2 − GM/r = −GM/(2a)
        specificEnergy: (v * v) / 2 - s.gm / r,
        E: -s.gm / (2 * s.a),
        years: t / T,
        TYears: T,
        massE30: s.gm / (G * 1e30),
        // 图元的 `visible` 绑定 scalars 里的数（> 0.5 显示），开关要落成 0/1
        showSecond: s.showSecond ? 1 : 0,
      },
      meta: {
        e: s.e,
        isCircle: s.e < 1e-6,
        showSecond: s.showSecond,
        E,
      },
    };
  },

  /** 守恒量自检：面积速率恒定 + 比耐能量守恒 */
  invariants(t: number, ctx: SolverCtx) {
    const s = setupFromParams(ctx.params);
    const T = periodYears(s.a, s.gm);
    const n = (t / T) * 2 * Math.PI;

    // 用多边形（鞋带公式）面积数值积分一小段，验证 dA/dt 恒定。
    // 不能只用首尾两点算三角形：扇形很宽时三角形会明显低估面积（实测差 40%）。
    const sweep = (M0: number, M1: number) => {
      const N = 512;
      let acc = 0;
      let prev = positionAt(M0, s.a, s.e);
      for (let i = 1; i <= N; i++) {
        const p = positionAt(M0 + ((M1 - M0) * i) / N, s.a, s.e);
        acc += Math.abs(prev[0] * p[1] - prev[1] * p[0]) / 2;
        prev = p;
      }
      return acc;
    };
    const dt = T * SECTOR_SPAN;
    // 时间单位是年，因此速率也要换算成 m²/年再比较
    const expected = areaRate(s.a, s.e, s.gm) * YEAR;
    const near = sweep(n, n + 2 * Math.PI * SECTOR_SPAN) / dt;
    const far = sweep(n + Math.PI, n + Math.PI + 2 * Math.PI * SECTOR_SPAN) / dt;

    const r = radiusAt(n, s.a, s.e);
    const v = speedAt(n, s.a, s.e, s.gm);
    const energy = (v * v) / 2 - s.gm / r;
    const e0 = -s.gm / (2 * s.a);

    return {
      areaRateError: Math.abs(near - expected) / expected,
      areaRateErrorFar: Math.abs(far - expected) / expected,
      energyDrift: Math.abs(energy - e0) / Math.abs(e0),
    };
  },
};
