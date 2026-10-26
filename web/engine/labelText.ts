/**
 * 标签文字排版（M3.5 · W3.3）
 *
 * 为什么需要一个独立模块：物理量写成纯文本一定是错的。
 * 场景里出现 `label: 'v_y'`、`label: 'vₓ'` 两种写法并存（一个下划线、一个 Unicode 下标），
 * 同一个画面里两种排版，学生看到的就是"下划线"而不是"下标"。
 *
 * 这里只做一件事：把 `v_y` / `F_{net}` / `m^2` 这类**声明式写法**翻译成
 * 带 `<sub>` / `<sup>` 的 HTML。内容层继续写普通字符串（宪法第六条：内容即数据），
 * 排版规则集中在渲染层一处。
 *
 * 返回值是 HTML 片段，所以**先转义再替换**，不接受任何来自外部的裸标签。
 */

// 用 \p{L} 而不是 [A-Za-zα-ω]：`F_浮` 这种中文下标必须也能排。
// 上一版只认拉丁+希腊字母，于是 `F_浮` 原样漏出下划线 —— 是契约测试抓到的。
const SUB_RE = /_(\{[^}]+\}|[\p{L}\p{N}]+)/gu;
const SUP_RE = /\^(\{[^}]+\}|[\p{L}\p{N}+\-]+)/gu;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `v_y` → `v<sub>y</sub>`；`F_{net}` → `F<sub>net</sub>`；`m^2` → `m<sup>2</sup>` */
export function formatLabel(text: string): string {
  return escapeHtml(text)
    .replace(SUB_RE, (_m, g1: string) => `<sub>${stripBraces(g1)}</sub>`)
    .replace(SUP_RE, (_m, g1: string) => `<sup>${stripBraces(g1)}</sup>`);
}

function stripBraces(s: string): string {
  return s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1) : s;
}

/** 去掉标记的纯文本（给 aria-label / title / 导出 CSV 用） */
export function plainLabel(text: string): string {
  return text.replace(SUB_RE, (_m, g1: string) => stripBraces(g1)).replace(SUP_RE, (_m, g1: string) => stripBraces(g1));
}

/**
 * 数值格式化（标签与 HUD 共用同一口径）
 *
 * 教学场景里 0.00 和 0 是两个不同的信息：「v_y 恰好为 0」是最高点的判据，
 * 保留固定小数位比"能省就省"更重要，所以这里**不裁尾零**，
 * 只有超过 3 位整数时才降精度（避免标签被 `1234.56` 撑爆）。
 */
export function formatValue(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(Math.min(digits, 1));
  return v.toFixed(digits);
}

/** 带单位的值：`6.3 m/s`（单位缺失时只给数） */
export function formatReading(v: number, digits = 2, unit?: string): string {
  const n = formatValue(v, digits);
  return unit ? `${n} ${unit}` : n;
}
