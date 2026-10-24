import type { SceneSpec } from '@/engine/spec';

/**
 * 声音的产生与传播 · 球面波前
 *
 * 为什么必须真 3D：波前是**球面**。2D 图只能画一组同心圆，学生默认以为
 * 波前是"一堵平面墙"整体推过来；3D 里三个互相垂直的圆同时存在、半径相同，
 * 转一下视角才能看出它们共同织出的是一个球——这是"远处的人只收到球面上
 * 很小一块"的唯一直观解释，也是"越远越轻"（S = 4πr²）的几何前提。
 *
 * 迁移自 lessons/初中物理实验/02-sound-propagation.html（物理已由
 * verify_junior.py 手算期望值验证；相对振幅公式迁移中修正，见 assumptions）。
 *
 * 规格：docs/specs/features/F-018-sound-propagation.spec.md
 */
export const soundPropagationScene: SceneSpec = {
  meta: {
    id: 'sound-propagation',
    title: '声音的产生与传播：一圈圈推开去',
    subtitle: 'r = v·t · 球面波前 S = 4πr² · 同一介质中声速恒定',
    stage: 'junior',
    chapterId: 'j8a-2',
    difficulty: 1,
    dimension: '3d',
    minutes: 10,
    tags: ['声音', '声速', '球面波', '波前', '介质'],
    pitch: '把"声音是一层层推出去的"变成三个转着看的圆',
  },

  camera: { position: [2.3, 1.8, 2.7], target: [0, -0.15, 0], fov: 45 },

  // 参数驱动的静态场景：传播时间由滑块设定，没有自动播放的物理过程。
  // 展台在画面下方（y = -2.75）：波前浮在木桌上方，像一件展品——
  // 没有这块木头，整个球面漂在近白画布上，截图像贴图而不是实验。
  // 桌面低于最大波前半径（2.52 m），滑块拖到极致时波前也不会穿过桌面。
  world: {
    gridSize: 4.5,
    gridDivisions: 9,
    showGrid: true,
    showAxis: false,
    stage: { kind: 'table', y: -2.75, size: 2.2 },
  },

  params: [
    {
      type: 'slider',
      key: 't',
      label: '传播时间 t',
      unit: 's',
      min: 0,
      max: 3,
      step: 0.02,
      // 默认 1.2 s：显示半径 1.18 m，约占画面高度 65%（取景即契约）。
      // lessons 原默认 0.4 s 只有 0.58 m——主体缩在画面中心一小团，
      // 截图完全看不出"三个圆织成一个球"。
      default: 1.2,
      hint: '波前走到 r = v·t。拖到 3 s，半径超过 1000 m',
    },
    {
      type: 'slider',
      key: 'v',
      label: '空气中的声速 v',
      unit: 'm/s',
      min: 200,
      max: 600,
      step: 10,
      default: 340,
      hint: '15 ℃ 空气约 340；水中约 1500、钢铁约 5000（超出量程，见讲解）',
    },
  ],

  solver: { kind: 'acoustics' },

  objects: [
    { type: 'grid', id: 'floor', size: [4.5, 4.5], divisions: 9, plane: 'xz', color: '#1e5a72', opacity: 0.24 },

    /* ---------- 声源 ---------- */
    { type: 'particle', id: 'src', bind: 'src', radius: 0.18, color: '#f472b6', glow: true },

    /* ---------- 当前波前：三个正交平面上的等径圆（共同示意球面） ---------- */
    { type: 'polyline', id: 'ring-xy', bind: 'ringXY', color: '#38bdf8', width: 2.4 },
    { type: 'polyline', id: 'ring-xz', bind: 'ringXZ', color: '#38bdf8', width: 2.4 },
    { type: 'polyline', id: 'ring-yz', bind: 'ringYZ', color: '#38bdf8', width: 2.4 },

    /* ---------- 当前波前上的珠点：1px 细线在缩略图里会发飘，
                 珠点让"这是一个球"在任意尺寸下都读得出来 ---------- */
    ...Array.from({ length: 6 }, (_, k) => [
      { type: 'particle' as const, id: `bead-xy-${k}`, bind: `beadXY${k}`, radius: 0.026, color: '#0e7490', glow: false },
      { type: 'particle' as const, id: `bead-xz-${k}`, bind: `beadXZ${k}`, radius: 0.02, color: '#0e7490', glow: false },
      { type: 'particle' as const, id: `bead-yz-${k}`, bind: `beadYZ${k}`, radius: 0.02, color: '#0e7490', glow: false },
    ]).flat(),

    /* ---------- 较早的波前（0.72R）：能看出"一圈圈"的先后 ---------- */
    { type: 'polyline', id: 'old-xy', bind: 'oldringXY', color: '#1e6091', width: 1.6 },
    { type: 'polyline', id: 'old-xz', bind: 'oldringXZ', color: '#1e6091', width: 1.6 },
    { type: 'polyline', id: 'old-yz', bind: 'oldringYZ', color: '#1e6091', width: 1.6 },

    /* ---------- 更早的波前（0.44R） ---------- */
    { type: 'polyline', id: 'older-xy', bind: 'olderringXY', color: '#144a6e', width: 1.4 },
    { type: 'polyline', id: 'older-xz', bind: 'olderringXZ', color: '#144a6e', width: 1.4 },
    { type: 'polyline', id: 'older-yz', bind: 'olderringYZ', color: '#144a6e', width: 1.4 },

    /* ---------- 标注 ---------- */
    { type: 'text', id: 'label-src', text: '声源（音叉）', position: [0.28, 0.3, 0], color: '#f472b6', size: 11 },
    { type: 'text', id: 'label-ring', text: '当前波前（球面）', position: [1.5, 1.35, 0], color: '#38bdf8', size: 11 },
    { type: 'text', id: 'label-old', text: '较早的波前', position: [-0.78, 0.58, 0], color: '#1e6091', size: 10 },
  ],

  hud: {
    readouts: [
      { label: '传播时间 t', bind: 't', unit: 's', digits: 2 },
      { label: '波前半径 r = v·t', bind: 'r', unit: 'm', digits: 1 },
      // 守恒读数：同一种介质里声速是定值，与音调高低无关（本场景最常考点）
      { label: '空气中的声速 v', bind: 'v', unit: 'm/s', digits: 0, constant: true },
      {
        label: '相对振幅（340 m 处为 1）',
        bind: 'amp',
        digits: 2,
        hint: '球面波振幅 ∝ 1/r：距离翻倍，振幅减半',
      },
      {
        label: '波前面积 S = 4πr²',
        bind: 'S',
        unit: 'm²',
        digits: 0,
        hint: '能量摊到整个球面上——这就是"越远越轻"的几何原因',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '粉色小球是声源——一只正在振动的音叉。拖动「传播时间」滑块，蓝色的三组圆环就是**波前**：这一时刻振动传到的所有点。',
      highlight: ['src', 'ring-xy', 'ring-xz', 'ring-yz'],
    },
    {
      at: 8,
      text: '关键看这里：三个圆分别躺在 xy、xz、yz 平面上，半径**完全相同**——它们共同织出的是一个**球面**，不是一堵平移过来的墙。拖动视角转一圈，就能看出它是球。',
      highlight: ['ring-xy', 'ring-xz', 'ring-yz'],
    },
    {
      at: 16,
      text: '越远越轻：球面面积 S = 4πr² 随半径**平方**增长，同样的能量摊到越来越大的球面上，振幅就按 1/r 衰减。盯住「相对振幅」读数——距离翻倍，它减半。',
      highlight: ['old-xy', 'old-xz'],
    },
    {
      at: 24,
      text: '介质决定速度：把声速从 340 拖到 500（更暖的空气），同一时刻波前明显更远。空气中约 340 m/s，水中约 1500，钢铁中约 5000。',
      params: { v: 500 },
      highlight: ['ring-xy'],
    },
    {
      at: 32,
      text: '最容易错的一点：**声速与音调无关**。高音和低音在同样的空气里跑得一样快——所以音乐会上高音和低音是同时传到你耳朵的，不会有"高音先到"。',
      highlight: ['src'],
    },
    {
      at: 40,
      text: '回到默认：t = 1.2 s 时波前半径 408 m、相对振幅 0.83（340 m 处为 1）。记住三件事——波前是球面、振幅按 1/r 衰减、声速只由介质（和温度）决定。',
      params: { t: 0.4, v: 340 },
      pause: true,
    },
  ],

  formulas: [
    { tex: 'r = v\\,t', caption: '波前半径 = 声速 × 传播时间。' },
    { tex: 'S = 4\\pi r^{2}', caption: '球面面积随半径平方增长——能量被摊到整个球面上，这是"越远越轻"的几何原因。' },
    { tex: 'A \\propto \\dfrac{1}{r}', caption: '球面波振幅与距离成反比；本场景的相对振幅以 340 m 处为 1。' },
  ],

  pitfalls: [
    {
      title: '以为声音传过来是"空气被搬过来了"',
      wrong: '声音传到耳朵，是空气分子从声源一路跑过来',
      right: '分子只在原地振动，传过去的是**振动状态**（能量）',
      desc: '波前是"扰动到达的位置"，不是物质的位置。如果是空气在搬家，远处的人早就被风吹到了。',
    },
    {
      title: '以为越远越轻是"空气把能量吃掉了"',
      wrong: '声音传得远就变小，是因为空气吸收了能量',
      right: '主因是**球面摊薄**：S = 4πr²，总能量不变但铺得越来越开',
      desc: '吸收衰减确实存在，但在百米量级上球面几何才是主因——把 r 拖大看「波前面积」读数的增长速度就知道了。',
    },
    {
      title: '以为声速与音调有关',
      wrong: '高音跑得快，低音跑得慢，所以远处的歌高低音会脱节',
      right: '同种介质、同一温度下，声速与频率**无关**',
      desc: '340 m/s 对 20 Hz 的低音和 20 kHz 的高音一样。真正影响声速的是介质种类与温度，不是音调。',
    },
    {
      title: '以为波前是一堵平移的墙',
      wrong: '波前像一堵墙，整体朝一个方向推进',
      right: '点源的波前是**球面**，远处的人只收到球面上很小一块',
      desc: '三个正交圆半径相同，转视角才看出它们织成一个球。墙的图景对平面波成立，对点源是错的。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '传播时间从 0.4 s 拖到 1.2 s，波前半径变为原来的几倍？相对振幅呢？',
      options: ['半径 3 倍、振幅 3 倍', '半径 3 倍、振幅 1/3', '半径不变、振幅 1/3', '半径 1/3、振幅 3 倍'],
      answer: 1,
      explain: 'r = v·t 线性于 t（3 倍）；而 A ∝ 1/r 反比（1/3）。球面衰减是严格的反比关系——这正是"距离翻倍、声音明显变小"的定量形式。',
      applyParams: { t: 1.2, v: 340 },
    },
    {
      type: 'single-choice',
      prompt: '空气中 340 m/s 的声速，对高音和低音是一样的吗？',
      options: ['高音更快', '低音更快', '一样快', '要看声源大小'],
      answer: 2,
      explain: '同种介质、同一温度下声速与频率无关。音乐会上各种音高的声音是同时到达的。',
    },
    {
      type: 'predict-then-run',
      prompt: '把声速拖到 500 m/s、传播时间 1 s，波前半径是多少？',
      options: ['136 m', '340 m', '500 m', '不变，还是 136 m'],
      answer: 2,
      explain: 'r = v·t = 500 × 1。半径由介质与时间共同决定，换介质立刻换半径。',
      applyParams: { v: 500, t: 1 },
    },
  ],

  assumptions: [
    '**点源模型**：波前是理想球面。真实声源（如音叉）在近场不是球面，要传到远大于声源尺寸的距离才近似成立。',
    '**几何半径为示意缩放**：显示半径 = 0.28 m + 真实半径 × 0.0022，把 0–1020 m 压进取景范围；真实半径见「波前半径」读数（与 induction 场景的 4e4 矢量缩放同一模式）。',
    '**相对振幅公式迁移中修正**：lessons 原页面为 1/min(r, 0.6)，它在 r > 0.6 m 后恒为 1.667（一条平台），与自带的"∝ 1/r"标签矛盾；改为 340/r，使 amp·r ≡ 340 成为可断言的不变量（F-018 spec §5 记录了完整推导）。',
    '忽略空气吸收与温度梯度：衰减只按球面几何摊薄计算。',
    '**静态模型**：传播时间由滑块设定，场景不自动播放扩散过程——播放时间只推进讲解脚本。',
  ],

  duration: 48,
};
