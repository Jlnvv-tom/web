'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneSpec } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';
import type { StateRef } from './objects';
import { ObjectView } from './objects';
import { SceneRuntime } from './SceneRuntime';
import { LabelProjector, deriveLabels } from './labels';

/* ============================================================
   程序化环境反射（替代 HDRI 文件，保证零外部资源）
   ============================================================ */
function ProceduralEnv({ intensity = 1 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, '#0a1828');
    g.addColorStop(0.44, '#14384d');
    g.addColorStop(0.5, '#1b6577');
    g.addColorStop(0.58, '#0b1e2e');
    g.addColorStop(1.0, '#02060c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);

    const blobs: [number, number, number, string][] = [
      [180, 150, 210, 'rgba(120,235,255,0.85)'],
      [640, 110, 250, 'rgba(255,196,130,0.55)'],
      [880, 330, 190, 'rgba(120,170,255,0.4)'],
      [400, 400, 160, 'rgba(255,130,90,0.25)'],
    ];
    for (const [x, y, r, col] of blobs) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    pmrem.dispose();
    tex.dispose();

    return () => {
      env.dispose();
      scene.environment = null;
    };
  }, [gl, scene, intensity]);

  return null;
}

/* ============================================================
   灯光
   ============================================================ */
function Lights() {
  return (
    <>
      <hemisphereLight args={['#2c4f68', '#080c12', 1.0]} />
      <directionalLight position={[9, 15, 12]} intensity={2.1} color="#ffffff" />
      <directionalLight position={[-10, 7, -13]} intensity={1.2} color="#7dd3fc" />
      <directionalLight position={[6, -6, 8]} intensity={0.5} color="#ffb27a" />
      <pointLight position={[-8, 3, 5]} intensity={26} distance={30} decay={2} color="#22d3ee" />
      <pointLight position={[8, -3, -5]} intensity={16} distance={28} decay={2} color="#ff8a3d" />
    </>
  );
}

/* ============================================================
   后处理：UnrealBloom（用 three 自带的 addons，不引第三方包）
   ============================================================ */
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

function PostFX({
  strength = 0.62,
  radius = 0.55,
  threshold = 0.6,
}: {
  strength?: number;
  radius?: number;
  threshold?: number;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), strength, radius, threshold);
    c.addPass(bloom);
    c.addPass(new OutputPass());
    c.setSize(size.width, size.height);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size.width, size.height]);

  // priority > 0 会接管渲染循环，R3F 的自动渲染随之关闭
  useFrame((_, dt) => {
    composer.render(dt);
  }, 1);

  return null;
}

/* ============================================================
   氛围：雾 + 漂浮尘埃（纯程序化，零外部资源）
   ============================================================ */
let dustTex: THREE.Texture | null = null;
function getDustTexture() {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(190,240,255,0.9)');
  g.addColorStop(0.4, 'rgba(120,200,240,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dustTex = new THREE.CanvasTexture(c);
  dustTex.colorSpace = THREE.SRGBColorSpace;
  return dustTex;
}

const DUST_COUNT = 700;

/**
 * 漂浮尘埃。
 *
 * `size` 必须随场景尺度缩放：屏幕上的视觉大小 ∝ size / 相机距离，
 * 所以 size 与相机距离成正比时，"尘埃有多大"在所有场景里是一致的。
 * 早先写死 0.42，在 20 m 的电场场景里是细雪，在 1 m 的单摆场景里
 * 变成糊满全屏的散景圆斑，把主体完全盖住——这就是典型的"看起来像 bug 的默认值"。
 */
function SceneDust({ spread = 90, size = 0.42 }: { spread?: number; size?: number }) {
  const points = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(DUST_COUNT * 3);
    const sp = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      sp[i] = 0.15 + Math.random() * 0.5;
    }
    return { positions: pos, speeds: sp };
  }, [spread]);

  useFrame((_, dt) => {
    const p = points.current;
    if (!p) return;
    const arr = p.geometry.attributes.position as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < DUST_COUNT; i++) {
      a[i * 3 + 1] += speeds[i]! * step;
      // 缓慢横移，制造悬浮感
      a[i * 3] += Math.sin(a[i * 3 + 1] * 0.3 + i) * 0.004;
      if (a[i * 3 + 1] > spread * 0.3) a[i * 3 + 1] = -spread * 0.3;
    }
    arr.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        map={getDustTexture()}
        color="#8fd8f0"
        transparent
        opacity={0.34}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* ============================================================
   高亮 / 淡化包装
   ============================================================ */
function HighlightGroup({
  highlighted,
  active,
  children,
  onClick,
}: {
  highlighted: boolean;
  active: boolean;
  children: React.ReactNode;
  onClick?: (e: { stopPropagation: () => void }) => void;
}) {
  const ref = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat.userData._orig) {
          mat.userData._orig = { op: mat.opacity, tr: mat.transparent };
        }
        if (active && !highlighted) {
          mat.transparent = true;
          mat.opacity = Math.min(mat.userData._orig.op, 0.14);
        } else {
          mat.transparent = mat.userData._orig.tr;
          mat.opacity = mat.userData._orig.op;
        }
        mat.needsUpdate = true;
      }
    });
  }, [highlighted, active]);

  return (
    <group ref={ref} onClick={onClick}>
      {children}
    </group>
  );
}

/* ============================================================
   场景内容（订阅 stepIndex，仅在切换讲解步骤时重渲染）
   ============================================================ */
function SceneObjects({ spec, store, stateRef }: { spec: SceneSpec; store: PlayerStoreApi; stateRef: StateRef }) {
  const stepIndex = store((s) => s.stepIndex);
  const selectedId = store((s) => s.selectedId);

  const highlighted = useMemo(() => {
    const set = new Set<string>();
    if (stepIndex >= 0) {
      const step = spec.script[stepIndex];
      step?.highlight?.forEach((id) => set.add(id));
    }
    if (selectedId) set.add(selectedId);
    return set;
  }, [stepIndex, selectedId, spec.script]);

  const active = highlighted.size > 0;

  return (
    <>
      {spec.objects.map((def) => (
        <HighlightGroup
          key={def.id}
          highlighted={highlighted.has(def.id)}
          active={active}
          onClick={(e) => {
            e.stopPropagation();
            const st = store.getState();
            st.select(st.selectedId === def.id ? null : def.id);
          }}
        >
          <ObjectView def={def} stateRef={stateRef} />
        </HighlightGroup>
      ))}
    </>
  );
}

/* ============================================================
   Canvas
   ============================================================ */
export function SceneCanvas({
  spec,
  store,
  stateRef,
  interactive = true,
}: {
  spec: SceneSpec;
  store: PlayerStoreApi;
  stateRef: StateRef;
  interactive?: boolean;
}) {
  const gridSize = spec.world.gridSize ?? 40;
  const maxDist = Math.max(gridSize * 1.6, 30);

  // 场景尺度差异极大（电容器只有 0.3 m，电场场景有 24 m），
  // 雾、尘埃、缩放下限都必须按相机距离缩放，否则小场景会被雾吞掉、无法放大。
  const camDist = useMemo(() => {
    const [x, y, z] = spec.camera.position;
    const [tx, ty, tz] = spec.camera.target;
    return Math.max(0.2, Math.hypot(x - tx, y - ty, z - tz));
  }, [spec.camera.position, spec.camera.target]);

  const [labelHost, setLabelHost] = useState<HTMLDivElement | null>(null);
  const labelsVisible = store((s) => s.labelsVisible);
  const labels = useMemo(() => deriveLabels(spec), [spec]);

  // 窄屏（手机）关闭泛光：GPU 预算优先给帧率，画面靠氛围层补
  const [bloom, setBloom] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 700
  );
  useEffect(() => {
    const onResize = () => setBloom(window.innerWidth >= 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        frameloop="always"
        camera={{
          position: spec.camera.position,
          fov: spec.camera.fov ?? 45,
          near: 0.05,
          far: 800,
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <ProceduralEnv />
        <Lights />
        {/* 雾：让远处元素自然退到暗部，画面有纵深（范围随场景尺度缩放） */}
        <fog attach="fog" args={['#04070d', camDist * 0.55, camDist * 3.6]} />
        <SceneDust
          spread={Math.min(90, Math.max(6, camDist * 1.6))}
          size={Math.min(2.2, Math.max(0.012, camDist * 0.035))}
        />
        {bloom ? <PostFX /> : null}
        <SceneRuntime spec={spec} store={store} stateRef={stateRef} />
        <SceneObjects spec={spec} store={store} stateRef={stateRef} />
        <LabelProjector labels={labels} stateRef={stateRef} host={labelHost} visible={labelsVisible} />
        <OrbitControls
          makeDefault
          enabled={interactive}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.75}
          zoomSpeed={0.9}
          panSpeed={0.7}
          minDistance={Math.max(0.06, camDist * 0.22)}
          maxDistance={maxDist}
          maxPolarAngle={Math.PI - 0.05}
        />
      </Canvas>

      {/* 3D 标签的 DOM 覆盖层（不参与 React 渲染，由 LabelProjector 逐帧定位） */}
      <div ref={setLabelHost} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* 暗角：压住四角，把注意力收到画面中心 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 42%, rgba(2,5,10,0.55) 78%, rgba(1,3,7,0.9) 100%)',
        }}
      />
    </div>
  );
}
