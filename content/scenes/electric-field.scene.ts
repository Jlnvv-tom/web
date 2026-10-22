import type { SceneSpec } from '@/engine/spec';

/**
 * 电场与电势 · 两个点电荷的场线与等势线
 *
 * 为什么必须真 3D：
 *   电场是"空间中每一点都有值"的矢量场，课本永远只给一张切面图，
 *   于是学生把电场理解成"平面上的几条曲线"。
 *   立体场线让"场充满空间"看得见；转动视角时，场线与等势线的垂直关系在透视下依然成立。
 *
 * 规格：docs/specs/features/001-electric-field.spec.md
 */
export const electricFieldScene: SceneSpec = {
  meta: {
    id: 'electric-field',
    title: '电场与电势：场线为什么会拐弯',
    subtitle: 'V = kΣq/r · E = kΣq/r² · 场线 ⊥ 等势面',
    stage: 'senior',
    chapterId: 'g3-1',
    difficulty: 2,
    dimension: '3d',
    minutes: 14,
    tags: ['电场', '电势', '电场线', '等势面', '点电荷', '叠加原理'],
    pitch: '把"电场充满空间"这件事，从课本的一张平面图变成可以转着看的立体场',
  },

  camera: { position: [6.5, 15, 19], target: [0, 0.4, 0], fov: 45 },

  world: { gridSize: 30, gridDivisions: 30, showGrid: true, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'q1',
      label: '左电荷 q₁',
      unit: 'nC',
      min: -5,
      max: 5,
      step: 0.5,
      default: 3,
      hint: '正值为正电荷（红），负值为负电荷（蓝）',
    },
    {
      type: 'slider',
      key: 'q2',
      label: '右电荷 q₂',
      unit: 'nC',
      min: -5,
      max: 5,
      step: 0.5,
      default: -3,
      hint: '把它也调成正的，看中间的"中性点"——那里场强为零，电势不为零',
    },
    {
      type: 'slider',
      key: 'd',
      label: '间距 d',
      unit: 'm',
      min: 2,
      max: 10,
      step: 0.5,
      default: 6,
      hint: '拉开距离，等势线会重新分布——但"处处垂直"的规律不变',
    },
    {
      type: 'select',
      key: 'mode',
      label: '场线视角',
      options: [
        { value: '3d', label: '立体' },
        { value: 'plane', label: '平面切片' },
      ],
      default: '3d',
      hint: '平面切片就是课本上的那张图；立体模式才看得到场的空间结构',
    },
    {
      type: 'slider',
      key: 'pr',
      label: '试探电荷释放点距原点',
      unit: 'm',
      min: 1,
      max: 12,
      step: 0.5,
      default: 5,
    },
    {
      type: 'slider',
      key: 'pa',
      label: '释放点方位角',
      unit: '°',
      min: 0,
      max: 360,
      step: 15,
      default: 90,
      hint: '换个位置释放，看它被推到哪儿去',
    },
    {
      type: 'slider',
      key: 'qt',
      label: '试探电荷 qₜ',
      unit: 'nC',
      min: -3,
      max: 3,
      step: 0.5,
      default: 1,
      hint: '调成 0 就没有受力；调成负值，力的方向立刻反过来',
    },
  ],

  solver: { kind: 'electricField' },

  objects: [
    {
      type: 'grid',
      id: 'floor',
      size: [30, 30],
      divisions: 30,
      plane: 'xz',
      color: '#16394a',
      opacity: 0.22,
    },
    // 场线：数量随参数变化，用 polylines（契约 v0.2）
    {
      type: 'polylines',
      id: 'field-lines',
      bind: 'fieldLines',
      color: '#22d3ee',
      width: 1.15,
      opacity: 0.6,
    },
    // 等势线：正电势暖色、负电势冷色、零势线单独一条白色
    {
      type: 'polylines',
      id: 'equip-pos',
      bind: 'equipPos',
      color: '#fbbf24',
      width: 2,
      dashed: true,
      opacity: 0.85,
    },
    {
      type: 'polylines',
      id: 'equip-neg',
      bind: 'equipNeg',
      color: '#7dd3fc',
      width: 2,
      dashed: true,
      opacity: 0.8,
    },
    {
      type: 'polylines',
      id: 'equip-zero',
      bind: 'equipZero',
      color: '#f1f5f9',
      width: 2.4,
      dashed: true,
      opacity: 1,
    },
    // 正负两种外观各放一个，按电荷符号显隐——球色永远与电性一致
    {
      type: 'particle',
      id: 'charge1-pos',
      bind: 'charge1',
      radius: 0.44,
      color: '#ff6b6b',
      glow: true,
      visible: 'q1pos',
    },
    {
      type: 'particle',
      id: 'charge1-neg',
      bind: 'charge1',
      radius: 0.44,
      color: '#60a5fa',
      glow: true,
      visible: 'q1neg',
    },
    {
      type: 'particle',
      id: 'charge2-pos',
      bind: 'charge2',
      radius: 0.44,
      color: '#ff6b6b',
      glow: true,
      visible: 'q2pos',
    },
    {
      type: 'particle',
      id: 'charge2-neg',
      bind: 'charge2',
      radius: 0.44,
      color: '#60a5fa',
      glow: true,
      visible: 'q2neg',
    },
    {
      type: 'particle',
      id: 'probe',
      bind: 'probe',
      radius: 0.2,
      color: '#facc15',
      glow: true,
    },
    {
      type: 'trail',
      id: 'trail',
      bind: 'trail',
      color: '#facc15',
      width: 3,
    },
    {
      type: 'vector',
      id: 'E-vec',
      bind: 'E',
      color: '#a78bfa',
      scale: 1.5,
      maxLength: 5,
      label: 'E',
    },
    {
      type: 'text',
      id: 'label-q1',
      text: 'q₁',
      position: 'label1',
      color: '#ff8f8f',
      size: 14,
    },
    {
      type: 'text',
      id: 'label-q2',
      text: 'q₂',
      position: 'label2',
      color: '#8fc4ff',
      size: 14,
    },
  ],

  hud: {
    readouts: [
      { label: '场强 |E|', bind: 'E', unit: 'V/m', digits: 2 },
      { label: '电势 V', bind: 'V', unit: 'V', digits: 2 },
      { label: '电场力 |F|', bind: 'F', unit: 'nN', digits: 2 },
      { label: '到 q₁ 距离', bind: 'r1', unit: 'm', digits: 2 },
      { label: '速率 v', bind: 'speed', unit: 'm/s', digits: 2 },
      { label: '动能 Eₖ', bind: 'KE', unit: 'nJ', digits: 2 },
      { label: '电势能 Eₚ', bind: 'PE', unit: 'nJ', digits: 2 },
      {
        label: '总能 Eₖ+Eₚ',
        bind: 'ME',
        unit: 'nJ',
        digits: 2,
        constant: true,
        hint: '静电力是保守力：动能与电势能互相转化，总量不变——盯住这一行',
      },
    ],
    charts: [
      {
        title: '动能 ↔ 电势能',
        series: [
          { bind: 'KE', label: 'Eₖ', color: '#facc15' },
          { bind: 'PE', label: 'Eₚ', color: '#38bdf8' },
        ],
        yLabel: 'nJ',
        note: '两条曲线此消彼长，和（总能）始终是一条水平线',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '左边一个正电荷，右边一个负电荷。青色细线是电场线——它画的不是任何粒子的路径，而是"每一点的场强方向"。',
      camera: { position: [6.5, 15, 19], target: [0, 0.4, 0] },
      highlight: ['charge1-pos', 'charge2-neg', 'field-lines'],
    },
    {
      at: 7.5,
      text: '看线的两端：从正电荷出发，一条条钻进负电荷。电场线不是闭合曲线，它始于正电荷、终于负电荷。',
      highlight: ['field-lines', 'charge1-pos', 'charge2-neg'],
    },
    {
      at: 15.5,
      text: '现在转一下视角。刚才那张图只是空间中的一层切片——立体模式下，场线是向四面八方辐射的。电场充满整个空间，不是平面上的几条线。',
      camera: { position: [-11, 9, 13], target: [0, 0.6, 0] },
      highlight: ['field-lines'],
    },
    {
      at: 24,
      text: '把右边也改成正电荷试试。两条"势力范围"互相顶住，中间出现一个箭头长度为零的地方——那里场强为零，叫中性点。',
      params: { q2: 3 },
      camera: { position: [5, 12, 15], target: [0, 0.4, 0] },
      highlight: ['field-lines', 'E-vec'],
    },
    {
      at: 33,
      text: '但中性点处的电势并不为零——注意读数：场强趋近于 0，电势仍是正的。场强和电势是两个不同的物理量。',
      highlight: ['probe'],
    },
    {
      at: 40.5,
      text: '虚线是等势线：沿同一条线走，电势处处相同。橙色是正电势，蓝色是负电势。等势线越密的地方，场强越大。',
      params: { q2: -3 },
      camera: { position: [6.5, 15, 19], target: [0, 0.4, 0] },
      highlight: ['equip-pos', 'equip-neg', 'equip-zero'],
    },
    {
      at: 48.5,
      text: '注意白色这条：它是 V=0 的等势线。等量异号时，它就是中垂面——电势为零，场强却不为零。这两个概念最容易混。',
      highlight: ['equip-zero'],
    },
    {
      at: 56.5,
      text: '最关键的一点：电场线和等势线处处垂直。转动视角看，这个直角在任何角度下都成立——这正是"等势面与电场垂直"的几何含义。',
      camera: { position: [-9, 10, 16], target: [0, 0.4, 0] },
      highlight: ['field-lines', 'equip-pos'],
    },
    {
      at: 64.5,
      text: '最后放一个试探电荷（黄点）：它从静止释放，一开始贴着场线走，随后就偏离了——因为速度一旦有了大小，力和速度就不再共线。',
      params: { qt: 1, pr: 5, pa: 90 },
      camera: { position: [7, 12, 17], target: [0, 0.5, 0] },
      highlight: ['probe', 'trail', 'E-vec'],
    },
    {
      at: 73,
      text: '所以"带电粒子沿电场线运动"是错的。它只在一种情况下成立：场线本身就是直线，且粒子从静止释放。',
      pause: true,
    },
  ],

  formulas: [
    {
      tex: 'V=\\sum_i \\frac{kq_i}{r_i}',
      caption: '电势是标量，可以直接相加——所以两个电荷的 V 只需代数和，符号自带。',
    },
    {
      tex: '\\vec{E}=\\sum_i \\frac{kq_i}{r_i^{2}}\\,\\hat{r}_i',
      caption: '场强是矢量，要按平行四边形法则叠加。注意 r̂ 从电荷指向场点。',
    },
    {
      tex: '\\vec{F}=q_t\\vec{E}',
      caption: '试探电荷受力。负电荷时 F 与 E 反向——这正是"场强方向"与"受力方向"容易混的地方。',
    },
    {
      tex: '\\vec{E}\\perp\\text{等势面}',
      caption: '沿等势面移动电荷不做功（ΔV=0），而 W=qE·Δs=0 说明 E 没有沿等势面的分量。',
    },
  ],

  pitfalls: [
    {
      title: '把电场线当成粒子的运动轨迹',
      wrong: '电场线就是带电粒子飞出去的路线，所以粒子会沿着那条线走',
      right: '电场线只是"场的方向"，粒子一旦有了速度，惯性会让它偏离场线',
      desc: '黄色试探电荷从静止释放时确实贴着场线起步，但很快就会偏离。只有"场线本身是直线 + 从静止释放"两个条件同时满足，轨迹才与场线重合。',
    },
    {
      title: '认为电场线可以相交',
      wrong: '两条电场线交叉的地方，场强方向有两个',
      right: '空间中每一点的 E 只有一个方向，所以电场线永不相交（中性点除外，那里 E=0）',
      desc: '把 q₂ 调成正电荷，两条场线在中性点附近互相"让开"，而不是交叉穿过去。',
    },
    {
      title: '把"场强为零"与"电势为零"混为一谈',
      wrong: '中性点场强为零，所以那里的电势也是零',
      right: '两个等量正电荷的中点：E=0，但 V=2kq/(d/2) > 0',
      desc: '反过来也成立：等量异号的中垂面上 V=0，而 E≠0。场强看的是"变化的快慢"，电势看的是"位置本身"。',
    },
    {
      title: '以为等势线越密场强越小',
      wrong: '等势线挤在一起说明那里"没什么变化"',
      right: '等势线越密，说明相同距离内电势变化越大，即 E=ΔV/Δd 越大',
      desc: '离电荷越近，等势线越密，场强越大——这两个"越"是同一个方向。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '两个等量异号点电荷，在它们连线的中垂面上取一点，该点电势是多少？',
      options: ['等于零', '大于零', '小于零', '无法判断'],
      answer: 0,
      explain: '中垂面上到两电荷距离相等，V = kq/r + k(−q)/r = 0。但那里的场强并不为零，方向由正电荷指向负电荷。',
    },
    {
      type: 'predict-then-run',
      prompt: '把一个正试探电荷从静止释放，它会沿着电场线运动吗？',
      options: ['一定沿电场线', '一定不沿电场线', '只有场线是直线时才沿', '取决于电荷量大小'],
      answer: 2,
      explain:
        '静止释放瞬间速度为零，加速度沿场线切线，所以起步是沿场线的。但一旦有了速度，惯性使速度方向不再紧跟场线方向，只有当场线是直线时两者才始终重合。',
      applyParams: { qt: 1, pr: 5, pa: 90 },
    },
    {
      type: 'predict-then-run',
      prompt: '两个等量正电荷，在连线中点处，场强与电势分别是？',
      options: ['E=0，V>0', 'E=0，V=0', 'E>0，V=0', 'E>0，V>0'],
      answer: 0,
      explain:
        '由对称性，两电荷在中点产生的场强大小相等、方向相反，矢量和为零；而电势是标量，两个正值相加仍大于零。这就是"场强为零、电势不为零"的典型例子。',
      applyParams: { q2: 3 },
    },
  ],

  assumptions: [
    '采用「示教粒子」：试探电荷质量取 1e-9 kg，使 q/m ≈ 1 C/kg。真实质子的 q/m ≈ 9.6×10⁷ C/kg，运动规律同构，但时间尺度差若干量级。',
    '等势面是三维曲面，本场景只在 y=0 平面上以「等势线」呈现——这是切面，不是全部。',
    '电荷视为真空中的理想点电荷，忽略重力、感应电荷、介质极化与辐射；r→0 时用软化半径 ε=1e-4 m 避免 1/r² 发散，在 r>0.05 m 处相对误差小于 1e-5。',
    '场线为等弧长步长的 RK4 流线积分（步长 0.22 m），超出 |r|>24 m 视为"走向无穷远"并被截断。',
  ],

  duration: 80,
};
