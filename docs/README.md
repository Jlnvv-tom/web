# 文档地图（SSD / Spec-Driven Development）

本项目采用**规格驱动开发**：先写规格，再写代码，最后用测试把规格钉死。

一句话原则：**规格是唯一的真相来源，代码是实现细节，测试是规格的可执行副本。**

---

## 1. 文档地图

| 文档 | 作用 | 谁需要读 | 状态 |
|---|---|---|---|
| [`constitution.md`](./constitution.md) | 项目宪法：8 条不可妥协的原则，任何 PR 都不得违反 | 所有人 | 生效中 |
| [`specs/README.md`](./specs/README.md) | 规格索引与状态表 | 所有人 | 生效中 |
| [`m3-plan.md`](./m3-plan.md) | **M3 视觉与体验打磨**：量化诊断、美术规范、六条工作流、可测验收指标 | 设计 + 开发 | v1.2 |
| [`m35-plan.md`](./m35-plan.md) | **M3.5 可读性 × 流畅性**：矢量/标签可读性、画质自适应三档、帧率尺子与实测记录 | 设计 + 开发 | v1.1（已执行） |
| [`m4-plan-commercial.md`](./m4-plan-commercial.md) | **M4 可运营（已挂起）**：教师账号 / 班级作业 / 计价、三条红线 | 产品 + 开发 | v1.1 |
| [`specs/010-scene-contract.spec.md`](./specs/010-scene-contract.spec.md) | **场景契约**：`SceneSpec` / `SceneState` 字段与版本策略 | 引擎、内容、AI 生成 | v0.5 |
| [`specs/011-solver-contract.spec.md`](./specs/011-solver-contract.spec.md) | **求解器契约**：纯函数、缓存、精度、不变量 | 引擎 | v1.0 |
| [`specs/012-authoring.spec.md`](./specs/012-authoring.spec.md) | **场景创作规范**：坐标、单位、节奏、内容配额、DoD | 内容作者 | v1.0 |
| [`specs/013-offline-export.spec.md`](./specs/013-offline-export.spec.md) | **离线单文件导出**：运行时共享、脚本转义、MathML 取舍、零网络断言 | 引擎、发布 | v1.0 |
| [`specs/014-telemetry.spec.md`](./specs/014-telemetry.spec.md) | **本地埋点**：三类事件、拖动合并、隐私边界、零网络 | 引擎、产品 | v1.0 |
| [`specs/features/`](./specs/features/) | 特性规格（每个场景一份） | 开发 + 评审 | — |
| [`testing.md`](./testing.md) | 测试策略：五层金字塔、覆盖红线、用例清单 | 开发 | 生效中 |
| [`roadmap.md`](./roadmap.md) | 里程碑、进度、下一步任务与验收门 | 所有人 | 月度更新 |
| [`adr/`](./adr/) | 架构决策记录（为什么这样做，以及什么时候该反悔） | 开发 | — |
| [`../市场调研报告-3D物理知识网站.md`](../市场调研报告-3D物理知识网站.md) | 竞品与定位（为什么做这个产品） | 产品 | 已完成 |
| [`../功能开发设计报告-MVP.md`](../功能开发设计报告-MVP.md) | MVP 范围与 12 个场景规划（做什么） | 产品 | 已完成 |

> 阅读顺序建议：`constitution` → `specs/README` → 需要改哪块就读哪份契约 → 动手前读 `testing.md` 的对应红线。

---

## 2. SDD 五阶段工作流

```
  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌──────────┐
  │ 1 Spec  │ → │ 2 Plan   │ → │ 3 Tasks  │ → │ 4 Implement│ → │ 5 Verify │
  │ 写规格  │   │ 定方案   │   │ 拆任务   │   │ 写代码     │   │ 测试收口 │
  └─────────┘   └──────────┘   └──────────┘   └────────────┘   └────┬─────┘
        ↑                                                             │
        └───────────────── 规格变更（需求变了，回头改 spec）───────────┘
```

| 阶段 | 产出 | 落盘位置 | 完成判据 |
|---|---|---|---|
| 1 Spec | 需求编号 + 验收标准 + 非目标 | `specs/features/NNN-*.spec.md` | 每条需求都能被测试断言 |
| 2 Plan | 算法/数据结构/契约变更方案 | spec 的「设计」章节 + 必要时新增 ADR | 无未决的技术选型 |
| 3 Tasks | 可独立验证的任务清单 | `roadmap.md` + 任务系统 | 每项任务 ≤ 半天 |
| 4 Implement | 代码 | `engine/` `components/` `content/` | 类型检查通过 |
| 5 Verify | 测试 + 构建 | `*.test.ts` `harness/` | 红线条目全绿 |

**规矩**：任何"顺手加个功能"的念头，先回到阶段 1 补一行需求编号。没有编号的代码不合并。

**规矩（验收写作，2026-10-25 增）**：验收标准必须写成**与时间无关的不变式**。
禁止用具体 id 表述"当前不存在/尚未实现"（✗ "`getSolver('shm')` 当前应抛出错误"——
随注册表增长自动变假；✓ "对任意未注册 kind 调用 `getSolver()` 抛错，文案含已注册列表"）。
同理，文档正文不写"当前 N 个场景/求解器"这类会过期的计数，写"全部注册场景"，
确需计数时由脚本生成或随迭代收口清单刷新。

---

## 3. 新增一个知识点（最常见的日常动作）

```
① 写 spec       docs/specs/features/NNN-<scene-id>.spec.md
                  └ 需求编号 REQ-X-NNN，每条都要有「验收」与「测试」
② 实现求解器     engine/solvers/<kind>.ts（若物理模型是新的）
                  └ 同时在 engine/solvers/index.ts 注册
③ 写场景         content/scenes/<scene-id>.scene.ts
                  └ 按 specs/012-authoring.spec.md 的配额与节奏
④ 接进章节树     content/chapters.ts 里对应知识点的 sceneId
⑤ 补测试         engine/solvers/<kind>.test.ts（不变量）
                  └ 契约测试会自动覆盖新场景，无需手写
```

`npm test` 里的**契约测试**会自动检查：`bind` 是否都能解析、脚本是否单调、quiz 答案是否越界、
章节引用是否双向一致、有没有对应的 spec 文档。**漏写 spec 会直接测试失败。**

---

## 4. 文档状态约定

| 状态 | 含义 | 允许的动作 |
|---|---|---|
| `Draft` | 讨论中，可能大改 | 可以随意改 |
| `Approved` | 已定，可以照此实现 | 改需求需走变更记录 |
| `Implemented` | 代码已实现且测试通过 | 只能追加，不能改语义 |
| `Deprecated` | 保留但不推荐 | 新代码不得使用 |

每份 spec 头部必须有：

```yaml
状态: Approved
版本: 1.0
最后更新: 2026-10-21
关联测试: engine/solvers/electricField.test.ts
```

**一致性由机器看守（2026-10-25 增）**：`web/engine/contract/spec-governance.test.ts`
会断言——① 每份 spec 头部的 状态/版本/最后更新 齐全；② 规格索引（`specs/README.md`）
与文档地图（本文件）里登记的版本 == spec 头部版本 == 变更记录最后一行；
③ 根 README 的场景表与求解器清单 == 注册表实况；④ 宪法第六条（`components/` 与
`app/` 不得出现场景 id 字面量）。版本漂移不再靠人记——漏改任何一处，`npm test` 直接红。

---

## 5. 契约变更流程（改 `SceneSpec` / `SceneState` 时必读）

契约是引擎与内容之间唯一的耦合点，因此比普通代码更严格：

1. **先改 spec，再改类型，最后改实现。** 顺序不能反。
2. 在 `010-scene-contract.spec.md` 的「变更记录」表格里加一行（版本 / 变更 / 兼容性）。
3. 版本规则：
   - 新增**可选**字段、新增图元类型 → `minor`（0.1 → 0.2），旧场景不动
   - 字段改语义、必填化、删除 → `major`，必须提供迁移脚本与旧场景全量回归
4. 每个新图元都要在 `ObjectView` 有实现，并在契约测试里有对应的解析断言。
5. 改完必须跑 `npm test`：契约测试会遍历**所有已发布场景**，任何一条 `bind` 断了都会红。
