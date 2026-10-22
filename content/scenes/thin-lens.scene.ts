import type { SceneSpec } from '@/engine/spec';

/**
 * 凸透镜成像规律
 *
 * 这一节的关键不是背表格，而是"三条特殊光线"如何在空间里交出像点。
 * 场景里始终同时给出：物、像、三条光线（实线）与虚像的反向延长线（虚线）。
 *
 * 世界单位：1 unit = 10 cm（由求解器统一换算）
 */
export const thinLensScene: SceneSpec = {
  meta: {
    id: 'thin-lens',
    title: '凸透镜成像：三条光线决定一切',
    subtitle: 'u 与 f 的关系 · 实像与虚像 · 放大率',
    stage: 'junior',
    chapterId: 'j8a-5',
    difficulty: 2,
    dimension: 'hybrid',
    minutes: 11,
    tags: ['凸透镜', '成像规律', '实像', '虚像', '放大镜'],
    pitch: '拖动物距，看着像点在光路上跑——比背「一倍焦距分虚实」有用得多',
  },

  camera: { position: [2.6, 4.6, 8.2], target: [0.2, 0.3, 0], fov: 44 },

  world: { showGrid: false, showAxis: false, gridSize: 16, gridDivisions: 16 },

  params: [
    {
      type: 'slider',
      key: 'u',
      label: '物距 u',
      unit: 'cm',
      min: 6,
      max: 50,
      step: 1,
      default: 30,
      hint: 'u > 2f 缩小；f < u < 2f 放大；u < f 虚像',
    },
    {
      type: 'slider',
      key: 'f',
      label: '焦距 f',
      unit: 'cm',
      min: 5,
      max: 20,
      step: 1,
      default: 10,
      hint: '改变 f，2f 的位置随之移动，"分界点"也跟着变',
    },
    {
      type: 'slider',
      key: 'h',
      label: '物高 h',
      unit: 'cm',
      min: 2,
      max: 8,
      step: 0.5,
      default: 4,
    },
  ],

  solver: { kind: 'thinLens' },

  objects: [
    // 主光轴
    { type: 'polyline', id: 'axis', bind: 'axis', color: '#475569', width: 1.4 },
    // 透镜
    { type: 'lens', id: 'lens', position: [0, 0, 0], semiHeight: 1.05, thickness: 0.24, kind: 'convex' },
    // 物与像
    { type: 'arrowLine', id: 'object', from: 'objectBase', to: 'objectTip', color: '#f59e0b', width: 2.4 },
    { type: 'arrowLine', id: 'image', from: 'imageBase', to: 'imageTip', color: '#22d3ee', width: 2.4 },
    // 三条特殊光线
    { type: 'polyline', id: 'ray0', bind: 'ray0', color: '#22d3ee', width: 1.8, arrows: true },
    { type: 'polyline', id: 'ray1', bind: 'ray1', color: '#4ade80', width: 1.8, arrows: true },
    { type: 'polyline', id: 'ray2', bind: 'ray2', color: '#a78bfa', width: 1.8, arrows: true },
    // 虚像的反向延长线
    // 虚像延长线：只在 u < f 时存在，故标记 optional
    { type: 'polyline', id: 'virtual0', bind: 'virtual0', color: '#22d3ee', width: 1.2, dashed: true, optional: true },
    { type: 'polyline', id: 'virtual1', bind: 'virtual1', color: '#4ade80', width: 1.2, dashed: true, optional: true },
    // 焦点标注
    { type: 'text', id: 'label-F', text: 'F', position: 'focusF', color: '#94a3b8', size: 12 },
    { type: 'text', id: 'label-F2', text: "F′", position: 'focusF2', color: '#94a3b8', size: 12 },
    { type: 'text', id: 'label-lens', text: '凸透镜', position: [0, 1.35, 0], color: '#67e8f9', size: 11 },
  ],

  hud: {
    readouts: [
      { label: '物距 u', bind: 'u', unit: 'cm', digits: 0 },
      { label: '焦距 f', bind: 'f', unit: 'cm', digits: 0 },
      { label: '像距 v', bind: 'imgDist', unit: 'cm', digits: 1 },
      { label: '放大率 m', bind: 'mag', unit: '×', digits: 2 },
      { label: '像高 h′', bind: 'hi', unit: 'cm', digits: 2 },
      { label: '成像性质', bind: 'meta.verdict' },
    ],
  },

  script: [
    {
      at: 0,
      text: '凸透镜成像不用背表格。只要画对三条特殊光线，像点自然就出来了：平行主光轴的过焦点，过光心的不偏折，过焦点的折射后平行。',
      camera: { position: [2.6, 4.6, 8.2], target: [0.2, 0.3, 0] },
      highlight: ['ray0', 'ray1', 'ray2'],
    },
    {
      at: 8,
      text: '现在 u = 30 cm，f = 10 cm，也就是 u > 2f。三条光线交于一点——倒立、缩小的实像，落在 f 与 2f 之间。',
      highlight: ['object', 'image'],
    },
    {
      at: 16,
      text: '把物距调到 2f = 20 cm。此时像也在 2f，大小和物完全相等——这是"放大与缩小"的分界点。',
      params: { u: 20 },
      highlight: ['image'],
    },
    {
      at: 24,
      text: '继续靠近到 15 cm（f < u < 2f）：像跑到 2f 以外，变成倒立、放大的实像。投影仪就是这个区间。',
      params: { u: 15 },
      camera: { position: [3.4, 3.8, 7.2], target: [0.9, 0.2, 0] },
      highlight: ['image'],
    },
    {
      at: 32,
      text: '再靠近到 u = f = 10 cm：出射光线互相平行，永远不相交——不成像。这是"虚实"的分界点。',
      params: { u: 10 },
      highlight: ['ray0', 'ray1'],
    },
    {
      at: 40,
      text: '当 u < f，出射光发散。把它们反向延长（虚线），交点落在物体同侧——正立、放大的虚像，这就是放大镜。',
      params: { u: 6 },
      camera: { position: [1.6, 4.2, 7.6], target: [-0.6, 0.2, 0] },
      highlight: ['virtual0', 'virtual1', 'image'],
    },
    {
      at: 49,
      text: '记住两个分界点：u = f 分虚实，u = 2f 分大小。中间的规律，自己拖一遍就忘不掉了。',
      pause: true,
    },
  ],

  formulas: [
    {
      tex: '\\frac{1}{u}+\\frac{1}{v}=\\frac{1}{f}',
      caption: '薄透镜成像公式（教材写法，实像时 v 取正）。u = f 时 v 趋于无穷，即不成像。',
    },
    { tex: 'm=\\frac{v}{u}=\\frac{h\'}{h}', caption: '放大率。m > 1 放大，m < 1 缩小；负号表示倒立。' },
    { tex: 'u>2f\\;\\Rightarrow\\;f<v<2f\\;(\\text{倒立缩小实像})', caption: '照相机区间。' },
    { tex: 'f<u<2f\\;\\Rightarrow\\;v>2f\\;(\\text{倒立放大实像})', caption: '投影仪区间。' },
  ],

  pitfalls: [
    {
      title: '把"像距"和"物距"搞反',
      wrong: '物距越大，像距也越大',
      right: '1/u + 1/v = 1/f，u 增大时 v 减小——物远像近',
      desc: '把 u 从 30 拖到 45，看像距读数：它在变小。这就是"拍远景时镜头要往回缩"的原因。',
    },
    {
      title: '以为虚像"不存在"',
      wrong: '虚像是假的，光屏上接不到，所以没有像',
      right: '虚像是实际出射光线反向延长线的交点，眼睛能看到，只是不能成在光屏上',
      desc: '虚线画的就是"反向延长"——光线本身是发散的，但人眼会沿直线回溯，看到那个虚像。',
    },
    {
      title: '认为 u = f 时成"无限大的像"',
      wrong: 'u = f 时像在无穷远，所以是一个巨大的像',
      right: 'u = f 时出射光平行，根本不相交，严格来说"不成像"',
      desc: '数学上 v → ∞ 只是极限描述；物理上平行光不会聚，没有像点。',
    },
    {
      title: '忽略"物在焦点内"时光线不经过透镜',
      wrong: 'u < f 时也该画第三条"过焦点"的光线',
      right: '物在焦点以内时，那条光线是背向透镜的，应改用两条光线 + 反向延长',
      desc: '观察 u = 6 cm 时的画面：场景里自动只保留两条实线光线，另加两条虚线延长线。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '焦距 10 cm 的凸透镜，物体放在 30 cm 处，像距是多少？',
      options: ['10 cm', '15 cm', '20 cm', '30 cm'],
      answer: 1,
      explain: '1/30 + 1/v = 1/10 → 1/v = 1/10 − 1/30 = 2/30 → v = 15 cm。放大率 m = 15/30 = 0.5，倒立缩小。',
      applyParams: { u: 30, f: 10 },
    },
    {
      type: 'predict-then-run',
      prompt: '把物体移到焦距以内（u < f），成的像是？',
      options: ['倒立缩小的实像', '倒立放大的实像', '正立放大的虚像', '不成像'],
      answer: 2,
      explain: 'u < f 时像距为负（与物同侧），放大率为正且大于 1 —— 正立放大的虚像，这就是放大镜。',
      applyParams: { u: 6 },
    },
    {
      type: 'predict-then-run',
      prompt: '把物距正好调到 f，会发生什么？',
      options: ['成等大实像', '像在无穷远，实际不成像', '成正立虚像', '像距等于 f'],
      answer: 1,
      explain: '1/u + 1/v = 1/f，当 u = f 时 1/v = 0，v → ∞。物理上出射光平行，不会聚，所以不成像。',
      applyParams: { u: 10 },
    },
  ],

  assumptions: [
    '采用薄透镜近似：忽略透镜厚度与球面像差、色差，近轴光线成像。',
    '三条特殊光线是作图工具，实际成像由全部光线共同决定（本场景只画代表光线以免画面拥挤）。',
  ],

  duration: 58,
};
