'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { needsTransmission, resolveMaterial, type MaterialKind } from '@/engine/materials';
import { STAGE_BACKDROP } from '@/engine/palette';
import { getQuality } from './quality';
import { textureFor, tiledTexture } from './textures';

/* ============================================================
   展台（M3 · W1）

   把"黑底虚空里的示意图"变成"一盏灯打亮的小实验台"。
   三个部件各解决一个具体问题：

   StageBackdrop  画面不再是纯黑 —— 上暗下亮的暖色渐变，有空气感
   TableTop       物体有落点 —— 可受光的实体台面（原来的 grid 是线框，接不住阴影）
   StageLights    有明暗层次 —— 1 盏投影主光 + 1 盏冷补光 + 1 盏台面补光

   **颜色全部来自 spec，几何全部程序化**（宪法第八条：不引外部资源）。
   ============================================================ */

/**
 * 背景板：竖直渐变的暖色。
 *
 * 为什么不用纯色：纯色背景会让"台面边缘"和"背景"糊成一片，
 * 物体看起来仍然悬空。渐变给了地平线的暗示，台面就有了承托感。
 */
export function StageBackdrop({ color }: { color: string }) {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const base = new THREE.Color(color);
    // 浅色模式：上亮下暗（顶灯在上、地面收光），和深色模式正好相反。
    // 之前深色模式是"上暗下亮"，直接沿用到浅色会变成"头顶一块乌云"。
    const top = base.clone().multiplyScalar(1.14);
    const mid = base.clone();
    const bottom = base.clone().multiplyScalar(0.86);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(0.58, `#${mid.getHexString()}`);
    g.addColorStop(1, `#${bottom.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;

    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene, color]);

  return null;
}

/**
 * 台面：一块圆角厚板。
 *
 * 用圆角而不是纯 box：直边在低角度会露出"一刀切"的硬边，
 * 圆角能把高光拉成一条柔和的弧线，这是"像实物"最便宜的一招。
 * 厚度取半边的 4.5%，薄了像纸、厚了像砖，这个比例实测最稳。
 */
/** 接触阴影贴图：径向渐变，一次生成全局复用 */
let contactTex: THREE.Texture | null = null;
function getContactTexture() {
  if (contactTex) return contactTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  contactTex = new THREE.CanvasTexture(c);
  contactTex.colorSpace = THREE.SRGBColorSpace;
  return contactTex;
}

export function TableTop({
  y,
  half,
  surface,
  material = 'wood',
  contact,
}: {
  y: number;
  half: number;
  /** 覆盖预设颜色；不填则用材质预设自己的色 */
  surface?: string;
  material?: MaterialKind;
  /** 接触阴影半径（米）。不填则不画 */
  contact?: number;
}) {
  const thickness = Math.max(0.012, half * 0.045);
  const geom = useMemo(
    () => new RoundedBoxGeometry(half * 2, thickness, half * 2, 3, Math.min(thickness * 0.4, half * 0.08)),
    [half, thickness]
  );

  const m = resolveMaterial(material, { color: surface });
  const highQuality = getQuality() === 'high';
  const base = textureFor(m.texture);
  // 木纹密度按台面尺寸走：小台面纹路要更密，否则一整块板上只有两道线
  const map = useMemo(
    () => (base ? tiledTexture(base, half * 2, half * 2, Math.max(0.25, half * 0.55)) : null),
    [base, half]
  );

  // 上表面对齐 y：几何中心要下沉半个厚度
  return (
    <>
      <mesh geometry={geom} position={[0, y - thickness / 2, 0]} receiveShadow>
        <meshPhysicalMaterial
          color={m.color}
          map={map ?? undefined}
          roughness={m.roughness}
          metalness={m.metalness}
          clearcoat={m.clearcoat}
          clearcoatRoughness={m.clearcoatRoughness}
          envMapIntensity={m.envMapIntensity}
          transmission={highQuality ? m.transmission : 0}
          transparent={!highQuality && needsTransmission(m)}
          opacity={!highQuality && needsTransmission(m) ? m.fallbackOpacity : 1}
        />
      </mesh>

      {/*
        接触阴影：真实投影只能覆盖"有体积的东西"，单摆的摆球直径 4 cm、
        杠杆的钩码更小，投出来的影子正好被自己挡住——看上去还是"浮着"。
        这层贴图专门负责"压住"主体，是最便宜的落地感。它只是装饰，不参与任何计算。
      */}
      {contact ? (
        <mesh position={[0, y + thickness * 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[contact * 2, contact * 2]} />
          <meshBasicMaterial
            map={getContactTexture()}
            transparent
            opacity={0.55}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </>
  );
}

/**
 * 展台光照。
 *
 * 与原来的 `<Lights>` 的差别不只是"更暖"，而是**只有一盏灯投影**：
 * 多头投影会互相打架，产生多份方向不同的软影，比没有影子更像 bug。
 */
export function StageLights({ half, y }: { half: number; y: number }) {
  const key = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const l = key.current;
    if (!l) return;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    // 阴影相机只覆盖台面附近，同样的 1024 贴图能换来更锐利的影子
    const r = half * 1.35;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.05;
    cam.far = half * 10;
    cam.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [half]);

  return (
    <>
      {/* 大面积暖环境光：亮度的主要来源，几乎不产生方向感。
          浅色模式下环境光占比要比深色模式高（深色模式靠主光压出明暗），
          否则暗部会脏。强度经过两轮实测：再高会把浅色台面推到一片死白。 */}
      <hemisphereLight args={['#FFF8EC', '#B8AC97', 0.55]} />

      {/* 主光：唯一投影光源，从头侧 45° 打下来 */}
      <directionalLight
        ref={key}
        position={[-half * 0.85, y + half * 1.55, half * 1.05]}
        intensity={2.5}
        color="#FFF6EA"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />

      {/* 冷补光：不发黄发闷的关键，从反侧低角度打 */}
      <directionalLight
        position={[half * 1.5, y + half * 0.7, -half * 1.2]}
        intensity={0.40}
        color="#BFD8E8"
      />

      {/* 台面补光：把台面中心轻轻提亮，制造"聚光"感。
          它最容易被调过头——离台面很近，稍微加一点就整片发白。 */}
      <pointLight
        position={[0, y + half * 0.45, 0]}
        intensity={0.70}
        distance={half * 4}
        decay={2}
        color="#FFD9B0"
      />
    </>
  );
}

/* ============================================================
   配色默认值（与 docs/m3-plan.md §4.1 保持一致）
   ============================================================ */
export const STAGE_DEFAULTS = {
  // 浅色模式（2026-10-22）：台面比深色模式下提亮一档。
  // 深色模式下压暗是为了不抢暗背景；浅色背景下再压暗会变成"一块脏木板"。
  surface: '#A8916E',
  /**
   * 背景色**不是最终显示值**，而是色调映射之前的输入值。
   *
   * 踩过的坑（深色模式时期）：写 `#2C231A`（sRGB L≈0.14）时，ACES + exposure 0.86
   * 会把它压到屏幕上的 L≈0.043，比"暗部"阈值 0.08 还低，整个上半屏都被统计成暗部。
   * 所以**选值要看屏幕上的结果，不能看十六进制本身**。
   *
   * 浅色模式下反过来：输入值要选得比目标更亮，因为 ACES 会压。
   * 雾必须用同一个值 —— 雾色与背景色走同一条 tone mapping，
   * 远处物体"淡出"后才能刚好融进背景，不会出现一圈比背景更亮的雾。
   */
  backdrop: STAGE_BACKDROP,
} as const;
