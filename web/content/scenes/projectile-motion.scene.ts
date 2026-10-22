import type { SceneSpec } from '@/engine/spec';

/**
 * 抛体运动
 *
 * 教学重点不是"抛物线长什么样"，而是"水平与竖直两个方向互不干扰"。
 * 所以场景里同时给出 v 的合成矢量与 vx / vy 两个分量矢量，
 * 让学生亲眼看到：v 在缩短，但 vx 一动也不动。
 */
export const projectileMotionScene: SceneSpec = {
  meta: {
    id: 'projectile-motion',
    title: '抛体运动：把速度拆成两半',
    subtitle: '平抛与斜抛 · 运动的合成与分解 · 射程',
    stage: 'senior',
    chapterId: 'g2-1',
    difficulty: 1,
    dimension: '3d',
    minutes: 10,
    tags: ['抛体运动', '平抛', '斜抛', '运动分解', '射程'],
    pitch: 'vx 从头到尾没变过——这一眼就是运动分解的全部秘密',
  },

  camera: { position: [18, 13, 42], target: [20, 6, 0], fov: 45 },

  world: { gridSize: 80, gridDivisions: 40, showGrid: true, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'v0',
      label: '初速度 v₀',
      unit: 'm/s',
      min: 6,
      max: 40,
      step: 1,
      default: 20,
    },
    {
      type: 'slider',
      key: 'theta',
      label: '抛射角 θ',
      unit: '°',
      min: 0,
      max: 90,
      step: 1,
      default: 45,
      hint: '0° 即平抛；真空中 45° 射程最大',
    },
    {
      type: 'slider',
      key: 'h0',
      label: '抛出高度 h₀',
      unit: 'm',
      min: 0,
      max: 20,
      step: 1,
      default: 0,
      hint: '试试从高处平抛：落点会明显变远',
    },
    {
      type: 'slider',
      key: 'g',
      label: '重力加速度 g',
      unit: 'm/s²',
      min: 1.6,
      max: 25,
      step: 0.1,
      default: 9.8,
      hint: '月球 1.6，火星 3.7，地球 9.8',
    },
    { type: 'toggle', key: 'showComponents', label: '显示速度分量', default: true },
  ],

  solver: { kind: 'projectile' },

  objects: [
    { type: 'grid', id: 'ground', size: [100, 40], divisions: 40, plane: 'xz', color: '#1b4459', opacity: 0.3 },

    { type: 'polyline', id: 'ideal-path', bind: 'ghost', color: '#2a4a5c', width: 1.2, dashed: true },
    { type: 'trail', id: 'trail', bind: 'trail', color: '#22d3ee', width: 3 },
    { type: 'polyline', id: 'height-line', bind: 'height', color: '#475569', width: 1.2, dashed: true },

    { type: 'particle', id: 'ball', bind: 'pos', radius: 0.5, color: '#ff8a3d', glow: true },

    { type: 'vector', id: 'v', bind: 'v', color: '#4ade80', scale: 0.26, maxLength: 9, label: 'v' },
    { type: 'vector', id: 'vx', bind: 'vx', color: '#22d3ee', scale: 0.26, maxLength: 9, label: 'vₓ' },
    { type: 'vector', id: 'vy', bind: 'vy', color: '#f59e0b', scale: 0.26, maxLength: 9, label: 'v_y' },

    { type: 'vector', id: 'g', bind: 'g', color: '#ef4444', fixed: true, label: 'g' },

    { type: 'disc', id: 'apex-mark', position: [0, 0, 0], radius: 0.9, ring: true, color: '#22d3ee', opacity: 0.35 },
  ],

  hud: {
    readouts: [
      { label: '速率 |v|', bind: 'speed', unit: 'm/s', digits: 1 },
      { label: '水平分量 vₓ', bind: 'vx', unit: 'm/s', digits: 2, constant: true, hint: '始终不变——水平方向匀速' },
      { label: '竖直分量 v_y', bind: 'vy', unit: 'm/s', digits: 2 },
      { label: '速度方向', bind: 'angle', unit: '°', digits: 1 },
      { label: '当前高度', bind: 'y', unit: 'm', digits: 2 },
      { label: '水平位移', bind: 'x', unit: 'm', digits: 1 },
      { label: '最大高度', bind: 'apexY', unit: 'm', digits: 2 },
      { label: '射程', bind: 'range', unit: 'm', digits: 1 },
      { label: '飞行时间', bind: 'flight', unit: 's', digits: 2 },
    ],
    charts: [
      {
        title: '速度分量随时间',
        series: [
          { bind: 'vx', label: 'vₓ（水平）', color: '#22d3ee' },
          { bind: 'vy', label: 'v_y（竖直）', color: '#f59e0b' },
        ],
        yLabel: 'm/s',
        note: '一条水平、一条倾斜：水平匀速 + 竖直匀变速，这就是"运动的分解"',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '抛体运动看起来复杂，其实只是两个简单运动"叠加"在一起：水平方向匀速，竖直方向匀变速。',
      camera: { position: [18, 13, 42], target: [20, 6, 0] },
      highlight: ['v'],
    },
    {
      at: 7,
      text: '现在盯住两条分量箭头：绿色的 v 一直在缩短，但青色的 vₓ 长度几乎不变——水平方向没有受任何力。',
      camera: { position: [22, 10, 30], target: [18, 6, 0] },
      highlight: ['vx', 'vy', 'v'],
    },
    {
      at: 15,
      text: '到达最高点时，竖直分量 v_y 变为 0，可是水平分量还在！所以球不会停在最高点，它会继续往前走。',
      camera: { position: [2, 12, 30], target: [16, 8, 0] },
      highlight: ['vy', 'vx'],
    },
    {
      at: 23,
      text: '注意上升和下落是对称的：同一高度经过两次，用时相同、速率相同、方向相反。',
      camera: { position: [20, 10, 30], target: [20, 6, 0] },
      highlight: ['trail'],
    },
    {
      at: 31,
      text: '把抛射角从 45° 调到 60°：飞得更高了，但落点变近了。射程 = v₀²sin2θ/g，45° 才是最大值。',
      params: { theta: 60 },
      highlight: ['trail'],
    },
    {
      at: 39,
      text: '换个星球呢？把 g 改成月球的 1.6：同样的初速度，射程直接变成 6 倍多。',
      params: { g: 1.6 },
      camera: { position: [22, 20, 58], target: [26, 8, 0] },
      highlight: ['trail'],
    },
    {
      at: 47,
      text: '最后试试平抛：把 θ 调成 0，小球只做水平匀速 + 竖直自由落体。它和自由落体的小球会同时落地。',
      params: { theta: 0, g: 9.8 },
      pause: true,
    },
  ],

  formulas: [
    { tex: 'x=v_0\\cos\\theta\\,t', caption: '水平方向：匀速直线，vₓ 恒定。' },
    { tex: 'y=h_0+v_0\\sin\\theta\\,t-\\tfrac12gt^2', caption: '竖直方向：匀变速，加速度恒为 g。' },
    {
      tex: 'R=\\frac{v_0^2\\sin 2\\theta}{g}',
      caption: '同一高度抛出时的射程。θ=45° 取最大值；θ 互补（30°/60°）射程相同。',
    },
  ],

  pitfalls: [
    {
      title: '以为最高点速度为零',
      wrong: '小球到最高点就停了一下，然后掉下来',
      right: '最高点只有 v_y = 0，vₓ = v₀cosθ 全程不变',
      desc: '把速度分解成两个方向分别看：竖直方向确实"到顶"了，水平方向从来没停过。',
    },
    {
      title: '把 v-t 图像当成轨迹',
      wrong: 'v-t 图上的抛物线就是小球的飞行路线',
      right: 'v-t 图画的是速度随时间变化，轨迹图画的是位置的集合，两者完全不同',
      desc: '轨迹是 y-x 关系（抛物线），v-t 是 v-t 关系。画在一起会彻底混淆。',
    },
    {
      title: '认为重的物体下落更快',
      wrong: '质量大的球会先落地',
      right: '忽略空气阻力时，加速度都是 g，与质量无关，同时落地',
      desc: '把 g 当参数调一调：改变 g 会改变一切，但场景里根本没有"质量"这个参数——因为它不影响运动。',
    },
    {
      title: '算射程时忘记初高度',
      wrong: 'R = v₀²sin2θ/g 适用于所有情况',
      right: '该公式只在"落回抛出高度"时成立；从高处抛出要重新解落地时间',
      desc: '把 h₀ 调到 10 m，再用公式算射程，会发现对不上——因为落地时间变长了。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '忽略空气阻力，小球在最高点时的加速度是多少？',
      options: ['0', 'g，方向竖直向下', '水平方向，大小等于 g', '无法确定'],
      answer: 1,
      explain: '加速度由合力决定。空中只受重力，所以全程加速度都是 g、方向竖直向下，最高点也不例外。',
    },
    {
      type: 'predict-then-run',
      prompt: '同一高度、同一初速度，把抛射角从 45° 增大到 60°，射程会怎样？',
      options: ['变大', '变小', '不变', '先变大后变小'],
      answer: 1,
      explain: 'R = v₀²sin2θ/g。sin90° = 1 是最大值，sin120° ≈ 0.866，所以射程变小，但最大高度变大。',
      applyParams: { theta: 60 },
    },
    {
      type: 'single-choice',
      prompt: '把场景里的 g 换成月球的 1.6 m/s²，落地时间会？',
      options: ['变短', '不变', '变长约 2.5 倍', '变长约 6 倍'],
      answer: 2,
      explain: 't = 2v₀sinθ/g，与 g 成反比。9.8/1.6 ≈ 6.1，但飞行时间还要看竖直分量，实际约 2.5 倍；射程约 6 倍。',
      applyParams: { g: 1.6 },
    },
  ],

  assumptions: [
    '忽略空气阻力（真空中抛体）。真实情况下阻力会让轨迹不再对称，射程明显缩短。',
    '地面为水平面，重力加速度恒定，不考虑地球曲率与自转。',
  ],

  duration: 56,
};
