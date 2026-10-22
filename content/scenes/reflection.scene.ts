import type { SceneSpec } from '@/engine/spec';
import { MIRROR_HALF_H, MIRROR_T, MIRROR_W } from '@/engine/solvers/reflection';

/**
 * 光的反射与平面镜成像
 *
 * 为什么必须真 3D：平面镜成像的经典演示是"把镜子转一个角，反射光转两个角"。
 * 镜面一旦倾斜，光路就离开原来的竖直平面——反射点跑到 z ≠ 0 的地方，
 * 这时候只有转动视角才能看清"像在镜后、光路在镜前"这个三维关系。
 *
 * 规格：docs/specs/features/008-reflection.spec.md
 */
export const reflectionScene: SceneSpec = {
  meta: {
    id: 'reflection',
    title: '平面镜成像：像为什么在镜子后面',
    subtitle: '入射角 = 反射角 · 像距 = 物距 · 镜转 θ 光线转 2θ',
    stage: 'junior',
    chapterId: 'j8a-4',
    difficulty: 1,
    dimension: '3d',
    minutes: 10,
    tags: ['光的反射', '平面镜', '虚像', '反射定律', '光路可逆'],
    pitch: '把"像在镜后"从一句口诀，变成一条能转着看的光路',
  },

  camera: { position: [-2.7, 1.95, 3.0], target: [-0.35, 1.0, 0], fov: 45 },

  world: { gridSize: 8, gridDivisions: 16, showGrid: true, showAxis: false },

  params: [
    {
      type: 'slider',
      key: 'u',
      label: '物距 u',
      unit: 'm',
      min: 0.5,
      max: 4,
      step: 0.1,
      // 默认取近一点：物距太远、眼睛太矮时入射角只有 2°，光路看着像一条直线
      default: 1.6,
      hint: '物体到镜面的距离。像距永远等于它',
    },
    {
      type: 'slider',
      key: 'h',
      label: '物高 h',
      unit: 'm',
      min: 0.2,
      max: 2,
      step: 0.1,
      default: 1,
    },
    {
      type: 'slider',
      key: 'eyeX',
      label: '眼睛到镜面',
      unit: 'm',
      min: 0.5,
      max: 4,
      step: 0.1,
      default: 2.5,
    },
    {
      type: 'slider',
      key: 'eyeY',
      label: '眼睛高度',
      unit: 'm',
      min: 0.2,
      max: 2,
      step: 0.1,
      default: 1.9,
    },
    {
      type: 'slider',
      key: 'phi',
      label: '镜面转角',
      unit: '°',
      min: -60,
      max: 60,
      step: 5,
      default: 0,
      hint: '入射方向不变时，镜面转 θ、反射光转 2θ',
    },
  ],

  solver: { kind: 'reflection' },

  objects: [
    { type: 'grid', id: 'floor', size: [8, 8], divisions: 16, plane: 'xz', color: '#16394a', opacity: 0.2 },

    /* ---------- 镜面（竖直薄板） ---------- */
    {
      type: 'box',
      id: 'mirror',
      // 高度必须够高：反射点在 y≈1.3 m 处，镜子矮了就"打在空气里"
      size: [MIRROR_T, MIRROR_HALF_H * 2, MIRROR_W],
      position: 'mirrorC',
      rotationY: 'mirrorRotY',
      round: 0.008,
      color: '#a8e4ff',
      metalness: 0.55,
      roughness: 0.14,
      opacity: 0.82,
      emissive: 0.06,
    },
    // 镜面与地面的交线：告诉学生"镜子站在哪儿"
    { type: 'polyline', id: 'mirror-line', bind: 'mirror', color: '#e0f2fe', width: 2.4 },

    /* ---------- 物体与像 ---------- */
    { type: 'polyline', id: 'obj-line', bind: 'objLine', color: '#fbbf24', width: 3 },
    { type: 'polyline', id: 'img-line', bind: 'imgLine', color: '#fbbf24', width: 2.2, dashed: true },
    { type: 'particle', id: 'obj-tip', bind: 'objTip', radius: 0.055, color: '#fbbf24', glow: true },
    { type: 'particle', id: 'img-tip', bind: 'imgTip', radius: 0.045, color: '#fde68a' },
    { type: 'particle', id: 'eye', bind: 'eye', radius: 0.05, color: '#4ade80', glow: true },

    /* ---------- 光路 ---------- */
    { type: 'polyline', id: 'ray-in', bind: 'rayTipIn', color: '#fde047', width: 2.2 },
    { type: 'polyline', id: 'ray-out', bind: 'rayTipOut', color: '#fde047', width: 2.2 },
    { type: 'polyline', id: 'ray-virtual', bind: 'rayTipVirtual', color: '#f59e0b', width: 1.6, dashed: true },
    { type: 'polyline', id: 'ray-in-base', bind: 'rayBaseIn', color: '#facc15', width: 1.6 },
    { type: 'polyline', id: 'ray-out-base', bind: 'rayBaseOut', color: '#facc15', width: 1.6 },

    /* ---------- 法向 ---------- */
    {
      type: 'vector',
      id: 'normal-vec',
      bind: 'normal',
      origin: 'mirrorC',
      color: '#a78bfa',
      radius: 0.02,
      label: '法线',
    },

    { type: 'text', id: 'label-obj', text: '物体', position: 'objTip', color: '#fbbf24', size: 13 },
    { type: 'text', id: 'label-img', text: '虚像', position: 'imgTip', color: '#fde68a', size: 13 },
    { type: 'text', id: 'label-eye', text: '眼睛', position: 'eye', color: '#4ade80', size: 12 },
  ],

  hud: {
    readouts: [
      { label: '入射角', bind: 'incidence', unit: '°', digits: 2 },
      { label: '反射角', bind: 'reflection', unit: '°', digits: 2 },
      {
        label: '入射角 − 反射角',
        bind: 'angleDiff',
        unit: '°',
        digits: 4,
        constant: true,
        hint: '反射定律：两者永远相等。这一行就是用读数钉住它',
      },
      { label: '像距', bind: 'imgDist', unit: 'm', digits: 2 },
      { label: '像高', bind: 'imgHeight', unit: 'm', digits: 2 },
      { label: '镜面转角', bind: 'phiDeg', unit: '°', digits: 1 },
      { label: '反射点偏移 z', bind: 'rOffset', unit: 'm', digits: 3, hint: '镜面一转，反射点就离开原来的竖直平面' },
    ],
  },

  script: [
    {
      at: 0,
      text: '一支蜡烛（物体）立在镜前，一只眼睛在看着它。黄色是射向镜面的光，折回来进入眼睛。',
      camera: { position: [-2.7, 1.95, 3.0], target: [-0.35, 1.0, 0] },
      highlight: ['obj-line', 'eye', 'ray-in', 'ray-out'],
    },
    {
      at: 7,
      text: '紫色是法线。入射角和反射角读数始终一模一样——这就是反射定律，也是整个场景的出发点。',
      highlight: ['normal-vec', 'ray-in', 'ray-out'],
    },
    {
      at: 14,
      text: '眼睛觉得光是直线传来的，于是大脑把反射光反向延长，交点在镜后——那里就是"像"。虚线就是这条反向延长线。',
      highlight: ['ray-virtual', 'img-line', 'img-tip'],
    },
    {
      at: 21.5,
      text: '像距等于物距，像高等于物高，而且是正立的。把物距从 2 m 拉到 1 m，像也跟着贴到镜后 1 m。',
      params: { u: 1 },
      highlight: ['img-line'],
    },
    {
      at: 29,
      text: '现在把镜面转 20 度。看反射点：它跑到了 z ≠ 0 的位置——光路已经不在原来的竖直平面里了。',
      params: { u: 2, phi: 20 },
      highlight: ['mirror-line', 'ray-in', 'ray-out'],
    },
    {
      at: 36.5,
      text: '转到侧面看：入射光线、反射光线、法线三者始终共面。这个"三线共面"在平面图上看不出来，在 3D 里一目了然。',
      camera: { position: [-1.2, 0.6, 3.4], target: [-0.3, 0.9, 0] },
      highlight: ['ray-in', 'ray-out', 'normal-vec'],
    },
    {
      at: 44,
      text: '如果入射方向不变，镜面转 θ，反射光就转 2θ。潜望镜、自行车尾灯、太阳灶，全都靠这条。',
      params: { phi: 40 },
      highlight: ['ray-out'],
    },
    {
      at: 51,
      text: '最后：把眼睛和蜡烛换个位置，光原路返回——光路可逆。所以"你能看见我，我也能看见你"。',
      params: { phi: 0, u: 1.5, eyeX: 2, eyeY: 1 },
      highlight: ['eye', 'ray-in', 'ray-out'],
      pause: true,
    },
  ],

  formulas: [
    { tex: 'i = r', caption: '反射定律：入射角等于反射角，且三线共面。' },
    { tex: "v' = -u", caption: '平面镜成像：像距与物距等大反号，负号表示像在镜后（虚像）。' },
    { tex: "h' = h", caption: '像与物等大、正立。平面镜不放大也不缩小。' },
    { tex: '\\theta_{\\text{光}} = 2\\theta_{\\text{镜}}', caption: '入射方向不变时，镜面转角是反射光线转角的一半。' },
  ],

  pitfalls: [
    {
      title: '以为"像在镜子里"是一个真实存在的点',
      wrong: '镜后真的有一个小人，光从那里发出来',
      right: '镜后没有实物，像是反射光**反向延长线**的交点（虚像）',
      desc: '场景里的虚像是虚线画的，而且用手"挡住"它也挡不住蜡烛——因为那里本来就没有光。只有实像才能呈在光屏上。',
    },
    {
      title: '把入射角当成光线与镜面的夹角',
      wrong: '入射角是光线和镜面的夹角',
      right: '入射角是光线与**法线**的夹角。光线与镜面的夹角是余角',
      desc: '看紫色法线和两条黄色光线：读数里那两个角是对法线量的。把法线去掉，反射定律就没法表述。',
    },
    {
      title: '认为镜子转了 30°，反射光也转 30°',
      wrong: '镜面转多少，反射光就转多少',
      right: '入射方向不变时，反射光转 2θ',
      desc: '因为法线跟着镜子一起转了 θ，入射角变了 θ，反射角也跟着变 θ，两者叠加就是 2θ。',
    },
    {
      title: '以为像会随镜子变小而变小',
      wrong: '用小一点的镜子照，像会变小',
      right: '平面镜的像始终与物等大；镜子小只是**看不到全身' + '**（视场变小）',
      desc: '把镜面高度从 1.6 m 拖到 0.6 m：像的大小读数不变，但眼睛能接收到的那部分光路变短了。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '把物体从距镜 2 m 处移到 1 m 处，像到镜面的距离怎么变？',
      options: ['仍是 2 m', '变成 1 m', '变成 0.5 m', '消失'],
      answer: 1,
      explain: '平面镜成像像距始终等于物距。物体靠近 1 m，像也靠近 1 m，二者间距变为 2 m。',
      applyParams: { u: 1 },
    },
    {
      type: 'predict-then-run',
      prompt: '保持入射方向不变，把镜面转过 20°，反射光线转过多少？',
      options: ['10°', '20°', '40°', '不变'],
      answer: 2,
      explain: '镜面转 θ，法线也转 θ，入射角与反射角各变 θ，反射光线总共转 2θ = 40°。',
      applyParams: { phi: 20 },
    },
    {
      type: 'single-choice',
      prompt: '关于平面镜成的像，下面哪句是对的？',
      options: ['是实像，能呈在光屏上', '是虚像，由反射光反向延长线相交得到', '比物体小', '比物体暗因为损失了能量'],
      answer: 1,
      explain: '镜后并没有实际光线会聚，所以是虚像，光屏接不到。像与物等大；镜面反射率很高，像不会明显变暗。',
    },
  ],

  assumptions: [
    '理想镜面：反射率 100%，忽略折射与吸收；真实镜面会损失约 4%–8% 能量。',
    '光线用近轴近似画粗细，实际是几何线；本场景不涉及波动光学（干涉/衍射）。',
    '眼睛视为一个点（没有瞳孔大小），所以"能不能看到全身"只由光路是否被镜子接住决定。',
    '镜面厚度取 3 cm 只为可视化；平面镜公式与厚度无关。',
  ],

  duration: 58,
};
