/**
 * 标签避让（M3.5 · W3.4）
 *
 * 现状：`LabelProjector` 把每个标签的中心钉在投影点上，于是
 * - 两个标签靠得近就叠在一起（抛体场景 `v`/`vₓ`/`v_y` 挤在球旁边）；
 * - 标签直接压在本体上（buoyancy 的 `N（测力计读数）` 横跨水槽棱线）——
 *   转视角时哪个被压住是随机的，越关键的标注越容易被挡。
 *
 * 这是个纯粹的几何问题，所以放在 engine 里当纯函数测，渲染层只消费结果。
 *
 * 策略：按优先级贪心放置。每个标签先试原位，再沿竖直方向逐格挪开，
 * 全部候选都被占满就隐藏（宁可少一个，不能糊一团）。
 */

export type LabelAnchor = {
  id: string;
  /** 投影到屏幕的锚点（CSS px） */
  x: number;
  y: number;
  /** 标签尺寸（估算或实测，CSS px） */
  w: number;
  h: number;
  /** 越大越优先留在原位：矢量 > 文字 > 轴 */
  priority: number;
};

export type LabelPlacement = {
  id: string;
  /** 标签中心最终位置 */
  x: number;
  y: number;
  /** 相对锚点的位移（用于画引线；0,0 表示不需要引线） */
  dx: number;
  dy: number;
  /** 被判定放不下 */
  hidden: boolean;
};

export type LayoutOptions = {
  /** 标签四周留白（px），避免"贴着但不重叠"的假分离 */
  padding: number;
  /** 每次尝试的竖直步长（px） */
  step: number;
  /** 最多试几个候选位置（原位 + 上下交替） */
  maxTries: number;
  /** 锚点在画布外多少 px 就丢弃 */
  margin: number;
  /** 位移超过它才画引线（px） */
  leaderThreshold: number;
};

export const LAYOUT_DEFAULTS: LayoutOptions = {
  padding: 3,
  step: 14,
  maxTries: 10,
  margin: 12,
  leaderThreshold: 6,
};

type Rect = { l: number; t: number; r: number; b: number };

const overlaps = (a: Rect, b: Rect): boolean => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);

/**
 * 纯函数：锚点 → 位置。同样的输入永远同样的输出（讲解脚本可跳帧、可回放）。
 *
 * 不修改入参；返回顺序与输入一致，方便调用方按下标更新 DOM。
 */
export function layoutLabels(
  anchors: LabelAnchor[],
  viewport: { width: number; height: number },
  opts: Partial<LayoutOptions> = {}
): LabelPlacement[] {
  const o = { ...LAYOUT_DEFAULTS, ...opts };
  // 优先级高的先占位；同优先级保持输入顺序（稳定排序）
  const order = anchors
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.priority - x.a.priority || x.i - y.i)
    .map((e) => e.a);

  const placed: Rect[] = [];
  const out = new Map<string, LabelPlacement>();

  for (const a of order) {
    // 锚点跑出画布：不画（省得标签贴在边界上像 bug）
    if (
      a.x < -o.margin ||
      a.y < -o.margin ||
      a.x > viewport.width + o.margin ||
      a.y > viewport.height + o.margin
    ) {
      out.set(a.id, { id: a.id, x: a.x, y: a.y, dx: 0, dy: 0, hidden: true });
      continue;
    }

    // 步长必须大于标签自身高度 + 两侧留白，否则"挪一格"仍然重叠
    const step = Math.max(o.step, a.h + 2 * o.padding);

    let chosen: LabelPlacement | null = null;
    for (let k = 0; k < o.maxTries && !chosen; k++) {
      // 候选：0, -1, +1, -2, +2, ... 个 step
      const dir = k === 0 ? 0 : k % 2 === 1 ? -1 : 1;
      const mag = Math.ceil(k / 2);
      const dy = dir * mag * step;
      const cx = a.x;
      const cy = clamp(a.y + dy, a.h / 2 + 2, viewport.height - a.h / 2 - 2);
      const rect: Rect = {
        l: cx - a.w / 2 - o.padding,
        r: cx + a.w / 2 + o.padding,
        t: cy - a.h / 2 - o.padding,
        b: cy + a.h / 2 + o.padding,
      };
      if (placed.some((p) => overlaps(p, rect))) continue;
      placed.push(rect);
      const realDy = cy - a.y;
      chosen = {
        id: a.id,
        x: cx,
        y: cy,
        dx: 0,
        dy: realDy,
        hidden: false,
      };
    }

    // 所有候选都被占：隐藏而不是叠上去
    out.set(
      a.id,
      chosen ?? { id: a.id, x: a.x, y: a.y, dx: 0, dy: 0, hidden: true }
    );
  }

  // 恢复输入顺序
  return anchors.map((a) => out.get(a.id)!);
}

/** 是否需要画引线（位移超过阈值） */
export function needsLeader(p: LabelPlacement, opts: Partial<LayoutOptions> = {}): boolean {
  const o = { ...LAYOUT_DEFAULTS, ...opts };
  return !p.hidden && Math.hypot(p.dx, p.dy) > o.leaderThreshold;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
