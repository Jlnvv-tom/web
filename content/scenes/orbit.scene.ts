import type { SceneSpec } from '@/engine/spec';

/**
 * 天体运动 · 开普勒三定律
 *
 * 为什么必须真 3D：开普勒三定律里最反直觉的是**面积定律**——
 * "相等时间扫过相等面积"在平面图上只是一个扇形示意图，
 * 而在 3D 里可以把近日点和远日点的两个扇形同时摆在眼前，直接比大小。
 * 轨道平面、焦点、径向矢量在空间中的关系，也只有转着看才清楚。
 *
 * 规格：docs/specs/features/007-orbit.spec.md
 *
 * ⚠️ 单位口径（见 007-orbit.spec.md §4）：
 *    - 时间轴单位是「地球年」
 *    - 世界坐标单位是「AU」（求解器输出前已除以 AU，不是米）
 *    - 只有 scalars 里的 r / E 等物理量保持 SI，HUD 用的是 rAU / vKms
 *   改任何数字前先确认它是哪一套单位。
 */
export const orbitScene: SceneSpec = {
  meta: {
    id: 'orbit',
    title: '开普勒三定律：行星为什么时快时慢',
    subtitle: 'T² ∝ a³ · 面积定律 · 椭圆轨道',
    stage: 'senior',
    chapterId: 'g2-3',
    difficulty: 2,
    dimension: '3d',
    minutes: 13,
    tags: ['开普勒定律', '万有引力', '椭圆轨道', '面积定律', '太阳系'],
    pitch: '把"相等时间扫过相等面积"从一个扇形插图，变成两个能并排比较的立体扇形',
  },

  // 世界坐标单位 = AU（1 个单位 ≈ 1.5 亿 km）
  camera: { position: [2.8, 2.0, 2.7], target: [0, 0, 0], fov: 45 },

  world: { showGrid: false, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'a',
      label: '半长轴 a',
      unit: 'AU',
      min: 0.3,
      max: 3,
      step: 0.1,
      default: 1,
      hint: '地球 1 AU、火星 1.52 AU、木星 5.2 AU。a 决定周期',
    },
    {
      type: 'slider',
      key: 'e',
      label: '偏心率 e',
      min: 0,
      max: 0.8,
      step: 0.02,
      default: 0.35,
      hint: 'e=0 是圆；e 越大椭圆越扁。彗星的 e 可以到 0.97',
    },
    {
      type: 'slider',
      key: 'M',
      label: '中心天体质量',
      unit: '10³⁰ kg',
      min: 0.05,
      max: 3,
      step: 0.05,
      default: 1.989,
      hint: '太阳 1.989。质量越大，同样轨道半径周期越短',
    },
    {
      type: 'slider',
      key: 'a2',
      label: '对比行星半长轴',
      unit: 'AU',
      min: 0.3,
      max: 4,
      step: 0.1,
      default: 1.52,
      hint: '第二条轨道，用来对比开普勒第三定律（默认取火星 1.52 AU）',
    },
    {
      type: 'slider',
      key: 'e2',
      label: '对比行星偏心率',
      min: 0,
      max: 0.8,
      step: 0.02,
      default: 0.1,
    },
    {
      type: 'toggle',
      key: 'showSecond',
      label: '显示对比行星',
      default: true,
    },
  ],

  solver: { kind: 'orbit' },

  objects: [
    /* ---------- 中心天体与行星 ---------- */
    // 半径按"看得见"取，不按真实比例（真实太阳半径只有 0.0046 AU，一个像素都不到）
    { type: 'particle', id: 'star', bind: 'star', radius: 0.042, color: '#fbbf24', glow: true },
    { type: 'particle', id: 'planet', bind: 'pos', radius: 0.028, color: '#38bdf8', glow: true },
    { type: 'particle', id: 'planet2', bind: 'planet2', radius: 0.022, color: '#a78bfa', glow: true, visible: 'showSecond' },

    /* ---------- 轨道 ---------- */
    { type: 'polyline', id: 'orbit', bind: 'orbit', color: '#1e6f8c', width: 1.4 },
    // 对比轨道要跟着开关一起消失，否则关掉开关后还留一条孤零零的虚线
    { type: 'polyline', id: 'orbit2', bind: 'orbit2', color: '#5b4a8c', width: 1.2, dashed: true, visible: 'showSecond' },
    { type: 'polyline', id: 'radius', bind: 'radius', color: '#f59e0b', width: 1.6, dashed: true },

    /* ---------- 扫过的扇形（面积定律的核心视觉） ---------- */
    { type: 'sector', id: 'sector-now', center: 'star', arc: 'sector', color: '#22d3ee', opacity: 0.3 },
    { type: 'sector', id: 'sector-ref', center: 'star', arc: 'sectorRef', color: '#f59e0b', opacity: 0.3 },

    /* ---------- 速度与标注 ---------- */
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      color: '#4ade80',
      radius: 0.012,
      // 求解器已把矢量长度归一到 ~0.8 AU 量级（见 orbit.ts 的 v 矢量注释）
      maxLength: 1.2,
      label: 'v',
    },
    { type: 'text', id: 'label-star', text: '中心天体（焦点）', position: 'star', color: '#fbbf24', size: 13 },
    { type: 'text', id: 'label-focus', text: '空焦点', position: 'emptyFocus', color: '#64748b', size: 11 },
  ],

  hud: {
    readouts: [
      { label: '周期 T', bind: 'T', unit: '年', digits: 3, constant: true, hint: '开普勒第三定律：T² ∝ a³，与偏心率无关' },
      { label: '对比行星周期', bind: 'T2', unit: '年', digits: 3 },
      { label: '日心距 r', bind: 'rAU', unit: 'AU', digits: 3 },
      { label: '速率 v', bind: 'vKms', unit: 'km/s', digits: 2 },
      { label: '近日距', bind: 'perihelion', unit: 'AU', digits: 3 },
      { label: '远日距', bind: 'aphelion', unit: 'AU', digits: 3 },
      { label: '近日速率', bind: 'vPeri', unit: 'km/s', digits: 2 },
      { label: '远日速率', bind: 'vAp', unit: 'km/s', digits: 2 },
      {
        label: '扫过面积（1/8 周期）',
        bind: 'areaNow',
        unit: 'AU²',
        digits: 4,
        constant: true,
        hint: '面积定律：不管在轨道哪个位置，相同时间扫过的面积都一样',
      },
      { label: '远日点对照面积', bind: 'areaRef', unit: 'AU²', digits: 4 },
    ],
  },

  script: [
    {
      at: 0,
      text: '一颗行星绕着中心天体转。注意它走的不是圆，而是椭圆——中心天体在椭圆的一个焦点上，另一个焦点是空的。',
      camera: { position: [2.8, 2.0, 2.7], target: [0, 0, 0] },
      highlight: ['orbit', 'star', 'label-focus'],
    },
    {
      at: 0.5,
      text: '把偏心率 e 从 0.35 拉到 0：椭圆立刻变成圆。e=0 是圆的特例，不是另一种东西。',
      params: { e: 0 },
      highlight: ['orbit'],
    },
    {
      at: 1.1,
      text: '现在把 e 推到 0.7：椭圆变得很扁。注意靠近中心天体时明显加速，远离时减速。',
      params: { e: 0.7 },
      highlight: ['orbit', 'v-vec'],
    },
    {
      at: 1.8,
      text: '青色扇形是这 1/8 个周期里扫过的面积，橙色扇形固定在远日点扫过同样时长。两个读数一模一样——这就是开普勒第二定律。',
      params: { e: 0.35 },
      highlight: ['sector-now', 'sector-ref'],
    },
    {
      at: 2.5,
      text: '为什么？因为角动量守恒：r²·dθ/dt 恒定，而扇形面积恰好是 ½r²dθ。转得越快，力臂越短，乘积不变。',
      highlight: ['radius', 'sector-now'],
    },
    {
      at: 3.2,
      text: '第三条定律看周期：半长轴 1 AU 时周期 1 年；换成火星的 1.52 AU，周期变成 1.87 年——T 与 a 的 3/2 次方成正比。',
      params: { a: 1 },
      highlight: ['orbit', 'orbit2'],
    },
    {
      at: 3.9,
      text: '注意：周期只由半长轴决定，和偏心率无关。一个很扁的轨道和一个正圆的轨道，只要 a 相同，跑完一圈的时间就相同。',
      params: { e: 0.7 },
      highlight: ['orbit'],
    },
    {
      at: 4.5,
      text: '活力公式给出速率：近日点 (1+e)/(1−e) 倍于远日点。e=0.7 时，近日点要比远日点快 5.7 倍。',
      params: { e: 0.7 },
      highlight: ['v-vec', 'planet'],
    },
    {
      at: 5.1,
      text: '哈雷彗星、冥王星、人造卫星——全都服这三条定律。牛顿后来用万有引力把它们解释了出来。',
      params: { e: 0.35 },
      pause: true,
    },
  ],

  formulas: [
    { tex: '\\frac{x^2}{a^2}+\\frac{y^2}{b^2}=1', caption: '椭圆轨道。中心天体在一个焦点上，b = a√(1−e²)。' },
    { tex: '\\frac{dA}{dt}=\\frac{1}{2}r^2\\frac{d\\theta}{dt}=\\text{常量}', caption: '面积定律。本质是角动量守恒。' },
    { tex: 'T^2=\\frac{4\\pi^2}{GM}a^3', caption: '开普勒第三定律。T 只由半长轴 a 决定，与 e 无关。' },
    { tex: 'v=\\sqrt{GM\\left(\\frac{2}{r}-\\frac{1}{a}\\right)}', caption: '活力公式。近日点 r 小所以 v 大。' },
  ],

  pitfalls: [
    {
      title: '认为椭圆轨道有两个中心',
      wrong: '中心天体在椭圆的中心，所以两边对称受力',
      right: '中心天体在**焦点**上，不在中心。另一个焦点什么都没有',
      desc: '场景里特意标出了"空焦点"：把视角转过去看，那个点上没有任何天体。椭圆中心到两焦点的距离是 c = ae。',
    },
    {
      title: '以为行星在远日点"慢下来"是因为受力变小',
      wrong: '离得远引力小，所以速度慢',
      right: '速度变化是角动量守恒的结果，不是"引力小所以慢"这么直接',
      desc: '引力确实变小，但决定速率的是活力公式 v²=GM(2/r−1/a)。面积定律给的是同一件事的另一种说法。',
    },
    {
      title: '认为轨道越扁周期越短',
      wrong: 'e 越大，行星跑得越"急"，周期越短',
      right: '周期只由半长轴 a 决定（T² ∝ a³），与 e 无关',
      desc: '把 e 从 0 拖到 0.7，周期读数一动不动。要让周期变，必须改 a 或改中心天体质量。',
    },
    {
      title: '把"扫过面积相等"理解成"弧长相等"',
      wrong: '相等时间走过相等的弧长',
      right: '相等时间扫过相等的**面积**；近日点弧长远大于远日点',
      desc: '看两个扇形：靠近中心天体那个又窄又长，远处那个又宽又扁，面积却相同。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '保持半长轴不变，把偏心率从 0.2 拉到 0.7，周期怎么变？',
      options: ['变短', '变长', '不变', '变为 3.5 倍'],
      answer: 2,
      explain: 'T² = 4π²a³/GM 里没有 e。周期只由半长轴决定——这是开普勒第三定律最容易被忽略的一点。',
      applyParams: { e: 0.7 },
    },
    {
      type: 'predict-then-run',
      prompt: '把半长轴从 1 AU 增加到 4 AU，周期变成多少？',
      options: ['4 倍', '8 倍', '16 倍', '2 倍'],
      answer: 1,
      explain: 'T ∝ a^{3/2}。a 变 4 倍 → 4^1.5 = 8 倍。这正是"外行星更慢"的定量原因。',
      applyParams: { a: 3 },
    },
    {
      type: 'single-choice',
      prompt: '关于开普勒第二定律，下面哪句是对的？',
      options: [
        '相等时间走过相等弧长',
        '相等时间扫过相等面积',
        '近日点角速度更小',
        '面积定律只在圆轨道成立',
      ],
      answer: 1,
      explain: '面积定律：r²dθ/dt 恒定。近日点 r 小，所以 dθ/dt 大——角速度更快，弧长也更长。',
    },
  ],

  assumptions: [
    '时间轴单位是「地球年」而非秒（物理周期约 3.16×10⁷ s，直接放进度轴会变成长串数字）。',
    '二体问题：忽略其他行星的扰动，中心天体视为固定不动（实际是绕共同质心运动）。',
    '中心天体的显示半径取 0.1 AU，远大于真实比例——按真实比例它只有一个像素点。',
    '轨道画在 z=0 平面内；真实太阳系各轨道有小的倾角，本场景不体现。',
  ],

  duration: 5.6,
};
