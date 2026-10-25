'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
  radius = 0.022,
  opacity = 1,
  fixedLength,
  maxLength,
  emissive = 0.35,
}: {
  getOrigin: () => Vec3Like;
  getVector: () => Vec3Like;
  color?: string;
  radius?: number;
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

    const headLen = Math.min(len * 0.34, radius * 11);
    const shaftLen = Math.max(len - headLen, 1e-4);

    s.quaternion.copy(tmp.q);
    s.position.copy(tmp.o).addScaledVector(dirn, shaftLen / 2);
    s.scale.set(1, shaftLen, 1);

    h.quaternion.copy(tmp.q);
    h.position.copy(tmp.o).addScaledVector(dirn, shaftLen + headLen / 2);
    h.scale.setScalar(headLen / 0.28);

    // 开场演出（W4）：淡入 + 点亮。不做缩放——箭头的位置与长度每帧由
    // getOrigin/getVector 驱动，缩放会和长度逻辑打架（v1 已知边界）。
    // 透明度统一走 applyIntroAlpha：它会在演出结束后撒手，
    // 不覆盖高亮压暗、也不会把 transparent 变体留在旧 shader 上。
    const fx = introFx(intro.current);
    for (const m of [s, h]) {
      applyIntroAlpha(m.material as THREE.MeshStandardMaterial, opacity, intro.current, fx.alpha);
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = emissive * fx.emissive;
    }
  });

  return (
    <group>
      <mesh ref={shaft} castShadow={false}>
        <cylinderGeometry args={[radius, radius, 1, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          metalness={0.2}
          roughness={0.45}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      <mesh ref={head}>
        <coneGeometry args={[radius * 2.6, 0.28, 14]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          metalness={0.2}
          roughness={0.45}
          transparent={opacity < 1}
          opacity={opacity}
        />
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
