/**
 * 光的反射与平面镜成像求解器
 *
 * 对应规格：docs/specs/features/008-reflection.spec.md
 *
 * 为什么必须真 3D：平面镜成像的经典演示是"把镜子转一个角，反射光转两个角"。
 * 镜面一旦倾斜，光路就离开了原来的竖直平面——反射点跑到 z ≠ 0 的地方，
 * 这时候只有转动视角才能看清"像在镜后、光路在镜前"这个三维关系。
 */
import type { Vec3 } from '../vec';
import { dot, len, normalize, scale, sub } from '../vec';
import type { ParamValues, SceneState } from '@/engine/spec';
import type { SolverCtx, SolverModule } from './types';
import { num } from './types';

/* ============================================================
   参数与几何
   ============================================================ */

/** 镜面半高（m）。必须高到能接住反射点——反射点在 y≈1.3 处，
 *  早先取 0.8 会让光线打在镜子外面，物理上"没有镜子"却照样画出光路。 */
export const MIRROR_HALF_H = 1.2;
/** 镜面宽度（m），沿镜面方向 */
export const MIRROR_W = 1.8;
/** 镜面厚度（m） */
export const MIRROR_T = 0.03;

export type MirrorSetup = {
  u: number; // 物距（沿 −x 方向为正）
  h: number; // 物高
  eyeX: number; // 眼睛到镜面的距离
  eyeY: number; // 眼睛高度
  phi: number; // 镜面绕 y 轴的转角（弧度）
  mirrorH: number;
};

export function setupFromParams(p: ParamValues): MirrorSetup {
  return {
    u: Math.max(0.3, num(p, 'u', 2)),
    h: Math.max(0.05, num(p, 'h', 1)),
    eyeX: Math.max(0.3, num(p, 'eyeX', 2.5)),
    eyeY: Math.max(0.05, num(p, 'eyeY', 1.2)),
    phi: (num(p, 'phi', 0) * Math.PI) / 180,
    // 镜面尺寸不是教学变量：它是道具，固定住才能保证光路一定落在镜面上。
    // （早先做成了参数，结果"把镜子调矮"会让光线打在空气里却照样画出光路。）
    mirrorH: MIRROR_HALF_H * 2,
  };
}

/** 镜面法向（单位向量）：φ=0 时沿 +x */
export function mirrorNormal(phi: number): Vec3 {
  return [Math.cos(phi), 0, Math.sin(phi)];
}

/** 点关于镜面的对称点（镜面过原点、法向 n） */
export function mirrorPoint(p: Vec3, n: Vec3): Vec3 {
  const d = dot(p, n);
  return [p[0] - 2 * d * n[0], p[1] - 2 * d * n[1], p[2] - 2 * d * n[2]];
}

/**
 * 反射点：把眼睛关于镜面对称得到 E'，直线 P→E' 与镜面的交点即反射点。
 * （这是"光路可逆"与"入射角=反射角"同时成立的几何解。）
 */
export function reflectionPoint(p: Vec3, eye: Vec3, n: Vec3): Vec3 | null {
  const e2 = mirrorPoint(eye, n);
  const dir = sub(e2, p);
  const denom = dot(dir, n);
  if (Math.abs(denom) < 1e-9) return null; // 光线与镜面平行
  const s = -dot(p, n) / denom;
  return [p[0] + s * dir[0], p[1] + s * dir[1], p[2] + s * dir[2]];
}

/**
 * 入射角 / 反射角（相对法向，弧度）
 *
 * 两个角都相对**入射侧那一支法向**测量——这是课本的定义。
 * 早期版本对两者用了相反的法向，导致"入射角 ≠ 反射角"。
 */
export function angles(p: Vec3, r: Vec3, eye: Vec3, n: Vec3): { incidence: number; reflection: number } {
  const inProp = normalize(sub(r, p)); // 入射光的传播方向（射向镜面）
  const outProp = normalize(sub(eye, r)); // 反射光的传播方向（离开镜面）
  const clamp = (x: number) => Math.min(1, Math.max(-1, Math.abs(x)));
  // 入射角/反射角都是与法向的**锐角**：取绝对值。
  // （早先版本对两者取了相反的法向，算出 177° 和 2.5°，直接违背反射定律。）
  return {
    incidence: Math.acos(clamp(dot(inProp, n))),
    reflection: Math.acos(clamp(dot(outProp, n))),
  };
}

/** 反射方向：d' = d − 2(d·n)n。用于验证"镜面转 θ、反射光转 2θ" */
export function reflectDirection(d: Vec3, n: Vec3): Vec3 {
  const k = 2 * dot(d, n);
  return normalize([d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]]);
}

/* ============================================================
   求解器
   ============================================================ */

export const reflectionSolver: SolverModule = {
  kind: 'reflection',

  duration() {
    return 24;
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const s = setupFromParams(ctx.params);
    const n = mirrorNormal(s.phi);

    const objBase: Vec3 = [-s.u, 0, 0];
    const objTip: Vec3 = [-s.u, s.h, 0];
    const eye: Vec3 = [-s.eyeX, s.eyeY, 0];

    const imgBase = mirrorPoint(objBase, n);
    const imgTip = mirrorPoint(objTip, n);

    const rTip = reflectionPoint(objTip, eye, n);
    const rBase = reflectionPoint(objBase, eye, n);

    const aTip = rTip ? angles(objTip, rTip, eye, n) : null;

    // 入射光线（镜前，实线）+ 反射光线（镜前，实线）+ 反向延长线（镜后，虚线）
    const ray = (p: Vec3, r: Vec3 | null): Vec3[] => (r ? [p, r] : [p, p]);
    const back = (r: Vec3 | null, img: Vec3): Vec3[] => (r ? [r, img] : []);

    // 镜面在水平方向上的切向（垂直于法向、躺在 xz 平面内）
    const tangent: Vec3 = [-Math.sin(s.phi), 0, Math.cos(s.phi)];
    // 镜面底边（镜面与地面相交的那条线），用来在画面里"标出镜子站在哪"
    const half = MIRROR_W / 2;
    const m1: Vec3 = [tangent[0] * half, 0, tangent[2] * half];
    const m2: Vec3 = [-m1[0], -m1[1], -m1[2]];
    // 镜面中心（薄板的几何中心）：竖直方向抬高半高，让镜面从地面向上立起来
    const mirrorC: Vec3 = [0, s.mirrorH / 2, 0];

    return {
      t,
      points: {
        pos: objTip,
        objBase,
        objTip,
        imgBase,
        imgTip,
        eye,
        mirrorC,
        rTip: rTip ?? [0, 0, 0],
        rBase: rBase ?? [0, 0, 0],
        // 法向箭头的位置（镜面中心，沿法向偏移一点）
        normalAt: scale(n, 0.35),
      },
      vectors: {
        n,
        normal: n,
      },
      lines: {
        mirror: [m1, m2],
        rayTipIn: ray(objTip, rTip),
        rayTipOut: ray(rTip ?? objTip, eye),
        rayTipVirtual: back(rTip, imgTip),
        rayBaseIn: ray(objBase, rBase),
        rayBaseOut: ray(rBase ?? objBase, eye),
        rayBaseVirtual: back(rBase, imgBase),
        // 物体与像的"高度线"
        objLine: [objBase, objTip],
        imgLine: [imgBase, imgTip],
      },
      scalars: {
        u: s.u,
        h: s.h,
        eyeX: s.eyeX,
        eyeY: s.eyeY,
        phiDeg: (s.phi * 180) / Math.PI,
        mirrorH: s.mirrorH,
        incidence: aTip ? (aTip.incidence * 180) / Math.PI : 0,
        reflection: aTip ? (aTip.reflection * 180) / Math.PI : 0,
        angleDiff: aTip ? ((aTip.incidence - aTip.reflection) * 180) / Math.PI : 0,
        mirrorPhi: s.phi,
        /**
         * 薄板的 rotation.y。盒子默认法向是 +x，绕 y 转 θ 后变成 (cosθ, 0, −sinθ)，
         * 而镜面法向是 (cosφ, 0, sinφ)，所以 θ = −φ。符号写反的话镜面会朝反方向倾，
         * 光路贴着镜子边缘擦过去——画面上"看起来差不多"，但几何全错。
         */
        mirrorRotY: -s.phi,
        mirrorHalfH: s.mirrorH / 2,
        // 像到镜面的距离（沿法向）
        imgDist: Math.abs(dot(imgTip, n)),
        imgHeight: len(sub(imgTip, imgBase)),
        // 反射点偏离镜面中心的程度（镜面转动时会被看到）
        rOffset: rTip ? rTip[2] : 0,
        rY: rTip ? rTip[1] : 0,
      },
      meta: {
        phi: s.phi,
        hit: rTip !== null,
      },
    };
  },
};
