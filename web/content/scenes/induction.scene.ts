import type { SceneSpec } from '@/engine/spec';
import { COIL_R, MAG_HALF_W, MAG_LEN } from '@/engine/solvers/induction';

/**
 * 电磁感应 · 楞次定律
 *
 * 为什么必须真 3D：
 *   楞次定律是整本教材里"空间推理密度"最高的一条规律——要连续用两次右手定则：
 *   ① 由磁铁的磁极与运动方向，判断穿过线圈的**原磁通**指向哪边；
 *   ② 由原磁通是增是减，判断**感应电流**该往哪绕。
 *   平面图上这两步都退化成"顺时针/逆时针"，学生只能背"增反减同"四个字，
 *   换个视角（从线圈背面看）就全错。3D 里三根矢量同时立起来，转一下就明白
 *   反的到底是哪一根。
 *
 * 规格：docs/specs/features/010-induction.spec.md
 */
export const inductionScene: SceneSpec = {
  meta: {
    id: 'induction',
    title: '楞次定律：感应电流为什么总跟你对着干',
    subtitle: '法拉第电磁感应定律 · ε = −N·ΔΦ/Δt · 增反减同',
    stage: 'senior',
    chapterId: 'gx2-2',
    difficulty: 3,
    dimension: '3d',
    minutes: 14,
    tags: ['电磁感应', '楞次定律', '法拉第定律', '磁通量', '感应电流'],
    pitch: '把"增反减同"这个背下来的口诀，还原成三根能转着看的矢量',
  },

  camera: { position: [0.42, 0.3, 0.46], target: [0.14, 0.02, 0], fov: 45 },

  world: { gridSize: 3, gridDivisions: 12, showGrid: true, showAxis: false },

  params: [
    {
      type: 'select',
      key: 'pole',
      label: '朝向线圈的磁极',
      options: [
        { value: 'N', label: 'N 极正对线圈' },
        { value: 'S', label: 'S 极正对线圈' },
      ],
      default: 'N',
      hint: '换一极，感应电流的绕向整个反过来',
    },
    {
      type: 'slider',
      key: 'N',
      label: '线圈匝数 N',
      unit: '匝',
      min: 50,
      max: 500,
      step: 10,
      default: 200,
      hint: 'ε 与 N 成正比：匝数翻倍，电流翻倍',
    },
    {
      type: 'slider',
      key: 'R',
      label: '回路电阻 R',
      unit: 'Ω',
      min: 5,
      max: 100,
      step: 5,
      default: 20,
      hint: 'I = ε/R。电阻越大电流越小，但磁通变化率不变',
    },
    {
      type: 'slider',
      key: 'amp',
      label: '往复行程',
      unit: 'cm',
      min: 4,
      max: 28,
      step: 1,
      default: 16,
      hint: '行程越长、周期越短 → 磁铁动得越快 → 电动势越大',
    },
    {
      type: 'slider',
      key: 'T',
      label: '往复周期 T',
      unit: 's',
      min: 1,
      max: 6,
      step: 0.5,
      default: 3,
      hint: '周期减半 → 速度翻倍 → 电动势翻倍',
    },
    {
      type: 'slider',
      key: 'm',
      label: '磁铁磁矩',
      unit: 'A·m²',
      min: 1,
      max: 12,
      step: 0.5,
      default: 5,
      hint: '换块更强的磁铁：Φ 整体按比例放大',
    },
  ],

  solver: { kind: 'induction' },

  objects: [
    { type: 'grid', id: 'floor', size: [0.9, 0.9], divisions: 10, plane: 'xz', color: '#16394a', opacity: 0.22 },

    /* ---------- 磁感线（两个互相垂直的含轴平面） ---------- */
    { type: 'polylines', id: 'b-lines', bind: 'bLines', color: '#38bdf8', width: 1.3, opacity: 0.42 },
    { type: 'polylines', id: 'b-lines2', bind: 'bLines2', color: '#38bdf8', width: 1.3, opacity: 0.28 },

    /* ---------- 运动轴 ---------- */
    { type: 'polyline', id: 'axis', bind: 'axis', color: '#334155', width: 1, dashed: true },

    /* ---------- 线圈（y-z 平面上的圆环，法向 +x） ---------- */
    { type: 'polyline', id: 'coil', bind: 'coil', color: '#22d3ee', width: 3 },

    /* ---------- 磁铁：朝向线圈的一极 / 背向的一极 ---------- */
    {
      type: 'box',
      id: 'mag-near-N',
      size: [MAG_LEN / 2, MAG_HALF_W * 2, MAG_HALF_W * 2],
      position: 'nearC',
      color: '#f87171',
      round: 0.006,
      metalness: 0.55,
      roughness: 0.35,
      // 相机拉近到 0.46 后，默认 clearcoat 0.4 + envMapIntensity 1.1 的镜面高光
      // 扫过相机时会被 bloom 放大成一团白（实测 1000+ 个通道全 >248 的像素）。
      clearcoat: 0.06,
      envMapIntensity: 0.35,
      visible: 'nearIsN',
    },
    {
      type: 'box',
      id: 'mag-near-S',
      size: [MAG_LEN / 2, MAG_HALF_W * 2, MAG_HALF_W * 2],
      position: 'nearC',
      color: '#60a5fa',
      round: 0.006,
      metalness: 0.55,
      roughness: 0.35,
      // 相机拉近到 0.46 后，默认 clearcoat 0.4 + envMapIntensity 1.1 的镜面高光
      // 扫过相机时会被 bloom 放大成一团白（实测 1000+ 个通道全 >248 的像素）。
      clearcoat: 0.06,
      envMapIntensity: 0.35,
      visible: 'farIsN',
    },
    {
      type: 'box',
      id: 'mag-far-N',
      size: [MAG_LEN / 2, MAG_HALF_W * 2, MAG_HALF_W * 2],
      position: 'farC',
      color: '#f87171',
      round: 0.006,
      metalness: 0.55,
      roughness: 0.35,
      // 相机拉近到 0.46 后，默认 clearcoat 0.4 + envMapIntensity 1.1 的镜面高光
      // 扫过相机时会被 bloom 放大成一团白（实测 1000+ 个通道全 >248 的像素）。
      clearcoat: 0.06,
      envMapIntensity: 0.35,
      visible: 'farIsN',
    },
    {
      type: 'box',
      id: 'mag-far-S',
      size: [MAG_LEN / 2, MAG_HALF_W * 2, MAG_HALF_W * 2],
      position: 'farC',
      color: '#60a5fa',
      round: 0.006,
      metalness: 0.55,
      roughness: 0.35,
      // 相机拉近到 0.46 后，默认 clearcoat 0.4 + envMapIntensity 1.1 的镜面高光
      // 扫过相机时会被 bloom 放大成一团白（实测 1000+ 个通道全 >248 的像素）。
      clearcoat: 0.06,
      envMapIntensity: 0.35,
      visible: 'nearIsN',
    },

    /* ---------- 磁通量面 ---------- */
    { type: 'disc', id: 'flux-face', position: [0, 0, 0], radius: COIL_R, rotation: [0, Math.PI / 2, 0], color: '#0e2a3a', opacity: 0.3 },

    /* ---------- 矢量 ---------- */
    // 相机拉近到 0.46 后，7 倍半径的 additive 光晕会在画面正中爆成一团白（实测 1410 个
    // 通道全 >248 的像素，青色被冲没）。这里只保留实心小球做矢量锚点，不要光晕。
    { type: 'particle', id: 'coil-center', bind: 'coilCenter', radius: 0.012, color: '#22d3ee', glow: false },
    {
      type: 'vector',
      id: 'B-vec',
      bind: 'B',
      origin: 'coilCenter',
      color: '#f472b6',
      radius: 0.012,
      maxLength: 0.16,
      label: 'B（原磁场）',
    },
    {
      type: 'vector',
      id: 'Bind-vec',
      bind: 'Bind',
      origin: 'coilCenter',
      color: '#a78bfa',
      radius: 0.012,
      maxLength: 0.16,
      label: "B'（感应磁场）",
    },
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      origin: 'magC',
      color: '#4ade80',
      radius: 0.012,
      maxLength: 0.12,
      label: 'v（磁铁速度）',
    },
    {
      type: 'vector',
      id: 'F-vec',
      bind: 'F',
      origin: 'magC',
      color: '#fbbf24',
      radius: 0.012,
      maxLength: 0.12,
      label: 'F（阻力）',
    },

    /* ---------- 电流箭头：8 个绕行方向一致的切向箭头 ---------- */
    ...Array.from({ length: 8 }, (_, i) => ({
      type: 'vector' as const,
      id: `I${i}`,
      bind: `I${i}`,
      origin: `c${i}`,
      color: '#facc15' as const,
      radius: 0.009,
      maxLength: 0.12,
    })),

    { type: 'text', id: 'label-near', text: '近端', position: 'poleNear', color: '#f8fafc', size: 11 },
    { type: 'text', id: 'label-coil', text: '线圈', position: [0, COIL_R + 0.05, 0], color: '#22d3ee', size: 11 },
  ],

  hud: {
    readouts: [
      { label: '磁铁到线圈距离 x', bind: 'x', unit: 'cm', digits: 2 },
      { label: '磁铁速度 v', bind: 'v', unit: 'cm/s', digits: 2 },
      { label: '磁通量 Φ（单匝）', bind: 'flux', unit: 'µWb', digits: 3, hint: '负号表示磁通指向 −x 方向' },
      { label: '磁通匝链数 NΦ', bind: 'linkage', unit: 'µWb', digits: 3 },
      { label: '感应电动势 ε', bind: 'emf', unit: 'mV', digits: 4, hint: 'ε = −N·dΦ/dt，负号就是楞次定律' },
      { label: '感应电流 I', bind: 'current', unit: 'µA', digits: 3 },
      { label: "感应磁场 B'", bind: 'bInd', unit: 'µT', digits: 3, hint: "总是反对 Φ 的变化" },
      { label: '磁铁受阻力 F', bind: 'force', unit: 'µN', digits: 4, hint: '恒与 v 反向：靠近时排斥、远离时吸引' },
      { label: '匝数 N', bind: 'N', unit: '匝', digits: 0 },
      { label: '电阻 R', bind: 'R', unit: 'Ω', digits: 0 },
      { label: '周期 T', bind: 'T', unit: 's', digits: 1 },
      { label: '最大速率', bind: 'vMax', unit: 'cm/s', digits: 1 },
    ],
    charts: [
      {
        title: '磁通量 Φ 与感应电动势 ε',
        series: [
          { bind: 'flux', label: 'Φ（µWb）', color: '#f472b6' },
          { bind: 'emf', label: 'ε（mV）', color: '#facc15' },
        ],
        yLabel: '读数',
        note: '注意：Φ 取极值的时刻，ε 恰好过零——"磁通最大"不等于"电流最大"',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '一个 N 匝线圈，法向朝右（青色圆环）。右边是一根条形磁铁，正沿轴线左右往复运动。粉色箭头是磁铁**在线圈中心处产生的原磁场 B**。',
      camera: { position: [0.42, 0.3, 0.46], target: [0.14, 0.02, 0] },
      highlight: ['coil', 'flux-face', 'B-vec', 'mag-near-N'],
    },
    {
      at: 8,
      text: '先看磁铁靠近的半程：穿过线圈的磁通量 Φ 的**绝对值在变大**。楞次定律说，感应电流必须**反对这个变化**。',
      params: { T: 3 },
      highlight: ['B-vec', 'flux-face'],
    },
    {
      at: 16,
      text: '于是线圈产生一个与原磁场**反向**的感应磁场 B\'（紫色），也就是"增则反之"。看紫色箭头：它和粉色箭头指着相反方向。',
      highlight: ['Bind-vec', 'B-vec'],
    },
    {
      at: 24,
      text: '宏观效果：线圈朝向磁铁的那一面变成了同名磁极，把磁铁往外推。这就是你手感到的"阻力"。黄色 F 箭头永远和绿色 v 箭头反向。',
      highlight: ['F-vec', 'v-vec'],
    },
    {
      at: 33,
      text: '关键误区来了：磁铁到达最近点的那一瞬间，磁通量**最大**，但电动势读数却是 **0**。因为 ε 取决于 Φ 的**变化率**，不是 Φ 本身。',
      params: { T: 3 },
      highlight: ['flux-face', 'B-vec'],
      pause: true,
    },
    {
      at: 42,
      text: '过了最近点，磁铁开始远离，Φ 的绝对值在减小。这时感应磁场要**补上**原来的磁通——"减则同之"，紫色箭头翻转，与粉色同向。',
      highlight: ['Bind-vec', 'B-vec'],
    },
    {
      at: 50,
      text: '此时线圈近端变成异名磁极，反过来**吸住**磁铁不让它走。F 与 v 依然反向：无论是推还是拉，感应电流都在跟你较劲。',
      highlight: ['F-vec', 'v-vec', 'I0', 'I4'],
    },
    {
      at: 58,
      text: '现在把磁极换成 S 极正对线圈：原磁场方向整根翻转，感应电流的绕向也跟着整个反过来。这是检验是否真懂的试金石。',
      params: { pole: 'S' },
      highlight: ['B-vec', 'Bind-vec', 'I0', 'I4'],
    },
    {
      at: 66,
      text: '最后把匝数从 200 拉到 400：ε 与 N 成正比，电动势和电流都翻倍。而能量账始终成立——F·v = −I²R，机械功全部变成焦耳热。',
      params: { N: 400, pole: 'N' },
      highlight: ['Bind-vec', 'F-vec'],
      pause: true,
    },
  ],

  formulas: [
    { tex: '\\Phi_1(x) = \\frac{\\mu_0 a^2\\,(\\vec m\\cdot\\hat n)}{2\\,(a^2+x^2)^{3/2}}', caption: '轴线上距磁偶极子 x 处、半径 a 的圆面的磁通量（由 A⃗ 环积分得到）。' },
    { tex: '\\varepsilon = -N\\frac{d\\Phi_1}{dt} = \\frac{3}{2}\\,\\frac{N\\mu_0 a^2(\\vec m\\cdot\\hat n)\\,x\\dot x}{(a^2+x^2)^{5/2}}', caption: '法拉第电磁感应定律。负号就是楞次定律的全部内容。' },
    { tex: 'I = \\frac{\\varepsilon}{R},\\qquad B\' = \\frac{\\mu_0 N I}{2a}', caption: '感应电流与它产生的磁场。B\' 的符号自动给出"增反减同"。' },
    { tex: 'F = N I\\,\\frac{d\\Phi_1}{dx},\\qquad F\\dot x = -I^2R', caption: '能量账：机械功率恒为负（阻碍运动），且恰好等于焦耳热。' },
  ],

  pitfalls: [
    {
      title: '以为磁通量最大时电流最大',
      wrong: 'Φ 最大 → ε 最大 → 电流最大',
      right: 'ε ∝ dΦ/dt。Φ 取极值时 dΦ/dt = 0，电流反而为零',
      desc: '看图表：Φ 曲线到顶的那一格，ε 曲线正在穿过零线。这和"速度最大时加速度为零"是同一类错误——把量和量的变化率混为一谈。',
    },
    {
      title: '把"阻碍"记成"阻止"',
      wrong: '感应电流会阻止磁铁运动，让它停下来',
      right: '感应电流只是反抗**变化**，磁铁匀速运动时电流恒定，运动照旧',
      desc: '楞次定律说的是"反对变化"，不是"反对运动"。如果真能阻止，磁铁就会悬停，电流消失，然后磁铁又开始动——永动机就造出来了。',
    },
    {
      title: '换磁极后忘记电流也跟着反向',
      wrong: '换 S 极只是磁场反向，电流绕向不变',
      right: '原磁场翻转 → 磁通变化率翻转 → ε 翻转 → 电流绕向整体反向',
      desc: '把 pole 切到 S，盯住 I0 和 I4 两个箭头：它们会同时调头。只记"增反减同"而不判原磁场方向，这里必错。',
    },
    {
      title: '认为匝数越多能量越省',
      wrong: 'N 翻倍 → 电流翻倍 → 省力',
      right: 'N 翻倍也让阻力翻倍，做功反而更多，全部变成热',
      desc: '由 F=NI·dΦ/dx 且 I∝N 可知 F∝N²。匝数翻倍，同样位移下机械功变四倍——多出来的能量去了焦耳热 I²R，同样∝N²。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '磁铁到达最近点的瞬间，感应电动势读数是多少？',
      options: ['最大', '零', '负值最大', '取决于匝数'],
      answer: 1,
      explain: '最近点速度为零 → dΦ/dt = 0 → ε = 0。此时 Φ 的绝对值却是全程最大的。',
      applyParams: { T: 3 },
    },
    {
      type: 'predict-then-run',
      prompt: '磁铁远离线圈时，线圈近端变成什么磁极？',
      options: ['同名磁极（排斥）', '异名磁极（吸引）', '不显磁性', '交替变化'],
      answer: 1,
      explain: '远离时磁通在减小，感应磁场要"补上"它，于是近端成为异名磁极把磁铁吸回来。',
    },
    {
      type: 'single-choice',
      prompt: '匝数 N 加倍、其余不变，磁铁受到的阻力如何变化？',
      options: ['不变', '变为 2 倍', '变为 4 倍', '变为 1/2'],
      answer: 2,
      explain: 'I = ε/R ∝ N，而 F = N·I·dΦ/dx ∝ N²，所以 N 加倍使阻力变 4 倍。多做的功全部变成焦耳热。',
      applyParams: { N: 400 },
    },
  ],

  assumptions: [
    '条形磁铁用**磁偶极子**近似：这要求磁铁尺寸远小于它到线圈的距离，最近点取 0.16 m、磁铁长 0.24 m 只是勉强满足，因此近端读数偏乐观。',
    '忽略线圈的自感：真实回路里感应电流还会产生自感电动势，使电流相位滞后。这里取纯电阻回路，ε 与 I 同相。',
    '磁铁按余弦规律往复运动（X = x_c + A·cos ωt），不是"匀速推入再匀速拉出"的理想化课本设定；这样电动势是平滑交变的。',
    '磁感线画的是偶极子场线方程 r = r₀sin²θ 在两个互相垂直的含轴平面内的曲线，只取形状不取疏密，不代表场强大小。',
    '线圈按 N 匝理想耦合处理（Φ 严格乘以 N），忽略漏磁与边缘效应。',
  ],

  duration: 76,
};
