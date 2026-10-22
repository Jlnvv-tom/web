'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneSpec, SceneState } from '@/engine/spec';
import type { Vec3 } from '@/engine/vec';
import type { StateRef } from './objects';

/** 复用的投影向量，避免每帧分配 */
const _v = new THREE.Vector3();

export type SceneLabel = {
  id: string;
  text: string;
  color: string;
  size?: number;
  getPoint: (s: SceneState) => Vec3 | undefined;
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
 * 用「投影 + DOM 覆盖层」而不是 drei 的 <Html>：
 *  - <Html> 会在 Canvas 内部再造一个 React root，切换场景时容易触发
 *    "synchronously unmount a root / removeChild" 竞态；
 *  - 纯 DOM 覆盖层每帧只改 transform，零 React 重渲染，性能更好。
 */
export function deriveLabels(spec: SceneSpec): SceneLabel[] {
  const out: SceneLabel[] = [];

  for (const o of spec.objects) {
    if (o.type === 'vector' && o.label) {
      out.push({
        id: `vec-${o.id}`,
        text: o.label,
        color: o.color ?? '#0e7490',
        getPoint: (s) => {
          const origin = s.points[o.origin ?? 'pos'] ?? [0, 0, 0];
          const raw = s.vectors[o.bind] ?? [0, 0, 0];
          const k = o.scale ?? 1;
          const v = clampLen([raw[0] * k, raw[1] * k, raw[2] * k], o.maxLength);
          return [origin[0] + v[0], origin[1] + v[1], origin[2] + v[2]];
        },
      });
    } else if (o.type === 'text') {
      const pos = o.position;
      out.push({
        id: `txt-${o.id}`,
        text: o.text,
        color: o.color ?? '#57534e',
        size: o.size,
        getPoint: typeof pos === 'string' ? (s) => s.points[pos] : () => pos,
      });
    }
  }

  return out;
}

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

  /* 建立 / 销毁 DOM 节点 */
  useEffect(() => {
    if (!host) return;
    const created: HTMLDivElement[] = [];
    for (const l of labels) {
      let el = nodes.get(l.id);
      if (!el) {
        el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.willChange = 'transform';
        el.style.whiteSpace = 'nowrap';
        el.style.fontSize = `${l.size ?? 11}px`;
        el.style.fontWeight = '700';
        el.style.color = l.color;
        // 浅色底用白色描边而不是黑色发光：黑字+黑影在白底上会糊成一团
        el.style.textShadow = '0 1px 2px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.8)';
        el.style.pointerEvents = 'none';
        el.style.transform = 'translate(-50%,-50%)';
        el.textContent = l.text;
        host.appendChild(el);
        nodes.set(l.id, el);
        created.push(el);
      }
    }
    return () => {
      for (const el of created) el.remove();
      for (const l of labels) nodes.delete(l.id);
    };
  }, [host, labels, nodes]);

  useFrame(({ camera, size }) => {
    if (!host) return;
    for (const l of labels) {
      const el = nodes.get(l.id);
      if (!el) continue;
      const p = visible ? l.getPoint(stateRef.current) : undefined;
      if (!p) {
        el.style.opacity = '0';
        continue;
      }

      _v.set(p[0], p[1], p[2]).project(camera);
      if (_v.z > 1 || _v.z < -1) {
        el.style.opacity = '0';
        continue;
      }
      const sx = (_v.x * 0.5 + 0.5) * size.width;
      const sy = (-_v.y * 0.5 + 0.5) * size.height;
      el.style.opacity = '1';
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-50%)`;
    }
  });

  return null;
}
