import type { SceneSpec } from '@/engine/spec';

/**
 * 杠杆 · 平衡条件
 *
 * 为什么必须真 3D（这一节其实是"2D 就够用"的典型，3D 的价值在于**打破 2D 的暗示**）：
 *
 *   课本上的杠杆永远是水平的，于是学生脑子里形成了两条错误绑定：
 *     ① 力臂 = 支点到挂点的**杆长**
 *     ② 杠杆一倾斜，平衡条件就失效了
 *   这两条都是被"只画水平图"这个演示习惯教出来的，不是学生笨。
 *   3D 里让杠杆真实地翘起来，同时把「斜的杆」和「水平的力臂」画成两条不同颜色的线，
 *   一眼就能看出它们不等长——力臂 = L·cosθ，是**支点到力的作用线的垂直距离**。
 *   再转个视角，能看到两条力臂始终落在同一条水平线上，而杆在转动，对比极其直接。
 *
 * 参数口径刻意用**钩码质量 m1 / m2** 而不是力：
 *   这样平衡条件 F1L1 = F2L2 变成 m1L1 = m2L2，重力加速度 g 作为公因子被约掉。
 *   既让默认值能取成干净的整数（2×60 = 4×30），也顺带回答了
 *   "把杠杆搬到月球上还平不平衡"这类问题——照样平衡。
 *
 * 规格：docs/specs/features/012-lever.spec.md
 */
export const leverScene: SceneSpec = {
  meta: {
    id: 'lever',
    title: '杠杆平衡：力臂不是杆上那一段',
    subtitle: '杠杆平衡条件 · F₁L₁ = F₂L₂ · 力臂 = 支点到力的作用线的垂直距离',
    stage: 'junior',
    chapterId: 'j8b-6',
    difficulty: 2,
    dimension: '3d',
    minutes: 11,
    tags: ['杠杆', '力矩', '力臂', '简单机械', '平衡条件'],
    pitch: '让杠杆真的翘起来，看斜的杆和水平的力臂为什么不等长',
  },

  camera: { position: [0.03, 0.26, 0.86], target: [0, -0.08, 0], fov: 45 },

  // 装饰层：拖钩码质量时，木杆挤压一下（杆是主角，而不是某个钩码）
  decor: { subject: 'bar', squash: 0.05 },

  // 支点落在台面上（y = 0），杆与钩码才有"压下去"的重量感（M3 · W1）
  world: {
    gridSize: 2.4,
    gridDivisions: 12,
    showGrid: true,
    showAxis: false,
    // 0.58：既要看到台面边缘（"微型展台"的边界感），也不能让台面铺满整个视野——
    // 铺满时画面就是一大片同色平面，比原来的黑底更没信息量。
    stage: { kind: 'table', y: 0, size: 0.5, contact: 0.34 },
  },

  params: [
    {
      type: 'slider',
      key: 'm1',
      label: '动力端钩码 m₁',
      unit: 'kg',
      min: 0.5,
      max: 10,
      step: 0.5,
      default: 2,
      hint: '左侧挂的钩码质量，动力 F₁ = m₁·g',
    },
    {
      type: 'slider',
      key: 'L1',
      label: '动力臂 L₁',
      unit: 'cm',
      min: 20,
      max: 100,
      step: 5,
      default: 60,
      hint: '支点到左侧挂点的**杆长**，注意它不等于力臂',
    },
    {
      type: 'slider',
      key: 'm2',
      label: '阻力端钩码 m₂',
      unit: 'kg',
      min: 0.5,
      max: 10,
      step: 0.5,
      default: 8,
      hint: '右侧挂的钩码质量，阻力 F₂ = m₂·g',
    },
    {
      type: 'slider',
      key: 'L2',
      label: '阻力臂 L₂',
      unit: 'cm',
      min: 20,
      max: 100,
      step: 5,
      default: 30,
      hint: '支点到右侧挂点的杆长',
    },
    {
      type: 'slider',
      key: 'T',
      label: '摆动周期 T',
      unit: 's',
      min: 2,
      max: 10,
      step: 0.5,
      default: 5,
      hint: '不平衡度越大摆得越厉害；调到平衡时杠杆会静止在水平',
    },
  ],

  solver: { kind: 'lever' },

  objects: [
    { type: 'grid', id: 'floor', size: [2.4, 2.4], divisions: 12, plane: 'xz', color: '#16394a', opacity: 0.18 },

    /* ---------- 支点三角架 ---------- */
    { type: 'polylines', id: 'pivot', bind: 'pivot', color: '#94a3b8', width: 2.2 },

    /* ---------- 力臂：支点到作用线的水平垂线段 ---------- */
    { type: 'polyline', id: 'arm-1', bind: 'arm1', color: '#4ade80', width: 3.2 },
    { type: 'polyline', id: 'arm-2', bind: 'arm2', color: '#fb923c', width: 3.2 },

    /* ---------- 竖直落差线：力臂直角三角形的另一条直角边 ---------- */
    { type: 'polyline', id: 'drop-1', bind: 'drop1', color: '#4ade80', width: 1.4, dashed: true },
    { type: 'polyline', id: 'drop-2', bind: 'drop2', color: '#fb923c', width: 1.4, dashed: true },

    /* ---------- 力的作用线（竖直虚线） ---------- */
    { type: 'polyline', id: 'fline-1', bind: 'fline1', color: '#4ade80', width: 1, dashed: true },
    { type: 'polyline', id: 'fline-2', bind: 'fline2', color: '#fb923c', width: 1, dashed: true },

    /* ---------- 杠杆本体 ----------
     * 用粗折线而不是 box：`box.size` 是静态的，而杠杆两端距离随 L1/L2 变化，
     * 固定长度的长方体会和挂点对不上。折线每帧从 effEnd 连到 resEnd，永远精确。
     */
    { type: 'polyline', id: 'bar', bind: 'bar', color: '#38bdf8', width: 9 },

    /* ---------- 两端挂点 ---------- */
    /* 钩码做成金属球：颜色编码交给力矢量（F₁ 绿 / F₂ 橙），
       物体本身不必染成绿的——"绿色的铁球"只会让人出戏 */
    { type: 'particle', id: 'eff-end', bind: 'effEnd', radius: 0.028, material: 'metal', segments: 20 },
    { type: 'particle', id: 'res-end', bind: 'resEnd', radius: 0.028, material: 'metal', segments: 20 },
    { type: 'particle', id: 'pivot-pt', bind: 'pivot', radius: 0.022, material: 'metal', segments: 16 },

    /* 参照物：一把木尺横在台面上 */
    {
      type: 'box',
      id: 'ref-ruler',
      size: [0.3, 0.007, 0.026],
      position: [-0.4, 0.004, 0.3],
      rotation: [0, 0.55, 0],
      round: 0.002,
      material: 'wood',
      color: '#E9D6B4',
    },

    /* ---------- 力矢量 ---------- */
    {
      type: 'vector',
      id: 'F1-vec',
      bind: 'F1',
      origin: 'effEnd',
      color: '#4ade80',
      radius: 0.009,
      maxLength: 0.4,
      label: 'F₁（动力）',
    },
    {
      type: 'vector',
      id: 'F2-vec',
      bind: 'F2',
      origin: 'resEnd',
      color: '#fb923c',
      radius: 0.009,
      maxLength: 0.4,
      label: 'F₂（阻力）',
    },
    /* ---------- 标注 ---------- */
    { type: 'text', id: 'label-pivot', text: '支点 O', position: [0, -0.02, 0], color: '#e2e8f0', size: 11 },
    { type: 'text', id: 'label-arm1', text: '力臂 L₁·cosθ', position: [-0.3, -0.055, 0], color: '#4ade80', size: 11 },
    { type: 'text', id: 'label-arm2', text: '力臂 L₂·cosθ', position: [0.15, -0.055, 0], color: '#fb923c', size: 11 },
  ],

  hud: {
    readouts: [
      { label: '动力端钩码 m₁', bind: 'm1', unit: 'kg', digits: 1 },
      { label: '动力 F₁ = m₁g', bind: 'F1', unit: 'N', digits: 2 },
      { label: '动力臂（杆长 L₁）', bind: 'L1', unit: 'cm', digits: 1 },
      { label: '真实力臂 L₁·cosθ', bind: 'arm1', unit: 'cm', digits: 2, hint: '倾斜时严格小于杆长' },
      { label: '阻力端钩码 m₂', bind: 'm2', unit: 'kg', digits: 1 },
      { label: '阻力 F₂ = m₂g', bind: 'F2', unit: 'N', digits: 2 },
      { label: '阻力臂（杆长 L₂）', bind: 'L2', unit: 'cm', digits: 1 },
      { label: '真实力臂 L₂·cosθ', bind: 'arm2', unit: 'cm', digits: 2 },
      { label: '动力矩 τ₁', bind: 'tau1', unit: 'N·m', digits: 3 },
      { label: '阻力矩 τ₂', bind: 'tau2', unit: 'N·m', digits: 3 },
      { label: '净力矩 τ', bind: 'tauNet', unit: 'N·m', digits: 3, hint: '为 0 即达到平衡' },
      { label: '力矩比 τ₁/τ₂', bind: 'ratio', unit: '', digits: 4, hint: '平衡时为 1，且与倾角无关' },
      { label: '支点支持力 R', bind: 'support', unit: 'N', digits: 2, hint: 'R = F₁ + F₂' },
      { label: '倾角 θ', bind: 'tilt', unit: '°', digits: 2 },
      { label: '是否平衡', bind: 'balanced', unit: '', digits: 0, hint: '1 = 平衡，此时杠杆静止在水平' },
    ],
    charts: [
      {
        title: '动力矩 τ₁ 与 阻力矩 τ₂',
        series: [
          { bind: 'tau1', label: 'τ₁（N·m）', color: '#4ade80' },
          { bind: 'tau2', label: 'τ₂（N·m）', color: '#fb923c' },
        ],
        yLabel: '力矩（N·m）',
        note: '两条曲线同步涨落（都带 cosθ）。重合即平衡；张开越大越不平衡，杠杆摆得越凶',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '一根刚性杆绕支点 O 转动。左端挂 m₁（绿色），右端挂 m₂（橙色），两个力都竖直向下。当前 2 kg×60 cm = 120，8 kg×30 cm = 240，**右边力矩大一倍**，所以杠杆朝右下垂并来回摆。',
      camera: { position: [0.03, 0.26, 0.86], target: [0, -0.08, 0] },
      highlight: ['bar', 'eff-end', 'res-end', 'pivot-pt'],
    },
    {
      at: 9,
      text: '看两条水平线段（绿、橙）——那是**力臂**：支点到力的作用线的**垂直距离**。两条竖直虚线是力的作用线，力臂始终与它垂直。',
      highlight: ['arm-1', 'arm-2', 'fline-1', 'fline-2'],
    },
    {
      at: 18,
      text: '先看竖直虚线（落差线）：它从杆端垂直落到力臂端点，长度是 L·sinθ。斜边是杆、一条直角边是力臂、另一条就是落差——三者构成直角三角形。',
      highlight: ['drop-1', 'drop-2', 'arm-1', 'bar'],
    },
    {
      at: 27,
      text: '关键观察来了：斜边永远比直角边长。所以**力臂一定短于杆上那段**。杆倾斜得越多，两者差得越明显。',
      params: { m2: 8 },
      highlight: ['arm-1', 'arm-2', 'bar'],
      pause: true,
    },
    {
      at: 37,
      text: '因为力竖直向下，力臂就是**水平距离**，等于 L·cosθ。杆转过 θ 角，水平投影就缩到 cosθ 倍。所以**力臂 ≠ 杆长**。',
      highlight: ['arm-1', 'bar'],
    },
    {
      at: 46,
      text: '但两条力臂**按同一个 cosθ 同步缩短**，比值不变。看下方图表：两条曲线一直同步涨落，谁也甩不开谁。',
      params: { m2: 8 },
      highlight: ['arm-1', 'arm-2'],
    },
    {
      at: 55,
      text: '这就是「平衡条件与倾角无关」的原因：τ₁/τ₂ = m₁L₁/(m₂L₂)，cosθ 约掉了。判据只看质量与杆长。',
      highlight: ['bar'],
    },
    {
      at: 64,
      text: '最后把平衡调出来：m₁ = 2 @ 40 cm，m₂ = 4 @ 20 cm。2×40 = 4×20，净力矩归零，杠杆**静静停在水平**——摆幅随不平衡度一起消失。',
      params: { m1: 2, L1: 40, m2: 4, L2: 20 },
      highlight: ['bar', 'pivot-pt'],
      pause: true,
    },
  ],

  formulas: [
    { tex: 'F_1 L_1 = F_2 L_2', caption: '杠杆平衡条件：动力矩与阻力矩大小相等、方向相反。' },
    { tex: '\\tau = (\\vec r\\times\\vec F)_z = -F\\,r_x', caption: '力矩的叉积定义。力竖直向下时只与作用点的水平坐标有关。' },
    { tex: 'd = L\\cos\\theta', caption: '力臂：支点到力的作用线的垂直距离。只有杠杆水平（θ=0）时才等于杆长 L。' },
    { tex: '\\frac{\\tau_1}{\\tau_2}=\\frac{m_1 L_1}{m_2 L_2}', caption: '两端都是重力时 g 被约掉——搬到月球上照样平衡。' },
  ],

  pitfalls: [
    {
      title: '把力臂当成杆上从支点到挂点的长度',
      wrong: '力臂就是支点到挂点那段杆的长度，恒定不变',
      right: '力臂是支点到**力的作用线**的垂直距离，杠杆倾斜时缩短为 L·cosθ',
      desc: '课本只画水平杠杆，这个区别被完全藏起来了。把杠杆转到倾斜位置，比较绿色水平线段和蓝色斜杆——两者明显不等长。这是本节最值得动手转一圈的地方。',
    },
    {
      title: '以为杠杆倾斜后平衡条件就失效了',
      wrong: 'F₁L₁ = F₂L₂ 只在杠杆水平时成立',
      right: '两边力臂同步乘上 cosθ，约掉后判据不变，任意倾角都成立',
      desc: '看图表里两条曲线：它们始终同步。平衡的判据是质量与杆长的乘积之比，与倾角无关。',
    },
    {
      title: '认为力臂越长的那端一定下沉',
      wrong: '力臂长的一端力矩大，一定往下压',
      right: '要看**力 × 力臂**的乘积，不是单看力臂',
      desc: '把 m₁ 调到 0.5 kg、L₁ 拉到 100 cm，同时 m₂ = 8 kg、L₂ = 20 cm：动力端力臂虽长，但 0.5×100 = 50 < 8×20 = 160，仍然翘起。',
    },
    {
      title: '把支点支持力当成某一侧的力',
      wrong: '支点受到的压力等于较重的那一边',
      right: 'R = F₁ + F₂，两侧的压力都要承担',
      desc: '看读数里的「支点支持力」：无论怎么调，它恒等于 F₁ + F₂，而不是其中较大的那个。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '杠杆倾斜到最大角度时，力臂与杆上那段长度相比如何？',
      options: ['相等', '力臂更短', '力臂更长', '随机变化'],
      answer: 1,
      explain: '力臂 = L·cosθ，而 cos θ < 1（θ≠0），所以倾斜时力臂总是比杆上那段短。',
      applyParams: { m1: 2, m2: 8, L1: 60, L2: 30 },
    },
    {
      type: 'single-choice',
      prompt: '左端 2 kg 挂在 40 cm 处，右端 4 kg 挂在 20 cm 处，杠杆是否平衡？',
      options: ['平衡', '左端下沉', '右端下沉', '无法判断'],
      answer: 0,
      explain: 'm₁L₁ = 2×40 = 80，m₂L₂ = 4×20 = 80，两者相等，杠杆平衡并静止在水平位置。',
      applyParams: { m1: 2, L1: 40, m2: 4, L2: 20 },
    },
    {
      type: 'predict-then-run',
      prompt: '把这套装置搬到月球上（g 变为约 1/6），平衡状态会怎样？',
      options: ['不再平衡', '依然平衡', '变为随机', '取决于质量'],
      answer: 1,
      explain: '两端力都是重力，g 是公因子：m₁gL₁ = m₂gL₂ 两边的 g 同时约掉，平衡与否只取决于 m·L。',
      applyParams: { m1: 2, L1: 40, m2: 4, L2: 20 },
    },
  ],

  assumptions: [
    '杠杆按**无质量刚体**处理：忽略杆自重产生的力矩，否则支点两侧还需各加一项自重力矩。',
    '两个力均**严格竖直向下**（钩码悬挂），不受杠杆倾斜影响；真实情况下挂点会随杆移动，但仍竖直。',
    '摆动按余弦规律驱动（θ = θ_amp·cos ωt），是"演示摆动"的理想化，不是由净力矩积分出的真实动力学。',
    '摆幅与不平衡度成正比，为教学可视化设定，不代表真实的转动动力学（真实情况需要转动惯量与角加速度）。',
    '忽略支点摩擦与空气阻力，系统无能量耗散，摆动不会衰减。',
  ],

  duration: 74,
};
