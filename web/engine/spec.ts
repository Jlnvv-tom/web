/**
 * SceneSpec —— 场景声明式协议 v0.2
 *
 * 设计目标：新增一个知识点 = 写一份 SceneSpec + 一段讲解文案，
 * 不需要写 Three.js 代码。
 *
 * 变更记录（详见 docs/specs/010-scene-contract.spec.md）：
 *   v0.1  初版：12 种图元
 *   v0.2  新增 SceneState.linesets（多折线集合）与 polylines 图元；
 *         新增 camera.fov / vector.maxLength / plane.bindPosition（均为可选，向后兼容）
 *
 * 三层结构：
 *   spec（静态声明） + solver（数值内核） + state（每帧求解结果）
 *
 * 关键约定：
 *   1. spec 可以被序列化为 JSON（便于 AI 生成 / 教师后台编辑 / 离线导出）；
 *      但在仓库里用 .scene.ts 书写，以获得编译期类型校验。
 *   2. solver 只产出 SceneState 这一种结构，渲染层只认 SceneState，
 *      因此任何求解器都能驱动任何对象，两者完全解耦。
 */
import { z } from 'zod';
import type { Vec3 } from './vec';

/* ============================================================
   基础
   ============================================================ */

import type { MaterialKind } from './materials';

export const zVec3 = z.tuple([z.number(), z.number(), z.number()]);

export type Stage = 'junior' | 'senior';
export type Dimension = '3d' | '2d' | 'hybrid';

/* ============================================================
   参数（自动生成控件）
   ============================================================ */

export type ParamDef =
  | {
      type: 'slider';
      key: string;
      label: string;
      unit?: string;
      min: number;
      max: number;
      step: number;
      default: number;
      /** 显示时乘以的系数，用于 mm→m 之类的单位换算展示 */
      displayScale?: number;
      hint?: string;
    }
  | { type: 'toggle'; key: string; label: string; default: boolean; hint?: string }
  | {
      type: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
      hint?: string;
    };

export type ParamValues = Record<string, number | boolean | string>;

/* ============================================================
   场景对象（13 种图元，覆盖 MVP 全部需求；均支持 ObjectCommon.visible）
   ============================================================ */

export type Bind = string; // 指向 SceneState 中的具名量

/**
 * 所有图元共有的可选字段
 *
 * `visible` 绑定 `scalars` 里的一个数：> 0.5 显示、否则隐藏。
 * 用途：同一位置放"正电荷 / 负电荷"两个外观不同的球，按参数决定哪个可见；
 * 或者只在某些参数下才显示辅助图元。
 */
export type ObjectCommon = { visible?: Bind };

export type ObjectDef = (
  | {
      /** 质点 / 小球 */
      type: 'particle';
      id: string;
      bind?: Bind; // points[key]，缺省 'pos'
      radius?: number;
      color?: string;
      glow?: boolean;
      /** 拖尾开关 */
      trace?: boolean;
      /** 材质预设。给摆球/钩码这类"实物球"用；带电粒子仍应保持发光点 */
      material?: MaterialKind;
      /** 球体分段数，默认 28；小物体可以降到 12 省顶点 */
      segments?: number;
    }
  /** 矢量箭头（速度、力、场强…） */
  | {
      type: 'vector';
      id: string;
      bind: Bind; // vectors[key]
      origin?: Bind; // points[key]，缺省 'pos'
      color?: string;
      label?: string;
      /** 每单位长度对应的世界尺寸 */
      scale?: number;
      /** 箭头固定长度（仅示意方向时） */
      fixed?: boolean;
      /** 箭头长度上限，防止大参数下箭头戳出画面 */
      maxLength?: number;
      /** 箭头粗细（世界单位）。小尺度场景（如 0.3 m 的电容器）必须调小 */
      radius?: number;
    }
  /** 轨迹线（累积点） */
  | { type: 'trail'; id: string; bind: Bind; color?: string; width?: number; dashed?: boolean }
  /**
   * 多条折线（电场线、等势线这类「数量不定」的曲线族）
   *
   * 与 `polyline` 的区别：polyline 是 1 条线（lines[key]），
   * polylines 是 N 条线（linesets[key]）。渲染层只在数组引用变化时重建几何，
   * 因此求解器必须返回**引用稳定**的数组（见 SPEC-011 REQ-SV-004）。
   */
  | {
      type: 'polylines';
      id: string;
      bind: Bind; // linesets[key]
      color?: string;
      width?: number;
      dashed?: boolean;
      opacity?: number;
    }
  /** 静态折线 / 由求解器给出的动态折线（光线、辅助线） */
  | {
      type: 'polyline';
      id: string;
      bind?: Bind; // lines[key]，优先于 points
      points?: Vec3[];
      color?: string;
      width?: number;
      dashed?: boolean;
      /** 每条线是否画箭头（光线方向） */
      arrows?: boolean;
      /**
       * 该折线只在部分参数下存在（如凸透镜的虚像延长线）：
       * 缺省时缺失会被契约测试判为断链，标了 optional 才允许缺省。
       */
      optional?: boolean;
    }
  /** 匀强场箭头阵列 */
  | {
      type: 'fieldArrows';
      id: string;
      dir: Vec3;
      count: Vec3;
      spacing: number;
      color?: string;
      opacity?: number;
      /** 是否随参数反向 */
      flipBind?: Bind;
    }
  /** 参考网格（地面 / 坐标面） */
  | {
      type: 'grid';
      id: string;
      size: [number, number];
      divisions: number;
      plane?: 'xz' | 'xy' | 'yz';
      color?: string;
      opacity?: number;
    }
  /** 坐标轴 */
  | { type: 'axis'; id: string; length: number; labels?: boolean }
  /** 平面（光屏、磁通量面） */
  | {
      type: 'plane';
      id: string;
      size: [number, number];
      position: Vec3;
      /** 位置跟随时点名的 points key（覆盖 position） */
      bindPosition?: string;
      rotation?: Vec3;
      color?: string;
      opacity?: number;
      /** 边框描边 */
      outline?: boolean;
    }
  /** 薄透镜（程序化生成的双凸/双凹形状） */
  | {
      type: 'lens';
      id: string;
      position: Vec3;
      /** 半高 */
      semiHeight: number;
      /** 中心厚度 */
      thickness: number;
      kind?: 'convex' | 'concave';
      opacity?: number;
      color?: string;
    }
  /**
   * 填充扇形（开普勒面积定律的"扫过面积"）
   *
   * `arc` 指向 `lines[key]`（从中心沿轨道的一串点），`center` 是扇形顶点。
   * 用三角扇 + 预分配缓冲实现，每帧只更新顶点，不重建几何。
   */
  | {
      type: 'sector';
      id: string;
      center: Bind | Vec3;
      arc: Bind;
      color?: string;
      opacity?: number;
    }
  /** 实体盒子（极板、支架、外壳……） */
  | {
      type: 'box';
      id: string;
      /** 尺寸 [宽, 高, 深]（米） */
      size: Vec3;
      /** 位置，可绑定 points[key] 跟随运动 */
      position: Vec3 | Bind;
      rotation?: Vec3;
      color?: string;
      /** 圆角半径，>0 时用 RoundedBoxGeometry（更"像实物"） */
      round?: number;
      /** 绕 y 轴的旋转（弧度），绑定 scalars[key]，每帧读取 */
      rotationY?: Bind;
      metalness?: number;
      roughness?: number;
      opacity?: number;
      /** 自发光强度（0 表示不发光） */
      emissive?: number;
      /**
       * 清漆层强度（默认 0.4）。清漆会在粗糙材质上再叠一层镜面高光，
       * 物体运动到某个角度、高光正对相机时会被 bloom 放大成一团白。
       * 相机拉得很近的场景应显式调低（0 ~ 0.1）。
       */
      clearcoat?: number;
      /** 环境贴图反射强度（默认 1.1）。同样是近距离场景过曝的元凶之一。 */
      envMapIntensity?: number;
      /**
       * 材质预设（M3 · W2），见 engine/materials.ts。
       * 只给**有体积的实物**用：矢量箭头/场线/轨迹是物理量的图形化，
       * 给它们贴木纹会让"这条线代表 E"这个约定失效。
       */
      material?: MaterialKind;
    }
  /** 带箭头的线段（物高 / 像高） */
  | {
      type: 'arrowLine';
      id: string;
      from: Bind | Vec3;
      to: Bind | Vec3;
      color?: string;
      width?: number;
      label?: string;
    }
  /** 圆盘 / 圆周（磁场截面、轨道） */
  | {
      type: 'disc';
      id: string;
      position: Vec3;
      radius: number;
      rotation?: Vec3;
      color?: string;
      opacity?: number;
      /** 只画圆环 */
      ring?: boolean;
    }
  /** 3D 文字标注 */
  | {
      type: 'text';
      id: string;
      text: string;
      position: Vec3 | Bind;
      color?: string;
      size?: number;
    }
) &
  ObjectCommon;

/* ============================================================
   HUD 读数与图表
   ============================================================ */

export type ReadoutDef = {
  label: string;
  /** SceneState.scalars 的 key */
  bind: string;
  unit?: string;
  digits?: number;
  /** 该读数恒定，用绿色强调（如磁场不做功 → 速率不变） */
  constant?: boolean;
  hint?: string;
};

export type ChartDef = {
  title: string;
  /** 多条曲线，key 指向 scalars */
  series: { bind: string; label: string; color?: string }[];
  yLabel?: string;
  note?: string;
};

/* ============================================================
   讲解脚本
   ============================================================ */

export type ScriptStep = {
  /** 起始时间（秒），相对场景时间轴 */
  at: number;
  text: string;
  camera?: { position?: Vec3; target?: Vec3; fov?: number };
  /** 高亮哪些对象 id */
  highlight?: string[];
  /** 自动设置参数（"把 θ 调小试试"） */
  params?: ParamValues;
  /** 到达此步时暂停播放 */
  pause?: boolean;
  /** 侧栏补充说明（如公式推导） */
  note?: string;
};

/* ============================================================
   内容块
   ============================================================ */

export type FormulaDef = { tex: string; caption?: string };

export type PitfallDef = { title: string; desc: string; wrong?: string; right?: string };

export type QuizDef = {
  type: 'predict-then-run' | 'single-choice';
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
  /** 选择后自动应用的参数，用于"预测→验证" */
  applyParams?: ParamValues;
};

export type MetaDef = {
  id: string;
  title: string;
  subtitle?: string;
  stage: Stage;
  /** 教材章节 id，对应 content/chapters.ts */
  chapterId: string;
  difficulty: 1 | 2 | 3;
  dimension: Dimension;
  /** 预计学习时长（分钟） */
  minutes: number;
  tags: string[];
  /** 一句话卖点，用于首页卡片 */
  pitch: string;
};

/* ============================================================
   SceneSpec
   ============================================================ */

export type SolverKind =
  | 'projectile'
  | 'lorentz'
  | 'thinLens'
  | 'electricField'
  | 'capacitor'
  | 'shm'
  | 'reflection'
  | 'wave'
  | 'orbit'
  | 'induction'
  | 'buoyancy'
  | 'lever'
  | 'acoustics'
  | 'rodInduction';

/**
 * 展台（M3 · 见 docs/m3-plan.md §4）
 *
 * 设计要点：**这是一个可选的声明式字段，不写就完全退回 M2 的样子**。
 * 12 个场景逐个迁移，任何时候中断都不会留下半坏的状态。
 *
 * `kind: 'none'` 也是合法值，用于天体这类"本来就该是黑底深空"的场景——
 * 规范必须允许例外，否则会被硬套成四不像。
 */
export type StageDef = {
  kind: 'none' | 'table';
  /** 台面高度（米，即台面上表面的 y），默认 0 */
  y?: number;
  /** 台面半边长（米），默认按相机距离推 */
  size?: number;
  /** 台面颜色，默认浅胡桃木 */
  surface?: string;
  /** 画布内背景色（同时用作雾色），默认暖黑 */
  backdrop?: string;
  /** 是否投射阴影，默认 true */
  shadows?: boolean;
  /** 接触阴影半径（米）。小物体靠真实投影压不住，需要这一层 */
  contact?: number;
  /** 台面材质，默认 wood（带程序化木纹） */
  material?: MaterialKind;
};

/**
 * 装饰层（M3 · W3/W4）
 *
 * **这里的所有东西都不得影响物理。** 它们是"手感"与"演出"，不是"模型"。
 * 契约测试会验证：把 decor 整个删掉，`sample(t)` 的输出必须逐值相同。
 */
export type DecorDef = {
  /** 参数变化时做挤压反馈的对象 id（一般是场景的主角） */
  subject?: string;
  /** 挤压幅度（0–0.2），默认 0.07 */
  squash?: number;
  /** 开场演出（M3 · W4）。见 IntroDef */
  intro?: IntroDef;
};

/**
 * 开场演出声明（M3 · W4 · "生动有趣"的主战场）
 *
 * 每个场景一个 0–2 秒的专属入场，也是短视频/分享的钩子。
 * **只作用于装饰层**：渲染层用独立时钟推进，不进 store、不进 solver——
 * `sample(t)` 拿不到它（宪法第五条），删掉后输出逐值不变（decor 契约测试）。
 *
 * kind 是枚举而不是自由参数：5 种效果由渲染层统一实现，场景只选哪一种。
 * 一旦允许"每个场景自己写演出"，12 个场景就会退化成 12 段特判代码，
 * 宪法第六条（内容即数据）当场失效。
 */
export type IntroKind =
  | 'trail-bloom' // 主角弹出 + 光晕扩散（洛伦兹力的粒子）
  | 'wipe-in' // 整体淡入（凸透镜的"一束光打进玻璃"）
  | 'light-up' // 自发光逐点点亮（机械波的质点/矢量）
  | 'splash' // 主角弹入 + 冲击环（浮力的"扑通入水"）
  | 'assemble' // 实体逐个弹出（简谐的摆球放下）
  | 'none';

export type IntroDef = {
  kind: IntroKind;
  /** 时长（秒）。默认 1.6；契约限制 ≤3（m3-plan：0–2 秒，留余量给回弹） */
  duration?: number;
};

export type SceneSpec = {
  meta: MetaDef;
  camera: { position: Vec3; target: Vec3; fov?: number };
  /** 世界尺度提示：网格半宽等 */
  /** 装饰层：只影响观感，不影响任何物理量 */
  decor?: DecorDef;
  world: {
    gridSize?: number;
    gridDivisions?: number;
    showGrid?: boolean;
    showAxis?: boolean;
    /** 展台（M3 · W1）。不写 = 保持原样（黑底虚空），零回归 */
    stage?: StageDef;
  };
  params: ParamDef[];
  solver: { kind: SolverKind; options?: Record<string, unknown> };
  objects: ObjectDef[];
  hud: { readouts: ReadoutDef[]; charts?: ChartDef[] };
  script: ScriptStep[];
  formulas?: FormulaDef[];
  pitfalls?: PitfallDef[];
  quiz?: QuizDef[];
  /** 理想化假设声明（教育产品必须诚实） */
  assumptions?: string[];
  /** 时间轴总长（秒），缺省取最后一个 script.at + 8 */
  duration?: number;
};

/* ============================================================
   每帧求解结果（渲染层唯一认识的契约）
   ============================================================ */

export type SceneState = {
  t: number;
  /** 具名点位 */
  points: Record<string, Vec3>;
  /** 具名矢量（方向 + 长度，单位由求解器决定） */
  vectors: Record<string, Vec3>;
  /** 具名轨迹/折线 */
  lines: Record<string, Vec3[]>;
  /**
   * 具名「多折线集合」（v0.2 可选字段）
   *
   * 用于电场线、等势线等数量随参数变化的曲线族。
   * 缺省 `undefined` 等价于空集，旧求解器无需改动。
   */
  linesets?: Record<string, Vec3[][]>;
  /** HUD 与图表读数 */
  scalars: Record<string, number>;
  /** 附加数据（如透镜的物距/像距/放大率） */
  meta: Record<string, number | string | boolean>;
};

export const emptyState = (): SceneState => ({
  t: 0,
  points: {},
  vectors: {},
  lines: {},
  scalars: {},
  meta: {},
});

/* ============================================================
   zod schema（校验 JSON 版场景，供 AI 生成 / 后台编辑使用）
   ============================================================ */

const zParam: z.ZodType<ParamDef> = z.union([
  z.object({
    type: z.literal('slider'),
    key: z.string(),
    label: z.string(),
    unit: z.string().optional(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    default: z.number(),
    displayScale: z.number().optional(),
    hint: z.string().optional(),
  }),
  z.object({
    type: z.literal('toggle'),
    key: z.string(),
    label: z.string(),
    default: z.boolean(),
    hint: z.string().optional(),
  }),
  z.object({
    type: z.literal('select'),
    key: z.string(),
    label: z.string(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
    default: z.string(),
    hint: z.string().optional(),
  }),
]);

export const zObject = z
  .object({ type: z.string(), id: z.string() })
  .passthrough() as unknown as z.ZodType<ObjectDef>;

export const zSceneSpec = z.object({
  meta: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    stage: z.enum(['junior', 'senior']),
    chapterId: z.string(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    dimension: z.enum(['3d', '2d', 'hybrid']),
    minutes: z.number().positive(),
    tags: z.array(z.string()),
    pitch: z.string(),
  }),
  camera: z.object({
    position: zVec3,
    target: zVec3,
    fov: z.number().optional(),
  }),
  decor: z
    .object({
      subject: z.string().optional(),
      squash: z.number().optional(),
      intro: z
        .object({
          kind: z.enum(['trail-bloom', 'wipe-in', 'light-up', 'splash', 'assemble', 'none']),
          duration: z.number().positive().max(3).optional(),
        })
        .optional(),
    })
    .optional(),
  world: z.object({
    gridSize: z.number().optional(),
    gridDivisions: z.number().optional(),
    showGrid: z.boolean().optional(),
    showAxis: z.boolean().optional(),
    stage: z
      .object({
        kind: z.enum(['none', 'table']),
        y: z.number().optional(),
        size: z.number().positive().optional(),
        surface: z.string().optional(),
        backdrop: z.string().optional(),
        shadows: z.boolean().optional(),
        contact: z.number().positive().optional(),
        material: z.string().optional(),
      })
      .optional(),
  }),
  params: z.array(zParam),
  solver: z.object({
    kind: z.enum([
      'projectile',
      'lorentz',
      'thinLens',
      'electricField',
      'capacitor',
      'shm',
      'reflection',
      'wave',
      'orbit',
      'induction',
      'buoyancy',
      'lever',
      'acoustics',
      'rodInduction',
    ]),
    options: z.record(z.unknown()).optional(),
  }),
  objects: z.array(zObject),
  hud: z.object({
    readouts: z.array(
      z.object({
        label: z.string(),
        bind: z.string(),
        unit: z.string().optional(),
        digits: z.number().optional(),
        constant: z.boolean().optional(),
        hint: z.string().optional(),
      })
    ),
    charts: z
      .array(
        z.object({
          title: z.string(),
          series: z.array(z.object({ bind: z.string(), label: z.string(), color: z.string().optional() })),
          yLabel: z.string().optional(),
          note: z.string().optional(),
        })
      )
      .optional(),
  }),
  script: z
    .array(
      z.object({
        at: z.number().min(0),
        text: z.string().min(1),
        camera: z
          .object({ position: zVec3.optional(), target: zVec3.optional(), fov: z.number().optional() })
          .optional(),
        highlight: z.array(z.string()).optional(),
        params: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
        pause: z.boolean().optional(),
        note: z.string().optional(),
      })
    )
    .min(1, '至少需要一步讲解'),
  formulas: z.array(z.object({ tex: z.string(), caption: z.string().optional() })).optional(),
  pitfalls: z
    .array(
      z.object({
        title: z.string(),
        desc: z.string(),
        wrong: z.string().optional(),
        right: z.string().optional(),
      })
    )
    .optional(),
  quiz: z
    .array(
      z.object({
        type: z.enum(['predict-then-run', 'single-choice']),
        prompt: z.string(),
        options: z.array(z.string()).min(2),
        answer: z.number().int().min(0),
        explain: z.string(),
        applyParams: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
      })
    )
    .optional(),
  assumptions: z.array(z.string()).optional(),
  duration: z.number().positive().optional(),
});

/** 校验并给出人话错误信息 */
export function validateScene(input: unknown): SceneSpec {
  const r = zSceneSpec.safeParse(input);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  · ${i.path.join('.')} — ${i.message}`);
    throw new Error(`SceneSpec 校验失败：\n${lines.join('\n')}`);
  }
  return r.data as SceneSpec;
}

/* ============================================================
   工具
   ============================================================ */

export function defaultParams(params: ParamDef[]): ParamValues {
  const out: ParamValues = {};
  for (const p of params) out[p.key] = p.default;
  return out;
}

export function sceneDuration(spec: SceneSpec): number {
  if (spec.duration) return spec.duration;
  const last = spec.script.reduce((m, s) => Math.max(m, s.at), 0);
  return last + 8;
}

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '基础',
  2: '进阶',
  3: '挑战',
};

export const STAGE_LABEL: Record<Stage, string> = { junior: '初中', senior: '高中' };
