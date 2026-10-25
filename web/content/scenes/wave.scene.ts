import type { SceneSpec } from '@/engine/spec';
import { PARTICLE_COUNT, STRING_LENGTH } from '@/engine/solvers/wave';

/**
 * 机械波 · 横波与驻波
 *
 * 为什么必须真 3D：波动最大的误解是"波把质点搬走了"。
 * 把绳子上每个质点的振动轨迹画出来、再让整条波形在立体空间里平移，
 * 转动视角才能看清"波形在走、质点只在原地上下"——平面图做不到这一点。
 *
 * 规格：docs/specs/features/009-wave.spec.md
 */
export const waveScene: SceneSpec = {
  meta: {
    id: 'wave',
    title: '机械波：波形在走，质点没走',
    subtitle: 'v = λf · 行波 · 驻波 · 叠加原理',
    stage: 'senior',
    chapterId: 'gx1-2',
    difficulty: 2,
    dimension: '3d',
    minutes: 12,
    tags: ['机械波', '横波', '波长', '频率', '驻波', '叠加'],
    pitch: '把"质点不随波迁移"这个最容易错的概念，做成一个能转着看的绳子',
  },

  camera: { position: [2.4, 1.8, 3.6], target: [STRING_LENGTH / 2, 0.2, 0], fov: 45 },

  // 装饰层：开场质点与矢量逐点点亮（light-up）——波还没到，先让"这些点会动"成立
  decor: { intro: { kind: 'light-up' } },

  world: { gridSize: 7, gridDivisions: 14, showGrid: true, showAxis: false },

  params: [
    {
      type: 'select',
      key: 'mode',
      label: '波的类型',
      options: [
        { value: 'travel', label: '行波' },
        { value: 'standing', label: '驻波' },
      ],
      default: 'travel',
      hint: '驻波 = 两列反向行波叠加，波形不再前进',
    },
    {
      type: 'slider',
      key: 'lambda',
      label: '波长 λ',
      unit: 'm',
      min: 0.5,
      max: 4,
      step: 0.1,
      default: 2,
      hint: '相邻两个同相点之间的距离。绳长 4 m，λ=2 时正好两个完整波形',
    },
    {
      type: 'slider',
      key: 'A',
      label: '单列波振幅 A',
      unit: 'm',
      min: 0.05,
      max: 0.6,
      step: 0.05,
      default: 0.3,
      hint: '驻波由两列波叠加而成，所以波腹振幅是 2A',
    },
    {
      type: 'slider',
      key: 'f',
      label: '频率 f',
      unit: 'Hz',
      min: 0.1,
      max: 2,
      step: 0.1,
      default: 0.5,
      hint: 'f 决定质点振动快慢，也决定波速 v = λf',
    },
  ],

  solver: { kind: 'wave' },

  objects: [
    { type: 'grid', id: 'floor', size: [7, 7], divisions: 14, plane: 'xz', color: '#16394a', opacity: 0.2 },

    /* ---------- 绳子与波形 ---------- */
    { type: 'polyline', id: 'curve', bind: 'curve', color: '#22d3ee', width: 2.6 },
    { type: 'polyline', id: 'shifted', bind: 'shifted', color: '#475569', width: 1.3, dashed: true },
    // 包络只在驻波模式下有值：行波模式下求解器返回空数组，标 optional 以免契约测试判为断链
    { type: 'polyline', id: 'env-up', bind: 'envUp', color: '#f59e0b', width: 1.2, dashed: true, optional: true },
    { type: 'polyline', id: 'env-down', bind: 'envDown', color: '#f59e0b', width: 1.2, dashed: true, optional: true },

    /* ---------- 25 个质点 ---------- */
    ...Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      type: 'particle' as const,
      id: `p${i}`,
      bind: `p${i}`,
      radius: 0.035,
      color: i % 5 === 0 ? '#fbbf24' : '#94a3b8',
      glow: i % 5 === 0,
    })),

    /* ---------- 中点质点：用它讲清"质点不迁移" ---------- */
    { type: 'polyline', id: 'mid-track', bind: 'midTrack', color: '#facc15', width: 1.2, dashed: true },
    { type: 'polyline', id: 'mid-trail', bind: 'midTrail', color: '#facc15', width: 2.4 },
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      origin: 'mid',
      color: '#4ade80',
      radius: 0.03,
      maxLength: 0.5,
      label: 'v（质点振动速度）',
    },

    { type: 'text', id: 'label-mid', text: '中点质点', position: 'mid', color: '#facc15', size: 12 },
  ],

  hud: {
    readouts: [
      { label: '波速 v', bind: 'v', unit: 'm/s', digits: 3, hint: 'v = λf：波形前进的快慢' },
      { label: '波长 λ', bind: 'lambda', unit: 'm', digits: 2 },
      { label: '频率 f', bind: 'f', unit: 'Hz', digits: 2 },
      { label: '周期 T', bind: 'T', unit: 's', digits: 2 },
      { label: '振幅', bind: 'amp', unit: 'm', digits: 3, hint: '行波为 A，驻波波腹为 2A（两列波叠加）' },
      { label: '中点位移', bind: 'midDisp', unit: 'm', digits: 3 },
      { label: '质点速率', bind: 'midSpeed', unit: 'm/s', digits: 3 },
      { label: '节点数', bind: 'nodeCount', unit: '个', digits: 0, hint: '驻波才有的概念：永远不动的点' },
    ],
    charts: [
      {
        title: '中点质点的位移',
        series: [{ bind: 'midDisp', label: 'y', color: '#facc15' }],
        yLabel: 'm',
        note: '行波时是正弦；驻波时振幅恒定但相位可能反相',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '一根绳子，25 个小球（质点）排在上面。青色是绳子的形状——它在向右走。',
      camera: { position: [2.4, 1.8, 3.6], target: [STRING_LENGTH / 2, 0.2, 0] },
      highlight: ['curve', 'p0', 'p12', 'p24'],
    },
    {
      at: 7,
      text: '关键观察：盯住中间那个黄点。它只是在原地上下抖，横向一步都没挪。走的是**波形**，不是质点。',
      highlight: ['mid-track', 'mid-trail', 'p12'],
    },
    {
      at: 14,
      text: '灰色虚线是 1/4 个周期后的形状。两个形状之间只差一个横向平移——这就是"波在传播"的含义。',
      highlight: ['shifted', 'curve'],
    },
    {
      at: 21,
      text: '绿色箭头是质点的振动速度，它和波速是两回事：v_质点最大只有 Aω，而波速 v = λf 可以大得多。',
      highlight: ['v-vec', 'p12'],
    },
    {
      at: 28,
      text: '把波长从 2 m 拖到 1 m：绳上出现四个完整波形，波速也跟着减半——v = λf，λ 减半则 v 减半。',
      params: { lambda: 1 },
      highlight: ['curve'],
    },
    {
      at: 35,
      text: '现在换成驻波：两列反向传播的波叠加，波形不再前进，而是原地"呼吸"。橙色虚线是包络。',
      params: { lambda: 2, mode: 'standing' },
      highlight: ['env-up', 'env-down', 'curve'],
    },
    {
      at: 43,
      text: '包络与绳子的交点永远不动——那就是节点。节点两侧的质点振动方向始终相反。',
      highlight: ['p6', 'p18', 'curve'],
    },
    {
      at: 50,
      text: '波腹在包络的最大处，振幅是 2A：因为两列波在这里同相叠加。这是"叠加原理"最直接的视觉证据。',
      highlight: ['p12'],
    },
    {
      at: 57,
      text: '声波、水波、地震波、激光——全都服这三条：v = λf、质点不随波迁移、波可以叠加。',
      pause: true,
    },
  ],

  formulas: [
    { tex: 'v = \\lambda f', caption: '波速 = 波长 × 频率。同一介质里 v 由介质决定，λ 与 f 此消彼长。' },
    { tex: 'y = A\\sin(kx - \\omega t)', caption: '行波方程。kx−ωt 不变的点就是"波形"上的同一点。' },
    { tex: 'y = 2A\\sin(kx)\\cos(\\omega t)', caption: '驻波 = 两列反向行波叠加。波腹 2A，节点 0。' },
    { tex: 'v_{\\text{质点,max}} = A\\omega', caption: '质点振动速度的上限。它和波速 v=λf 是两件不同的事。' },
  ],

  pitfalls: [
    {
      title: '以为质点跟着波一起跑',
      wrong: '波向右传，绳子上的点也被带到右边去了',
      right: '质点只在平衡位置附近振动，波形才是传播的东西',
      desc: '盯住场景里的黄点：它整个生命周期都在同一条竖直虚线上活动。海浪把你推来推去的是水质点的运动，不是水在整体移动。',
    },
    {
      title: '把质点振动速度和波速混为一谈',
      wrong: '波速就是质点运动的速度',
      right: '波速 v=λf 描述波形前进；质点速度最大只有 Aω',
      desc: '本场景 λ=2 m、f=0.5 Hz → 波速 1 m/s；而质点最大速度 Aω = 0.3×π ≈ 0.94 m/s。量级相近纯属巧合，物理上毫无关系。',
    },
    {
      title: '以为驻波是"停下来的波"',
      wrong: '驻波就是不传播的波，所以没有能量',
      right: '驻波是两列反向行波的叠加，能量在波腹与节点间来回交换',
      desc: '看曲线：它在原地胀缩，不是静止。把 mode 切回行波对比一下，形状的区别只在于"是否前进"。',
    },
    {
      title: '认为波长变大波速一定变大',
      wrong: 'λ 变大所以 v 变大',
      right: '同一介质里 v 由介质决定；f 不变时 λ 变大才会让 v 变大',
      desc: '本场景 v=λf 是公式定义，但物理上通常是"介质定了 v，于是 λ=v/f"。把 f 从 0.5 拖到 1.0，λ 若不变，v 就翻倍。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '保持频率不变，把波长从 2 m 减到 1 m，波速怎么变？',
      options: ['不变', '减半', '翻倍', '变为 1/4'],
      answer: 1,
      explain: 'v = λf。f 不变、λ 减半 → v 减半。读数里的波速会跟着动。',
      applyParams: { lambda: 1 },
    },
    {
      type: 'predict-then-run',
      prompt: '切换到驻波后，波腹处的振幅是多少？',
      options: ['A', '2A', 'A/2', '0'],
      answer: 1,
      explain: '驻波由两列振幅为 A 的反向行波叠加而成，波腹处同相 → 2A；节点处反相 → 0。',
      applyParams: { mode: 'standing' },
    },
    {
      type: 'single-choice',
      prompt: '关于质点振动速度与波速，下面哪句是对的？',
      options: [
        '两者是同一个速度',
        '质点速度最大为 Aω，波速为 λf',
        '波速越大质点振动越快',
        '驻波中质点速度为零',
      ],
      answer: 1,
      explain: '波速描述波形前进，质点速度描述上下抖动。驻波中质点照样在振动（节点除外），只是不再积累位移。',
    },
  ],

  assumptions: [
    '绳子上的质点用 25 个等距点采样，波形曲线用 160 段折线近似——视觉上足够平滑，但不是连续介质解。',
    '忽略绳子的阻尼与色散：所有频率的波速相同（v = λf 对任意 f 成立）。',
    '绳子两端在场景外，不画边界反射；驻波模式直接给出叠加结果，不模拟两列波相向而行。',
    '振幅为单列波的振幅；驻波模式显示的是两列波叠加后的结果（波腹 2A）。',
  ],

  duration: 64,
};
