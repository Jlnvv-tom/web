# 规格索引

> 每份 spec 都有稳定 ID，测试注释通过 `REQ-*` 反查规格。新增规格必须在本表登记。

## 平台规格（改一次影响全部场景）

| ID | 名称 | 状态 | 版本 | 关联代码 | 关联测试 |
|---|---|---|---|---|---|
| [010](./010-scene-contract.spec.md) | 场景契约（SceneSpec / SceneState） | Implemented | 0.5 | `engine/spec.ts` | `engine/contract/*.test.ts` |
| [011](./011-solver-contract.spec.md) | 求解器契约（纯函数 / 缓存 / 精度） | Implemented | 1.0 | `engine/solvers/types.ts` | `engine/solvers/*.test.ts` |
| [012](./012-authoring.spec.md) | 场景创作规范（坐标 / 节奏 / 配额 / DoD） | Approved | 1.0 | `content/scenes/*` | `engine/contract/scene-contract.test.ts` |
| [013](./013-offline-export.spec.md) | 离线单文件导出（运行时共享 + 浏览器端拼装） | Implemented | 1.0 | `lib/standalone.ts`, `export/*`, `scripts/build-standalone.mjs` | `lib/standalone.test.ts`, `scripts/verify_offline.py` |
| [014](./014-telemetry.spec.md) | 本地埋点（三类事件 / 拖动合并 / 零网络） | Implemented | 1.0 | `engine/telemetry.ts`, `components/player/TelemetryPanel.tsx` | `engine/telemetry.test.ts`, `scripts/verify_telemetry.py` |

> 013 / 014 是**平台能力**，不绑定单个场景，因此文件放在 `specs/` 根目录（01x 段），
> 不进 `specs/features/`，也不写 `场景:` 行——否则会被 `spec-coverage.test.ts` 判成孤儿规格。

## 特性规格（一个特性 = 一个可验收的增量）

| ID | 名称 | 状态 | 场景 id | 需求数 | 关联测试 |
|---|---|---|---|---|---|
| [F-001](./features/001-electric-field.spec.md) | 电场与电势（双点电荷） | Implemented | `electric-field` | 12 | `engine/solvers/electricField.test.ts` |
| [F-005](./features/005-capacitor.spec.md) | 平行板电容器 · 带电粒子偏转 | Implemented | `capacitor` | 12 | `engine/solvers/capacitor.test.ts` |
| [F-002](./features/002-lorentz-force.spec.md) | 洛伦兹力（已有场景回溯编写） | Implemented | `lorentz-force` | 8 | `engine/solvers/solvers.test.ts` |
| [F-003](./features/003-projectile-motion.spec.md) | 抛体运动（已有场景回溯编写） | Implemented | `projectile-motion` | 7 | `engine/solvers/solvers.test.ts` |
| [F-004](./features/004-thin-lens.spec.md) | 凸透镜成像（已有场景回溯编写） | Implemented | `thin-lens` | 8 | `engine/solvers/solvers.test.ts` |
| [F-006](./features/006-shm.spec.md) | 简谐运动 · 单摆与弹簧振子 | Implemented | `shm` | 12 | `engine/solvers/shm.test.ts` |
| [F-007](./features/007-orbit.spec.md) | 天体运动 · 开普勒三定律 | Implemented | `orbit` | 12 | `engine/solvers/orbit.test.ts` |
| [F-008](./features/008-reflection.spec.md) | 光的反射与平面镜成像 | Implemented | `reflection` | 12 | `engine/solvers/reflection.test.ts` |
| [F-009](./features/009-wave.spec.md) | 机械波 · 行波与驻波 | Implemented | `wave` | 12 | `engine/solvers/wave.test.ts` |
| [F-010](./features/010-induction.spec.md) | 电磁感应 · 楞次定律 | Implemented | `induction` | 12 | `engine/solvers/induction.test.ts` |
| [F-011](./features/011-buoyancy.spec.md) | 浮力 · 阿基米德原理 | Implemented | `buoyancy` | 10 | `engine/solvers/buoyancy.test.ts` |
| [F-012](./features/012-lever.spec.md) | 杠杆 · 平衡条件 | Implemented | `lever` | 10 | `engine/solvers/lever.test.ts` |
| [F-018](./features/018-sound-propagation.spec.md) | 声音的产生与传播 · 球面波前 | Implemented | `sound-propagation` | 7 | `engine/solvers/acoustics.test.ts` |
| [F-019](./features/019-em-induction.spec.md) | 电磁感应 · 切割磁感线 | Implemented | `em-induction` | 8 | `engine/solvers/rodInduction.test.ts` |

> F-002 / F-003 / F-004 是**回溯补写**：代码先于规格存在。这在规范流程里是债务，
> 处理方式是补齐规格与验收，让测试与需求编号重新对齐。下一次新场景不得再走这条路。

## 待编写（Backlog，按优先级）

| 计划 ID | 名称 | 优先级 | 依赖 | 备注 |
|---|---|---|---|---|
| F-013 | 动量守恒 · 碰撞 | P2 | 新增 `collision` 求解器 | 选必一第一章；二维碰撞的动量矢量在 3D 里最容易讲错方向 |
| F-014 | 电磁振荡 · LC 回路 | P2 | 新增 `oscillation` 求解器 | 选必一第五章，偏演示 |
| — | 移动端手势 + 竖屏布局 | P1 | — | 路线图任务 #19；双指缩放/单指旋转，不改契约 |
| ~~视觉回归基线比对~~ | ~~`harness/shots` 基线~~ | ~~P2~~ | — | ✅ 已完成（2026-10-24：`verify_baseline.py` 虚拟时钟 + 14 场景基线，见 testing.md L5） |
| F-015 | 光的折射 · 全反射 | P1 | 新增 `refraction` 求解器 | 初中端补位；与 F-008 共用"光线在空间转弯"的图元经验 |
| F-016 | 声现象 · 音调响度音色 | P2 | 复用 `wave` 求解器 | 初中端补位，几乎零引擎成本 |
| F-017 | 内能 · 分子热运动 | P3 | 新增 `thermal` 求解器 | 粒子系统，3D 价值高但建模成本也高 |

> F-018 / F-019 是 lessons 初中实验页迁移进产品的首批成果（2026-10-24）：
> 物理数值原样继承 verify_junior.py 的手算期望值，同时修正了两处公式/方向错误
> （见各 spec §5 迁移修正记录）。每迁完一个场景即删除对应 HTML。

> 12 个 MVP 场景已全部交付，另有 F-018 / F-019 两个迁移场景（2026-10-24），
> 当前共 **14 个场景（初中 5 / 高中 9）**。**下一个周期的重心应转向初中**：
> 初二（声、热、光）是用户基数最大、竞品最弱的学段，而不是继续加深高中内容。

## 状态图例

`Draft` 讨论中 · `Approved` 已定可实施 · `Implemented` 已实现且测试通过 · `Deprecated` 保留不用
