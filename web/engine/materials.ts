/**
 * 材质预设表（M3 · W2）
 *
 * 设计原则（见 docs/m3-plan.md §4.2）：
 *
 * 1. **声明式，不是渲染层分支。** 场景只写 `material: 'wood'`，
 *    不允许在 `objects.tsx` 里判断"这个 id 是杆子所以用木头"——那样
 *    12 个场景会退化成 12 段特判代码，宪法第六条当场失效。
 *
 * 2. **材质只给"实物"，示意元素保持线框。** 矢量箭头、场线、轨迹这些是
 *    *物理量的图形化*，不是现实里的东西。给它们贴木纹会让"这条线代表 E"这个
 *    约定失效。所以 `material` 只加在 `box` / `particle` 这类有体积的图元上。
 *
 * 3. **覆盖优先。** 场景显式写的 `color` / `roughness` 永远压过预设，
 *    这样同一个 `metal` 可以做出黄铜、铝、不锈钢三种。
 *
 * 4. **零外部资源**（宪法第八条）。所有贴图由 `textures.ts` 用 Canvas 现画，
 *    不引入任何图片文件。
 */

export type MaterialKind = 'wood' | 'linen' | 'clay' | 'metal' | 'glass' | 'jelly' | 'chalk';

export type MaterialPreset = {
  /** 基础色。场景的 `color` 会覆盖它 */
  color: string;
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** 玻璃/胶体的透射强度（0–1） */
  transmission?: number;
  /** 透射厚度（米，影响折射偏移量） */
  thickness?: number;
  ior?: number;
  /** 程序化贴图种类 */
  texture?: 'wood' | 'linen';
  /** 低画质档位下代替 transmission 的不透明度 */
  fallbackOpacity?: number;
  envMapIntensity?: number;
};

/**
 * 六种材质。数值经过实测调整：
 * - 木/布要"粗糙但不脏"：roughness 0.6–0.9 之间，太高会像纸板
 * - 金属的 metalness 必须 ≥0.85，否则在暖光下会变成"灰塑料"
 * - 玻璃的 ior 固定 1.5（真实玻璃），改它只会让折射看起来"错"
 */
export const MATERIALS: Record<MaterialKind, MaterialPreset> = {
  wood: {
    color: '#DCCBAB',
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    texture: 'wood',
    envMapIntensity: 0.5,
  },
  linen: {
    color: '#D6CCBA',
    roughness: 0.92,
    metalness: 0,
    texture: 'linen',
    envMapIntensity: 0.35,
  },
  clay: {
    color: '#CBB9A2',
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.45,
  },
  metal: {
    color: '#AEB6C0',
    roughness: 0.28,
    metalness: 0.92,
    envMapIntensity: 0.95,
  },
  glass: {
    color: '#CFE6EA',
    roughness: 0.06,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.22,
    ior: 1.5,
    fallbackOpacity: 0.32,
    envMapIntensity: 1.2,
  },
  jelly: {
    color: '#E39A5E',
    roughness: 0.24,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    transmission: 0.5,
    thickness: 0.3,
    ior: 1.36,
    fallbackOpacity: 0.78,
    envMapIntensity: 0.9,
  },
  chalk: {
    color: '#EDE6DA',
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.4,
  },
};

export const MATERIAL_KINDS = Object.keys(MATERIALS) as MaterialKind[];

export const isMaterialKind = (v: unknown): v is MaterialKind =>
  typeof v === 'string' && v in MATERIALS;

/** 场景可覆盖的材质相关字段 */
export type MaterialOverride = {
  color?: string;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  envMapIntensity?: number;
  opacity?: number;
};

export type ResolvedMaterial = {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  opacity: number;
  envMapIntensity: number;
  texture: 'wood' | 'linen' | null;
  fallbackOpacity: number;
};

/**
 * 合并预设与覆盖值。
 *
 * `over` 里只认显式给出的字段——`undefined` 视为"没写"，回落到预设。
 * 这一条保证了 `{ material: 'metal', color: '#D4AF37' }` 能做出黄铜，
 * 而 `{ material: 'metal' }` 仍然是默认的不锈钢色。
 */
export function resolveMaterial(
  kind: MaterialKind | undefined,
  over: MaterialOverride = {}
): ResolvedMaterial {
  const p = kind ? MATERIALS[kind] : null;

  const pick = <T,>(a: T | undefined, b: T): T => (a === undefined ? b : a);

  return {
    color: pick(over.color, p?.color ?? '#8b98a8'),
    roughness: pick(over.roughness, p?.roughness ?? 0.3),
    metalness: pick(over.metalness, p?.metalness ?? 0.85),
    // 没指定材质时保持旧行为（0.4）。这是 M2 的盒子默认值，改了会让
    // 尚未迁移的 9 个场景外观悄悄变化——迁移必须是显式的。
    clearcoat: pick(over.clearcoat, p ? (p.clearcoat ?? 0) : 0.4),
    clearcoatRoughness: p?.clearcoatRoughness ?? 0.25,
    transmission: p?.transmission ?? 0,
    thickness: p?.thickness ?? 0.2,
    ior: p?.ior ?? 1.5,
    opacity: pick(over.opacity, 1),
    envMapIntensity: pick(over.envMapIntensity, p?.envMapIntensity ?? 1.1),
    texture: p?.texture ?? null,
    fallbackOpacity: p?.fallbackOpacity ?? 0.5,
  };
}

/** 是否需要用 transmission（决定走 PBR 透射还是退回半透明） */
export const needsTransmission = (m: ResolvedMaterial) => m.transmission > 0.01;
