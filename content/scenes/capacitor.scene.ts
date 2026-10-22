import type { SceneSpec } from '@/engine/spec';
import { PLATE_T } from '@/engine/solvers/capacitor';

/**
 * 平行板电容器 · 带电粒子在匀强电场中偏转
 *
 * 为什么必须真 3D：「板间是匀强电场」是一个**空间**结论——
 * 极板之间任何一点、任何高度的 E 都相同。只有把整个间隙当作一个体积来看，
 * 才能直观看到"偏转量与入射高度无关"。课本的剖面图会让人误以为只有中间那条线受力。
 *
 * 规格：docs/specs/features/005-capacitor.spec.md
 */
export const capacitorScene: SceneSpec = {
  meta: {
    id: 'capacitor',
    title: '平行板电容器：一束电子怎么被掰弯',
    subtitle: 'E = U/d · C = ε₀S/d · 偏转 y = qEL²/(2mv₀²)',
    stage: 'senior',
    chapterId: 'g3-2',
    difficulty: 2,
    dimension: '3d',
    minutes: 13,
    tags: ['电容器', '匀强电场', '偏转', '电容', '带电粒子'],
    pitch: '把"板间处处场强相同"从一句结论，变成一个可以转着看的立体间隙',
  },

  // 世界尺度是米：极板 30 cm × 30 cm，相机距离约 0.75 m
  camera: { position: [0.44, 0.32, 0.56], target: [0, 0, 0], fov: 45 },

  world: { showGrid: false, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'U',
      label: '电压 U',
      unit: 'V',
      min: 0,
      max: 500,
      step: 10,
      default: 300,
      hint: 'U = 0 时粒子直线飞出——这就是"没有电场时"的对照组',
    },
    {
      type: 'slider',
      key: 'd',
      label: '板间距 d',
      unit: 'cm',
      min: 0.2,
      max: 8,
      step: 0.1,
      default: 3,
      hint: 'd 越小场强越大（E=U/d），同时电容也越大（C=ε₀S/d）',
    },
    {
      type: 'slider',
      key: 'v0',
      label: '入射速率 v₀',
      unit: 'm/s',
      min: 200,
      max: 2000,
      step: 50,
      default: 800,
      hint: 'v₀ 越小，在板间飞得越久，偏转越大；太小会直接撞上极板',
    },
    {
      type: 'slider',
      key: 'q',
      label: '粒子电荷 q',
      unit: 'nC',
      min: -3,
      max: 3,
      step: 0.5,
      default: 1,
      hint: '调成负值，偏转方向立刻反过来（正负电荷受力方向相反）',
    },
  ],

  solver: { kind: 'capacitor' },

  objects: [
    /* ---------- 两块极板（实体圆角金属） ---------- */
    {
      type: 'box',
      id: 'plate-pos',
      size: [0.3, 0.3, PLATE_T],
      position: 'platePos',
      round: 0.004,
      color: '#d9705f',
      metalness: 0.9,
      roughness: 0.32,
      emissive: 0.35,
    },
    {
      type: 'box',
      id: 'plate-neg',
      size: [0.3, 0.3, PLATE_T],
      position: 'plateNeg',
      round: 0.004,
      color: '#5b8fd9',
      metalness: 0.9,
      roughness: 0.32,
    },

    /* ---------- 无电场时的直线路径（对照组） ---------- */
    {
      type: 'polyline',
      id: 'straight',
      bind: 'straight',
      color: '#64748b',
      width: 1.4,
      dashed: true,
    },

    /* ---------- 匀强电场的示意箭头：等长 = 处处相同 ---------- */
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => ({
      type: 'vector' as const,
      id: `efield-${i}`,
      bind: `E${i}`,
      origin: `f${i}`,
      color: '#38bdf8',
      radius: 0.008,
      opacity: 0.9,
    })),

    /* ---------- 粒子与轨迹 ---------- */
    {
      type: 'trail',
      id: 'trail',
      bind: 'trail',
      color: '#facc15',
      width: 3,
    },
    {
      type: 'particle',
      id: 'particle',
      bind: 'pos',
      radius: 0.009,
      color: '#fde047',
      glow: true,
    },
    {
      type: 'vector',
      id: 'E-vec',
      bind: 'E',
      color: '#a78bfa',
      radius: 0.005,
      label: 'E',
    },
    {
      type: 'vector',
      id: 'F-vec',
      bind: 'F',
      color: '#ef4444',
      radius: 0.0055,
      label: 'F = qE',
    },

    /* ---------- 标注 ---------- */
    { type: 'text', id: 'label-pos', text: '正极板 +', position: 'labelPos', color: '#ffb3a7', size: 13 },
    { type: 'text', id: 'label-neg', text: '负极板 −', position: 'labelNeg', color: '#a8c8ff', size: 13 },
    { type: 'text', id: 'label-particle', text: '带电粒子', position: 'entry', color: '#fde047', size: 12 },
  ],

  hud: {
    readouts: [
      { label: '场强 E', bind: 'E', unit: 'V/m', digits: 0 },
      { label: '电容 C', bind: 'C', unit: 'pF', digits: 1 },
      { label: '电量 Q', bind: 'Q', unit: 'nC', digits: 2 },
      { label: '储能 W', bind: 'W', unit: 'nJ', digits: 1 },
      { label: '偏转量 y', bind: 'z', unit: 'mm', digits: 2 },
      { label: '速率 v', bind: 'speed', unit: 'm/s', digits: 0 },
      {
        label: '动能 Eₖ',
        bind: 'KE',
        unit: 'nJ',
        digits: 2,
        hint: '粒子靠近异号极板，电场力做正功，动能增大',
      },
      {
        label: '总能 Eₖ+Eₚ',
        bind: 'ME',
        unit: 'nJ',
        digits: 2,
        constant: true,
        hint: '静电力是保守力：动能与电势能互相转化，总量不变',
      },
    ],
    charts: [
      {
        title: '偏转量 y 随位移 x 的变化',
        series: [
          { bind: 'z', label: 'y', color: '#facc15' },
          { bind: 'E', label: 'E', color: '#38bdf8' },
        ],
        yLabel: 'mm / (V/m)',
        note: 'y 是一条抛物线（x 方向匀速、z 方向匀加速）；E 是一条水平线——匀强电场',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '两块平行金属板，上面接正、下面接负。中间那块黄色的带电粒子正沿着中线飞进来。',
      camera: { position: [0.44, 0.32, 0.56], target: [0, 0, 0] },
      highlight: ['plate-pos', 'plate-neg', 'particle'],
    },
    {
      at: 7,
      text: '先看对照组：把电压调到 0。粒子沿直线飞出——这就是"没有电场时"会发生的事。',
      params: { U: 0 },
      highlight: ['straight', 'trail'],
    },
    {
      at: 14,
      text: '现在加上 300 V。八个蓝色箭头是板间的电场：它们长短一样、方向一样——这就是"匀强"两个字的意思。',
      params: { U: 300 },
      highlight: ['efield-0', 'efield-1', 'efield-2', 'efield-3'],
    },
    {
      at: 21.5,
      text: '注意箭头的指向：从正极板指向负极板。正电荷顺着它走，所以粒子往下偏；把电荷改成负的，偏转立刻反过来。',
      params: { q: 1 },
      highlight: ['E-vec', 'F-vec', 'particle'],
    },
    {
      at: 29,
      text: '转到侧面看：偏转轨迹是一条抛物线。水平方向不受力（匀速），竖直方向受恒力（匀加速）——两条规律叠出来的。',
      camera: { position: [0.05, 0.05, 0.68], target: [0, 0, 0] },
      highlight: ['trail', 'straight'],
    },
    {
      at: 36.5,
      text: '最容易被忽略的一点：偏转量与入射高度无关。因为板间每一点的 E 都相同——从中间飞和从边上飞，弯得一样多。',
      highlight: ['efield-4', 'efield-5', 'efield-6', 'efield-7'],
    },
    {
      at: 44,
      text: '把电压提高到 500 V，粒子当场撞在极板上。偏转太大不是"掉下去"，是根本没飞出去。',
      params: { U: 500 },
      highlight: ['particle', 'plate-neg'],
    },
    {
      at: 51.5,
      text: '这块电容器本身也有参数：C = ε₀S/d。把板间距从 3 cm 拉到 6 cm，电容减半，而场强 E = U/d 也减半。',
      params: { U: 300, d: 6 },
      highlight: ['plate-pos', 'plate-neg'],
    },
    {
      at: 59,
      text: '看读数：电容、电量、储能一起变。示波器、手机触摸屏、心脏除颤器，用的都是这条公式。',
      highlight: [],
    },
    {
      at: 65,
      text: '最后记住那个抛物线公式：y = qEL²/(2mv₀²)。L 是极板长度，v₀² 在分母——飞得越快，越"直"。',
      pause: true,
    },
  ],

  formulas: [
    {
      tex: 'E=\\frac{U}{d}',
      caption: '板间匀强电场。与位置无关，只由电压和间距决定。',
    },
    {
      tex: 'y=\\frac{qEL^{2}}{2mv_{0}^{2}}',
      caption: '出射偏转量。L 是极板长度，v₀² 在分母：飞得越快，偏得越少。',
    },
    {
      tex: 'C=\\frac{\\varepsilon_{0}S}{d}',
      caption: '平行板电容。d 减半 → C 翻倍、E 翻倍、偏转翻倍。',
    },
    {
      tex: 'W=\\frac{1}{2}CU^{2}',
      caption: '电容器储存的能量。充电时电源做的功有一半变成热，只有一半存下来。',
    },
  ],

  pitfalls: [
    {
      title: '认为只有中线上的粒子受力',
      wrong: '电场线只画在中间，所以只有从中间射入的粒子才会偏转',
      right: '板间是匀强电场，偏离中线的粒子受力完全相同，偏转量也相同',
      desc: '把视角转到侧面看八个蓝色箭头：它们铺满了整个间隙，长短方向一模一样。偏转量与入射高度无关。',
    },
    {
      title: '把电容 C 当成"装多少电"的固定值',
      wrong: '这个电容器能装 20 nC 电',
      right: 'C 只由几何决定（C=ε₀S/d），Q = CU 才随电压变',
      desc: '拖动电压，Q 与 W 一起变，而 C 不变；拖动板间距，C 才变。这三个量要分开记。',
    },
    {
      title: '认为电压不变时拉开极板，场强也不变',
      wrong: '电源接着，电场就不变',
      right: 'U 恒定时 E = U/d，拉开极板场强减小（若断开电源保持 Q 不变，拉开才会让 E 不变）',
      desc: '本场景默认"电压源始终接着"。把 d 从 1 cm 拉到 2 cm，读数里的 E 会减半。',
    },
    {
      title: '以为粒子偏转后速度方向沿电场线',
      wrong: '粒子被电场掰了一下，之后就顺着电场线飞',
      right: '离开极板后不再受力，粒子沿**出射时的切线方向**匀速直线飞出',
      desc: '看黄色轨迹：飞出右端之后是直线，而且方向是斜的——速度有水平分量，电场只贡献了竖直分量。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '保持其它条件不变，把入射速率 v₀ 提高到原来的 2 倍，出射偏转量怎么变？',
      options: ['不变', '变为原来的 1/2', '变为原来的 1/4', '变为原来的 2 倍'],
      answer: 2,
      explain: 'y = qEL²/(2mv₀²)，偏转量与 v₀² 成反比。v₀ 翻倍 → 偏转变为 1/4。',
      applyParams: { v0: 1600 },
    },
    {
      type: 'predict-then-run',
      prompt: '把粒子电荷改成负的，其它不变，会发生什么？',
      options: ['轨迹消失', '偏转方向反过来，大小不变', '偏转变大', '速率变慢'],
      answer: 1,
      explain: 'y = qEL²/(2mv₀²) 与 q 成正比且含符号：q 变负 → 偏转反向；|q| 不变 → 大小不变。',
      applyParams: { q: -1 },
    },
    {
      type: 'single-choice',
      prompt: '电压源始终接着，把板间距 d 拉大到原来的 2 倍，场强 E 与电容 C 分别怎么变？',
      options: ['E 不变，C 减半', 'E 减半，C 减半', 'E 加倍，C 加倍', 'E 减半，C 加倍'],
      answer: 1,
      explain: 'U 恒定时 E = U/d → E 减半；C = ε₀S/d → C 也减半。若改为断开电源（Q 不变），拉开极板 E 才不变。',
      applyParams: { d: 6 },
    },
  ],

  assumptions: [
    '采用「示教粒子」：质量取 1e-9 kg，使 q/m ≈ 1 C/kg。真实电子的 q/m ≈ 1.76×10¹¹ C/kg，运动规律同构，但时间尺度差两个量级。',
    '极板视为无限大平行板，忽略边缘效应（真实电容器在板边附近电场会翘起来）。',
    '电场箭头用示意长度（取间距的 40%），真实 |E| 见读数；两板间任何位置的 E 大小方向都相同。',
    '极板尺寸固定为 30 cm × 30 cm、厚 1.2 cm（求解器 PLATE_T），不随参数变化——否则视觉尺寸会和轨迹不一致。',
    '默认板间距取 3 cm：这是"箭头在间隙里还看得清"与"接近课本例题"之间的折中；拖到 0.2 cm 时箭头会退化成一个点。',
  ],

  duration: 72,
};
