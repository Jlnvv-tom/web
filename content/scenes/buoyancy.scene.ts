import type { SceneSpec } from '@/engine/spec';
import { TANK_DEPTH, TANK_HALF } from '@/engine/solvers/buoyancy';

/**
 * 浮力 · 阿基米德原理
 *
 * 为什么必须真 3D：
 *   浮力最顽固的误解是「浮力来自物体底部受到的压力」，由此会推出两个错误结论：
 *   「沉底的物体不受浮力」「形状越尖浮力越小」。而浮力的真正来源是
 *   **上下表面的压力差**（F = ρ_l·g·h·S），这必须用「压强随深度线性增大」这个
 *   空间图像来支撑。2D 剖面里物体只是一个矩形，看不出"排开的那部分液体"是一个
 *   **体积**；3D 里液面是一个真实的水平面，物体在其中上下穿越，转视角才看得清
 *   排开体积的 12 条棱是怎么随浸入深度长出来的。
 *
 * 规格：docs/specs/features/011-buoyancy.spec.md
 */
export const buoyancyScene: SceneSpec = {
  meta: {
    id: 'buoyancy',
    title: '浮力：被挤走的水，才是托住物体的那只手',
    subtitle: '阿基米德原理 · F_浮 = ρ液·g·V排 · 漂浮条件 h/L = ρ物/ρ液',
    stage: 'junior',
    chapterId: 'j8b-4',
    difficulty: 2,
    dimension: '3d',
    minutes: 12,
    tags: ['浮力', '阿基米德原理', '密度', '视重', '物体的浮沉'],
    pitch: '把「排开液体的重力」这个抽象说法，变成能从各个角度端详的一块体积',
  },

  camera: { position: [0.55, 0.36, 0.7], target: [0, -0.2, 0], fov: 45 },

  world: { gridSize: 1.6, gridDivisions: 12, showGrid: true, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'rhoB',
      label: '物体密度 ρ物',
      unit: 'kg/m³',
      min: 100,
      max: 3000,
      step: 50,
      default: 600,
      hint: '木块约 600、冰约 900、铝 2700。大于液体密度就会下沉',
    },
    {
      type: 'slider',
      key: 'rhoL',
      label: '液体密度 ρ液',
      unit: 'kg/m³',
      min: 500,
      max: 1600,
      step: 50,
      default: 1000,
      hint: '水 1000、酒精 800、盐水约 1030、水银 13600（超出上限）',
    },
    {
      type: 'slider',
      key: 'L',
      label: '正方体边长',
      unit: 'cm',
      min: 6,
      max: 30,
      step: 1,
      default: 20,
      hint: '边长翻倍 → 重力变 8 倍，完全浸没时浮力也变 8 倍',
    },
    {
      type: 'slider',
      key: 'T',
      label: '往复周期 T',
      unit: 's',
      min: 2,
      max: 10,
      step: 0.5,
      default: 6,
      hint: '只影响快慢，不影响任何力——浮力与运动速度无关',
    },
  ],

  solver: { kind: 'buoyancy' },

  objects: [
    { type: 'grid', id: 'floor', size: [1.6, 1.6], divisions: 12, plane: 'xz', color: '#16394a', opacity: 0.18 },

    /* ---------- 水槽：4 条竖直棱 + 底框 ---------- */
    { type: 'polylines', id: 'tank-wall', bind: 'tank', color: '#1d4e63', width: 1.2, opacity: 0.85 },

    /* ---------- 液面（水平矩形，y = 0） ---------- */
    { type: 'polyline', id: 'water-surf', bind: 'waterSurf', color: '#38bdf8', width: 2.4 },

    /* ---------- 液面与物体的交线：水线 ---------- */
    { type: 'polyline', id: 'waterline', bind: 'waterline', color: '#fbbf24', width: 2, optional: true },

    /* ---------- 排开体积的线框（12 条棱） ---------- */
    { type: 'polylines', id: 'displaced', bind: 'displaced', color: '#22d3ee', width: 1.6, opacity: 0.85 },

    /* ---------- 物体本体：正方体 ---------- */
    {
      type: 'box',
      id: 'block',
      size: [0.2, 0.2, 0.2],
      position: 'blockC',
      round: 0.012,
      color: '#e8931a',
      metalness: 0.08,
      roughness: 0.72,
    },

    /* ---------- 平衡位置提示点（漂浮时底面应停在这里） ---------- */
    { type: 'particle', id: 'eq-point', bind: 'eqPoint', radius: 0.012, color: '#4ade80', glow: true },

    /* ---------- 力矢量 ---------- */
    {
      type: 'vector',
      id: 'G-vec',
      bind: 'G',
      origin: 'blockC',
      color: '#f87171',
      radius: 0.009,
      maxLength: 0.45,
      label: 'G（重力）',
    },
    {
      type: 'vector',
      id: 'Fb-vec',
      bind: 'Fb',
      origin: 'blockC',
      color: '#22d3ee',
      radius: 0.009,
      maxLength: 0.45,
      label: 'F浮',
    },
    {
      type: 'vector',
      id: 'N-vec',
      bind: 'N',
      origin: 'blockC',
      color: '#a78bfa',
      radius: 0.009,
      maxLength: 0.45,
      label: 'N（测力计读数）',
    },
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      origin: 'blockC',
      color: '#4ade80',
      radius: 0.007,
      maxLength: 0.28,
      label: 'v',
    },

    /* ---------- 标注 ---------- */
    { type: 'text', id: 'label-surf', text: '液面', position: [TANK_HALF + 0.06, 0.02, 0], color: '#7dd3fc', size: 11 },
    { type: 'text', id: 'label-eq', text: '平衡位置', position: [TANK_HALF + 0.06, -0.12, 0], color: '#4ade80', size: 11 },
    { type: 'text', id: 'label-bottom', text: '槽底', position: [TANK_HALF + 0.06, -TANK_DEPTH, 0], color: '#64748b', size: 10 },
  ],

  hud: {
    readouts: [
      { label: '浸入深度 h', bind: 'h', unit: 'cm', digits: 2 },
      // 注意：ratio 绑定的是**平衡**浸入比例 ρ物/ρ液，不是瞬时 h/L。
      // 物体上下振荡时瞬时 h/L 与它并不相等（默认参数下 h=12.94cm → 64.7%，
      // 而这里显示 60.0%），标签写成「h/L」会让学生自己一算就对不上。
      {
        label: '平衡浸入比例 ρ物/ρ液',
        bind: 'ratio',
        unit: '%',
        digits: 1,
        hint: '物体停稳后 h/L 会等于这个值；振荡过程中瞬时 h/L 在它上下摆动',
      },
      { label: '排开液体体积 V排', bind: 'Vd', unit: 'cm³', digits: 1 },
      { label: '排开液体质量', bind: 'dispMass', unit: 'g', digits: 1 },
      { label: '浮力 F浮', bind: 'Fb', unit: 'N', digits: 3 },
      { label: '重力 G', bind: 'G', unit: 'N', digits: 3 },
      { label: '视重 N（测力计）', bind: 'N', unit: 'N', digits: 3, hint: 'N = G − F浮，压到底后不为负' },
      { label: '物体密度 ρ物', bind: 'rhoB', unit: 'kg/m³', digits: 0 },
      { label: '液体密度 ρ液', bind: 'rhoL', unit: 'kg/m³', digits: 0 },
      { label: '边长 L', bind: 'L', unit: 'cm', digits: 1 },
      { label: '运动速度 v', bind: 'v', unit: 'cm/s', digits: 2 },
      { label: '是否漂浮', bind: 'floats', unit: '', digits: 0, hint: '1 = 漂浮，0 = 下沉' },
    ],
    charts: [
      {
        title: 'F浮 与 浸入深度 h 的关系',
        series: [
          { bind: 'h', label: 'h（cm）', color: '#fbbf24' },
          { bind: 'Fb', label: 'F浮（N）', color: '#22d3ee' },
        ],
        yLabel: '读数',
        note: '两条曲线完全同步——没入多深，浮力就按比例涨多少；全没入之后 h 被截断，F浮 也一起停住',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '水面固定在 y = 0（青色矩形），下面是一个 0.9 m 深的玻璃水槽。橙色正方体正沿竖直方向匀速上下穿越水面。',
      camera: { position: [0.55, 0.36, 0.7], target: [0, -0.2, 0] },
      highlight: ['water-surf', 'block', 'tank-wall'],
    },
    {
      at: 8,
      text: '黄色矩形是**水线**——液面与物体相交的那条矩形。青色线框标出的，就是水面以下被物体**挤走的那块水**：它的体积 V排 = L²·h。',
      highlight: ['waterline', 'displaced'],
    },
    {
      at: 17,
      text: '阿基米德原理：**浮力等于被挤走的这块水所受的重力**。看读数——「排开液体质量」乘以 g，就是「浮力 F浮」，两个数永远同步。',
      params: { rhoB: 600, rhoL: 1000, L: 20 },
      highlight: ['Fb-vec', 'displaced'],
    },
    {
      at: 26,
      text: '红色箭头是重力 G，青色是浮力 F浮，紫色是**视重** N——也就是弹簧测力计上的读数，N = G − F浮。物体越往下压，F浮 越大，N 越小。',
      highlight: ['G-vec', 'Fb-vec', 'N-vec'],
    },
    {
      at: 35,
      text: '物体完全没入之后，再往下压，V排 不再增加，**F浮 保持不变**。这是最常考的一条：浮力只跟排开体积有关，跟深度无关。',
      highlight: ['displaced', 'Fb-vec'],
      pause: true,
    },
    {
      at: 45,
      text: '看下方图表：h 曲线和 F浮 曲线在部分浸入阶段完全同步；一旦全没入，h 被截断在 L，F浮 也跟着停住，两条线一起变平。',
      highlight: ['displaced'],
    },
    {
      at: 54,
      text: '现在换物体：把 ρ物 从 600 拉到 2700（铝块）。漂浮判据 h/L = ρ物/ρ液 = 2.7 > 1，说明它**根本漂不起来**，必然下沉。',
      params: { rhoB: 2700 },
      highlight: ['block', 'G-vec', 'Fb-vec'],
    },
    {
      at: 63,
      text: '再看 ρ物 = 900 的冰块放在 ρ液 = 800 的酒精里：h/L = 1.125 > 1，冰在酒精中也是沉的。**换液体和换物体是同一件事**——决定沉浮的是比值。',
      params: { rhoB: 900, rhoL: 800 },
      highlight: ['block', 'water-surf'],
      pause: true,
    },
    {
      at: 73,
      text: '最后检验误区：把 ρ物 拉回 600、ρ液 回到 1000，物体漂浮时应有 h/L = 60%。注意绿色平衡点就是它该停的位置——浸入比例恰好等于密度比。',
      params: { rhoB: 600, rhoL: 1000 },
      highlight: ['eq-point', 'waterline'],
    },
  ],

  formulas: [
    { tex: 'F_\\text{浮} = \\rho_\\text{液}\\, g\\, V_\\text{排} = \\rho_\\text{液}\\,g\\,L^2 h', caption: '阿基米德原理。h 是浸入深度，被裁剪到 [0, L]。' },
    { tex: 'F_\\text{浮} = (p_\\text{下}-p_\\text{上})S = \\rho_\\text{液}\\,g\\,h\\,S', caption: '浮力的真正来源：上下表面的压力差，而不是"底部受到的压力"。' },
    { tex: 'N = G - F_\\text{浮} = \\rho_\\text{物}L^3g-\\rho_\\text{液}gL^2h', caption: '视重，即弹簧测力计读数。压到槽底后截断为 0。' },
    { tex: '\\frac{h}{L}=\\frac{\\rho_\\text{物}}{\\rho_\\text{液}}', caption: '漂浮平衡条件。比值 > 1 表示物体会下沉，这是判断浮沉最快的办法。' },
  ],

  pitfalls: [
    {
      title: '以为浮力来自"底部受到的压力"',
      wrong: '物体底部有水顶着，所以有浮力；沉底后底部没水，就没有浮力了',
      right: '浮力 = 下表面向上的压力 − 上表面向下的压力，是两个压力的**差**',
      desc: '这个错误会直接推出「沉底的物体不受浮力」——但沉底的铁块依然受浮力，只是浮力小于重力所以它沉了。真正的判据是 ρ物 与 ρ液 的比值，不是"底下有没有水"。',
    },
    {
      title: '以为越深浮力越大',
      wrong: '物体压得越深，受到的浮力就越大',
      right: '完全浸没后 V排 不再变化，浮力保持恒定，与深度无关',
      desc: '看图表：全没入之后 F浮 曲线变成一条水平线。压强确实随深度增大，但上下表面的压强**差**不变，所以合力不变。',
    },
    {
      title: '把"排开的液体"当成"溢出的液体"',
      wrong: '杯子没装满、水没溢出来，就没有 V排',
      right: 'V排 是物体占据的那部分水的体积，与是否溢出无关',
      desc: '无论水槽满不满，只要物体浸入，就挤走了等体积的水。溢出只是"排开的水去了哪里"的结果，不是排开本身。',
    },
    {
      title: '认为漂浮时"重力变小了"',
      wrong: '物体浮在水面上，说明它受到的重力变小了',
      right: '重力不变，是浮力抵消了它；漂浮时 F浮 = G',
      desc: '盯住读数：ρ物 和 L 不变时 G 全程恒定，变的是 F浮。漂浮不是重力消失，而是合力为零。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '把物体完全压入水中后继续往下压，浮力如何变化？',
      options: ['继续变大', '保持不变', '变小', '先变大后变小'],
      answer: 1,
      explain: '完全浸没后 V排 = L³ 不再变化，F浮 = ρ液·g·V排 保持恒定。深度增加只让各处压强同比例增大，上下压力差不变。',
      applyParams: { rhoB: 600, rhoL: 1000, L: 20 },
    },
    {
      type: 'single-choice',
      prompt: '密度为 900 kg/m³ 的冰块放入密度为 800 kg/m³ 的酒精中，稳定后浸入比例是多少？',
      options: ['90%', '80%', '沉底（比例 100% 且下沉）', '约 89%'],
      answer: 2,
      explain: 'h/L = ρ物/ρ液 = 900/800 = 1.125 > 1，说明即使完全浸没，浮力仍不足以平衡重力，冰块会下沉。',
      applyParams: { rhoB: 900, rhoL: 800 },
    },
    {
      type: 'predict-then-run',
      prompt: 'ρ物 = 600 kg/m³ 的木块漂浮在水面上，浸入水中的比例是多少？',
      options: ['40%', '60%', '100%', '与体积有关'],
      answer: 1,
      explain: '漂浮时 F浮 = G，即 ρ液·L²·h = ρ物·L³，化简得 h/L = ρ物/ρ液 = 0.6。与物体大小、形状都无关。',
      applyParams: { rhoB: 600, rhoL: 1000 },
    },
  ],

  assumptions: [
    '物体简化为**正方体**，这样 V排 = L²·h 是精确闭式解；真实形状（球、船体）的 V排 与 h 是非线性关系。',
    '液面高度固定不变：忽略了物体浸入导致的液面上升（真实溢水杯实验中这一点正是测量原理）。',
    '物体按余弦规律上下往复（y = y_c + A·cos ωt），是"被外力匀速压入再拉出"的理想化，不考虑浮力与重力共同决定的真实动力学。',
    '忽略水的黏滞阻力与表面张力；物体穿越液面时不计晃动与波浪。',
    '视重 N 在物体压到槽底后截断为 0，实际应为支持力承担剩余部分，这里不模拟触底碰撞。',
  ],

  duration: 84,
};
