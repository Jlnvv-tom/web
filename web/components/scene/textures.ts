/**
 * 程序化贴图（M3 · W2）
 *
 * 宪法第八条要求"零外部资源"，所以木纹、布纹都在这里用 Canvas 现画。
 *
 * **必须可复现**：用固定种子的 LCG 而不是 `Math.random()`。
 * 否则每次刷新纹理都不一样，视觉回归基线比对会永远失败。
 *
 * **贴图只画"明暗纹理"，不画色相。** 材质的 `color` 会与 `map` 相乘，
 * 如果贴图里已经烤进棕色，再乘一次 `color` 就是双层变暗——
 * 实测把台面从 L≈0.40 直接砸到 0.23，整块画面变平。
 * 所以底色取接近白（≈0.95），木纹只是那条比底色更深的纹路。
 */

import * as THREE from 'three';

/** 固定种子线性同余发生器 —— 同一版本永远画出同一张图 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let woodTex: THREE.Texture | null = null;

/**
 * 木纹：沿一个方向的细长纹路 + 少量深色节疤。
 *
 * 为什么用"细长纹路"而不是"年轮"：台面是锯开的板材，看到的是**弦切面**，
 * 纹路本来就接近平行线。画年轮会立刻暴露"这是贴图"。
 */
export function getWoodTexture(): THREE.Texture {
  if (woodTex) return woodTex;

  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rnd = lcg(20261022);

  ctx.fillStyle = '#F2ECE2';
  ctx.fillRect(0, 0, S, S);

  // 200 条不均匀的纹理线
  for (let i = 0; i < 200; i++) {
    const x = rnd() * S;
    const dark = 0.05 + rnd() * 0.13;
    ctx.strokeStyle = `rgba(96,70,44,${dark.toFixed(3)})`;
    ctx.lineWidth = 0.5 + rnd() * 2.4;
    ctx.beginPath();
    let y = -24;
    ctx.moveTo(x, y);
    const drift = (rnd() - 0.5) * 0.9;
    while (y < S + 24) {
      y += 10 + rnd() * 16;
      ctx.lineTo(x + Math.sin(y * 0.021 + i) * 3.2 + drift * y * 0.02 + (rnd() - 0.5) * 2, y);
    }
    ctx.stroke();
  }

  // 轻微的整体明暗带，避免"一整块均匀色"
  for (let i = 0; i < 5; i++) {
    const x = rnd() * S;
    const g = ctx.createLinearGradient(x, 0, x + 70, 0);
    g.addColorStop(0, 'rgba(255,235,205,0)');
    g.addColorStop(0.5, `rgba(255,235,205,${(0.03 + rnd() * 0.05).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,235,205,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 70, S);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  woodTex = t;
  return t;
}

let linenTex: THREE.Texture | null = null;

/** 亚麻：两组互相垂直的细线 + 轻微褶皱明暗 */
export function getLinenTexture(): THREE.Texture {
  if (linenTex) return linenTex;

  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const rnd = lcg(777001);

  ctx.fillStyle = '#F6F2EA';
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 128; i++) {
    const p = (i / 128) * S + (rnd() - 0.5) * 1.2;
    ctx.strokeStyle = `rgba(110,96,78,${(0.05 + rnd() * 0.07).toFixed(3)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  linenTex = t;
  return t;
}

export function textureFor(kind: 'wood' | 'linen' | null): THREE.Texture | null {
  if (kind === 'wood') return getWoodTexture();
  if (kind === 'linen') return getLinenTexture();
  return null;
}

/**
 * 按物体尺寸复制一份贴图并设置 repeat。
 *
 * 关键是 `clone()` 共享同一张 image，只复制采样参数——
 * 不同大小的物体因此可以共享内存，但纹路密度一致（否则小块上是一整块色，
 * 大块上是密密麻麻的细纹，看起来像两种材质）。
 */
export function tiledTexture(base: THREE.Texture, worldW: number, worldH: number, tile = 0.42): THREE.Texture {
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(0.4, worldW / tile), Math.max(0.4, worldH / tile));
  return t;
}
