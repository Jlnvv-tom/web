/**
 * 开场演出（M3 · W4）· 纯逻辑部分
 *
 * 这个文件**不碰 React、不碰 Three**——时钟推进与 kind→视觉乘子的翻译
 * 都是纯函数，可在 Node 里单测（宪法第五条的同款纪律：可复现、可断言）。
 * React context 在 components/scene/intro.ts，渲染应用在各图元组件里。
 *
 * 设计约束（docs/m3-plan.md §5 W4 与八条宪法）：
 * - kind 是枚举：5 种效果由渲染层统一实现，场景只选哪一种（宪法第六条：
 *   一旦允许每场景自己写演出，就会退化成 12 段特判代码）。
 * - 独立时钟：进度只存在于 render 层的 ref，不进 store、不进 solver，
 *   `sample(t)` 拿不到它（宪法第五条）；删掉 decor 后输出逐值不变
 *   （decor 契约测试的 G3 机器保证）。
 * - 可禁用：`prefers-reduced-motion` 直接跳到结束态，零演出。
 */
import type { IntroKind } from './spec';

export type IntroState = {
  kind: IntroKind;
  /** 时长（秒） */
  duration: number;
  elapsed: number;
  /** 0→1；结束后钉在 1 */
  progress: number;
  /** 是否还在演出。结束后为 false——后续帧走禁用快路径，零开销 */
  active: boolean;
};

/** 禁用态：progress=1 意味着"所有效果恒等"，与没有 intro 完全一致 */
export const INTRO_IDLE: IntroState = {
  kind: 'none',
  duration: 0,
  elapsed: 0,
  progress: 1,
  active: false,
};

export const INTRO_DEFAULT_DURATION = 1.6;

/** 场景挂载时调用一次。reduced-motion 或 kind 缺失 → 禁用 */
export function makeIntro(kind: IntroKind | undefined, duration?: number): IntroState {
  if (!kind || kind === 'none') return INTRO_IDLE;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return INTRO_IDLE;
  }
  return {
    kind,
    duration: duration && duration > 0 ? duration : INTRO_DEFAULT_DURATION,
    elapsed: 0,
    progress: 0,
    active: true,
  };
}

/** 每帧推进（SceneObjects 的 useFrame 调用；dt 已被调用方 clamp 到 0.05） */
export function advanceIntro(s: IntroState, dt: number): void {
  if (!s.active) return;
  s.elapsed += dt;
  s.progress = Math.min(1, s.elapsed / s.duration);
  if (s.progress >= 1) s.active = false;
}

/** 每种 kind 把进度翻译成的视觉乘子。1 = 无效果 */
export type IntroFx = {
  /** 网格/物体缩放 */
  scale: number;
  /** 不透明度乘子 */
  alpha: number;
  /** 自发光强度乘子（0 = 还没点亮） */
  emissive: number;
  /** 光晕缩放乘子（>1 = 光晕比常态大） */
  halo: number;
};

const FX_IDLE: IntroFx = { scale: 1, alpha: 1, emissive: 1, halo: 1 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 立方缓出：快起慢收，比线性"有手感" */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** 回弹缓出：轻微过冲再收回，实体"弹出来"的关键 */
const easeOutBack = (t: number) => {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u ** 3 + c * u ** 2;
};

/**
 * kind × 进度 → 视觉乘子。
 *
 * isSubject：`decor.subject` 指向的主角。trail-bloom / splash 的主角
 * 拿完整效果（弹出 + 光晕/冲击环），其余物体只做淡入——不抢戏。
 * 演出结束（progress=1）时所有 kind 都收敛到恒等，与没有 intro 一致。
 */
export function introFx(s: IntroState, isSubject = false): IntroFx {
  if (!s.active) return FX_IDLE;
  const p = s.progress;
  switch (s.kind) {
    case 'assemble':
      return { scale: easeOutBack(clamp01(p * 1.15)), alpha: clamp01(p * 1.6), emissive: 1, halo: 1 };
    case 'wipe-in':
      // v1 是整体淡入。按世界坐标 y 的"擦除"留待 v2——它需要每个图元
      // 上报自己的位置，而图元位置分属 state/def 两处，v1 不做这个抽象。
      return { scale: 1, alpha: easeOutCubic(p), emissive: 1, halo: 1 };
    case 'light-up':
      // 前半段淡入，后半段点亮自发光
      return { scale: 1, alpha: clamp01(p * 2), emissive: clamp01(p), halo: 1 };
    case 'trail-bloom':
      return isSubject
        ? {
            scale: easeOutBack(clamp01(p * 1.2)),
            alpha: clamp01(p * 2),
            emissive: 1,
            halo: 1 + 0.9 * (1 - p),
          }
        : { scale: 1, alpha: clamp01(p * 1.5), emissive: 1, halo: 1 };
    case 'splash':
      return isSubject
        ? { scale: easeOutBack(clamp01(p * 2.2)), alpha: clamp01(p * 3), emissive: 1, halo: 1 }
        : { scale: 1, alpha: clamp01(p * 1.5), emissive: 1, halo: 1 };
    default:
      return FX_IDLE;
  }
}
