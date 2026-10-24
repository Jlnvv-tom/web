/**
 * 画布墨色适配（M3 · Phase 0）
 *
 * ## 这个模块解决什么问题
 *
 * 场景内容按深色主题书写（172 处 hex / 46 个唯一值）。全站切浅色后，
 * 这些语义色在画布底板上全部不达标 —— 最严重的是代表"力"的 `#ef4444`，
 * 对中间调底板只有 **1.03:1**，等于看不见。
 *
 * 但修法不能是"把场景文件里的颜色改暗"：
 *   ① 场景文件声明的是**语义**（这是力、那是场线），主题适配是渲染层职责，
 *      与 `materials.ts`（场景写 `material: 'wood'`、渲染层解析）完全同构；
 *   ② 未来若恢复双主题，内容零回改；
 *   ③ 新写的场景自动获得适配；
 *   ④ 纯函数可单测 —— 内容改写只能靠截图人眼，那是不可验证的。
 *
 * ## 为什么底板必须一起改（§0.1 的实测结论）
 *
 * 中间调底板（`#8E8574`，L=0.238）要满足 4.5:1，前景亮度必须 ≤ 0.014（近纯黑）。
 * 700 档语义色在它上面只有 1.35–2.09:1；要达标就得把红/青/绿全压成近黑，
 * **色相编码随之失效**。中间调是对比度最差的底板：对亮色不够暗，对暗色不够亮。
 * 所以底板改为近白，语义色压到 700 档 —— 同批颜色在近白上实测 4.45–7.19:1。
 *
 * ## 使用方式
 *
 * ```ts
 * // 场景仍写语义色；渲染层过一层 ink()
 * <lineBasicMaterial color={ink(def.color, '#22d3ee')} />
 * ```
 */

/* ============================================================
   基准与目标
   ============================================================ */

/**
 * 非展台场景的画布底板。
 *
 * 近白（L≈0.94）。选它而不是纯白：纯白在投影仪上会过曝，且与页面底色
 * （#f6f3ee）割裂。与页面差一档，画布仍是"一块板"而不是"一个洞"。
 */
export const CANVAS_BACKDROP = '#faf8f4';

/** 展台场景底板：同近白，略暖一档，让木台面成为唯一的中间调锚点 */
export const STAGE_BACKDROP = '#f5f1ea';

/** 语义墨色目标：WCAG AA 正文 4.5:1 */
export const INK_TARGET = 4.5;

/**
 * 结构色目标：WCAG 非文本图形 3:1。
 *
 * 水槽框、容器边线这类"作者故意要做 subtle"的东西走这个档，
 * 否则会被压成粗黑线，把主体的视觉权重抢走。
 */
export const STRUCTURE_TARGET = 3.0;

/* ============================================================
   第一层：策展映射表
   ============================================================ */

/**
 * 场景声明的深色主题色 → 浅色底板对应色。
 *
 * 取值原则（与 `scripts/theme_light.py` 的 UI 层迁移一致）：**400 档 → 700 档**。
 * 逐色指定而不是算法生成，是因为语义色必须保持可辨识的色相差 ——
 * 算法只降明度会把青和蓝压成同一团。
 *
 * 表内每一对对 `CANVAS_BACKDROP` 的对比度都由 `palette.test.ts` 断言 ≥4.5。
 */
export const LIGHT_INK_MAP: Record<string, string> = {
  // ---- 青 / 场线 / 速度一类主色 ----
  '#22d3ee': '#0e7490', // cyan-400  → cyan-700
  '#67e8f9': '#0e7490',
  '#7dd3fc': '#0369a1', // cyan-300  → sky-700
  '#a5f3fc': '#0369a1',
  '#38bdf8': '#0369a1', // sky-400   → sky-700
  '#8fc4ff': '#1d4ed8', // 淡蓝      → blue-700
  '#60a5fa': '#1d4ed8', // blue-400  → blue-700
  '#a8c8ff': '#1d4ed8',
  '#5b8fd9': '#1d4ed8',
  '#a8e4ff': '#0369a1',
  '#e0f2fe': '#075985', // 极淡蓝    → sky-800

  // ---- 绿 / 速度 ----
  // 用 800 档而不是 700：green-700 (#15803d) 在展台底板 #f5f1ea 上只有 4.45:1，
  // 差 0.05 不达标。绿色是"速度"的主色，出现频率极高，不能卡在临界值上。
  '#4ade80': '#166534', // green-400 → green-800

  // ---- 红 / 力 ----
  '#ef4444': '#b91c1c', // red-400   → red-700
  '#f87171': '#b91c1c',
  '#ff6b6b': '#b91c1c',
  '#ff8f8f': '#b91c1c',
  '#d9705f': '#b91c1c',
  '#ffb3a7': '#b91c1c',

  // ---- 琥珀 / 黄 ----
  // 黄系统一用 800 档：yellow-700 (#a16207) 在展台底板 #f5f1ea 上只有 4.37:1，
  // 差 0.13 不达标。黄色明度天然偏高，是整张表里最容易被底板"吃掉"的一族。
  '#facc15': '#854d0e', // yellow-400 → yellow-800
  '#fde047': '#854d0e',
  '#fde68a': '#854d0e',
  // 琥珀族统一用 800 档：amber-700 (#b45309) 在展台底板 #f5f1ea 上只有 4.46:1，
  // 差 0.04 不达标。amber-800 (#92400e) 实测 6.30:1，留足余量。
  '#fbbf24': '#92400e', // amber-400 → amber-800
  '#f59e0b': '#92400e',
  '#fb923c': '#c2410c', // orange-400 → orange-700
  '#ff8a3d': '#c2410c',
  '#e8931a': '#c2410c',
  '#d9a24a': '#92400e',

  // ---- 紫 / 粉 ----
  '#a78bfa': '#6d28d9', // violet-400 → violet-700
  '#c4b5fd': '#6d28d9',
  '#5b4a8c': '#5b21b6',
  '#f472b6': '#be185d', // pink-400  → pink-700

  // ---- 灰 / 近白线 ----
  '#94a3b8': '#57534e', // slate-400 → stone-600
  '#64748b': '#57534e', // slate-500 → stone-600
  '#e2e8f0': '#292524', // slate-200 → stone-800
  '#f1f5f9': '#292524',
  '#f8fafc': '#292524',
};

/**
 * 结构色映射（目标 3:1 而非 4.5:1）。
 *
 * 这些是水槽边框、容器轮廓、坐标轴这类"subtle 结构"，
 * 作者故意要让它们退到主体之后。压到 4.5:1 会把它们变成抢戏的粗黑线。
 *
 * 注意：近白底板上"3:1"对应的前景亮度上限是 L≤0.28 —— 比深色模式严得多
 * （那时半透明叠层就够）。所以映射目标不是中灰，而是石色/深蓝灰一档：
 * 肉眼仍是"退后"的，但擦得掉。
 */
export const LIGHT_STRUCTURE_MAP: Record<string, string> = {
  '#16394a': '#64748b', // 深青玻璃 → slate-500
  '#1b4459': '#64748b',
  '#1d4e63': '#64748b',
  '#1e4b5e': '#64748b',
  '#2a4a5c': '#64748b',
  '#1e6f8c': '#0369a1', // 亮青结构 → sky-700
  '#475569': '#57534e',
  '#334155': '#57534e',
  '#0e2a3a': '#44403c',
  '#1e5a72': '#64748b', // 网格深青 → slate-500（GridHelper 满不透明度，必须过结构档）
  '#10303e': '#78716c',
  '#e9d6b4': '#8f7a56', // 浅木（木尺）→ 深木：仍是木色，但擦得掉
  '#9c8a66': '#7c6f5c',
};

/* ============================================================
   色彩工具（纯函数，无依赖）
   ============================================================ */

export type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** sRGB 相对亮度（WCAG 定义） */
export function relativeLuminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a)!);
  const lb = relativeLuminance(parseHex(b)!);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** RGB → OKLCH（近似实现，够用于色相保持判断） */
export function toOklch(rgb: RGB): { l: number; c: number; h: number } {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as RGB;

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}

/* ============================================================
   第二层：算法兜底
   ============================================================ */

/**
 * 表外色的兜底适配：保持色相与饱和度，只降明度，直到对比度达标。
 *
 * 为什么需要它：映射表覆盖当前 46 个色，但**新场景会引入新颜色**。
 * 没有兜底的话，新场景作者忘记查表就得到一个看不见的箭头 —— 而这种错误
 * 在截图上是"看起来挺正常"，只有对比度能抓到。
 *
 * 有限步收敛（≤24 步）：每步把 OKLCH 的 L 降 3%，必然在 24 步内
 * 从任意颜色降到 L<0.02。不收敛就意味着有 bug，测试会红。
 */
export function deepenForContrast(hex: string, bg: string, target: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  if (contrastRatio(hex, bg) >= target) return hex.toLowerCase();

  // 在 sRGB 空间按固定比例衰减，保持色相比 OKLCH 往返更稳
  let cur: RGB = [...rgb] as RGB;
  for (let step = 0; step < 24; step++) {
    cur = cur.map((v) => v * 0.93) as RGB;
    const out = toHex(cur);
    if (contrastRatio(out, bg) >= target) return out;
  }
  // 理论上到不了这里；真到了就返回近黑，保证"可见"优先于"好看"
  return '#1c1917';
}

/* ============================================================
   统一入口
   ============================================================ */

const cache = new Map<string, string>();

export type InkOptions = {
  /** 'ink' 走 4.5:1（语义墨色）；'structure' 走 3:1（subtle 结构色） */
  role?: 'ink' | 'structure';
  /** 底板色，默认 CANVAS_BACKDROP */
  bg?: string;
};

/**
 * 把场景声明的颜色适配到当前主题。
 *
 * 三条路径，按优先级：
 *   1. **查表优先** —— 命中策展表就用映射值。表里编码的是**作者意图**
 *      （这个深青是"subtle 玻璃边"、那个亮青是"场线"），不只是对比度。
 *      这一点很关键：`#16394a` 在近白底上对比度 11.5:1，纯按对比度判断会
 *      "恒等通过"，结果深色模式下的 subtle 玻璃边变成一根死黑粗线。
 *      查表优先让"意图"压过"数字"。
 *   2. **恒等** —— 表外色且已达标就原样返回。`labels.tsx` 已手工修过的两处
 *      （`#0e7490` / `#57534e`）走这条路，证明零回归。
 *   3. **兜底** —— 表外且不达标，走 `deepenForContrast`。
 *
 * 渲染层每帧调用也只有一次 Map 查找，所以没有性能顾虑。
 */
export function ink(declared: string | undefined, fallback: string, opts: InkOptions = {}): string {
  const raw = (declared ?? fallback).toLowerCase();
  const role = opts.role ?? 'ink';
  const bg = (opts.bg ?? CANVAS_BACKDROP).toLowerCase();
  const target = role === 'structure' ? STRUCTURE_TARGET : INK_TARGET;
  const key = `${raw}|${bg}|${target}`;

  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const table = role === 'structure' ? LIGHT_STRUCTURE_MAP : LIGHT_INK_MAP;

  // 1. 查表优先（编码作者意图）
  const mapped = table[raw];
  if (mapped) {
    const out = contrastRatio(mapped, bg) >= target ? mapped : deepenForContrast(mapped, bg, target);
    cache.set(key, out);
    return out;
  }

  // 2. 恒等：表外色且已达标
  if (parseHex(raw) && contrastRatio(raw, bg) >= target) {
    cache.set(key, raw);
    return raw;
  }

  // 3. 兜底
  const out = deepenForContrast(raw, bg, target);
  cache.set(key, out);
  return out;
}

/** 测试用：清掉缓存 */
export function resetInkCache(): void {
  cache.clear();
}
