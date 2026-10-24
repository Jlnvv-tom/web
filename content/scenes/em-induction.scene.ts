import type { SceneSpec } from '@/engine/spec';
import { RAIL_HALF } from '@/engine/solvers/rodInduction';

/**
 * 电磁感应 · 切割磁感线（初中：磁生电）
 *
 * 为什么必须真 3D：感应电流的方向**垂直导轨平面**（−z，向里）。
 * 平面图上第三维只能画成"点/叉"，学生背"左力右电"式口诀却不知道反的是哪根轴；
 * 3D 里把 B（竖直向下）、v（水平向右）、I（垂直纸面向里）三根正交矢量同时立起来，
 * 转一下视角才能看清右手定则到底在三个方向之间建立了什么关系。
 * 主体是平面装置，但核心矢量离开该平面——dimension 因此标 hybrid。
 *
 * 迁移自 lessons/初中物理实验/05-electromagnetic-induction.html（数值已由
 * verify_junior.py 手算验证；**电流方向迁移中修正**，见 assumptions）。
 *
 * 与高中 `induction`（F-010 楞次定律·磁铁插线圈）的边界：初中只讲
 * "条件 / 方向 / 大小"，BLv 作为读数出现；高中讲磁通量与磁通变化。
 *
 * 规格：docs/specs/features/F-019-em-induction.spec.md
 */
export const emInductionScene: SceneSpec = {
  meta: {
    id: 'em-induction',
    title: '电磁感应：切割磁感线才有电流',
    subtitle: 'ε = B·L·v · I = BLv/R · 离开磁场立即归零',
    stage: 'junior',
    chapterId: 'j9-4',
    difficulty: 2,
    dimension: 'hybrid',
    minutes: 12,
    tags: ['电磁感应', '切割磁感线', '感应电流', '右手定则', '发电机'],
    pitch: '把"切割磁感线"这个动作，变成三根能转着看的正交矢量',
  },

  camera: { position: [2.9, 2.1, 3.3], target: [2.05, 0.12, 0], fov: 45 },

  // 参数驱动的静态场景：棒的位置由滑块设定，不模拟动力学。
  // 展台：装置站在木桌上。没有桌子时整套设备漂在近白画布上，
  // 截图像"贴图"而不是"实验"——木头是画面里唯一的中间调锚点。
  world: {
    gridSize: 5.5,
    gridDivisions: 11,
    showGrid: true,
    showAxis: false,
    stage: { kind: 'table', y: -1.05, size: 2.9, contact: 0.22 },
  },

  params: [
    {
      type: 'slider',
      key: 'x',
      label: '导体棒位置 x',
      unit: 'm',
      min: 0,
      max: 4,
      step: 0.05,
      default: 1.2,
      hint: '磁场区是 x ∈ [0, 3]；拖到 3 以外，电流立刻归零',
    },
    {
      type: 'slider',
      key: 'B',
      label: '磁感应强度 B',
      unit: 'T',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: '磁场越强，电流越大（线性正比）',
    },
    {
      type: 'slider',
      key: 'L',
      label: '有效切割长度 L',
      unit: 'm',
      min: 0.1,
      max: 0.8,
      step: 0.05,
      default: 0.4,
      hint: '是棒**在磁场中**的那一段长度，不是棒的总长',
    },
    {
      type: 'slider',
      key: 'v',
      label: '导体棒速度 v',
      unit: 'm/s',
      min: 0,
      max: 3,
      step: 0.1,
      default: 1.5,
      hint: '拖到 0 = 棒静止：不切割磁感线，就没有电流',
    },
    {
      type: 'slider',
      key: 'R',
      label: '回路电阻 R',
      unit: 'Ω',
      min: 0.5,
      max: 10,
      step: 0.5,
      default: 2,
      hint: '电阻在分母上：R 翻倍，电流减半',
    },
  ],

  solver: { kind: 'rodInduction' },

  objects: [
    { type: 'grid', id: 'floor', size: [5.5, 5.5], divisions: 11, plane: 'xz', color: '#1e5a72', opacity: 0.22 },

    /* ---------- 磁场区边界（x ∈ [0,3] 的方盒） ---------- */
    { type: 'polyline', id: 'zone-l', bind: 'zoneL', color: '#a78bfa', width: 1.6 },
    { type: 'polyline', id: 'zone-r', bind: 'zoneR', color: '#a78bfa', width: 1.6 },
    { type: 'polyline', id: 'zone-f', bind: 'zoneF', color: '#7c3aed', width: 1.6 },
    { type: 'polyline', id: 'zone-b', bind: 'zoneB', color: '#7c3aed', width: 1.6 },

    /* ---------- 导轨 ---------- */
    { type: 'polyline', id: 'rail-f', bind: 'railF', color: '#94a3b8', width: 2 },
    { type: 'polyline', id: 'rail-b', bind: 'railB', color: '#94a3b8', width: 2 },

    /* ---------- 导体棒：有体积的金属块（折线的 linewidth 被 WebGL 忽略，
                   1px 细线撑不起主角；金属块受光后有高光，画面才有分量） ---------- */
    {
      type: 'box',
      id: 'rod',
      size: [0.035, RAIL_HALF * 2, 0.035],
      position: 'rodC',
      material: 'metal',
      color: '#b45309',
    },

    /* ---------- 三根正交矢量：B / v / I ---------- */
    {
      type: 'vector',
      id: 'v-vec',
      bind: 'v',
      origin: 'rodTop',
      color: '#f472b6',
      radius: 0.014,
      maxLength: 1,
      label: 'v（运动方向）',
      visible: 'inF',
    },
    {
      type: 'vector',
      id: 'I-vec',
      bind: 'I',
      origin: 'rodC',
      color: '#34d399',
      radius: 0.014,
      maxLength: 0.7,
      label: 'I（感应电流）',
      visible: 'inF',
    },
    {
      type: 'vector',
      id: 'B1-vec',
      bind: 'B1',
      origin: 'b1',
      color: '#60a5fa',
      radius: 0.014,
      maxLength: 1.4,
      label: 'B（竖直向下）',
    },
    {
      type: 'vector',
      id: 'B2-vec',
      bind: 'B2',
      origin: 'b2',
      color: '#60a5fa',
      radius: 0.014,
      maxLength: 1.4,
      label: 'B（竖直向下）',
    },

    /* ---------- 标注 ---------- */
    { type: 'text', id: 'label-zone', text: '匀强磁场区（B 竖直向下）', position: [1.5, 1.3, 0], color: '#7c3aed', size: 11 },
    { type: 'text', id: 'label-rail', text: '导轨', position: [-0.25, 1.12, 0], color: '#94a3b8', size: 10 },
    { type: 'text', id: 'label-rod', text: '导体棒', position: [1.32, -1.12, 0], color: '#fbbf24', size: 10 },
  ],

  hud: {
    readouts: [
      { label: '棒的位置 x', bind: 'x', unit: 'm', digits: 2 },
      { label: '是否在磁场中', bind: 'inF', digits: 0, unit: '（1 是 / 0 否）', hint: 'x < 3 m 在磁场中；离开后电流立刻归零' },
      { label: '感应电动势 ε = BLv', bind: 'eps', unit: 'V', digits: 3 },
      { label: '感应电流 I', bind: 'curmA', unit: 'mA', digits: 1 },
      // 守恒读数：I₀ 与位置无关——离开磁场只是"条件不满足"，不是公式失效
      {
        label: '磁场中的电流 I₀ = BLv/R',
        bind: 'I0',
        unit: 'mA',
        digits: 1,
        constant: true,
        hint: '只要棒在磁场里就该有这个值；拖出磁场后实际电流归零，I₀ 不变',
      },
    ],
  },

  script: [
    {
      at: 0,
      text: '紫色框出的区域是**匀强磁场区**（x ∈ [0, 3]，B 竖直向下，蓝色箭头）。黄色导体棒垂直搭在两条导轨上，构成闭合回路。现在棒在 x = 1.2 m，正在磁场中——看读数，有电流。',
      highlight: ['zone-l', 'zone-r', 'zone-f', 'zone-b', 'rod'],
    },
    {
      at: 8,
      text: '把棒拖到 x = 3.5 m——**离开磁场**。感应电流立刻变成 0：没有切割磁感线，就没有感应电动势。「做切割磁感线运动」是三个条件里最容易被跳过的一个。',
      params: { x: 3.5 },
      highlight: ['rod', 'I-vec', 'v-vec'],
    },
    {
      at: 16,
      text: '方向：B 竖直向下、v 向右，由右手定则感应电流**垂直纸面向里**（绿色箭头指向 −z）。拖动视角转一下——这根箭头是离开导轨平面的，平面图上只能画一个叉，这就是本场景值得转着看的原因。',
      params: { x: 1.2 },
      highlight: ['B1-vec', 'v-vec', 'I-vec'],
    },
    {
      at: 24,
      text: '大小：ε = B·L·v。把 B 从 0.5 拖到 1.0 T——电流按比例翻倍。L 和 v 也是同样的线性关系，四个因子（B、L、v、R）各自独立可控。',
      params: { x: 1.2, B: 1 },
      highlight: ['B1-vec', 'rod'],
    },
    {
      at: 32,
      text: '电阻是唯一的反因子：I = BLv/R，R 从 2 Ω 拖到 10 Ω，电流缩到 1/5。还有一个"隐藏因子"——安培力 F = BIL 永远**阻碍**棒运动：机械功全部变成焦耳热，F·v = I²R，这正是"阻碍"的定量含义。',
      params: { R: 10 },
      highlight: ['v-vec', 'I-vec'],
    },
    {
      at: 40,
      text: '回到默认参数。产生感应电流的三个条件：① 电路闭合 ② 一部分导体 ③ 做**切割**磁感线运动。发电机就是把这三个条件用机械方式持续满足的装置。',
      params: { x: 1.2, B: 0.5, L: 0.4, v: 1.5, R: 2 },
      pause: true,
    },
  ],

  formulas: [
    { tex: '\\varepsilon = B\\,L\\,v', caption: '感应电动势：磁场 × 有效切割长度 × 速度。三者垂直时才成立。' },
    { tex: 'I = \\dfrac{B\\,L\\,v}{R}', caption: '闭合回路欧姆定律。R 在分母上——唯一的反因子。' },
    { tex: 'F = B\\,I\\,L', caption: '安培力：电流在磁场中受的力，方向由左手定则，总是阻碍相对运动。' },
    { tex: 'F\\,v = I^{2}R', caption: '能量平衡：机械功率全部转化为焦耳热——楞次定律"阻碍"的定量形式。' },
  ],

  pitfalls: [
    {
      title: '以为"在磁场中就有电流"',
      wrong: '棒放在磁场里，就会有感应电流',
      right: '要**切割**磁感线——静止的棒在磁场中也没有电流',
      desc: '把 v 拖到 0 试试：条件不满足，ε = 0。磁场只是舞台，切割才是动作。',
    },
    {
      title: '以为电流方向只看磁场',
      wrong: '电流向里还是向外，只取决于磁场方向',
      right: '由 v 和 B **共同**决定：任一个反向，电流就反向（右手定则）',
      desc: '发电机就是靠改变切割方向来得到交变电流的。三个方向（v、B、I）两两垂直，缺一个都定不了向。',
    },
    {
      title: '以为电路不闭合也有电流',
      wrong: '只要切割磁感线就有电流，开关断开无所谓',
      right: '感应电流需要**闭合回路**；开路只有感应电动势，没有电流',
      desc: '电动势是"能力"，电流是"流动"。回路断开时能力存在（可测电压），但电荷没有通路。',
    },
    {
      title: '以为"棒越长电流越大"',
      wrong: '换一根更长的棒，电流一定更大',
      right: '有效长度是棒**在磁场中**的那一段；长出磁场的部分不切割，不计入 L',
      desc: 'L 是"同时处于 B 和回路中的长度"。把棒加长到磁场区之外，多出来的段不产生电动势。',
    },
  ],

  quiz: [
    {
      type: 'predict-then-run',
      prompt: '把导体棒从磁场中拖出去（x 从 1.2 到 3.5），感应电流怎么变？',
      options: ['保持不变', '变成 0', '反向', '变大'],
      answer: 1,
      explain: '离开磁场 → 不切割磁感线 → ε = 0 → I = 0。注意「磁场中的电流 I₀」读数不变——它表示"如果在磁场中会是多大"，公式并没有失效。',
      applyParams: { x: 3.5 },
    },
    {
      type: 'single-choice',
      prompt: '下面哪个办法**不能**增大感应电流？',
      options: ['换更强的磁场', '让棒跑得更快', '增大回路电阻', '增大有效切割长度'],
      answer: 2,
      explain: 'I = BLv/R。B、L、v 都在分子上，只有 R 在分母上——增大电阻会让电流变小。',
    },
    {
      type: 'predict-then-run',
      prompt: '棒静止在磁场中（v = 0），有感应电流吗？',
      options: ['有，磁场本身就能产生电流', '没有，不切割就没有', '有，方向不定', '取决于 B 多强'],
      answer: 1,
      explain: 'v = 0 → ε = BLv = 0。磁场只是条件之一，"相对运动/切割"才是触发开关。',
      applyParams: { x: 1.2, v: 0 },
    },
  ],

  assumptions: [
    '**静态模型**：棒的位置由滑块设定，不模拟动力学（真实实验中棒受安培力会减速，匀速是理想化）。',
    '**几何尺寸为示意**：导轨间距 1.7 显示单位、磁场区宽 3 m，而有效长度 L = 0.4 m 是独立物理量，两者不共刻度（产品既定模式：orbit 用 AU、induction 的矢量缩放 4e4）。',
    '**匀强磁场局限在 x ∈ [0, 3] 的方盒内**，边界锐利；真实磁场有边缘过渡区。',
    '**理想导轨与回路**：不计导轨电阻、摩擦与接触电阻，回路总电阻就是 R。',
    '**感应电流方向迁移中修正**：lessons 原页面把 I 画成 +z，但 v(+x)、B(−y) 时 v×B = −z，且 I 沿 +z 时安培力会顺着运动方向给棒助力，违反能量守恒与楞次定律；本场景修正为 −z（垂直纸面向里），此时安培力沿 −x 阻碍运动（F-019 spec §5 记录了完整推导）。',
  ],

  duration: 48,
};
