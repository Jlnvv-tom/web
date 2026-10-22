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
import { STAGE_DEFAULTS, StageBackdrop, StageLights, TableTop } from './Stage';

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
function SceneDust({
  spread = 90,
  size = 0.42,
  color = '#8fd8f0',
  opacity = 0.34,
}: {
  spread?: number;
  size?: number;
  color?: string;
  opacity?: number;
}) {
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
        color={color}
        transparent
        opacity={opacity}
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
  pulse,
  squash = 0.07,
}: {
  highlighted: boolean;
  active: boolean;
  children: React.ReactNode;
  onClick?: (e: { stopPropagation: () => void }) => void;
  /** 参数变化脉冲源。传了才做挤压反馈（只有"主角"需要） */
  pulse?: () => number;
  /** 挤压幅度 */
  squash?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const [hovered, setHovered] = useState(false);

  /* 手感状态：hover 的抬升是缓动，点击/改参是弹簧 */
  const lift = useRef(1);
  const spring = useRef({ x: 0, v: 0 });
  const lastPulse = useRef(0);

  /**
   * 光标直接写在事件里，不用 effect。
   *
   * 用 effect 时出现过"点了有反应、hover 却没有光标"：`onPointerOver`
   * 只在"进入对象"的那一帧触发，而 R3F 的重渲染可能把这次进入状态吃掉。
   * 直接在事件回调里写 DOM 样式，绕过 React 的调度，行为立刻可预测。
   */
  const setHover = (on: boolean) => {
    if (on) setHovered(true);
    gl.domElement.style.cursor = on ? 'pointer' : '';
  };

  useEffect(() => {
    return () => {
      gl.domElement.style.cursor = '';
    };
  }, [gl]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;

    // 参数脉冲：连续拖动时每次都重新触发，而不是"一直保持变形"
    if (pulse) {
      const n = pulse();
      if (n !== lastPulse.current) {
        lastPulse.current = n;
        spring.current.x = -0.85;
        spring.current.v = 0;
      }
    }

    // 阻尼弹簧：k=260 / c=11 时约 200 ms 收敛，且有约 30% 的过冲（有"弹"的观感）
    const d = Math.min(dt, 0.05);
    const s = spring.current;
    s.v += (-260 * s.x - 11 * s.v) * d;
    s.x += s.v * d;
    s.x = Math.max(-1.5, Math.min(1.5, s.x));

    // hover 抬升走缓动，不用弹簧（否则鼠标划过会一直抖）
    const targetLift = hovered ? 1.025 : 1;
    lift.current += (targetLift - lift.current) * Math.min(1, d * 16);

    // 挤压：y 变扁、xz 变胖，体积感才对
    const q = s.x * squash;
    const L = lift.current;
    g.scale.set(L * (1 - q * 0.45), L * (1 + q), L * (1 - q * 0.45));
  });

  /** 点击：给弹簧一个初始位移，让它自己回弹（1 → 0.93 → 1.02 → 1） */
  const kick = () => {
    spring.current.x = -1;
    spring.current.v = 0;
  };

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
    <group
      ref={ref}
      onClick={(e) => {
        kick();
        onClick?.(e);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      // 兜底：某些浏览器/几何体上 pointerover 不触发，但 pointermove 一定触发
      onPointerMove={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      {children}
    </group>
  );
}

/* ============================================================
   场景内容（订阅 stepIndex，仅在切换讲解步骤时重渲染）
   ============================================================ */
function SceneObjects({
  spec,
  store,
  stateRef,
  hideGrid = false,
}: {
  spec: SceneSpec;
  store: PlayerStoreApi;
  stateRef: StateRef;
  /** 有展台时不再画线框网格：网格画在 y=0 会浮在台面中间，比没有更难解释 */
  hideGrid?: boolean;
}) {
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
      {spec.objects
        .filter((def) => !(hideGrid && def.type === 'grid'))
        .map((def) => (
        <HighlightGroup
          key={def.id}
          highlighted={highlighted.has(def.id)}
          active={active}
          // 只有场景声明的"主角"对参数变化做挤压，其余物体保持静止
          pulse={
            def.id === spec.decor?.subject ? () => store.getState().paramPulse.n : undefined
          }
          squash={spec.decor?.squash}
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

  /* ---------- 展台（M3 · W1）：不写 world.stage 时行为与 M2 完全一致 ---------- */
  const stage = spec.world.stage;
  const staged = stage?.kind === 'table';
  const stageHalf = stage?.size ?? camDist * 0.85;
  const stageY = stage?.y ?? 0;
  // 不写 surface 时用材质预设自己的色（木纹预设的色比纯色更暖一点）
  const stageSurface = stage?.surface;
  const stageBackdrop = stage?.backdrop ?? STAGE_DEFAULTS.backdrop;
  // 阴影是新的 GPU 开销，默认开启但允许场景关掉（低端机/平板）
  const shadowsOn = staged && (stage?.shadows ?? true);

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

  /**
   * 入场转场（M3 · W3）。
   *
   * 场景切换是整页导航，没有共享的 3D 上下文可以插值，所以用"淡入 + 3% 推近"
   * 模拟镜头推进：180 ms，和参考站那种"画面原地长出来"的观感一致。
   * 这是纯 CSS，不占 GPU，也不影响 canvas 的渲染循环。
   */
  const [entered, setEntered] = useState(false);
  const motionOk = useMemo(() => {
    try {
      return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [spec.meta.id]);

  return (
    <div
      className="relative h-full w-full"
      style={
        motionOk
          ? {
              opacity: entered ? 1 : 0,
              transform: entered ? 'scale(1)' : 'scale(1.03)',
              transition: 'opacity 180ms ease-out, transform 180ms ease-out',
            }
          : undefined
      }
    >
      <Canvas
        dpr={[1, 2]}
        frameloop="always"
        shadows={shadowsOn ? 'soft' : false}
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
          // 台面变亮后要压回曝光，否则高光整片糊掉
          gl.toneMappingExposure = staged ? 0.86 : 1.15;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        {staged ? <StageBackdrop color={stageBackdrop} /> : null}
        {/* 展台场景压暗环境反射：暖光环境里不该有青蓝色反光 */}
        <ProceduralEnv intensity={staged ? 0.55 : 1} />
        {staged ? <StageLights half={stageHalf} y={stageY} /> : <Lights />}
        {/* 雾：让远处元素自然退到暗部，画面有纵深（范围随场景尺度缩放） */}
        <fog
          attach="fog"
          args={
            staged
              ? [stageBackdrop, camDist * 2.2, camDist * 9]
              : ['#04070d', camDist * 0.55, camDist * 3.6]
          }
        />
        {staged ? <TableTop
          y={stageY}
          half={stageHalf}
          surface={stageSurface}
          material={stage?.material ?? 'wood'}
          contact={stage?.contact}
        /> : null}
        <SceneDust
          spread={Math.min(90, Math.max(6, camDist * 1.6))}
          size={Math.min(2.2, Math.max(0.012, camDist * 0.035))}
          color={staged ? '#FFE7C4' : '#8fd8f0'}
          opacity={staged ? 0.16 : 0.34}
        />
        {bloom ? (
          <PostFX
            strength={staged ? 0.16 : 0.62}
            threshold={staged ? 0.86 : 0.6}
            radius={staged ? 0.35 : 0.55}
          />
        ) : null}
        <SceneRuntime spec={spec} store={store} stateRef={stateRef} />
        <SceneObjects spec={spec} store={store} stateRef={stateRef} hideGrid={staged} />
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

      {/* 暗角：压住四角，把注意力收到画面中心。
          展台场景改用暖色半透明：冷黑暗角压在暖台面上会像"镜头上蒙了脏东西" */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          // 展台场景几乎不要暗角：实测顶部被 0.62 的黑压到 L=0.046，
          // 而背景本身是 0.094——"暗部占比"一直降不下来，元凶是这层 CSS 而不是 3D。
          // 深色科技风需要暗角收边，暖色展台不需要（参考站也没有）。
          background: staged
            ? 'radial-gradient(ellipse at 50% 44%, rgba(0,0,0,0) 62%, rgba(20,15,10,0.10) 84%, rgba(14,10,7,0.26) 100%)'
            : 'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 42%, rgba(2,5,10,0.55) 78%, rgba(1,3,7,0.9) 100%)',
        }}
      />
    </div>
  );
}
