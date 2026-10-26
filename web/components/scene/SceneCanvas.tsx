'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { SceneSpec } from '@/engine/spec';
import type { PlayerStoreApi } from '@/engine/store';
import { BLOOM_THRESHOLD, CANVAS_BACKDROP as CANVAS_BACKDROP_LIGHT } from '@/engine/palette';
import type { StateRef } from './objects';
import { ObjectView } from './objects';
import { SceneRuntime } from './SceneRuntime';
import { LabelProjector, deriveLabels } from './labels';
import { STAGE_DEFAULTS, StageBackdrop, StageLights, TableTop } from './Stage';
import { getQuality } from './quality';
import {
  RENDER_POLICY,
  createGovernor,
  pushFrame,
  setQuality,
  type GovernorState,
  type Quality,
} from '@/engine/perf';
import {
  IntroContext,
  INTRO_DEFAULT_DURATION,
  advanceIntro,
  makeIntro,
  useIntro,
  type IntroState,
} from './intro';

/** 非展台场景的画布底板：比页面（#f6f3ee）深一档，比展台背景再深一档 */
/** 非展台场景的画布底板。
 *
 *  近白，不是中间调。实测结论（完整推导见 engine/palette.ts 顶部）：
 *  中间调底板 #8E8574 上要达到 4.5:1，前景相对亮度必须 ≤0.014（近纯黑），
 *  所有 700 档语义色在它上面只有 1.35–2.09:1 —— 要么违反对比度，
 *  要么把红/青/绿全压成近黑、毁掉色相编码。中间调是对比度最差的底板：
 *  对亮色不够暗，对暗色不够亮。
 *  换成近白后同批颜色 4.45–7.19:1，全部达标。 */
const CANVAS_BACKDROP = CANVAS_BACKDROP_LIGHT;

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
    // 浅色模式（2026-10-22）：原来的冷蓝夜空会反射成"金属发蓝"，
    // 在白底页面上很脏。换成暖白室内光 —— 上亮下暗，像一盏顶灯照着的桌面。
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, '#fffaf2');
    g.addColorStop(0.42, '#f3ece0');
    g.addColorStop(0.52, '#e7ddcc');
    g.addColorStop(0.62, '#d9cdb9');
    g.addColorStop(1.0, '#c9bda8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);

    // 柔和的光斑：给金属/玻璃一点可反射的东西，否则清一色哑光
    const blobs: [number, number, number, string][] = [
      [180, 120, 240, 'rgba(255,252,244,0.95)'],
      [640, 90, 260, 'rgba(255,240,214,0.75)'],
      [880, 300, 200, 'rgba(226,240,246,0.5)'],
      [400, 380, 170, 'rgba(214,196,168,0.45)'],
    ];
    for (const [x, y, r, col] of blobs) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
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

   浅色模式（2026-10-22）：原来是"深空 + 霓虹点光"，
   白底下霓虹点光会把物体染成一块块彩色。
   改成"室内顶光 + 微弱冷暖补光"，方向光承担造型，点光只做点缀。
   ============================================================ */
function Lights() {
  return (
    <>
      <hemisphereLight args={['#fffaf0', '#b8ac97', 0.55]} />
      <directionalLight position={[9, 15, 12]} intensity={2.9} color="#ffffff" />
      <directionalLight position={[-10, 7, -13]} intensity={0.9} color="#dbeafe" />
      <directionalLight position={[6, -6, 8]} intensity={0.45} color="#ffe4c4" />
      <pointLight position={[-8, 3, 5]} intensity={9} distance={30} decay={2} color="#a5f3fc" />
      <pointLight position={[8, -3, -5]} intensity={6} distance={28} decay={2} color="#fed7aa" />
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
  scale = 1,
}: {
  strength?: number;
  radius?: number;
  threshold?: number;
  /**
   * 泛光缓冲相对画布的分辨率比例（M3.5 · W2）。
   * 泛光是多 pass 的全屏模糊，代价随像素数平方增长；
   * 0.5 等于只要 1/4 像素，观感几乎不变（它本来就是低频光晕）。
   */
  scale?: number;
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
    // 半分辨率：composer 的渲染目标降到 50%，OutputPass 会贴回全屏。
    // 顺序不能反：setPixelRatio 内部会用上次的 size 重算，必须在 setSize 之前。
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width * scale, size.height * scale);
  }, [composer, size.width, size.height, scale, gl]);

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
  // 中性白：颜色完全由 SceneDust 的 color 决定。
  // 原来这里烤了一层青色，深色模式下看不出来，浅色模式下会变成灰绿色的脏点。
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dustTex = new THREE.CanvasTexture(c);
  dustTex.colorSpace = THREE.SRGBColorSpace;
  return dustTex;
}

/**
 * 漂浮尘埃（M3.5 · W1.2：CPU 逐帧 → GPU 着色器）
 *
 * 旧实现每帧在 JS 里遍历 700 个粒子、改 position 数组、整块上传：
 * 60fps × 8400 字节 = 每秒 500KB 无谓上传，而且这些粒子只是"光里的灰尘"，
 * 根本不参与任何物理量。现在漂移写进顶点着色器，每帧只更新一个 `uTime` uniform。
 *
 * `size` 必须随场景尺度缩放：屏幕上的视觉大小 ∝ size / 相机距离，
 * 所以 size 与相机距离成正比时，"尘埃有多大"在所有场景里是一致的。
 * 早先写死 0.42，在 20 m 的电场场景里是细雪，在 1 m 的单摆场景里
 * 变成糊满全屏的散景圆斑，把主体完全盖住——这就是典型的"看起来像 bug 的默认值"。
 */
function SceneDust({
  count = 700,
  spread = 90,
  size = 0.42,
  color = '#8fd8f0',
  opacity = 0.34,
  additive = true,
}: {
  count?: number;
  spread?: number;
  size?: number;
  color?: string;
  opacity?: number;
  /** 深色底用叠加（亮点），浅色底用普通混合（暗点） */
  additive?: boolean;
}) {
  const uTime = useMemo(() => ({ value: 0 }), []);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
      speed[i] = 0.15 + Math.random() * 0.5;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    // 位置每帧在着色器里变，包围球没意义
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), spread);
    return g;
  }, [count, spread]);

  const material = useMemo(() => {
    const m = new THREE.PointsMaterial({
      size,
      map: getDustTexture(),
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSpread = { value: spread };
      shader.vertexShader =
        'uniform float uTime;\nuniform float uSpread;\nattribute float aSpeed;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          [
            'vec3 transformed = vec3( position );',
            // 与原 CPU 版同口径：y 在 ±0.3·spread 之间循环上升
            'float span = uSpread * 0.6;',
            'transformed.y = mod( position.y + uTime * aSpeed + span * 0.5, span ) - span * 0.5;',
            // 缓慢横移（原来是每帧 +0.004，帧率相关；这里改成有界振荡）
            'transformed.x += sin( uTime * 0.45 + aSpeed * 37.0 ) * 0.25;',
          ].join('\n')
        );
    };
    // 不同 material 共用同一份着色器源码，缓存键要显式区分
    m.customProgramCacheKey = () => 'scene-dust-v1';
    return m;
  }, [size, color, opacity, additive, spread, uTime]);

  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    uTime.value += Math.min(dt, 0.05);
  });

  return <points geometry={geom} material={material} frustumCulled={false} />;
}

/* ============================================================
   压暗下限（M3.5 · W3.0）
   ============================================================ */

/**
 * "聚焦某一步"时，其余物体压到多暗。
 *
 * 旧值 0.14 是照深色底调的：深底上 0.14 的线还看得出轮廓。
 * 近白底上同样的 0.14 等于把物理量擦掉——实测抛体场景 t=3.9s（第 0 步只高亮 v），
 * 整条轨迹、vₓ、v_y、地面网格全变成"灰纸上的水痕"，而唯一高亮的 v
 * 只有 2px 宽。10 秒测试看到的就是"没内容"。
 *
 * 按图元类型给不同下限，而不是按场景 id 特判（宪法第六条）：
 * - 结构线（网格/轴）：0.16，本来就该退到背景里；
 * - 物理量（轨迹/矢量/读数相关）：0.42，退一档但仍可读。
 */
const DIM_FLOOR: Record<string, number> = {
  default: 0.42,
  grid: 0.16,
  axis: 0.2,
};

/* ============================================================
   画质分档的两个执行器（M3.5 · W2）
   ============================================================ */

/**
 * 帧率探针：把真实帧间隔喂给长官僚，档位变化时回调。
 *
 * 放在 Canvas 内部是因为 `useFrame` 的 delta 才是"这台机器此刻跑一格要多久"；
 * 放在外面只能用 rAF，拿不到 three 的渲染耗时占比。
 */
function FrameProbe({ governor, onChange }: { governor: GovernorState; onChange: (q: Quality) => void }) {
  /** 上一次帧之前页面是否被隐藏过（切标签页/锁屏）——只有这种大帧才该被丢弃 */
  const wasHidden = useRef(false);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') wasHidden.current = true;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useFrame((_, dt) => {
    const gap = wasHidden.current;
    wasHidden.current = false;
    if (pushFrame(governor, dt * 1000, gap)) onChange(governor.quality);
  });
  return null;
}

/**
 * 阴影档位执行器。
 *
 * 为什么不直接改 `<Canvas shadows>`：R3F 的 shadows 只在建上下文时生效，
 * 运行中改 prop 不会重建 shadow map。这里直接操作 renderer 与灯的 shadow，
 * 并且**在开关翻转时把全场材质标脏**——`shadowMapEnabled` 在 program 缓存键里，
 * 不标脏会留下仍在采样旧阴影贴图的 shader（画面会出现一块块死黑）。
 */
function ShadowRig({ enabled, size }: { enabled: boolean; size: 1024 | 512 | 0 }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const last = useRef<{ enabled: boolean; size: number } | null>(null);

  useEffect(() => {
    // 值没变就什么都不做：挂载时无条件标脏会让每个材质再编译一次，
    // 实测 buoyancy（玻璃透射 + 阴影）因此多出约 3 秒的"每帧 33ms"。
    if (last.current && last.current.enabled === enabled && last.current.size === size) return;
    last.current = { enabled, size };

    gl.shadowMap.enabled = enabled;
    // three 0.186 起 PCFSoftShadowMap 已被移除（设置它会打印弃用警告并回退），
    // 所以三档只区分**贴图尺寸**，不区分滤波类型。
    if (enabled) gl.shadowMap.type = THREE.PCFShadowMap;
    scene.traverse((o) => {
      const light = o as THREE.Light & { shadow?: THREE.LightShadow };
      if (light.isLight && light.shadow) {
        const sh = light.shadow;
        if (size > 0 && sh.mapSize.width !== size) {
          sh.mapSize.set(size, size);
          sh.map?.dispose();
          // three 在 map === null 且 needsUpdate 时会重新申请贴图
          sh.map = null;
        }
        sh.needsUpdate = true;
      }
      const m = (o as THREE.Mesh).material;
      if (m) {
        for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      }
    });
  }, [enabled, size, gl, scene]);

  return null;
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
  dimGrace = 0,
  dimFloor = DIM_FLOOR.default,
}: {
  highlighted: boolean;
  active: boolean;
  children: React.ReactNode;
  onClick?: (e: { stopPropagation: () => void }) => void;
  /** 参数变化脉冲源。传了才做挤压反馈（只有"主角"需要） */
  pulse?: () => number;
  /** 挤压幅度 */
  squash?: number;
  /** 压暗宽限（秒）。Infinity = 跟随 intro 状态；0 = 即时压暗（旧路径） */
  dimGrace?: number;
  /** 压暗后的不透明度下限（按图元类型给，见 DIM_FLOOR） */
  dimFloor?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const [hovered, setHovered] = useState(false);

  // 开场演出状态（W4 任务 4.5）：演出窗口内不压暗，结束后再把压暗淡入
  const intro = useIntro();

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

    // 宽限窗倒计时（仅无 intro 场景走这条；intro 场景由 intro.current.active 驱动）
    if (graceLeft.current !== Infinity && graceLeft.current > 0) {
      graceLeft.current = Math.max(0, graceLeft.current - d);
    }
    const inGrace = intro.current.active || graceLeft.current > 0;

    // 宽限结束后的压暗淡入（任务 4.5）；ramp 完成后本块零开销。
    // kill-switch 必须等宽限结束才生效：store 初始 stepIndex=-1，挂载头几帧
    // active=false，若此时就杀掉 ramp，第 0 步高亮生效后压暗将永远不落地。
    if (!ramp.current.done && !inGrace) {
      if (!(active && !highlighted)) {
        ramp.current.done = true; // 本对象不需要压暗，ramp 永久跳过
      } else {
        ramp.current.p = Math.min(1, ramp.current.p + d / 0.35);
        applyDimState(1 - (1 - ramp.current.p) ** 3);
        if (ramp.current.p >= 1) ramp.current.done = true;
      }
    }
  });

  /** 点击：给弹簧一个初始位移，让它自己回弹（1 → 0.93 → 1.02 → 1） */
  const kick = () => {
    spring.current.x = -1;
    spring.current.v = 0;
  };

  /**
   * 材质清单缓存（M3.5 · W1.5）
   *
   * 旧实现每次调用都 `traverse` 整棵子树，并且**每帧**把每个材质 `needsUpdate = true`。
   * 后者很贵：`needsUpdate` 会递增 material.version，渲染器随即重新走一遍
   * program 缓存判定——0.35s 的压暗淡入里，每帧、每个材质都来一次。
   *
   * 现在：挂载时遍历一次收集材质；透明度照旧逐帧写；
   * `needsUpdate` 只在 `transparent` **真的翻转**时置一次（它影响混合与排序）。
   */
  const mats = useRef<(THREE.MeshStandardMaterial & { userData: Record<string, unknown> })[]>([]);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    const list: typeof mats.current = [];
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const arr = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of arr) {
        const mat = m as THREE.MeshStandardMaterial & { userData: Record<string, unknown> };
        if (!mat.userData._orig) {
          mat.userData._orig = { op: mat.opacity, tr: mat.transparent };
        }
        list.push(mat);
      }
    });
    mats.current = list;
  }, []);

  /**
   * 按混合系数写入压暗态：p=0 全亮（不压暗），p=1 完全压暗（opacity 0.14）。
   *
   * `__dim` 标记给 applyIntroAlpha 用（"收尾要还原到压暗值而不是基准值"）。
   * 任务 4.5 之后压暗与演出不再同时存在——演出窗口内 p 恒 0，标记只在
   * 演出结束后才被写上，min(__dim) 分支保留为防御。
   */
  const applyDimState = (p: number) => {
    const dimming = active && !highlighted && p > 0;
    for (const mat of mats.current) {
      const orig = mat.userData._orig as { op: number; tr: boolean };
      if (dimming) {
        const dimOp = Math.min(orig.op, dimFloor);
        mat.userData.__dim = dimOp;
        mat.opacity = orig.op + (dimOp - orig.op) * p;
      } else {
        delete mat.userData.__dim;
        mat.opacity = orig.op;
      }
      const wantTr = dimming ? true : orig.tr;
      if (mat.transparent !== wantTr) {
        mat.transparent = wantTr;
        mat.needsUpdate = true;
      }
    }
  };

  /**
   * 压暗的时机（W4 任务 4.5；实测来源：多数场景第 0 步就带 highlight，
   * 旧实现里开场 1.6s 物体全在 0.14 压暗态——开场演出等于在灰画里演）：
   * - 宽限窗内（intro 生效中，或无 intro 场景的前 1.6s）不压暗；
   * - 宽限结束后由 useFrame 的 ramp 把压暗在 ~0.35s 内淡入（从全亮突跳
   *   到 0.14 会像故障）；
   * - reduced-motion（dimGrace=0）/ 播放中的步骤切换：即时压暗（老路径）。
   */
  const graceLeft = useRef(dimGrace);
  const ramp = useRef({ done: !(intro.current.active || dimGrace > 0), p: 0 });

  useLayoutEffect(() => {
    if (intro.current.active || graceLeft.current > 0) {
      applyDimState(0);
      return;
    }
    ramp.current.done = true;
    applyDimState(1);
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

  // 开场演出（W4）：时钟归 SceneObjects 所有——它只驱动 mesh 变换，
  // 不进 store、不进 solver（宪法第五条）。每帧推进，结束后快路径零开销。
  const intro = useRef<IntroState>(
    makeIntro(spec.decor?.intro?.kind, spec.decor?.intro?.duration)
  );
  useFrame((_, delta) => advanceIntro(intro.current, Math.min(delta, 0.05)));

  return (
    <IntroContext.Provider value={intro}>
      {spec.objects
        .filter((def) => !(hideGrid && def.type === 'grid'))
        .map((def) => (
        <HighlightGroup
          key={def.id}
          highlighted={highlighted.has(def.id)}
          active={active}
          /*
           * 压暗宽限窗（任务 4.5）：第 0 步就带 highlight 的场景不该把开场变成灰画。
           * - intro 生效中：宽限 = 演出时长（压暗等演出结束）
           * - 声明了 intro 但被 reduced-motion 关掉：0（保持旧路径即时压暗，A 门零回归）
           * - 没声明 intro：默认 1.6s 宽限（与演出时长同源）
           */
          dimGrace={
            intro.current.active
              ? Infinity
              : spec.decor?.intro?.kind
                ? 0
                : INTRO_DEFAULT_DURATION
          }
          dimFloor={DIM_FLOOR[def.type] ?? DIM_FLOOR.default}
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
          <ObjectView def={def} stateRef={stateRef} subjectId={spec.decor?.subject} />
        </HighlightGroup>
      ))}
    </IntroContext.Provider>
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

  /* ---------- 画质：静态分档起步，运行时长官接管（M3.5 · W2） ---------- */
  const governor = useRef<GovernorState | null>(null);
  if (!governor.current) {
    const seeded = typeof window === 'undefined' ? 'high' : getQuality();
    governor.current = createGovernor(seeded);
  }
  const [quality, setQ] = useState<Quality>(governor.current.quality);
  const policy = RENDER_POLICY[quality];

  /** 降档提示只弹一次（用户点了"保持"或"恢复"就不再打扰） */
  const [notice, setNotice] = useState<Quality | null>(null);

  /** `?nofx=1` 关掉后处理，用来分辨"颜色不对"是材质问题还是泛光把背景当高光 */
  const [fxOff] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nofx')
  );

  useEffect(() => {
    document.documentElement.dataset.quality = quality;
  }, [quality]);

  const applyQuality = (q: Quality, lock = false) => {
    if (!governor.current) return;
    setQuality(governor.current, q, lock);
    setQ(q);
    setNotice(null);
  };

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
        dpr={policy.dpr}
        frameloop="always"
        shadows={shadowsOn}
        camera={{
          position: spec.camera.position,
          fov: spec.camera.fov ?? 45,
          near: 0.05,
          far: 800,
        }}
        gl={{
          // 抗锯齿是建上下文参数，运行中改不了（改了要重建 context），所以只读一次
          antialias: RENDER_POLICY[governor.current.quality].antialias,
          alpha: true,
          powerPreference: 'high-performance',
          // 关掉：没有任何代码读 drawingBuffer（全仓无 toDataURL），
          // 开着等于每帧让驱动多存一份全屏像素。移动端这是实打实的带宽。
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          // 浅色模式下整体曝光要压一点：白底已经很亮，
          // 再按深色模式的 1.15 曝光，台面与物体会一起糊成一片白。
          gl.toneMappingExposure = staged ? 0.7 : 0.78;
          gl.outputColorSpace = THREE.SRGBColorSpace;

          // `?diag=1`：把渲染器统计暴露给 scripts/diag_fps.py。
          // 只在这个参数下挂，普通用户拿不到任何全局句柄。
          if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('diag')) {
            (window as unknown as Record<string, unknown>).__p3d = {
              gl,
              scene,
              camera,
              governor: () => governor.current,
              policy: () => RENDER_POLICY[governor.current!.quality],
            };
          }
        }}
      >
        {/* 浅色模式下**所有**场景都要有画布底板。
            原来是透明画布 + 页面深色背景充当"虚空"来框住内容；
            页面变浅后透明画布会让 3D 内容直接漂在白纸上，细线几乎看不见。
            给一块比页面略深、比台面略浅的底板，层次才立得住。 */}
        <StageBackdrop color={staged ? stageBackdrop : CANVAS_BACKDROP} />
        {/* 展台场景压暗环境反射：暖光环境里不该有青蓝色反光 */}
        <ProceduralEnv intensity={staged ? 0.55 : 1} />
        {staged ? <StageLights half={stageHalf} y={stageY} /> : <Lights />}
        {/* 雾：让远处元素自然退到背景色，画面有纵深（范围随场景尺度缩放） */}
        <fog
          attach="fog"
          args={
            staged
              ? [stageBackdrop, camDist * 2.2, camDist * 9]
              : ['#efe9e0', camDist * 0.55, camDist * 3.6]
          }
        />
        {staged ? <TableTop
          y={stageY}
          half={stageHalf}
          surface={stageSurface}
          material={stage?.material ?? 'wood'}
          contact={stage?.contact}
        /> : null}
        {/* 尘埃：浅色下改用普通混合的暗色微粒。
            原来是叠加混合的亮点，在白底上等于不存在；换成暗点才像"光里的灰尘" */}
        {policy.dust > 0 ? (
          <SceneDust
            count={policy.dust}
            spread={Math.min(90, Math.max(6, camDist * 1.6))}
            size={Math.min(2.2, Math.max(0.012, camDist * 0.035))}
            color={staged ? '#8a7a63' : '#9a8f80'}
            opacity={staged ? 0.2 : 0.22}
            additive={false}
          />
        ) : null}
        {policy.bloom !== 'off' && !fxOff ? (
          <PostFX
            /**
             * 阈值的硬约束：**必须高于画布底板自身的亮度**（M3.5 · W3.0 实测）
             *
             * 底板 #faf8f4 的线性亮度约 0.955、台面 #f5f1ea 约 0.93。
             * 旧阈值 0.88 / 0.94 都在底板之下，于是整个背景被泛光 pass 当成高光，
             * 全屏叠了一层白纱：实测抛体场景轨迹的峰值像素从 (143,190,199)
             * 被冲成 (222,225,226)（相当于 42% 不透明度的线只显示出 9%）。
             * 这不是"颜色不好看"，是**读数被擦掉**——而"墨迹占比 0.3%"这个
             * 反复出现的老结论，有一半是这层白纱造成的。
             *
             * 现在阈值抬到底板之上，只让真正的高光（金属反光、发光体）溢出。
             */
            strength={staged ? 0.1 : 0.2}
            threshold={BLOOM_THRESHOLD}
            radius={staged ? 0.3 : 0.4}
            scale={policy.bloom === 'half' ? 0.5 : 1}
          />
        ) : null}
        <ShadowRig enabled={shadowsOn && policy.shadowMap > 0} size={policy.shadowMap} />
        <FrameProbe
          governor={governor.current}
          onChange={(q) => {
            setQ(q);
            setNotice(q);
          }}
        />
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

      {/* 暗角：浅色模式下几乎去掉 —— 深色暗角压在浅色画布上像一层脏灰。
          只留极轻的一层把视线收到中心（深色科技风才需要重暗角收边） */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 44%, rgba(0,0,0,0) 70%, rgba(28,25,23,0.07) 92%, rgba(28,25,23,0.14) 100%)',
        }}
      />

      {/* 降档提示（M3.5 · W2.3）：只弹一次，且必须给"改回来"的出口。
          自动降档如果不告诉用户，看起来就是"我什么都没干，画面变糊了"。 */}
      {notice ? (
        <div
          role="status"
          data-quality-notice={notice}
          className="absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-xl border border-stone-900/12 bg-white/95 px-3 py-2 text-[11px] text-stone-700 shadow-sm backdrop-blur"
        >
          <span>设备渲染偏慢，已切到流畅模式</span>
          <button
            type="button"
            onClick={() => applyQuality(notice, true)}
            className="rounded-md border border-stone-900/12 px-2 py-[3px] text-[10.5px] text-stone-600 transition hover:text-stone-900"
          >
            保持
          </button>
          <button
            type="button"
            onClick={() => applyQuality('high', true)}
            className="rounded-md border border-cyan-700/30 bg-cyan-600/10 px-2 py-[3px] text-[10.5px] font-medium text-cyan-800 transition hover:bg-cyan-600/16"
          >
            恢复清晰
          </button>
        </div>
      ) : null}
    </div>
  );
}
