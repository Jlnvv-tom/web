# SPEC-012 · 场景创作规范

```yaml
状态: Approved
版本: 1.0
最后更新: 2026-10-21
关联代码: web/content/scenes/*.scene.ts, web/content/chapters.ts
关联测试: web/engine/contract/scene-contract.test.ts
```

本文件写给「写场景的人」——包括未来的你自己，以及被要求生成场景的 AI。

---

## 1. 文件与命名

```
content/scenes/<scene-id>.scene.ts     # 一份场景一个文件，导出 <camelCase>Scene
content/scenes/index.ts                # 注册表：加一行 import + 一行数组项
content/chapters.ts                    # 把 sceneId 挂到知识点上
docs/specs/features/NNN-<scene-id>.spec.md   # 规格（缺了契约测试会红）
```

- `scene-id` 用 kebab-case，`engine` 侧无限制，但与章节树的 `sceneId` 必须完全一致；
- 一个场景只对应**一个知识点**。如果一个知识点需要两种视角，用 `script` 切镜头，不要拆两个场景。

---

## 2. 坐标与单位（与 SPEC-010 保持一致）

| 项 | 约定 |
|---|---|
| 世界尺度 | 1 unit = 1 m |
| 竖直方向 | `+y` 向上 |
| 水平面 | xz 平面（`y = 0`） |
| 角度 | 参数用「度」，求解器内部转弧度 |
| 相机 | `position` 与 `target` 的欧氏距离建议 12–40，`fov` 45 |
| 网格 | `world.gridSize` 与相机距离同量级，否则网格会缩成一片糊 |

**常见错误**：把 2D 物理题的 x-y 坐标直接搬到 3D（y 在项目里是"上"）。物理题的"水平面"
在本项目里是 xz 平面。

---

## 3. 讲解脚本的节奏

`script[].at` 是时间轴上的秒数，必须严格递增。

| 规则 | 理由 |
|---|---|
| 每步间隔 6–10 秒 | 中文旁白约 4 字/秒，一步 40–60 字最舒服 |
| 单步文案 ≤ 2 句 | 字幕条只能显示两行 |
| 8 步以内 | 超过就说明这个知识点应该拆成两个 |
| 至少 1 次 `camera` 变化 | 否则观众不知道"可以转" |
| 至少 1 次 `params` 变化 | 让观众看到参数与现象的因果关系 |
| 最后一步 `pause: true` | 停在总结句，把控制权交回用户 |
| `highlight` 指向真实存在的对象 id | 否则高亮无效（契约测试会拦） |

**文案风格**：先给现象，再给原因，最后给公式。不要一上来念定义。

- ✗ 「电场强度是描述电场强弱和方向的物理量……」
- ✓ 「看这条线：它从正电荷出发，最后钻进负电荷。电场线不是随便画的——它每一点的切线方向，
  就是那一点的场强方向。」

---

## 4. 内容配额（DoD 的一部分）

| 内容块 | 最低数量 | 说明 |
|---|---|---|
| `formulas` | 2 | 至少一条定义式 + 一条推论式 |
| `pitfalls` | 3 | 每条必须有 `wrong` 与 `right`，只写"注意 XX"不算 |
| `quiz` | 3 | 至少 1 条 `predict-then-run` 且带 `applyParams` |
| `assumptions` | 1 | 写清楚省略了什么、为什么可以省略 |
| `hud.readouts` | 4 | 至少 1 条标 `constant: true`（守恒量的可视化） |
| `script` | 5–8 | 见上节节奏 |

**易错点的写法**：必须是「学生真的会这么想」的错误，而不是「课本上的正确表述反过来写」。

- ✗ wrong: 「电场线是曲线」（这不是学生的误解）
- ✓ wrong: 「带电粒子会沿着电场线运动」（这是最经典的误解，必须点名）

---

## 5. 视觉密度

| 指标 | 上限 | 超过怎么办 |
|---|---|---|
| 同屏 `polylines` 子曲线 | 60 条 | 减少种子数 / 提高等势线级别间距 |
| 同屏 `vector` 箭头 | 12 个 | 只保留关键矢量，其余用读数代替 |
| 同屏 `text` 标注 | 6 个 | 合并成一句话 |
| 单条折线点数 | 400 | 求解器侧抽稀 |

**留白优先**：宁可少画一条线，也不要让画面没有焦点。

---

## 6. 配色：场景写语义色，渲染层负责适配

场景文件里写的是**语义色**（这个青是场线、那个红是力、坐标轴 x/y/z 用 RGB 三原色），
不是"最终显示值"。主题适配由 `web/engine/palette.ts` 在渲染层完成：

```tsx
// ✅ 对：渲染层过一层 ink()
<lineBasicMaterial color={ink(def.color, '#22d3ee')} />

// ❌ 错：绕过适配直接用
<lineBasicMaterial color={def.color ?? '#22d3ee'} />
```

三条规则：

1. **新场景作者不需要查表**。`ink()` 有算法兜底（`deepenForContrast`），
   表外色会自动压明度到达标。策展表 `LIGHT_INK_MAP` 只是为了让色相保持得更准。
2. **语义色必须保持可辨识的色相差**。红/青/绿各自成族，不要用同一个灰代替 ——
   那会毁掉"看颜色就知道是哪个量"的约定。
3. **subtle 结构色走 `role: 'structure'`**（目标 3:1 而非 4.5:1）。
   水槽框、容器边线、网格这类作者故意要退后的东西，压到 4.5:1 会变成抢戏的粗黑线。

`ink()` 的幂等性与"已达标色原样返回"由 `engine/palette.test.ts` 断言，
所以渲染层接线不会让已经调好的颜色漂移。

> 2026-10-24 补充：画布底板因此从中间调改为近白。中间调底板上 4.5:1 要求前景
> 亮度 ≤0.014（近纯黑），与"保持色相编码"不可兼得；近白底板上同批颜色 4.45–7.19:1。
> 完整推导见 `web/engine/palette.ts` 顶部注释。

### 6.1 语义色参考（历史约定，最终显示值由 palette 决定）

下表是**语义约定**——"哪个物理量用哪个色相族"。写进场景文件的是这些语义色，
渲染层经 `ink()` 适配后显示，**场景作者不需要也不应该查表改色值**。

| 语义 | 色相族 | 参考值 |
|---|---|---|
| 正电荷 / 正电势 / 高温 | 暖红 | `#ff6b6b` `#f59e0b` |
| 负电荷 / 负电势 / 低温 | 冷蓝 | `#60a5fa` `#38bdf8` |
| 运动主体（粒子、试探电荷） | 青 / 琥珀 | `#22d3ee` `#facc15` |
| 力 | 红 | `#ef4444` |
| 速度 | 绿 | `#4ade80` |
| 场（电场、磁场） | 蓝青 | `#38bdf8` `#22d3ee` |
| 参考 / 辅助 | 灰 | `#64748b` `#94a3b8` |

同一场景内，**同一物理量只能有一种颜色**。改颜色前先想想会不会让学生把两个量搞混。

---

## 7. 完成定义（DoD Checklist）

贴到每个 spec 的末尾，逐项打勾才能标 `Implemented`：

```
[ ] 场景文件已写，导出的 spec 通过 validateScene
[ ] 求解器已实现并注册（或复用了已有求解器）
[ ] 场景已在 content/scenes/index.ts 注册
[ ] 章节树里对应知识点的 sceneId 已挂上，且 chapterId 一致
[ ] docs/specs/features/NNN-*.spec.md 已写，头部有 `场景: <id>`
[ ] 不变量单测 ≥ 5 条，全部断言物理恒等式
[ ] npm test 全绿（含契约测试遍历到这个场景）
[ ] npx tsc --noEmit 通过
[ ] harness 冒烟：3D 画布渲染、无 console error
[ ] 拖动每个滑块，画面都有可见变化（参数无死值）
[ ] 讲完 8 步脚本，没有"卡住不动"的时刻
```

---

## 8. 场景模板（可直接复制）

```ts
import type { SceneSpec } from '@/engine/spec';

/**
 * <知识点名> · <一句话说明>
 *
 * 为什么必须（/不必）真 3D：<一句话>
 */
export const myScene: SceneSpec = {
  meta: {
    id: 'my-scene',
    title: '<15 字以内，能独立看懂>',
    subtitle: '<公式 · 关键词>',
    stage: 'senior',          // junior | senior
    chapterId: 'g3-1',        // 必须真实存在
    difficulty: 2,            // 1 基础 / 2 进阶 / 3 挑战
    dimension: '3d',          // 3d | hybrid | 2d
    minutes: 10,
    tags: ['…'],
    pitch: '<首页卡片上的一句话，要有钩子>',
  },

  camera: { position: [10, 8, 14], target: [0, 1, 0], fov: 45 },
  world: { gridSize: 26, gridDivisions: 26, showGrid: true, showAxis: false },

  params: [
    { type: 'slider', key: 'x', label: '…', unit: '…', min: 0, max: 10, step: 0.5, default: 5, hint: '…' },
  ],

  solver: { kind: 'mySolver' },

  objects: [
    { type: 'particle', id: 'p', bind: 'pos', radius: 0.3, color: '#ff6b6b', glow: true },
    { type: 'vector', id: 'v', bind: 'v', color: '#4ade80', scale: 0.25, maxLength: 4 },
  ],

  hud: {
    readouts: [{ label: '速率', bind: 'speed', unit: 'm/s', digits: 2, constant: true }],
  },

  script: [
    { at: 0, text: '…', highlight: ['p'] },
    { at: 8, text: '…', params: { x: 8 }, pause: true },
  ],

  formulas: [{ tex: 'E=\\frac{kQ}{r^2}', caption: '…' }],
  pitfalls: [{ title: '…', wrong: '…', right: '…', desc: '…' }],
  quiz: [{ type: 'predict-then-run', prompt: '…', options: ['…', '…'], answer: 0, explain: '…', applyParams: { x: 8 } }],
  assumptions: ['…'],
  duration: 40,
};
```

---

## 9. 反模式

| 反模式 | 后果 |
|---|---|
| 在一个场景里塞两个知识点 | 观众不知道重点，停留时长反而下降 |
| 脚本一步讲 100 字 | 字幕读不完，用户直接拖进度条 |
| 参数滑块的默认值不是"最好看的那个" | 首屏劝退 |
| 所有元素都高亮 | 等于没有高亮 |
| 用 3D 包装 2D 内容（`dimension: '3d'` 但无立体信息） | 违反宪法第四条，失去差异化 |
| `assumptions` 写"忽略次要因素" | 等于没说。要写具体忽略什么 |
