import type { SceneSpec } from '@/engine/spec';

/**
 * 洛伦兹力 · 带电粒子在匀强磁场中的运动
 *
 * 为什么必须真 3D：F = qv×B 中 F 垂直于 v 与 B 张成的平面，
 * 这是一个"只能转着看才能确认"的空间关系。2D 示意图永远在骗人。
 */
export const lorentzForceScene: SceneSpec = {
  meta: {
    id: 'lorentz-force',
    title: '洛伦兹力：带电粒子在磁场中怎么走',
    subtitle: 'F = qv×B · 匀速圆周运动 · 螺旋线',
    stage: 'senior',
    chapterId: 'gx2-1',
    difficulty: 2,
    dimension: '3d',
    minutes: 12,
    tags: ['磁场', '洛伦兹力', '圆周运动', '右手定则', '螺旋线'],
    pitch: '把 F 垂直于 v-B 平面这件事，转着看一遍就再也忘不掉',
  },

  camera: { position: [7.6, 6.1, 10.4], target: [0, 0, 5], fov: 45 },

  // 装饰层：开场粒子弹出 + 光晕扩散（trail-bloom）——先看到"有个东西进去了"，再看它转
  decor: { subject: 'particle', intro: { kind: 'trail-bloom' } },

  world: { gridSize: 26, gridDivisions: 26, showGrid: true, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'q',
      label: '电荷量 q',
      unit: 'C',
      min: -3,
      max: 3,
      step: 0.5,
      default: 1,
      hint: '取负值可看反向偏转；注意 F 方向对正负电荷是相反的',
    },
    {
      type: 'slider',
      key: 'm',
      label: '质量 m',
      unit: 'kg',
      min: 0.5,
      max: 3,
      step: 0.5,
      default: 1,
      hint: 'm 越大，同样条件下转弯半径越大（惯性大）',
    },
    {
      type: 'slider',
      key: 'B',
      label: '磁感应强度 B',
      unit: 'T',
      min: 0.5,
      max: 5,
      step: 0.5,
      default: 2,
      hint: 'B 翻倍 → r 减半、T 减半',
    },
    {
      type: 'slider',
      key: 'v0',
      label: '初速度 v₀',
      unit: 'm/s',
      min: 2,
      max: 20,
      step: 1,
      default: 10,
    },
    {
      type: 'slider',
      key: 'theta',
      label: 'v 与 B 的夹角 θ',
      unit: '°',
      min: 0,
      max: 180,
      step: 5,
      default: 90,
      hint: 'θ=90° 是圆周；θ=0/180° 是直线；中间是螺旋线',
    },
  ],

  solver: { kind: 'lorentz' },

  objects: [
    {
      type: 'grid',
      id: 'floor',
      size: [26, 26],
      divisions: 26,
      plane: 'xz',
      color: '#1b4459',
      opacity: 0.3,
    },
    {
      type: 'fieldArrows',
      id: 'B-field',
      dir: [0, 1, 0],
      count: [3, 2, 5],
      spacing: 4.2,
      color: '#38bdf8',
      opacity: 0.4,
      flipBind: 'bSign',
    },
    {
      // 磁场区雾墙（W4 补墨）：把"匀强磁场充满这个空间"画成一块半透明体积，
      // 与 B-field 箭头阵列同体积对齐。只是示意的着色体积，不承载任何物理量。
      type: 'box',
      id: 'B-region',
      size: [13.2, 6, 21.5],
      position: [0, 0, 0],
      color: '#38bdf8',
      opacity: 0.16,
      unlit: true,
    },
    {
      type: 'polyline',
      id: 'ideal-circle',
      bind: 'circle',
      color: '#1e4b5e',
      width: 1.2,
      dashed: true,
    },
    {
      // 光晕层（W4 补墨）：同一条轨迹的宽淡副本，细线在浅底上才有"荧光"的体积感
      type: 'trail',
      id: 'trail-halo',
      bind: 'trail',
      color: '#22d3ee',
      width: 16,
      opacity: 0.16,
    },
    {
      type: 'trail',
      id: 'trail',
      bind: 'trail',
      color: '#22d3ee',
      width: 6.5,
    },
    {
      type: 'particle',
      id: 'particle',
      bind: 'pos',
      radius: 0.36,
      color: '#ff8a3d',
      glow: true,
    },
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      color: '#4ade80',
      scale: 0.26,
      maxLength: 4.4,
      label: 'v',
    },
    {
      type: 'vector',
      id: 'F-vec',
      bind: 'F',
      color: '#ef4444',
      scale: 0.1,
      maxLength: 3.2,
      label: 'F = qv×B',
    },
    {
      type: 'text',
      id: 'label-B',
      text: 'B（匀强磁场）',
      position: [0, 5.4, -5],
      color: '#38bdf8',
      size: 12,
    },
  ],

  hud: {
    readouts: [
      {
        label: '速率 |v|',
        bind: 'speed',
        unit: 'm/s',
        digits: 2,
        constant: true,
        hint: '磁场不做功，速率恒定——这是本节最重要的一条',
      },
      { label: '垂直分量 v⊥', bind: 'vPerp', unit: 'm/s', digits: 2 },
      { label: '平行分量 v∥', bind: 'vPara', unit: 'm/s', digits: 2 },
      { label: '洛伦兹力 |F|', bind: 'F', unit: 'N', digits: 1 },
      { label: '半径 r', bind: 'r', unit: 'm', digits: 2 },
      { label: '周期 T', bind: 'T', unit: 's', digits: 2 },
      { label: '已转圈数', bind: 'turns', unit: '圈', digits: 2 },
      { label: '螺距', bind: 'pitch', unit: 'm', digits: 2 },
    ],
    charts: [
      {
        title: 'x–t / z–t 投影',
        series: [
          { bind: 'x', label: 'x', color: '#22d3ee' },
          { bind: 'z', label: 'z', color: '#ff8a3d' },
        ],
        yLabel: 'm',
        note: '圆周运动在两个方向上的投影都是简谐振动',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '一个带正电的粒子以速度 v 射入匀强磁场 B。蓝色箭头表示磁场方向，竖直向上。',
      camera: { position: [7.6, 6.1, 10.4], target: [0, 0, 5] },
      highlight: ['B-field'],
    },
    {
      at: 6,
      text: '它立刻受到洛伦兹力 F = qv×B。注意红色箭头：F 同时垂直于 v 和 B，指向圆的中心。',
      highlight: ['v-vec', 'F-vec', 'particle'],
    },
    {
      at: 13,
      text: '现在自己拖动视角绕一圈——从任何角度看，F 始终垂直于 v，永远指向同一点。这就是"圆周运动"的几何本质。',
      camera: { position: [-7.0, 5.0, 8.7], target: [0, 0, 5] },
      highlight: ['F-vec', 'ideal-circle'],
    },
    {
      at: 21,
      text: '因为 F ⊥ v，洛伦兹力不做功，速率始终不变。看右侧绿色的 |v| 读数——它一直是 10，一秒都没变过。',
      camera: { position: [0, 14, 6], target: [0, 0, 4.6] },
      highlight: ['trail'],
    },
    {
      at: 29,
      text: '半径由 r = mv⊥/(qB) 决定。把 B 从 2 T 调到 4 T，半径立刻减半。',
      params: { B: 4 },
      highlight: ['ideal-circle', 'particle'],
    },
    {
      at: 37,
      text: '但如果 v 不垂直于 B 呢？把 θ 调到 45°：平行于 B 的那份速度不受力，轨迹被"拉"成了螺旋线。',
      params: { theta: 45 },
      camera: { position: [7.6, 5.9, 10.0], target: [0, 0, 5] },
      highlight: ['trail'],
    },
    {
      at: 46,
      text: '回旋加速器、质谱仪、甚至极光——背后都是这同一条规律。',
      pause: true,
    },
  ],

  formulas: [
    {
      tex: '\\vec{F}=q\\vec{v}\\times\\vec{B}',
      caption: '洛伦兹力。叉乘决定了 F 垂直于 v 与 B 张成的平面；负电荷时方向相反。',
    },
    {
      tex: 'r=\\frac{mv_\\perp}{|q|B}',
      caption: '圆周半径。v⊥ 越大、m 越大、B 越小，转得越"大圈"。',
    },
    {
      tex: 'T=\\frac{2\\pi m}{|q|B}',
      caption: '周期与速率无关——这正是回旋加速器能工作的前提。',
    },
  ],

  pitfalls: [
    {
      title: '把 F 画成"顺着 B"',
      wrong: '洛伦兹力沿磁场方向，把粒子往磁场方向推',
      right: 'F ⊥ v 且 F ⊥ B，方向由右手定则（负电荷反向）确定',
      desc: 'F = qv×B 是叉乘，结果必然垂直于 v 和 B。转动视角观察红色箭头：它在水平面内，与竖直的 B 严格垂直。',
    },
    {
      title: '以为磁场会对粒子做功',
      wrong: '磁场让粒子加速了，所以磁场做了功',
      right: 'F ⊥ v ⟹ P = F·v = 0 ⟹ 磁场不做功，速率与动能都不变',
      desc: '磁场只改变速度的方向。右侧的 |v| 读数刻意用绿色标出，就是从数值上盯住这一点。',
    },
    {
      title: '受力分析时多画一个"向心力"',
      wrong: '粒子受洛伦兹力，还受一个向心力',
      right: '向心力不是新的力，它就是洛伦兹力本身扮演的角色',
      desc: '受力分析只画真实存在的力。写 F = mv²/r 时，左边的 F 就是洛伦兹力，不要再另加一项。',
    },
    {
      title: '认为 T 与速度有关',
      wrong: 'v 越大，转一圈要越久',
      right: 'T = 2πm/(|q|B) 与 v 无关；v 变大只是圈变大，角速度不变',
      desc: '可以自己把 v₀ 从 10 调到 20：半径翻倍，但周期读数不动。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '保持其它条件不变，把磁感应强度 B 增大为原来的 2 倍，轨道半径怎么变？',
      options: ['不变', '变为原来的 1/2', '变为原来的 2 倍', '变为原来的 1/4'],
      answer: 1,
      explain: 'r = mv⊥/(|q|B)，r 与 B 成反比。B 翻倍 → 半径减半，同时周期也减半。',
      applyParams: { B: 4 },
    },
    {
      type: 'predict-then-run',
      prompt: '把 v 与 B 的夹角从 90° 减小到 45°，轨迹会变成什么？',
      options: ['半径更小的圆', '螺旋线', '一条直线', '抛物线'],
      answer: 1,
      explain:
        '速度分解后，平行于 B 的分量 v∥ 不受力（匀速直线），垂直分量 v⊥ 做圆周运动——两者叠加就是螺旋线。',
      applyParams: { theta: 45 },
    },
    {
      type: 'single-choice',
      prompt: '若把电荷量改成负值（q < 0），其它不变，会发生什么？',
      options: ['轨迹消失', '半径不变，旋转方向反转', '半径变大', '速率变小'],
      answer: 1,
      explain: 'ω = qB/m 变号 → 旋转方向反转；半径 r = mv⊥/(|q|B) 只与 |q| 有关，大小不变。',
      applyParams: { q: -1 },
    },
  ],

  assumptions: [
    '为便于观察，采用"示教粒子"（q/m ≈ 1 C/kg）。真实质子、电子的 q/m 相差数个量级，但运动规律完全同构。',
    '忽略重力、相对论效应与辐射损失；磁场视为理想匀强磁场，边界无限大。',
  ],

  duration: 54,
};
