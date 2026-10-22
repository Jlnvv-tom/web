import type { SceneState } from '../spec';
import type { SolverModule } from './types';
import { num } from './types';

/**
 * 凸透镜成像（薄透镜近似）
 *
 * 笛卡尔符号约定（与教材光路图一致）：
 *   物在 x = −u（u > 0），透镜在 x = 0，主光轴沿 x
 *   1/x_i − 1/x_o = 1/f   ⇒   x_i = u·f / (u − f)
 *   横向放大率 m = f / (f − u)，像高 h_i = h·m
 *
 *   u > 2f      倒立缩小实像（f < x_i < 2f）
 *   u = 2f      倒立等大实像（x_i = 2f）
 *   f < u < 2f  倒立放大实像（x_i > 2f）
 *   u = f       不成像（出射为平行光）
 *   u < f       正立放大虚像（x_i < 0，与物同侧）
 *
 * 世界单位：1 unit = 10 cm
 */
const W = 0.1; // world per cm

type P3 = [number, number, number];

export const thinLensSolver: SolverModule = {
  kind: 'thinLens',

  duration() {
    return 12;
  },

  sample(t, { params }) {
    const { u, f, h } = read(params);
    const nearFocus = Math.abs(u - f) < 0.6;

    const xo = -u;
    const xi = nearFocus ? NaN : (u * f) / (u - f);
    const mag = nearFocus ? NaN : f / (f - u);
    const hi = nearFocus ? NaN : h * mag;

    const real = Number.isFinite(xi) && xi > 0;
    const virtual = Number.isFinite(xi) && xi < 0;

    const X = (cm: number) => cm * W;

    const objectBase: P3 = [X(xo), 0, 0];
    const objectTip: P3 = [X(xo), X(h), 0];
    const imageBase: P3 = Number.isFinite(xi) ? [X(xi), 0, 0] : [0, 0, 0];
    const imageTip: P3 = Number.isFinite(xi) ? [X(xi), X(hi), 0] : [0, 0, 0];

    const xEnd = Math.max(Number.isFinite(xi) ? Math.abs(xi) : u * 1.6, u, f) * 1.3;

    /* ---------- 特殊光线 ---------- */
    const rays: Record<string, P3[]> = {};

    // ① 平行主光轴 → 折射后过 F′(f,0)
    {
      const yAt = X(h);
      const k = (X(xEnd) - 0) / (X(f) || 1e-9);
      rays.ray0 = [
        objectTip,
        [0, yAt, 0],
        [X(xEnd), yAt + (0 - yAt) * k, 0],
      ];
    }

    // ② 过光心 → 方向不变
    {
      const k = X(xEnd) / X(u);
      rays.ray1 = [objectTip, [0, 0, 0], [X(xEnd), X(h) * k, 0]];
    }

    // ③ 过前焦点 F(−f,0) → 折射后平行主光轴（仅实像情形画，虚像时该光线背向透镜）
    if (real) {
      const yAtLens = X(hi);
      rays.ray2 = [
        objectTip,
        [X(-f), 0, 0],
        [0, yAtLens, 0],
        [X(xEnd), yAtLens, 0],
      ];
    }

    /* ---------- 虚像的反向延长线 ---------- */
    const dashed: Record<string, P3[]> = {};
    if (virtual) {
      dashed.virtual0 = [[0, X(h), 0], imageTip];
      dashed.virtual1 = [[0, 0, 0], imageTip];
    }

    const kind: 'real' | 'virtual' | 'none' = nearFocus ? 'none' : real ? 'real' : 'virtual';

    const state: SceneState = {
      t,
      points: {
        objectBase,
        objectTip,
        imageBase,
        imageTip,
        focusF: [X(-f), 0, 0],
        focusF2: [X(f), 0, 0],
        lensCenter: [0, 0, 0],
      },
      vectors: {},
      lines: {
        ...rays,
        ...dashed,
        axis: [
          [X(-xEnd), 0, 0],
          [X(xEnd), 0, 0],
        ],
        objectRay: [objectBase, objectTip],
        imageRay: Number.isFinite(xi) ? [imageBase, imageTip] : [],
      },
      scalars: {
        u,
        f,
        xi: Number.isFinite(xi) ? xi : 0,
        imgDist: Number.isFinite(xi) ? Math.abs(xi) : 0,
        mag: Number.isFinite(mag) ? mag : 0,
        hi: Number.isFinite(hi) ? hi : 0,
        kindCode: kind === 'real' ? 1 : kind === 'virtual' ? -1 : 0,
      },
      meta: {
        kind,
        real,
        virtual,
        nearFocus,
        // 便于 UI 直接显示判断结论
        verdict: nearFocus
          ? '不成像（出射光平行）'
          : real
            ? u > 2 * f
              ? '倒立、缩小的实像'
              : Math.abs(u - 2 * f) < 0.6
                ? '倒立、等大的实像'
                : '倒立、放大的实像'
            : '正立、放大的虚像',
      },
    };
    return state;
  },

  invariants(t, { params }) {
    const { u, f } = read(params);
    const s = this.sample(t, { params, options: {} });
    const xi = s.scalars.xi!;
    return {
      // 教材写法 1/u + 1/v = 1/f 的残差（实像时）
      lensEquationResidual: xi > 0 ? 1 / u + 1 / xi - 1 / f : 0,
      magnificationError: s.scalars.mag! - f / (f - u),
    };
  },
};

function read(p: Record<string, number | boolean | string>) {
  return { u: num(p, 'u', 30), f: num(p, 'f', 10), h: num(p, 'h', 4) };
}
