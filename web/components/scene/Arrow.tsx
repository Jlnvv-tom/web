'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '@/engine/vec';
import { ink } from '@/engine/palette';
import { applyIntroAlpha, introFx, useIntro } from './intro';

const UP = new THREE.Vector3(0, 1, 0);

export type Vec3Like = readonly [number, number, number] | Vec3;

/**
 * 3D 箭头：圆柱杆 + 圆锥头，可逐帧跟随
 *
 * 用 accessor 而不是 props 传值，是为了让每帧更新绕开 React 重渲染。
 */
export function Arrow({
  getOrigin,
  getVector,
  // 过 ink()：场景写的是深色主题语义色，渲染层负责适配当前底板
  color = ink(undefined, '#22d3ee'),
  radius,
  radiusPx = 2.4,
  opacity = 1,
  fixedLength,
  maxLength,
  emissive = 0.5,
}: {
  getOrigin: () => Vec3Like;
  getVector: () => Vec3Like;
  color?: string;
  /** 显式指定世界单位粗细（覆盖屏幕恒定口径） */
  radius?: number;
  /**
   * 屏幕恒定粗细：箭杆半径的目标像素数（M3.5 · W3.1）
   *
   * 为什么不能写死世界单位：场景尺度差 10 倍以上（电容器 0.3 m、电场 24 m）。
   * 原来固定 `radius = 0.022`，在 42 世界单位的抛体场景里 = 0.68px 半径，
   * 直径 1.4px —— 截图上是"根本不存在的箭头"，学生只看到三个字母标签。
   * 现在按"箭头到相机的距离 + 视口高度"实时换算，任何缩放都是 2–3px。
   */
  radiusPx?: number;
  opacity?: number;
  /** 固定长度（只示意方向时用） */
  fixedLength?: number;
  /** 长度上限，防止大参数下箭头戳出画面 */
  maxLength?: number;
  emissive?: number;
}) {
  const shaft = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const intro = useIntro();
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.size);
  // 几何按"基准半径"建一次，逐帧用 scale 换算成目标像素粗细
  const BASE_R = 0.022;
  const tmp = useMemo(
    () => ({
      o: new THREE.Vector3(),
      d: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    }),
    []
  );

  useFrame(() => {
    const s = shaft.current;
    const h = head.current;
    if (!s || !h) return;

    const ov = getOrigin();
    const vv = getVector();
    tmp.o.set(ov[0], ov[1], ov[2]);
    tmp.d.set(vv[0], vv[1], vv[2]);

    let len = tmp.d.length();
    if (len < 1e-6) {
      s.visible = false;
      h.visible = false;
      return;
    }
    s.visible = true;
    h.visible = true;

    if (fixedLength != null) {
      tmp.d.setLength(fixedLength);
      len = fixedLength;
    } else if (maxLength != null && len > maxLength) {
      tmp.d.setLength(maxLength);
      len = maxLength;
    }

    const dirn = tmp.d.clone().normalize();
    tmp.q.setFromUnitVectors(UP, dirn);

    // 屏幕恒定粗细：该箭头所在深度上"一个 CSS 像素等于多少世界单位"
    let r = radius;
    if (r == null) {
      const cam = camera as THREE.PerspectiveCamera;
      const dist = Math.max(0.01, tmp.o.distanceTo(camera.position));
      const worldHeight = 2 * dist * Math.tan(((cam.fov ?? 45) * Math.PI) / 360);
      const worldPerPx = worldHeight / Math.max(1, viewport.height);
      r = radiusPx * worldPerPx;
      // 短箭头不许变成一根大棍子：粗细不超过长度的 12%
      r = Math.min(r, len * 0.12);
    }
    const k = r / BASE_R;

    const headLen = Math.min(len * 0.34, r * 11);
    const shaftLen = Math.max(len - headLen, 1e-4);

    s.quaternion.copy(tmp.q);
    s.position.copy(tmp.o).addScaledVector(dirn, shaftLen / 2);
    s.scale.set(k, shaftLen, k);

    h.quaternion.copy(tmp.q);
    h.position.copy(tmp.o).addScaledVector(dirn, shaftLen + headLen / 2);
    // 锥体的径向缩放是 k（让底圆半径 = 2.6r），轴向是 headLen/0.28。
    // 两个因子**不能相乘**：早先把 (headLen/0.28)*k 同时给了 x/z，
    // 结果箭头底圆被放大到 36 倍，画面里是一个盖住球的半透明大圆盘。
    h.scale.set(k, headLen / 0.28, k);

    // 开场演出（W4）：淡入 + 点亮。不做缩放——箭头的位置与长度每帧由
    // getOrigin/getVector 驱动，缩放会和长度逻辑打架（v1 已知边界）。
    // 透明度统一走 applyIntroAlpha：它会在演出结束后撒手，
    // 不覆盖高亮压暗、也不会把 transparent 变体留在旧 shader 上。
    const fx = introFx(intro.current);
    for (const m of [s, h]) {
      applyIntroAlpha(m.material as THREE.Material & { opacity: number; transparent: boolean }, opacity, intro.current, fx.alpha);
    }
  });

  return (
    <group>
      {/* 材质：平涂（basic）而不是 PBR。
          实测原因：箭头用 MeshStandardMaterial + 场景强光（directional 2.9）时，
          深绿 #166534 被照到亮度 >1，再经 ACES 曝光映射直接褪成浅灰绿 ——
          屏幕上是一根"雾里的荧光棒"，不是矢量。
          箭头是**标注**不是实体，它需要的是一致的墨色对比度，而不是被环境光影响。
          toneMapped=false 让颜色原样落地，白底上才有 7:1 的对比。 */}
      <mesh ref={shaft} castShadow={false}>
        <cylinderGeometry args={[BASE_R, BASE_R, 1, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} fog={false} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh ref={head}>
        <coneGeometry args={[BASE_R * 2.6, 0.28, 14]} />
        <meshBasicMaterial color={color} toneMapped={false} fog={false} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}

/** 静态箭头（用于光线方向、场箭头阵列） */
export function StaticArrow({
  from,
  to,
  color = ink(undefined, '#94a3b8'),
  radius = 0.018,
  opacity = 1,
}: {
  from: Vec3;
  to: Vec3;
  color?: string;
  radius?: number;
  opacity?: number;
}) {
  const { pos, quat, shaftLen, headLen } = useMemo(() => {
    const o = new THREE.Vector3(...from);
    const d = new THREE.Vector3(...to).sub(o);
    const len = d.length();
    const dirn = d.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dirn);
    const hl = Math.min(len * 0.4, radius * 10);
    const sl = Math.max(len - hl, 1e-4);
    return {
      pos: {
        shaft: o.clone().addScaledVector(dirn, sl / 2),
        head: o.clone().addScaledVector(dirn, sl + hl / 2),
      },
      quat: q,
      shaftLen: sl,
      headLen: hl,
    };
  }, [from, to, radius]);

  return (
    <group>
      <mesh position={pos.shaft} quaternion={quat} scale={[1, shaftLen, 1]}>
        <cylinderGeometry args={[radius, radius, 1, 8]} />
        <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.6} />
      </mesh>
      <mesh position={pos.head} quaternion={quat} scale={headLen / 0.28}>
        <coneGeometry args={[radius * 2.4, 0.28, 10]} />
        <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.6} />
      </mesh>
    </group>
  );
}
