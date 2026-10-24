'use client';

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ObjectDef, SceneState } from '@/engine/spec';
import type { Vec3 } from '@/engine/vec';
import { Arrow, StaticArrow } from './Arrow';
import { ink } from '@/engine/palette';
import { needsTransmission, resolveMaterial } from '@/engine/materials';
import { getQuality } from './quality';
import { textureFor, tiledTexture } from './textures';

export type StateRef = { current: SceneState };

/* ============================================================
   工具
   ============================================================ */

const MAX_POINTS = 260;

/** 光晕贴图（代码生成，避免外部资源） */
let glowTex: THREE.Texture | null = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(160,240,255,0.45)');
  g.addColorStop(0.6, 'rgba(60,190,235,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  glowTex = t;
  return t;
}

const toV3 = (v: readonly [number, number, number]) => new THREE.Vector3(v[0], v[1], v[2]);

/* ============================================================
   动态折线：定长缓冲 + setPositions，避免每帧重建属性
   ============================================================ */

function DynLine({
  getPoints,
  color = ink(undefined, '#22d3ee'),
  width = 2,
  dashed = false,
  opacity = 1,
  depthTest = true,
}: {
  getPoints: () => Vec3[] | undefined;
  color?: string;
  width?: number;
  dashed?: boolean;
  opacity?: number;
  depthTest?: boolean;
}) {
  const ref = useRef<never>(null);
  const buf = useMemo(() => new Float32Array(MAX_POINTS * 3), []);

  useFrame(() => {
    const line = ref.current as unknown as {
      visible: boolean;
      geometry: { setPositions: (a: Float32Array) => void; setDrawRange?: (s: number, c: number) => void };
      computeLineDistances?: () => void;
    } | null;
    if (!line) return;

    const pts = getPoints();
    if (!pts || pts.length < 2) {
      line.visible = false;
      return;
    }
    line.visible = true;

    const n = Math.min(pts.length, MAX_POINTS);
    const last = pts[n - 1]!;
    for (let i = 0; i < MAX_POINTS; i++) {
      const p = i < n ? pts[i]! : last;
      buf[i * 3] = p[0];
      buf[i * 3 + 1] = p[1];
      buf[i * 3 + 2] = p[2];
    }
    line.geometry.setPositions(buf);
    if (dashed) line.computeLineDistances?.();
  });

  return (
    <Line
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      points={[
        [0, 0, 0],
        [0, 0, 0],
      ]}
      color={color}
      lineWidth={width}
      dashed={dashed}
      dashSize={0.18}
      gapSize={0.12}
      transparent={opacity < 1}
      opacity={opacity}
      depthTest={depthTest}
    />
  );
}

/* ============================================================
   多折线：数量随参数变化，仅在数组引用变化时重建（SPEC-010 v0.2）
   ============================================================ */

const EMPTY_SETS: Vec3[][] = [];

function MultiPolyline({
  def,
  stateRef,
}: {
  def: Extract<ObjectDef, { type: 'polylines' }>;
  stateRef: StateRef;
}) {
  const [sets, setSets] = useState<Vec3[][]>(EMPTY_SETS);
  const last = useRef<Vec3[][] | undefined>(undefined);

  useFrame(() => {
    const ls = stateRef.current.linesets?.[def.bind];
    // 引用比较：求解器命中缓存时返回原数组，因此播放过程中这里恒为 false
    if (ls !== last.current) {
      last.current = ls;
      setSets(ls ?? EMPTY_SETS);
    }
  });

  if (!sets.length) return null;

  return (
    <group>
      {sets.map((pts, i) =>
        pts.length >= 2 ? (
          <Line
            key={i}
            points={pts}
            color={ink(def.color, '#38bdf8')}
            lineWidth={def.width ?? 1.2}
            dashed={def.dashed}
            dashSize={0.24}
            gapSize={0.16}
            transparent
            opacity={def.opacity ?? 0.85}
          />
        ) : null
      )}
    </group>
  );
}

/* ============================================================
   各图元
   ============================================================ */

function Particle({
  def,
  stateRef,
}: {
  def: Extract<ObjectDef, { type: 'particle' }>;
  stateRef: StateRef;
}) {
  const bind = def.bind ?? 'pos';
  const r = def.radius ?? 0.16;
  const mesh = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const tex = useMemo(() => getGlowTexture(), []);

  // 指定了材质 = 这是个"实物球"（摆球、钩码），走 PBR；否则是发光标记点
  const m = def.material ? resolveMaterial(def.material) : null;
  const seg = def.segments ?? 28;

  useFrame(() => {
    const p = stateRef.current.points[bind];
    if (!p) return;
    mesh.current?.position.set(p[0], p[1], p[2]);
    halo.current?.position.set(p[0], p[1], p[2]);
  });

  return (
    <group>
      {/* castShadow：展台场景里，摆球/钩码是唯一能投出影子的实体，
          没有它"万物有落点"就只剩托盘的方块成立 */}
      <mesh ref={mesh} castShadow={!!m}>
        <sphereGeometry args={[r, seg, Math.max(8, Math.round(seg * 0.7))]} />
        {m ? (
          <meshPhysicalMaterial
            color={m.color}
            roughness={m.roughness}
            metalness={m.metalness}
            clearcoat={m.clearcoat}
            clearcoatRoughness={m.clearcoatRoughness}
            envMapIntensity={m.envMapIntensity}
            transmission={getQuality() === 'high' ? m.transmission : 0}
            thickness={m.thickness}
            ior={m.ior}
            transparent={getQuality() !== 'high' && needsTransmission(m)}
            opacity={getQuality() !== 'high' && needsTransmission(m) ? m.fallbackOpacity : 1}
          />
        ) : (
          <meshStandardMaterial
            color={def.color ?? '#ff8a3d'}
            emissive={def.color ?? '#ff8a3d'}
            emissiveIntensity={0.55}
            metalness={0.3}
            roughness={0.35}
          />
        )}
      </mesh>
      {!m && def.glow !== false && (
        <sprite ref={halo} scale={[r * 7, r * 7, 1]}>
          <spriteMaterial
            map={tex}
            color={def.color ?? '#ff8a3d'}
            transparent
            opacity={0.55}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      )}
    </group>
  );
}

function GridObject({ def }: { def: Extract<ObjectDef, { type: 'grid' }> }) {
  const geom = useMemo(() => {
    const [w, h] = def.size;
    const div = def.divisions;
    // GridHelper 的材质是 { vertexColors: true, toneMapped: false } —— 完全不透明。
    // 场景里的深青网格色是为深色底选的，在近白底上会变成满不透明度的深色网格，
    // 所以必须过 structure 档（3:1）而不是原样使用。
    return new THREE.GridHelper(
      Math.max(w, h),
      div,
      new THREE.Color(ink(def.color, '#1e5a72', { role: 'structure' })),
      new THREE.Color(ink(def.color, '#10303e', { role: 'structure' }))
    );
  }, [def.size, def.divisions, def.color]);

  const rotation = useMemo<Vec3>(() => {
    if (def.plane === 'xy') return [0, 0, 0];
    if (def.plane === 'yz') return [0, 0, Math.PI / 2];
    return [0, 0, 0];
  }, [def.plane]);

  return (
    <primitive object={geom} rotation={rotation} position={[0, 0, 0]}>
      <primitive object={new THREE.Object3D()} attach="none" />
    </primitive>
  );
}

/** 用 Line 拼的网格（比 GridHelper 更好控透明度） */
function GridPlane({ def }: { def: Extract<ObjectDef, { type: 'grid' }> }) {
  const [w, h] = def.size;
  const div = def.divisions;
  const color = ink(def.color, '#1e5a72', { role: 'structure' });
  const op = def.opacity ?? 0.35;

  const segments = useMemo(() => {
    const out: [number, number, number][][] = [];
    for (let i = 0; i <= div; i++) {
      const x = -w / 2 + (w * i) / div;
      out.push([
        [x, 0, -h / 2],
        [x, 0, h / 2],
      ]);
      const z = -h / 2 + (h * i) / div;
      out.push([
        [-w / 2, 0, z],
        [w / 2, 0, z],
      ]);
    }
    return out;
  }, [w, h, div]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr: number[] = [];
    segments.forEach(([a, b]) => arr.push(...a, ...b));
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  }, [segments]);

  const rot: Vec3 = def.plane === 'xy' ? [0, 0, 0] : def.plane === 'yz' ? [0, 0, Math.PI / 2] : [-Math.PI / 2, 0, 0];

  return (
    <lineSegments geometry={geom} rotation={rot}>
      <lineBasicMaterial color={color} transparent opacity={op} depthWrite={false} />
    </lineSegments>
  );
}

function FieldArrows({
  def,
  stateRef,
}: {
  def: Extract<ObjectDef, { type: 'fieldArrows' }>;
  stateRef: StateRef;
}) {
  const [cx, cy, cz] = def.count;
  const s = def.spacing;
  const color = ink(def.color, '#38bdf8');
  const op = def.opacity ?? 0.55;
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!group.current || !def.flipBind) return;
    const sign = Math.sign(stateRef.current.scalars[def.flipBind] ?? 1) || 1;
    group.current.scale.set(1, sign, 1);
  });

  const arrows = useMemo(() => {
    const out: { from: Vec3; to: Vec3 }[] = [];
    const len = s * 0.34;
    for (let i = 0; i < cx; i++) {
      for (let j = 0; j < cy; j++) {
        for (let k = 0; k < cz; k++) {
          const p: Vec3 = [
            (i - (cx - 1) / 2) * s,
            (j - (cy - 1) / 2) * s,
            (k - (cz - 1) / 2) * s,
          ];
          const d = new THREE.Vector3(...def.dir).normalize();
          const from: Vec3 = p;
          const to: Vec3 = [
            p[0] + d.x * len * 0.5,
            p[1] + d.y * len * 0.5,
            p[2] + d.z * len * 0.5,
          ];
          out.push({ from, to });
        }
      }
    }
    return out;
  }, [cx, cy, cz, s, def.dir]);

  return (
    <group ref={group}>
      {arrows.map((a, i) => (
        <StaticArrow key={i} from={a.from} to={a.to} color={color} radius={s * 0.012} opacity={op} />
      ))}
    </group>
  );
}

function Axis({ def }: { def: Extract<ObjectDef, { type: 'axis' }> }) {
  const L = def.length;
  const axes = useMemo(
    () => [
      // 坐标轴是标准的 RGB 语义色（x 红 / y 绿 / z 蓝），过 ink() 保色相、只压明度
      { p: [[-L, 0, 0], [L, 0, 0]] as Vec3[], c: ink(undefined, '#f87171'), n: 'x' },
      { p: [[0, -L * 0.35, 0], [0, L, 0]] as Vec3[], c: ink(undefined, '#4ade80'), n: 'y' },
      { p: [[0, 0, -L], [0, 0, L]] as Vec3[], c: ink(undefined, '#60a5fa'), n: 'z' },
    ],
    [L]
  );

  return (
    <group>
      {axes.map((a) => (
        <group key={a.n}>
          <Line points={a.p} color={a.c} lineWidth={1.4} transparent opacity={0.55} />

        </group>
      ))}
    </group>
  );
}

function PlaneObject({ def, stateRef }: { def: Extract<ObjectDef, { type: 'plane' }>; stateRef: StateRef }) {
  const [w, h] = def.size;
  const geom = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geom), [geom]);
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!def.bindPosition || !group.current) return;
    const p = stateRef.current.points[def.bindPosition];
    if (p) group.current.position.set(p[0], p[1], p[2]);
  });

  return (
    <group ref={group} position={def.position} rotation={def.rotation ?? [0, 0, 0]}>
      <mesh geometry={geom}>
        <meshStandardMaterial
          color={def.color ?? '#64748b'}
          transparent
          opacity={def.opacity ?? 0.18}
          side={THREE.DoubleSide}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      {def.outline !== false && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={ink(def.color, '#94a3b8', { role: 'structure' })} transparent opacity={0.6} />
        </lineSegments>
      )}
    </group>
  );
}

function LensObject({ def }: { def: Extract<ObjectDef, { type: 'lens' }> }) {
  const cap = def.kind ?? 'convex';
  const sx = def.thickness / 2;
  return (
    <group position={def.position}>
      <mesh scale={[Math.max(sx, 0.02), def.semiHeight, def.semiHeight]}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshPhysicalMaterial
          color={def.color ?? '#9fd8ff'}
          transparent
          opacity={def.opacity ?? 0.42}
          roughness={0.06}
          metalness={0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* 边缘高光圈 */}
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[def.semiHeight * 0.98, 0.012, 8, 64]} />
        <meshBasicMaterial color={cap === 'convex' ? '#67e8f9' : '#a5b4fc'} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function DiscObject({ def }: { def: Extract<ObjectDef, { type: 'disc' }> }) {
  return (
    <group position={def.position} rotation={def.rotation ?? [0, 0, 0]}>
      {def.ring ? (
        <mesh>
          <ringGeometry args={[def.radius * 0.995, def.radius, 64]} />
          <meshBasicMaterial color={ink(def.color, '#22d3ee')} transparent opacity={def.opacity ?? 0.5} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <mesh>
          <circleGeometry args={[def.radius, 64]} />
          <meshBasicMaterial color={ink(def.color, '#0e2a3a', { role: 'structure' })} transparent opacity={def.opacity ?? 0.25} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

const resolvePoint = (state: SceneState, x: string | Vec3): Vec3 =>
  Array.isArray(x) ? x : (state.points[x] ?? [0, 0, 0]);

function ArrowLineObject({
  def,
  stateRef,
}: {
  def: Extract<ObjectDef, { type: 'arrowLine' }>;
  stateRef: StateRef;
}) {
  if (typeof def.from !== 'string' && typeof def.to !== 'string') {
    return <Arrow getOrigin={() => def.from as Vec3} getVector={() => {
      const a = def.from as Vec3;
      const b = def.to as Vec3;
      return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    }} color={ink(def.color, '#22d3ee')} radius={(def.width ?? 1) * 0.024} />;
  }
  return (
    <Arrow
      getOrigin={() => resolvePoint(stateRef.current, def.from as string | Vec3)}
      getVector={() => {
        const a = resolvePoint(stateRef.current, def.from as string | Vec3);
        const b = resolvePoint(stateRef.current, def.to as string | Vec3);
        return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      }}
      color={ink(def.color, '#22d3ee')}
      radius={(def.width ?? 1) * 0.024}
    />
  );
}


/* ============================================================
   分发
   ============================================================ */

/** 按 scalars 绑定控制显隐（契约 v0.2 的 ObjectCommon.visible） */
function Gate({ bind, stateRef, children }: { bind: string; stateRef: StateRef; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = (stateRef.current.scalars[bind] ?? 1) > 0.5;
  });
  return <group ref={ref}>{children}</group>;
}

export function ObjectView({ def, stateRef }: { def: ObjectDef; stateRef: StateRef }) {
  const inner = renderObject(def, stateRef);
  if (!def.visible) return inner;
  return (
    <Gate bind={def.visible} stateRef={stateRef}>
      {inner}
    </Gate>
  );
}

function renderObject(def: ObjectDef, stateRef: StateRef) {
  switch (def.type) {
    case 'particle':
      return <Particle def={def} stateRef={stateRef} />;

    case 'trail':
      return (
        <DynLine
          getPoints={() => stateRef.current.lines[def.bind]}
          color={ink(def.color, '#22d3ee')}
          width={def.width ?? 2}
          dashed={def.dashed}
          opacity={0.9}
        />
      );

    case 'polyline':
      return def.bind ? (
        <DynLine
          getPoints={() => stateRef.current.lines[def.bind!]}
          color={ink(def.color, '#94a3b8')}
          width={def.width ?? 1.6}
          dashed={def.dashed}
          opacity={0.95}
        />
      ) : (
        <PolylineStatic def={def} />
      );

    case 'polylines':
      return <MultiPolyline def={def} stateRef={stateRef} />;

    case 'vector':
      return (
        <Arrow
          getOrigin={() => stateRef.current.points[def.origin ?? 'pos'] ?? [0, 0, 0]}
          getVector={() => {
            const v = stateRef.current.vectors[def.bind] ?? [0, 0, 0];
            const k = def.scale ?? 1;
            return [v[0] * k, v[1] * k, v[2] * k];
          }}
          color={ink(def.color, '#22d3ee')}
          fixedLength={def.fixed ? 1.6 : undefined}
          maxLength={def.maxLength}
          radius={def.radius}
        />
      );

    case 'fieldArrows':
      return <FieldArrows def={def} stateRef={stateRef} />;

    case 'grid':
      return <GridPlane def={def} />;

    case 'axis':
      return <Axis def={def} />;

    case 'plane':
      return <PlaneObject def={def} stateRef={stateRef} />;

    case 'lens':
      return <LensObject def={def} />;

    case 'disc':
      return <DiscObject def={def} />;

    case 'box':
      return <BoxObject def={def} stateRef={stateRef} />;

    case 'sector':
      return <SectorObject def={def} stateRef={stateRef} />;

    case 'arrowLine':
      return <ArrowLineObject def={def} stateRef={stateRef} />;

    case 'text':
      // 文字由 LabelProjector 统一渲染（DOM 覆盖层）
      return null;

    default:
      return null;
  }
}

/**
 * 填充扇形：三角扇 + 预分配缓冲，每帧只改顶点位置（不重建几何）
 * 用于开普勒第二定律"相等时间扫过相等面积"的可视化。
 */
function SectorObject({
  def,
  stateRef,
}: {
  def: Extract<ObjectDef, { type: 'sector' }>;
  stateRef: StateRef;
}) {
  const MAX_ARC = 64;

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((MAX_ARC + 1) * 3);
    const idx: number[] = [];
    for (let i = 1; i < MAX_ARC; i++) idx.push(0, i, i + 1);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    return g;
  }, []);

  useFrame(() => {
    const arc = stateRef.current.lines[def.arc];
    const c = typeof def.center === 'string' ? stateRef.current.points[def.center] : def.center;
    if (!arc || arc.length < 2 || !c) {
      geom.setDrawRange(0, 0);
      return;
    }
    const attr = geom.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.min(arc.length, MAX_ARC);
    attr.setXYZ(0, c[0], c[1], c[2] ?? 0);
    for (let i = 0; i < n; i++) {
      const p = arc[i]!;
      attr.setXYZ(i + 1, p[0], p[1], p[2] ?? 0);
    }
    attr.needsUpdate = true;
    // 三角扇：n-1 个三角形 × 3 个索引
    geom.setDrawRange(0, (n - 1) * 3);
  });

  return (
    <mesh geometry={geom} frustumCulled={false}>
      <meshBasicMaterial
        color={ink(def.color, '#22d3ee')}
        transparent
        opacity={def.opacity ?? 0.22}
        side={THREE.DoubleSide}
        depthWrite={false}
        // 原来是叠加混合（深色底上当「发光」用）。白底上叠加会让它直接消失 ——
        // 开普勒第二定律的面积扇是核心图元，不能看不见。
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}

/** 实体盒子：圆角 + 物理材质，让极板/支架像实物 */
function BoxObject({
  def,
  stateRef,
}: {
  def: Extract<ObjectDef, { type: 'box' }>;
  stateRef: StateRef;
}) {
  const [w, h, d] = def.size;
  const r = Math.min(def.round ?? 0, Math.min(w, h, d) / 2.2);
  const geom = useMemo(
    () => (r > 0.001 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d)),
    [w, h, d, r]
  );
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!group.current) return;
    if (typeof def.position === 'string') {
      const p = stateRef.current.points[def.position];
      if (p) group.current.position.set(p[0], p[1], p[2]);
    }
    if (def.rotationY != null) {
      group.current.rotation.y = stateRef.current.scalars[def.rotationY] ?? 0;
    }
  });

  /**
   * 材质解析：预设打底 + 场景显式值覆盖。
   *
   * 这里**没有**任何 `if (def.id === ...)`——材质完全由数据决定，
   * 这是宪法第六条（内容即数据）在渲染层的落地。
   */
  const m = resolveMaterial(def.material, {
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    clearcoat: def.clearcoat,
    envMapIntensity: def.envMapIntensity,
    opacity: def.opacity,
  });
  const highQuality = getQuality() === 'high';
  const useTransmission = highQuality && needsTransmission(m);
  const base = textureFor(m.texture);
  const map = useMemo(
    () => (base ? tiledTexture(base, Math.max(w, d), Math.max(h, d)) : null),
    [base, w, h, d]
  );
  // 低画质档位不能用 transmission，退回半透明；两者不能同时开，否则会双重变淡
  const fallback = !highQuality && needsTransmission(m);
  const opacity = useTransmission ? 1 : fallback ? m.fallbackOpacity : m.opacity;

  return (
    <group ref={group} position={typeof def.position === 'string' ? [0, 0, 0] : def.position} rotation={def.rotation ?? [0, 0, 0]}>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={m.color}
          map={map ?? undefined}
          metalness={m.metalness}
          roughness={m.roughness}
          clearcoat={m.clearcoat}
          clearcoatRoughness={m.clearcoatRoughness}
          envMapIntensity={m.envMapIntensity}
          transmission={useTransmission ? m.transmission : 0}
          thickness={m.thickness}
          ior={m.ior}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      {def.emissive ? (
        <mesh geometry={geom}>
          <meshBasicMaterial color={def.color ?? '#8b98a8'} transparent opacity={0.28 * def.emissive} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

/** 静态折线（可带方向箭头） */
function PolylineStatic({ def }: { def: Extract<ObjectDef, { type: 'polyline' }> }) {
  const pts = def.points ?? [];
  const arrows = useMemo(() => {
    if (!def.arrows || pts.length < 2) return [];
    const out: { from: Vec3; to: Vec3 }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const hl = 0.16;
      out.push({
        from: [mid[0] - d.x * hl * 0.5, mid[1] - d.y * hl * 0.5, mid[2] - d.z * hl * 0.5],
        to: [mid[0] + d.x * hl * 0.5, mid[1] + d.y * hl * 0.5, mid[2] + d.z * hl * 0.5],
      });
    }
    return out;
  }, [def.arrows, pts]);

  if (pts.length < 2) return null;

  return (
    <group>
      <Line
        points={pts}
        color={ink(def.color, '#94a3b8')}
        lineWidth={def.width ?? 1.6}
        dashed={def.dashed}
        dashSize={0.12}
        gapSize={0.1}
        transparent
        opacity={0.95}
      />
      {arrows.map((a, i) => (
        <StaticArrow key={i} from={a.from} to={a.to} color={ink(def.color, '#94a3b8')} radius={0.022} />
      ))}
    </group>
  );
}
