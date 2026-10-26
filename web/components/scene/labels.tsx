'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneSpec, SceneState } from '@/engine/spec';
import type { Vec3 } from '@/engine/vec';
import { ink } from '@/engine/palette';
import { formatLabel, formatReading, plainLabel } from '@/engine/labelText';
import { layoutLabels, needsLeader, type LabelAnchor } from '@/engine/labelLayout';
import type { StateRef } from './objects';

/** 复用的投影向量，避免每帧分配 */
const _v = new THREE.Vector3();

export type SceneLabel = {
  id: string;
  /** 已排版的 HTML（下标已转 <sub>） */
  html: string;
  /** 纯文本（aria-label / DOM 兜底） */
  plain: string;
  color: string;
  size?: number;
  /** 越大越优先留在原位 */
  priority: number;
  getPoint: (s: SceneState) => Vec3 | undefined;
  /** 就地读数：返回"6.30 m/s"这种字符串；无读数返回 undefined */
  getValue?: (s: SceneState) => string | undefined;
};

const clampLen = (v: Vec3, max?: number): Vec3 => {
  if (!max) return v;
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l <= max || l === 0) return v;
  const k = max / l;
  return [v[0] * k, v[1] * k, v[2] * k];
};

/**
 * 从 SceneSpec 推导出需要贴着 3D 点显示的标签
 *
 * 用「投影 + DOM 覆盖层」而不是 drei 的 `<Html>`：
 *  - `<Html>` 会在 Canvas 内部再造一个 React root，切换场景时容易触发
 *    "synchronously unmount a root / removeChild" 竞态；
 *  - 纯 DOM 覆盖层每帧只改 transform，零 React 重渲染，性能更好。
 *
 * M3.5 · W3.2：矢量标签可以带**就地读数**（`valueBind` / `unit` / `digits`）。
 * 数值原本只在右侧「实时读数」面板里，学生要左右对位才能把"v = 20 m/s"
 * 和画面上的那支绿箭头连起来；贴着箭头写就没有这个问题。
 */
export function deriveLabels(spec: SceneSpec): SceneLabel[] {
  const out: SceneLabel[] = [];

  const reading = (
    valueBind?: string,
    unit?: string,
    digits?: number
  ): ((s: SceneState) => string | undefined) | undefined => {
    if (!valueBind) return undefined;
    return (s) => {
      const v = s.scalars[valueBind];
      return typeof v === 'number' && Number.isFinite(v) ? formatReading(v, digits ?? 2, unit) : undefined;
    };
  };

  for (const o of spec.objects) {
    if (o.type === 'vector' && o.label) {
      out.push({
        id: `vec-${o.id}`,
        html: formatLabel(o.label),
        plain: plainLabel(o.label),
        // 与箭头同色：标签和它标注的矢量必须是同一个色系，否则学生对不上
        color: ink(o.color, '#0e7490'),
        priority: 10,
        getPoint: (s) => {
          const origin = s.points[o.origin ?? 'pos'] ?? [0, 0, 0];
          const raw = s.vectors[o.bind] ?? [0, 0, 0];
          const k = o.scale ?? 1;
          const v = clampLen([raw[0] * k, raw[1] * k, raw[2] * k], o.maxLength ?? (o.fixed ? 1.6 : undefined));
          return [origin[0] + v[0], origin[1] + v[1], origin[2] + v[2]];
        },
        getValue: reading(o.valueBind, o.unit, o.digits),
      });
    } else if (o.type === 'text') {
      const pos = o.position;
      out.push({
        id: `txt-${o.id}`,
        html: formatLabel(o.text),
        plain: plainLabel(o.text),
        color: ink(o.color, '#57534e'),
        size: o.size,
        priority: 5,
        getPoint: typeof pos === 'string' ? (s) => s.points[pos] : () => pos,
      });
    }
  }

  return out;
}

/** 数值刷新频率：读数不需要 60fps，12Hz 已经"像在跳字"了 */
const VALUE_HZ = 12;

/**
 * 标签投影器：每帧把 3D 点投影到屏幕，直接写 DOM style
 */
export function LabelProjector({
  labels,
  stateRef,
  host,
  visible = true,
}: {
  labels: SceneLabel[];
  stateRef: StateRef;
  host: HTMLDivElement | null;
  visible?: boolean;
}) {
  const nodes = useMemo(() => new Map<string, HTMLDivElement>(), []);
  const lines = useMemo(() => new Map<string, SVGLineElement>(), []);
  const dots = useMemo(() => new Map<string, SVGCircleElement>(), []);
  const svg = useRef<SVGSVGElement | null>(null);
  /** 实测尺寸（只在文案变化时量一次，别每帧 offsetWidth） */
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  /** 上一帧写入的位置，位移小于半像素就不碰 DOM */
  const lastPos = useRef(new Map<string, { x: number; y: number; hidden: boolean }>());
  const lastValue = useRef(new Map<string, string>());
  const sinceValue = useRef(0);

  /* ---------- 建立 / 销毁 DOM 节点 + 引线 SVG ---------- */
  useEffect(() => {
    if (!host) return;
    const created: Element[] = [];

    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '100%');
    s.setAttribute('height', '100%');
    s.style.position = 'absolute';
    s.style.inset = '0';
    s.style.pointerEvents = 'none';
    s.style.overflow = 'visible';
    host.appendChild(s);
    svg.current = s;
    created.push(s);

    for (const l of labels) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.willChange = 'transform';
      el.style.whiteSpace = 'nowrap';
      el.style.pointerEvents = 'none';
      el.style.display = 'flex';
      el.style.alignItems = 'baseline';
      el.style.gap = '4px';
      el.style.color = l.color;
      el.style.fontSize = `${l.size ?? 11}px`;
      el.style.fontWeight = '700';
      el.style.lineHeight = '1.15';
      // 浅色底用白色描边而不是黑色发光：黑字+黑影在白底上会糊成一团
      el.style.textShadow = '0 1px 2px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.8)';
      el.setAttribute('aria-label', l.plain);
      el.innerHTML = `<span data-role="sym">${l.html}</span>`;
      host.appendChild(el);
      nodes.set(l.id, el);
      created.push(el);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', l.color);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-opacity', '0.45');
      line.setAttribute('stroke-dasharray', '2 3');
      line.style.display = 'none';
      s.appendChild(line);
      lines.set(l.id, line);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '1.6');
      dot.setAttribute('fill', l.color);
      dot.setAttribute('fill-opacity', '0.75');
      dot.style.display = 'none';
      s.appendChild(dot);
      dots.set(l.id, dot);
    }

    return () => {
      for (const el of created) el.remove();
      nodes.clear();
      lines.clear();
      dots.clear();
      sizes.current.clear();
      lastPos.current.clear();
      lastValue.current.clear();
      svg.current = null;
    };
  }, [host, labels, nodes, lines, dots]);

  /* ---------- 每帧定位 ---------- */
  const anchors = useMemo<LabelAnchor[]>(
    () => labels.map((l) => ({ id: l.id, x: 0, y: 0, w: 40, h: 14, priority: l.priority })),
    [labels]
  );

  useFrame(({ camera, size }, delta) => {
    if (!host) return;

    // 读数 12Hz 刷新（写 textContent 会触发布局，不能每帧来）
    sinceValue.current += delta;
    const syncValue = sinceValue.current >= 1 / VALUE_HZ;
    if (syncValue) sinceValue.current = 0;

    for (let i = 0; i < labels.length; i++) {
      const l = labels[i]!;
      const a = anchors[i]!;
      const p = visible ? l.getPoint(stateRef.current) : undefined;
      if (!p) {
        a.x = Number.NaN; // 交给 layout 判定为隐藏
        continue;
      }
      _v.set(p[0], p[1], p[2]).project(camera);
      if (_v.z > 1 || _v.z < -1) {
        a.x = Number.NaN;
        continue;
      }
      a.x = (_v.x * 0.5 + 0.5) * size.width;
      a.y = (-_v.y * 0.5 + 0.5) * size.height;

      // 尺寸：文案变了才量
      const sz = sizes.current.get(l.id);
      if (!sz) {
        const el = nodes.get(l.id);
        a.w = el ? el.offsetWidth || 40 : 40;
        a.h = el ? el.offsetHeight || 14 : 14;
        sizes.current.set(l.id, { w: a.w, h: a.h });
      } else {
        a.w = sz.w;
        a.h = sz.h;
      }

      if (syncValue && l.getValue) {
        const txt = l.getValue(stateRef.current) ?? '';
        if (lastValue.current.get(l.id) !== txt) {
          lastValue.current.set(l.id, txt);
          const el = nodes.get(l.id);
          if (el) {
            const val = el.querySelector('[data-role="val"]') as HTMLSpanElement | null;
            if (txt) {
              if (val) {
                val.textContent = txt;
              } else {
                const span = document.createElement('span');
                span.dataset.role = 'val';
                span.style.fontWeight = '500';
                span.style.fontSize = '0.86em';
                span.style.opacity = '0.85';
                span.style.fontVariantNumeric = 'tabular-nums';
                span.textContent = txt;
                el.appendChild(span);
              }
            } else if (val) {
              val.remove();
            }
            // 宽度随读数变化（6.30 → 10.00）
            sizes.current.delete(l.id);
          }
        }
      }
    }

    // 隐藏的锚点：x 置 NaN，layout 会跳过（`NaN` 参与比较恒 false，所以先兜底）
    const view = { width: size.width, height: size.height };
    const placements = layoutLabels(
      anchors.map((a) => (Number.isNaN(a.x) ? { ...a, x: -9999, y: -9999 } : a)),
      view
    );

    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i]!;
      const l = labels[i]!;
      const el = nodes.get(l.id);
      if (!el) continue;
      const prev = lastPos.current.get(l.id);
      const anchor = anchors[i]!;

      if (pl.hidden) {
        if (!prev || !prev.hidden) {
          el.style.opacity = '0';
          const ln = lines.get(l.id);
          const dt = dots.get(l.id);
          if (ln) ln.style.display = 'none';
          if (dt) dt.style.display = 'none';
          lastPos.current.set(l.id, { x: 0, y: 0, hidden: true });
        }
        continue;
      }

      if (!prev || prev.hidden || Math.abs(prev.x - pl.x) > 0.5 || Math.abs(prev.y - pl.y) > 0.5) {
        el.style.opacity = '1';
        // translate(-50%,-50%) 让标签以算出来的中心点对齐
        el.style.transform = `translate(${pl.x}px, ${pl.y}px) translate(-50%,-50%)`;
        lastPos.current.set(l.id, { x: pl.x, y: pl.y, hidden: false });
      }

      // 引线：标签被推开时指回锚点
      const ln = lines.get(l.id);
      const dt = dots.get(l.id);
      if (ln && dt) {
        if (needsLeader(pl)) {
          ln.setAttribute('x1', String(anchor.x));
          ln.setAttribute('y1', String(anchor.y));
          ln.setAttribute('x2', String(pl.x));
          ln.setAttribute('y2', String(pl.y));
          ln.style.display = '';
          dt.setAttribute('cx', String(anchor.x));
          dt.setAttribute('cy', String(anchor.y));
          dt.style.display = '';
        } else if (ln.style.display !== 'none') {
          ln.style.display = 'none';
          dt.style.display = 'none';
        }
      }
    }
  });

  return null;
}
