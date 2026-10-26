# SPEC-010 · 场景契约（SceneSpec / SceneState）

```yaml
状态: Implemented
版本: 0.5
最后更新: 2026-10-25
关联代码: web/engine/spec.ts, web/components/scene/objects.tsx, web/components/scene/labels.tsx
关联测试: web/engine/contract/scene-contract.test.ts, web/engine/spec.test.ts
```

---

## 1. 这份规格解决什么问题

新增一个知识点，成本必须低到「写一份 JSON + 一段文案」，而不是「写 Three.js 代码」。

因此把场景切成三层，层与层之间只有一份契约：

```
   ①  SceneSpec（静态声明，可序列化 JSON）
          │   参数 / 相机 / 对象 / HUD / 讲解脚本 / 内容块
          ▼
   ②  求解器 SolverModule（物理内核，纯函数）
          │   sample(t) → SceneState
          ▼
   ③  SceneState（每帧结果，渲染层唯一认识的结构）
          │   points / vectors / lines / linesets / scalars / meta
          ▼
   ④  渲染层 ObjectView（14 种图元，只认 bind，不认物理）
```

**核心不变量**：求解器只产出 `SceneState`，渲染层只消费 `SceneState`。
因此任何求解器都能驱动任何图元，反之亦然——渲染层里不存在任何物理语义。

---

## 2. 需求

### REQ-SC-001 · 可校验
任何 `SceneSpec` 必须能通过 `validateScene()`（zod）。失败信息必须是**人话**，包含字段路径。

验收：非法输入抛出信息含 `字段路径 — 原因`；`scene.script` 为空时被拒绝。

### REQ-SC-002 · 标识唯一
同一场景内 `objects[].id` 唯一；全部场景之间 `meta.id` 唯一。

验收：契约测试遍历注册表，重复即失败。

### REQ-SC-003 · 声明即解析（本期重点）

补充约定：
- `trail` 是「生长中」的折线，`t=0` 时只有 1 个点属正常，不视为断链；
- `polyline` 可标 `optional: true`，表示该折线只在部分参数下存在（如凸透镜的虚像延长线），
  缺省时不报错；**没标 optional 的缺失一律判为断链**。

`objects` 里出现的每一处引用，在 `sample(t)` 的返回里都必须能解析：

| 图元字段 | 解析目标 | 缺省 |
|---|---|---|
| `particle.bind` | `points[bind]` | `'pos'` |
| `vector.bind` | `vectors[bind]` | 必填 |
| `vector.origin` | `points[origin]` | `'pos'` |
| `trail.bind` / `polyline.bind` | `lines[bind]` | 必填 |
| `polylines.bind` | `linesets[bind]` | 必填 |
| `plane.bindPosition` | `points[bind]` | 用 `position` |
| `arrowLine.from/to` | `points[bind]` 或字面量 | — |
| `hud.readouts[].bind` | `scalars[bind]` | 必填 |
| `hud.charts[].series[].bind` | `scalars[bind]` | 必填 |
| `script[].highlight[]` | `objects[].id` | 必填 |

验收：在 `t ∈ {0, dur/2, dur}` 三个时刻全部可解析；`linesets[bind]` 必须是非空数组，
且每条子折线至少 2 个点。

### REQ-SC-004 · 单位与坐标（全局约定）
- 世界坐标 **1 unit = 1 m**，`y` 轴向上；
- 水平面为 **xz 平面**（`y = 0`），所有 2D 类图示（等势线、轨迹投影）画在 xz 平面；
- 角度参数以「度」为单位存 `ParamDef`，求解器内部转弧度；
- 电荷单位 nC、电势 V、场强 V/m、力 N。

验收：新增场景的相机 `position` 与 `world.gridSize` 应同量级（人工评审项）。

### REQ-SC-004b · 图元通用字段 `visible`（v0.2 新增）

任意图元都可以声明 `visible: <scalar key>`：该标量 > 0.5 时显示，否则隐藏（每帧读取，不触发 React 重渲染）。

用途：同一位置放「正电荷球 / 负电荷球」两个外观，由电荷符号决定哪个可见——
否则把 q₂ 从 −3 拖到 +3 时，球还是蓝色的，颜色与电性矛盾。

验收：`visible` 指向的 key 必须存在于 `scalars`，契约测试逐条断言。

### REQ-SC-005 · 多折线集合（v0.2 新增）
`SceneState.linesets?: Record<string, Vec3[][]>`，用于电场线、等势线等「数量不定」的曲线族。

约定：
- **可选字段**，旧求解器无需修改（`undefined` 视同空集）；
- 数组顺序即绘制顺序，无特殊语义；
- 求解器**必须返回引用稳定的数组**（同参数下不重建），否则渲染层每帧重建几何；
- 每条子折线点数建议 ≤ 400（超过时由求解器抽稀，而不是让渲染层截断）。

验收：`polylines` 图元在参数变化时重建一次，播放过程中不重建。
允许 `linesets[bind]` 是**空数组**（该参数下曲线族确实不存在，如全同号电荷没有零势线）。

### REQ-SC-006 · 渲染层零物理
`components/` 下不得出现具体场景 id，也不得出现物理量名（`velocity`、`charge` 等）。
只允许出现契约字段名（`points`、`vectors`、`bind`）。

验收：`grep` 检查（人工 + 评审），刻意保留为软约束。

### REQ-SC-007 · 脚本合法
`script[].at` 严格递增（允许相等则按后者生效，会导致闪烁，故禁止）；
`duration` 若省略则取 `max(at) + 8`。

验收：契约测试断言 `at[i] < at[i+1]`。

### REQ-SC-008 · 练习题合法
`quiz[].answer` 必须 `< options.length`；`applyParams` 的 key 必须存在于 `params`，
数值型参数的值必须落在 `[min, max]` 闭区间内（否则"验证"按钮点了没反应）。

验收：契约测试逐条断言。

### REQ-SC-009 · 章节双向一致
`meta.chapterId` 必须是真实章节 id；且章节树中**恰好有一个**知识点的 `sceneId === meta.id`，
该知识点必须属于 `meta.chapterId` 这一章。

验收：契约测试用 `content/chapters.ts` 反查。

### REQ-SC-010 · 可序列化
`SceneSpec` 必须能 `JSON.stringify` 且无函数、无循环引用——这是「AI 生成场景」与
「离线导出单文件 HTML」的前提。

验收：`JSON.parse(JSON.stringify(spec))` 后与 `validateScene` 结果等价。

### REQ-SC-011 · 假设声明
`assumptions` 至少 1 条（对应宪法第三条）。

验收：契约测试断言。

### REQ-SC-012 · 规格覆盖
每个注册场景必须有一份 `docs/specs/features/*.spec.md`，且头部声明 `场景: <meta.id>`。

验收：`spec-coverage.test.ts` 扫描 `docs/specs/features/` 与场景注册表，缺一即失败。

### REQ-SC-013 · 版本与兼容
- 新增可选字段/新图元 → `minor`
- 改语义/必填化/删除 → `major` + 迁移脚本
- 本文件的「变更记录」必须同步

### REQ-SC-014 · 未知图元必须可见地失败
渲染层遇到未实现图元时返回 `null`，但**开发环境**应 `console.warn` 一次，
避免"写了图元但不显示"的静默失败。

---

## 3. 字段表

### 3.1 SceneSpec

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `meta` | MetaDef | ✓ | id / title / stage / chapterId / difficulty / dimension / minutes / tags / pitch |
| `camera` | `{position,target,fov?}` | ✓ | 初始位姿，`fov` 缺省 45 |
| `world` | `{gridSize?,gridDivisions?,showGrid?,showAxis?}` | ✓ | 参考网格与坐标轴 |
| `params` | ParamDef[] | ✓ | 控件声明，自动生成参数面板 |
| `solver` | `{kind,options?}` | ✓ | 求解器种类与私有选项 |
| `objects` | ObjectDef[] | ✓ | 图元列表 |
| `hud` | `{readouts,charts?}` | ✓ | 实时读数与曲线 |
| `script` | ScriptStep[] | ✓ | 讲解脚本，至少 1 步 |
| `formulas?` | FormulaDef[] | | KaTeX 公式卡 |
| `pitfalls?` | PitfallDef[] | | 破误区卡 |
| `quiz?` | QuizDef[] | | POE 练习 |
| `assumptions?` | string[] | | 理想化假设（实际要求 ≥1） |
| `duration?` | number | | 时间轴总长（秒） |
| `decor?` | `DecorDef` | | 装饰层：`subject?` / `squash?` / `intro?`（见 3.4） |

### 3.4 装饰层 `decor`（W3 / W4）

**装饰层不参与任何物理计算**：契约测试断言"删掉 `decor` 后 `sample(t)` 逐值不变"
（`engine/contract/decor.test.ts`，REQ-W3-001 / REQ-W4-001）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `subject?` | string | 主角对象 id（参数脉冲挤压、trail-bloom/splash 的目标）。只声明 intro 时可不填 |
| `squash?` | number | 挤压幅度 (0, 0.2]，默认 0.07 |
| `intro?` | `{kind, duration?}` | 开场演出，见下 |

`intro.kind` 是**枚举**（5 种 + `none`），渲染层统一实现，场景只选哪一种——
一旦允许每场景自己写演出，12 个场景就会退化成 12 段特判代码（宪法第六条）。

| kind | 效果 |
|---|---|
| `trail-bloom` | 主角弹出 + 光晕扩散（洛伦兹力的粒子） |
| `wipe-in` | 整体淡入（凸透镜的光路） |
| `light-up` | 自发光逐点点亮（机械波的质点/矢量） |
| `splash` | 主角弹入 + 冲击环（浮力的入水） |
| `assemble` | 实体弹出（简谐的摆球） |

`intro.duration` 默认 1.6s，上限 3s（m3-plan：0–2 秒，留余量给回弹）。

**三条渲染纪律**（写在 `components/scene/intro.ts` 的 `applyIntroAlpha` 上，
每条都有实测来源）：演出未开启时不碰 opacity（否则覆盖高亮压暗）、
演出结束后恢复一次基准值即撒手、`transparent` 变化必须标 `needsUpdate`
（它在 three 的 program 缓存键里）。

### 3.2 SceneState

| 字段 | 类型 | 说明 |
|---|---|---|
| `t` | number | 当前时刻 |
| `points` | `Record<string, Vec3>` | 具名点位 |
| `vectors` | `Record<string, Vec3>` | 具名矢量（长度单位由求解器决定） |
| `lines` | `Record<string, Vec3[]>` | 单条轨迹/折线 |
| `linesets?` | `Record<string, Vec3[][]>` | 多折线集合（v0.2） |
| `scalars` | `Record<string, number>` | HUD / 图表读数 |
| `meta` | `Record<string, number\|string\|boolean>` | 状态标记（如 `kind: 'virtual'`） |

### 3.3 图元（14 种）

| type | 绑定源 | 用途 | 3D 价值 |
|---|---|---|---|
| `particle` | `points` | 质点/小球/电荷 | 高 |
| `vector` | `vectors` | 速度、力、场强箭头 | 高 |
| `trail` | `lines` | 累积轨迹 | 中 |
| `polyline` | `lines` 或字面量 | 光线、辅助线、理想轨道 | 中 |
| `polylines` | `linesets` | **电场线、等势线**（v0.2） | 高 |
| `box` | `points`（位置可绑） | 极板、支架、外壳等实体（v0.2） | 高 |
| `fieldArrows` | 字面量 | 匀强场箭头阵列 | 高 |
| `grid` | 字面量 | 地面参考网格 | 低 |
| `axis` | 字面量 | 坐标轴 | 低 |
| `plane` | 字面量 + `points` | 光屏、磁通量面 | 中 |
| `lens` | 字面量 | 程序化薄透镜 | 中 |
| `arrowLine` | `points` 或字面量 | 物高/像高 | 低 |
| `disc` | 字面量 | 磁场截面、圆轨道 | 中 |
| `text` | `points` 或字面量 | 3D 标注（DOM 投影层渲染） | 低 |

---

## 4. 变更记录

| 版本 | 日期 | 变更 | 兼容性 |
|---|---|---|---|
| 0.1 | 2026-10-20 | 初版：12 种图元、6 个求解器占位 | — |
| 0.2 | 2026-10-21 | 新增 `SceneState.linesets` 与 `polylines` 图元；新增 `ObjectCommon.visible` 显隐绑定；新增 `polyline.optional` 条件折线；新增 `camera.fov` / `vector.maxLength` / `plane.bindPosition` | minor（纯新增，旧场景不改） |
| 0.2 | 2026-10-22 | 增补 `box` 图元（实体物件，支持圆角与物理材质）与 `vector.radius`（小尺度场景的箭头粗细） | minor（纯新增） |
| 0.3 | 2026-10-24 | `SolverKind` 新增 `acoustics`（球面波前，F-018）与 `rodInduction`（切割磁感线，F-019）：初中内容补位首批 | minor（纯新增枚举值，旧场景零影响） |
| 0.4 | 2026-10-25 | 补记 `decor`（W3 落地时漏文档）+ 新增 `decor.intro`（`kind` 五值枚举 + `duration`，W4 开场演出） | minor（可选字段，不写零回归；A 门实测 0.00%） |
| 0.5 | 2026-10-25 | W4 补墨三件套：`trail`/`polyline` 增补可选 `opacity`（同 bind 宽淡"光晕层"）；`box` 增补 `unlit`（无光照不写深度的区域示意体积——受光半透明体积会被 Stage 灯照成近白并用深度遮挡内容，实测来源 lorentz 雾墙）；`disc.position` 支持 `Bind`（抛体落点尘环） | minor（纯新增可选字段，旧场景零影响） |

> **REQ-W4-001（开场演出不污染物理）**：`decor.intro` 只影响渲染层的
> 缩放/透明度/自发光；删掉 `decor` 后 `sample(t)` 输出逐值不变；
> 演出禁用（reduced-motion）时画面与无 intro 版本逐像素一致；
> 演出结束后画面逐像素回到无 intro 状态。三条都由
> `engine/contract/decor.test.ts` + `scripts/verify_intro.py`（A/B 双门 0.00%）看守。

> 契约的每次扩张都由真实需求驱动：v0.2 三项各自由一个缺陷驱动（见下），
> v0.3 的两个求解器枚举由 lessons 迁移驱动——初中场景复用同一份 SceneSpec 契约，
> 不需要任何新图元，证明三层结构对"参数驱动型静态场景"同样成立。

> v0.2 的三项新增各自由一个真实缺陷驱动，不是"预留"：
> `linesets` ← 电场线数量随参数变化；`visible` ← 电荷符号翻转后球色不变；
> `optional` ← 凸透镜虚像延长线在实像情形下不存在，却被判为断链。

---

## 5. 非目标

- **不做**运行期脚本求值（`eval`/`new Function`）：场景必须是纯数据，才能被 AI 生成与安全渲染。
- **不做**物理引擎（rapier/cannon）接入：教学场景要可跳帧、可回退、与教材公式严丝合缝，
  见 ADR-0002。
- **不做**场景热更新：MVP 阶段内容随构建发布，避免版本漂移。
