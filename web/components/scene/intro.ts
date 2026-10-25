/**
 * 开场演出（M3 · W4）· React 侧
 *
 * 纯逻辑（时钟推进、kind→视觉乘子）在 engine/intro.ts，可在 Node 单测。
 * 这里放 context 与「材质写入的唯一入口」：intro 状态存在 ref 里逐帧变，
 * 但只驱动 mesh 变换/材质透明度，**绝不触发 React 重渲染**（与 stateRef 同构）。
 */
'use client';

import { createContext, useContext } from 'react';
import type * as THREE from 'three';
import type { IntroState } from '@/engine/intro';
import { INTRO_IDLE } from '@/engine/intro';

export { INTRO_IDLE, advanceIntro, introFx, makeIntro } from '@/engine/intro';
export type { IntroFx, IntroState } from '@/engine/intro';

export const IntroContext = createContext<{ current: IntroState }>({ current: INTRO_IDLE });

export const useIntro = () => useContext(IntroContext);

type AlphaMaterial = THREE.Material & { opacity: number; transparent: boolean };

/**
 * 开场演出对材质透明度的**唯一切入点**。
 *
 * 三条纪律，每一条都是踩出来的：
 * 1. **演出没开就一次都不碰 opacity。** HighlightGroup 的"聚焦某一步"会把
 *    其他物体压暗到 opacity 0.14——逐帧覆盖会让聚焦失效（实测 lorentz
 *    t=1.0：旧帧是压暗态、新帧全亮，差 1%）。
 * 2. **演出结束就撒手。** 只恢复一次基准值，之后不再逐帧写，
 *    把材质还给 JSX 与高亮层。
 * 3. **transparent 变化必须标 needsUpdate。** 它在 three 的 program 缓存键里，
 *    不标脏会让材质继续用旧 shader 变体渲染（实测 buoyancy 方块区域残留 1%）。
 */
export function applyIntroAlpha(
  mat: AlphaMaterial | undefined | null,
  baseOpacity: number,
  st: { kind: string; active: boolean },
  alpha: number
) {
  if (!mat) return;
  const u = mat.userData as { __introSettled?: boolean; __dim?: number };

  // 场景没声明 intro：一次都不碰（保护高亮压暗）
  if (st.kind === 'none') {
    u.__introSettled = true;
    return;
  }

  // 压暗态（HighlightGroup 标记）：基准值要取压暗值，否则演出收尾会把压暗还原没了。
  // 任务 4.5 之后压暗被推迟到演出结束，演出窗口内此标记不存在——min() 保留为防御。
  const base = u.__dim != null ? Math.min(baseOpacity, u.__dim) : baseOpacity;

  // 演出已结束：恢复一次基准值后撒手
  if (!st.active) {
    if (u.__introSettled) return;
    u.__introSettled = true;
    mat.opacity = base;
    const want = base < 0.999;
    if (mat.transparent !== want) {
      mat.transparent = want;
      mat.needsUpdate = true;
    }
    return;
  }

  // 演出中：淡入 + 临时透明
  mat.opacity = base * alpha;
  if (!mat.transparent) {
    mat.transparent = true;
    mat.needsUpdate = true;
  }
}
