'use client';

/**
 * 原地更新的粗线（M3.5 · W1.4）
 *
 * 为什么不用 drei 的 `<Line>`：
 * 它的 `geometry.setPositions()` 每次调用都会 `new InstancedInterleavedBuffer(...)` +
 * `setAttribute()`（见 three/examples/jsm/lines/LineSegmentsGeometry.js:111）。
 * 而 `DynLine` 是**逐帧**调用的：60fps × 260 点 ≈ 每秒新建 60 个 GPU 缓冲。
 * 旧 attribute 被丢弃时没有任何地方调 `attributes.remove()`，
 * 于是 WebGL 缓冲只增不减——表现就是"刚打开还好，跑几分钟越来越卡"。
 *
 * 这里改成：**一次性按最大点数分配，之后每帧只往同一块 Float32Array 里写**，
 * 并把 `instanceCount` 设成真实段数（不再拿退化线段凑满）。
 */

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Vec3 } from '@/engine/vec';

export type FatLineProps = {
  /** 每帧取当前点列（返回 undefined 或少于 2 点时整条线隐藏） */
  getPoints: () => Vec3[] | undefined;
  /** 缓冲容量（点数）。超出部分截断 */
  maxPoints: number;
  color: string;
  /** 屏幕像素宽 */
  width?: number;
  dashed?: boolean;
  dashSize?: number;
  gapSize?: number;
  opacity?: number;
  depthTest?: boolean;
  /** 每帧回调，用来做开场演出 / 压暗的透明度动画 */
  onMaterial?: (mat: LineMaterial) => void;
};

export function FatLine({
  getPoints,
  maxPoints,
  color,
  width = 2,
  dashed = false,
  dashSize = 0.18,
  gapSize = 0.12,
  opacity = 1,
  depthTest = true,
  onMaterial,
}: FatLineProps) {
  const size = useThree((s) => s.size);

  const built = useMemo(() => {
    const geom = new LineGeometry();
    // 一次分配 maxPoints 个点（LineGeometry 会转成 maxPoints-1 段的成对缓冲）
    geom.setPositions(new Float32Array(Math.max(2, maxPoints) * 3));

    const start = geom.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const buf = start.data as THREE.InstancedInterleavedBuffer;
    const arr = buf.array as Float32Array;

    // 虚线的累计长度同样一次建好，之后原地写
    const distArr = new Float32Array(Math.max(1, maxPoints - 1) * 2);
    const distBuf = new THREE.InstancedInterleavedBuffer(distArr, 2, 1);
    geom.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(distBuf, 1, 0));
    geom.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(distBuf, 1, 1));

    const mat = new LineMaterial({
      color: new THREE.Color(color),
      // 标注不该随距离褪色：雾是给"景物"做纵深的，
      // 而轨迹/矢量是读数的一部分。开着雾时 40 单位的抛体轨迹
      // 会被 #efe9e0 冲成一条灰线（实测 t=3.9s 截图）。
      fog: false,
      linewidth: width,
      dashed,
      dashSize,
      gapSize,
      transparent: opacity < 1,
      opacity,
      depthTest,
    });
    mat.resolution.set(size.width, size.height);

    const line = new Line2(geom, mat);
    line.frustumCulled = false; // 位置每帧都变，包围球算了也用不上

    return { geom, mat, line, arr, buf, distArr, distBuf };
  }, [maxPoints, color, width, dashed, dashSize, gapSize, opacity, depthTest, size.width, size.height]);

  useEffect(() => {
    return () => {
      built.geom.dispose();
      built.mat.dispose();
    };
  }, [built]);

  // resize 只更新 uniform，不重建几何
  useEffect(() => {
    built.mat.resolution.set(size.width, size.height);
  }, [built, size.width, size.height]);

  useFrame(() => {
    const { geom, mat, line, arr, buf, distArr, distBuf } = built;
    if (onMaterial) onMaterial(mat);

    const pts = getPoints();
    const n = pts ? Math.min(pts.length, maxPoints) : 0;
    if (!pts || n < 2) {
      line.visible = false;
      return;
    }
    line.visible = true;

    // 段 i = (p[i], p[i+1])
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const o = i * 6;
      arr[o] = a[0];
      arr[o + 1] = a[1];
      arr[o + 2] = a[2];
      arr[o + 3] = b[0];
      arr[o + 4] = b[1];
      arr[o + 5] = b[2];

      if (mat.dashed) {
        // 与 LineSegments2.computeLineDistances 同口径：沿折线累计长度
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        distArr[i * 2] = acc;
        acc += Math.sqrt(dx * dx + dy * dy + dz * dz);
        distArr[i * 2 + 1] = acc;
      }
    }
    buf.needsUpdate = true;
    geom.instanceCount = n - 1;
    if (mat.dashed) distBuf.needsUpdate = true;
  });

  return <primitive object={built.line} />;
}
