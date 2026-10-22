import type { SceneSpec } from '@/engine/spec';

/**
 * 简谐运动 · 单摆与弹簧振子
 *
 * 为什么必须真 3D：简谐运动最抽象的一步是「它是匀速圆周运动在直径上的投影」。
 * 参考圆 + 投影线 + 实际振子三者同场，转动视角才能看清这个对应关系——
 * 课本只能画一张示意图，让学生自己去想象那个转动的圆。
 *
 * 规格：docs/specs/features/006-shm.spec.md
 */
export const shmScene: SceneSpec = {
  meta: {
    id: 'shm',
    title: '简谐运动：圆周运动投出来的影',
    subtitle: 'T = 2π√(L/g) · T = 2π√(m/k) · 投影即简谐',
    stage: 'senior',
    chapterId: 'gx1-2',
    difficulty: 2,
    dimension: '3d',
    minutes: 12,
    tags: ['简谐运动', '单摆', '弹簧振子', '周期', '参考圆', '机械能'],
    pitch: '把"圆周运动的投影就是简谐运动"从一句结论，变成一个可以转着看的圆',
  },

  camera: { position: [1.0, 0.8, 1.2], target: [0, 0.5, 0], fov: 45 },

  // 装饰层：拖摆长/振幅时，摆球挤压回弹
  decor: { subject: 'bob', squash: 0.07 },

  // 摆球的最低点在台面上方一点点：影子贴着摆动轨迹走，是"简谐"最好懂的视觉线索（M3 · W1）
  world: {
    gridSize: 5,
    gridDivisions: 20,
    showGrid: true,
    showAxis: false,
    stage: { kind: 'table', y: -0.07, size: 2.60, contact: 0.30 },
  },

  params: [
    {
      type: 'select',
      key: 'mode',
      label: '振子类型',
      options: [
        { value: 'pendulum', label: '单摆' },
        { value: 'spring', label: '弹簧振子' },
      ],
      default: 'pendulum',
      hint: '两者的运动规律完全一样，只是决定周期的公式不同',
    },
    {
      type: 'slider',
      key: 'L',
      label: '摆长 L',
      unit: 'm',
      min: 0.2,
      max: 2,
      step: 0.05,
      default: 1,
      hint: 'T = 2π√(L/g)：摆长变 4 倍，周期变 2 倍',
    },
    {
      type: 'slider',
      key: 'k',
      label: '劲度系数 k',
      unit: 'N/m',
      min: 1,
      max: 20,
      step: 0.5,
      default: 5,
      hint: 'T = 2π√(m/k)：k 变 4 倍，周期减半',
    },
    {
      type: 'slider',
      key: 'A',
      label: '振幅 A',
      unit: 'm',
      min: 0.05,
      max: 0.5,
      step: 0.05,
      default: 0.25,
      hint: '关键实验：改振幅，周期读数一动不动——这才是"简谐"',
    },
    {
      type: 'slider',
      key: 'm',
      label: '质量 m',
      unit: 'kg',
      min: 0.1,
      max: 2,
      step: 0.1,
      default: 0.5,
      hint: '单摆的周期与质量无关；弹簧振子的周期才含 m',
    },
    {
      type: 'slider',
      key: 'g',
      label: '重力加速度 g',
      unit: 'm/s²',
      min: 1.6,
      max: 12,
      step: 0.1,
      default: 9.8,
      hint: '月球 1.6、地球 9.8、木星 24.9（超出范围但趋势如此）',
    },
  ],

  solver: { kind: 'shm' },

  objects: [
    { type: 'grid', id: 'floor', size: [5, 5], divisions: 20, plane: 'xz', color: '#16394a', opacity: 0.25 },

    /* ---------- 参考圆（xz 平面，半径 = 振幅） ---------- */
    { type: 'polyline', id: 'ref-circle', bind: 'refCircle', color: '#64748b', width: 1.3, dashed: true },
    { type: 'polyline', id: 'ref-radius', bind: 'refRadius', color: '#64748b', width: 1.2, dashed: true },
    { type: 'polyline', id: 'projection', bind: 'projection', color: '#a78bfa', width: 1.4, dashed: true },
    { type: 'particle', id: 'ref-point', bind: 'ref', radius: 0.035, color: '#a78bfa', glow: true },
    { type: 'particle', id: 'proj-point', bind: 'proj', radius: 0.028, color: '#c4b5fd' },

    /* ---------- 振子本体 ---------- */
    // 摆杆只在单摆模式有值、弹簧只在弹簧模式有值，另一支求解器返回空数组
    { type: 'polyline', id: 'rod', bind: 'rod', color: '#94a3b8', width: 2.2, optional: true },
    { type: 'polyline', id: 'spring', bind: 'spring', color: '#fbbf24', width: 1.6, optional: true },
    /* 摆球：磨砂玻璃。半透明能让"摆球在台面上的影子"透出来，
       影子与摆球同步游走是简谐最好的视觉线索（计划 §9.5） */
    { type: 'particle', id: 'bob', bind: 'pos', radius: 0.075, material: 'glass', segments: 32 },

    /* 参照物：一支铅笔（木杆 + 金属箍用两段盒子拼） */
    {
      type: 'box',
      id: 'ref-pencil',
      size: [0.42, 0.009, 0.014],
      position: [-0.92, -0.064, 0.64],
      rotation: [0, 0.6, 0],
      round: 0.004,
      material: 'wood',
      color: '#D9A24A',
    },
    { type: 'trail', id: 'trail', bind: 'trail', color: '#22d3ee', width: 2.5 },

    /* ---------- 受力与状态 ---------- */
    {
      type: 'vector',
      id: 'F-vec',
      bind: 'F',
      color: '#ef4444',
      radius: 0.014,
      maxLength: 0.5,
      label: '恢复力 F',
    },
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      color: '#4ade80',
      radius: 0.012,
      maxLength: 0.5,
      label: 'v',
    },

    { type: 'text', id: 'label-ref', text: '参考圆：匀速圆周', position: 'ref', color: '#a78bfa', size: 12 },
  ],

  hud: {
    readouts: [
      { label: '周期 T', bind: 'T', unit: 's', digits: 3, constant: true, hint: '周期与振幅无关——这是"简谐"的定义性特征' },
      { label: '频率 f', bind: 'f', unit: 'Hz', digits: 3 },
      { label: '位移 x', bind: 'x', unit: 'm', digits: 3 },
      { label: '速率 v', bind: 'v', unit: 'm/s', digits: 3 },
      { label: '加速度 a', bind: 'a', unit: 'm/s²', digits: 3 },
      { label: '最大速率 v_max', bind: 'vMax', unit: 'm/s', digits: 3 },
      { label: '动能 Eₖ', bind: 'KE', unit: 'J', digits: 4 },
      { label: '势能 Eₚ', bind: 'PE', unit: 'J', digits: 4 },
      {
        label: '总能 Eₖ+Eₚ',
        bind: 'ME',
        unit: 'J',
        digits: 4,
        constant: true,
        hint: '只有保守力做功：动能与势能来回倒，总量不变',
      },
      { label: '摆角振幅', bind: 'thetaDeg', unit: '°', digits: 1, hint: '小角近似在 < 15° 时很好用' },
    ],
    charts: [
      {
        title: '动能 ↔ 势能',
        series: [
          { bind: 'KE', label: 'Eₖ', color: '#facc15' },
          { bind: 'PE', label: 'Eₚ', color: '#38bdf8' },
        ],
        yLabel: 'J',
        note: '两条曲线此消彼长，一个周期内互换两次',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '一个单摆正在来回摆动。注意青色那条轨迹——它走过的是一段圆弧，不是直线。',
      camera: { position: [1.0, 0.8, 1.2], target: [0, 0.5, 0] },
      highlight: ['bob', 'trail'],
    },
    {
      at: 7,
      text: '红色箭头是恢复力：始终指向平衡位置，而且越偏离越大。这就是"简谐"两个字的来源。',
      highlight: ['F-vec', 'bob'],
    },
    {
      at: 14,
      text: '现在出现一个紫色的圆。圆上有个点在做**匀速**圆周运动，它在 x 方向上的投影——就是这个单摆。',
      params: {},
      highlight: ['ref-circle', 'ref-point', 'proj-point'],
    },
    {
      at: 22,
      text: '转一下视角：参考圆是竖着放的（在水平面内），投影点在振动方向上来回。圆上那点转多快，单摆就摆多快。',
      camera: { position: [1.0, 2.0, 1.7], target: [0, 0.45, 0] },
      highlight: ['ref-circle', 'ref-radius', 'projection'],
    },
    {
      at: 30,
      text: '关键实验：把振幅从 0.25 m 改到 0.05 m。看周期读数——一动不动。周期与振幅无关，这才是"简谐运动"的定义。',
      params: { A: 0.05 },
      highlight: ['bob'],
    },
    {
      at: 38,
      text: '那把摆长从 1 m 拉到 2 m：周期变成 √2 ≈ 1.41 倍。月球上（g=1.6）同一个摆会慢到 2.5 倍——所以登月影片里人的动作像慢放。',
      params: { A: 0.25, L: 2, g: 1.6 },
      highlight: ['bob', 'trail'],
    },
    {
      at: 47,
      text: '换成弹簧振子：同样的正弦曲线，但周期换成了 T = 2π√(m/k)——这时候质量就有影响了。',
      params: { mode: 'spring', g: 9.8 },
      highlight: ['spring', 'bob'],
    },
    {
      at: 55,
      text: '把劲度系数 k 调到 20：周期立刻减半。单摆那条"与质量无关"的规律，在弹簧上并不成立。',
      params: { k: 20 },
      highlight: ['spring'],
    },
    {
      at: 62,
      text: '最后看能量：动能与势能来回倒，总量那条绿线始终水平。机械能守恒，是简谐运动能一直摆下去的原因。',
      params: { k: 5 },
      highlight: ['bob', 'trail'],
      pause: true,
    },
  ],

  formulas: [
    { tex: 'x = A\\cos(\\omega t + \\varphi)', caption: '简谐运动的位移方程。A 是振幅，ω 是角频率，φ 是初相。' },
    { tex: 'F = -kx', caption: '恢复力与位移成正比、方向相反。负号就是"总想回到平衡位置"。' },
    { tex: 'T = 2\\pi\\sqrt{\\frac{L}{g}}', caption: '单摆周期（小角近似）。与质量、振幅都无关。' },
    { tex: 'T = 2\\pi\\sqrt{\\frac{m}{k}}', caption: '弹簧振子周期。与重力加速度无关——拿到月球上也一样快。' },
  ],

  pitfalls: [
    {
      title: '以为振幅越大周期越长',
      wrong: '拉得越远，摆回来得越慢，所以周期更长',
      right: '小角近似下周期与振幅完全无关（T = 2π√(L/g) 里没有 A）',
      desc: '本场景第 5 步就是为这个误解设计的：把振幅从 0.25 改到 0.05，周期读数一动不动。只有摆角很大（>15°）时才略有变长。',
    },
    {
      title: '把单摆和弹簧振子的公式搞混',
      wrong: '单摆周期也含质量：T = 2π√(m/k)',
      right: '单摆 T = 2π√(L/g) 与质量无关；弹簧振子 T = 2π√(m/k) 与 g 无关',
      desc: '记住口径：单摆的"k"由重力提供（mg/L），所以 m 约掉了；弹簧振子的恢复力与重力无关。',
    },
    {
      title: '认为平衡位置速度最大是因为"受力最大"',
      wrong: '平衡位置恢复力最大，所以速度最大',
      right: '平衡位置恢复力为**零**，速度最大是因为势能全部转成了动能',
      desc: '看红色箭头和绿色箭头：在平衡位置 F=0 而 v 最大；在端点 F 最大而 v=0。力最大的地方恰恰是不动的地方。',
    },
    {
      title: '把参考圆当成真实存在的运动',
      wrong: '单摆真的是在绕着某个圆转',
      right: '参考圆是**数学工具**：圆周运动在直径上的投影恰好满足简谐方程',
      desc: '紫色圆上那点做匀速圆周运动，它投下来的影子才是单摆。真实世界里只有一个摆，没有那个圆。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '把摆长从 1 m 增加到 2 m，周期变成原来的多少倍？',
      options: ['√2 ≈ 1.41 倍', '2 倍', '4 倍', '不变'],
      answer: 0,
      explain: 'T = 2π√(L/g) 与 √L 成正比。L 翻倍 → 周期变 √2 ≈ 1.41 倍，不是翻倍。',
      applyParams: { L: 2 },
    },
    {
      type: 'predict-then-run',
      prompt: '把单摆的振幅从 0.25 m 减到 0.05 m，周期怎么变？',
      options: ['变为 1/5', '变为 √5 倍', '几乎不变', '变为 5 倍'],
      answer: 2,
      explain: '小角近似下周期与振幅无关。这是"简谐运动"最重要的定义性特征，也是单摆能用来计时的原因。',
      applyParams: { A: 0.05 },
    },
    {
      type: 'predict-then-run',
      prompt: '把同一个弹簧振子从地球搬到月球（g 从 9.8 变成 1.6），周期怎么变？',
      options: ['变慢', '变快', '不变', '变成 √(9.8/1.6) 倍'],
      answer: 2,
      explain: '弹簧振子的周期 T = 2π√(m/k) 里没有 g——重力只改变平衡位置，不改变振动快慢。换作单摆就会变慢。',
      applyParams: { mode: 'spring', g: 1.6 },
    },
  ],

  assumptions: [
    '单摆采用小角近似（θ < 15° 时误差 < 0.5%）：本场景把振幅限制在 0.35L 以内，HUD 会显示当前摆角振幅。',
    '势能取精确值 mgh（h = L(1−cosθ)），而动力学用线性化方程，因此机械能会有 O(θ³) 的漂移——这不是数值误差，测试里专门有一条断言它随振幅平方缩小。',
    '忽略空气阻力与摆杆质量，摆锤视为质点。',
    '参考圆是数学工具，不是真实运动：圆周运动在直径上的投影恰好满足简谐方程。',
  ],

  duration: 70,
};
