# ADR-0001 · 前端架构选型

> 状态：已采纳（Accepted）
> 日期：2026-10-21
> 适用范围：`web/`（初高中物理 3D 概念讲解库）
> 上游文档：《功能开发设计报告-MVP.md》

---

## 1. 决策摘要

| 层 | 选型 | 一句话理由 |
| --- | --- | --- |
| 框架 | **Next.js 15（App Router）+ React 19 + TS** | 每个知识点一页，SEO 是主要流量入口；RSC 让重内容服务端渲染、3D 播放器独立成 client island |
| 3D 渲染 | **Three.js + @react-three/fiber + @react-three/drei** | 声明式才能支撑"场景即数据"；drei 省掉轨道控制/文字/环境等轮子 |
| 物理 | **自研确定性求解器为主 + rapier 为辅** | 教学场景要求可暂停、可回退、可跳帧，且数值必须与教材公式一致 |
| 状态 | **Zustand（播放器单 store）** | 3D 每帧状态绝不进 React state，Zustand 只承载"低频 UI 状态" |
| 样式 | **Tailwind CSS v4 + CSS 变量 token** | 与 demo 已验证的深色科技风对齐；v4 的 CSS-first 配置减少样板 |
| 公式 | **KaTeX** | 渲染速度约 MathJax 的 10 倍，公式卡是高频组件 |
| 图表 | **实时曲线自绘 Canvas；统计图 Recharts（V1）** | 60fps 实时数据不该走通用图表库的 diff |
| 测试 | **Vitest** | 求解器 invariants 断言是内容正确性的最后一道防线 |
| 部署 | **静态导出（`output: 'export'`）→ 对象存储 + CDN** | MVP 无后端，零运维；V1 再上 Node 运行时 |

**一句话总结这次选型的核心思想：把「重」的部分（three.js、物理求解器、KaTeX）全部隔离在按需加载的 client island 里，把「轻」的部分（章节树、文案、参数表）全部留给服务端渲染。**

---

## 2. 框架选型

### 候选对比

| 维度 | Next.js 15 App Router | Vite + React Router | Astro 5 |
| --- | --- | --- | --- |
| 每知识点独立 URL + SEO | ✅ SSG + metadata API | ✅ 需自行配 prerender | ✅ SSG 原生最强 |
| 首屏 JS 体积 | ⚠️ 需手动控 island 边界 | ⚠️ 全 client | ✅ 默认零 JS，islands 最彻底 |
| 3D 重交互承载 | ✅ React 生态最全 | ✅ | ⚠️ island 需手动接 React |
| 后续加账号/班级作业 | ✅ 全栈（Route Handler / Server Action） | ❌ 要另起服务 | ⚠️ 需配 SSR adapter |
| 生态与招聘/协作 | ✅ 最大 | ✅ | ⚠️ 较小 |
| 学习/维护成本 | ⚠️ RSC 心智负担 | ✅ 简单 | ✅ 简单 |

### 决策：Next.js 15 App Router

**理由**
1. 本项目 80% 的访问会来自教师/学生搜索具体知识点名（"洛伦兹力 3D"、"凸透镜成像规律 动画"），**每知识点一个静态 HTML 是刚需**，三个方案都满足。
2. 但 V1 明确要上「账号 + 班级作业 + 学情热力图」，这需要服务端能力。Next.js 是唯一能平滑从"纯静态"演进到"全栈"而不换框架的选项。
3. R3F / drei / zustand / framer-motion 全部围绕 React 19 优化，Next 15 默认 React 19，版本对齐最省心。

**明确的约束（写进代码规范）**
- `app/` 下除 `components/player/**` 外一律为 Server Component；播放器用 `next/dynamic` 以 `ssr: false` 加载。
- 禁止在 Server Component 里 `import 'three'`。
- 每个知识点页必须 `generateStaticParams()`，保证 `output: 'export'` 下可构建。

**为什么不用 Astro**：它的 islands 确实更适合"内容站 + 少量交互"，且首屏 JS 更小。但 V1 的班级作业需要登录态与服务端渲染的数据视图，Astro 需要额外配 SSR adapter 并引入第二套运行时。为省一次迁移，选 Next。

**为什么不用纯 Vite**：SEO  prerender 与 metadata 管理都要自己搭，且 V1 无演进路径。

---

## 3. 3D 渲染选型

### 候选对比

| 维度 | R3F + drei | 原生 Three.js | Babylon.js |
| --- | --- | --- | --- |
| 声明式场景 = 数据 | ✅ 核心优势 | ❌ 要自己写 React 桥 | ❌ |
| OrbitControls / Text / Environment | ✅ drei 开箱即用 | ❌ 手写（demo 里写过，约 120 行） | ✅ |
| 包体积 | ⚠️ drei 较大，需按需引 | ✅ 最小 | ❌ 很大 |
| 生态 / 文档 | ✅ 最大 | ✅ | ⚠️ |
| 与 SceneSpec 的匹配度 | ✅✅ | ⚠️ | ❌ |

### 决策：@react-three/fiber ^9 + @react-three/drei ^10 + three ^0.186

**核心理由：SceneSpec 是 JSON，必须有"JSON → 场景"的声明式映射。** R3F 的 JSX 就是这个映射层：

```tsx
// SceneSpec.objects 数组 → JSX 元素，无需手写命令式场景图
{spec.objects.map(o => <ObjectRenderer key={o.id} def={o} state={state} />)}
```

demo 阶段已验证原生 Three.js 可行，但每个部件都要手写 `new THREE.Mesh()` + `scene.add()`，无法从数据驱动。**从 demo 到正式项目，最大的架构升级就在这一层。**

**drei 按需引入**：只用 `OrbitControls`、`Text`、`Environment`（或自建 IBL）、`Html`（标注锚点）、`Bounds`。避免全量引入拖慢首屏。

**备选说明**：Babylon 的物理与材质更强，但本项目物理是解析解、材质是程序化基础材质，用不上；且它的 React 绑定生态远弱于 R3F。

---

## 4. 物理求解器策略（本项目的技术命门）

### 决策：解析解 / 自定义积分器 为主，rapier 为辅

| 方案 | 可回退 | 与教材一致 | 性能 | 结论 |
| --- | --- | --- | --- | --- |
| **解析解 + 自研积分器（RK4 / Boris / Verlet）** | ✅ `stateAt(t)` | ✅✅ 公式即代码 | ✅ 优 | **主力** |
| rapier（WASM） | ❌ 黑盒步进 | ⚠️ 有数值偏差 | ✅ | 仅碰撞/绳约束 |
| cannon-es | ❌ | ⚠️ | ✅ | 不用 |

**为什么"可回退"是刚需**：讲解脚本必须能跳到"小球飞到最高点的那一帧"并暂停讲受力。这要求 `stateAt(t)` 是纯函数——解析解天然满足，定步长积分器可通过"从 t=0 重放"满足。

**为什么"与教材一致"是刚需**：学生是拿着这个去理解 `r = mv/(qB)` 的。若引擎给出 3.02 而教材算 3.00，信任瞬间崩塌。解析解没有这个问题。

**统一接口（`engine/solvers/types.ts`）**

```ts
export interface Solver<S> {
  init(params: Params): S;
  step(state: S, dt: number): S;              // 纯函数，便于回退与测试
  stateAt(state: S, t: number): S;            // 时间轴任意跳转
  invariants(state: S): Record<string, number>; // 守恒量，用于自动化正确性断言
}
```

**正确性防线**：每个求解器配一个 Vitest 用例，断言 invariants。例如洛伦兹力场景断言 `|v|` 恒定（磁场不做功），误差 > 1e-6 即测试失败。这是"3D 画错比不画更糟"的工程解法。

---

## 5. 状态管理选型

### 决策：Zustand 单 store（仅播放器低频状态）

**明确的分层原则——这是性能关键：**

| 状态类型 | 存放 | 更新频率 |
| --- | --- | --- |
| 物理状态（位置/速度/场） | `useRef` + solver | 每帧 |
| 渲染对象变换 | R3F `useFrame` 内直接写 | 每帧 |
| 播放头 playhead | Zustand | 每帧 ⚠️ |
| 参数 params | Zustand | 用户操作 |
| 选中 / 面板开关 | Zustand | 用户操作 |
| 章节树 / 场景元数据 | 服务端 props | 构建期 |

**playhead 每帧进 Zustand 是否可行**：可行，但订阅组件必须极少（时间轴滑块、字幕、HUD 三个），且用 `useShallow` 精确选择。**若后续实测掉帧，退化方案是把 playhead 移出 React，用一个 `useSyncExternalStore` 的轻量订阅源或直接 rAF 回调。**

**为什么不用 Context**：播放器组件树有 10+ 层，Context 会让整树重渲染。
**为什么不用 Redux**：样板成本与包体积对本项目无收益。

---

## 6. 样式方案

### 决策：Tailwind CSS v4 + `@theme` token

- **不用组件库（shadcn/MUI）**：本项目的 UI 是"3D 画布 + 侧栏面板"的高度定制布局，通用组件库只会增加包裹层与 CSS 体积。改为在 `app/globals.css` 用 `@utility` 定义少量原子类（`panel` / `chip` / `btn` / `canvas-host`），其余用 Tailwind 组合。
- **设计 token 走 `@theme`**：色板、字体与 demo 的深色科技风完全一致，保证两个产物的视觉连续性。
- **不用 CSS Modules**：Tailwind 已覆盖 95% 场景，剩余 5%（KaTeX 容器、画布宿主）用原子类。

---

## 7. 公式与图表

| 需求 | 选型 | 理由 |
| --- | --- | --- |
| 公式卡 | **KaTeX** | 比 MathJax 快约 10×；公式卡每页多处出现，是热点组件。服务端渲染字符串即可，无需 `react-katex` 包裹 |
| 实时曲线（v-t / x-t） | **自绘 Canvas** | 每帧追加数据点；通用图表库的 diff 开销在 60fps 下不可接受 |
| 统计图表（V1 学情） | **Recharts** | 低频渲染，直接享受生态 |

---

## 8. 目录结构

```
3d_physics/
├─ docs/                                  # 文档
│  ├─ 市场调研报告-3D物理知识网站.md
│  ├─ 功能开发设计报告-MVP.md
│  └─ adr/
│     ├─ 0001-frontend-stack.md            # 本文
│     ├─ 0002-scenespec-v0.1.md            # 数据契约（待写）
│     └─ 0003-solver-strategy.md           # 物理策略（待写）
├─ demo/                                  # 保留：DJI Action 4 拆解预研（Three.js 能力验证）
└─ web/                                   # 正式项目
   ├─ app/
   │  ├─ layout.tsx  page.tsx  globals.css
   │  ├─ topics/[id]/page.tsx              # 知识点页（核心）
   │  ├─ chapters/[bookId]/page.tsx        # 教材章节视图
   │  ├─ search/page.tsx
   │  └─ embed/[id]/page.tsx               # iframe 嵌入（PPT / 公众号）
   ├─ components/
   │  ├─ player/                           # ScenePlayer · ParamPanel · Hud · Subtitle · Timeline
   │  ├─ scene/                            # ObjectRenderer（按 SceneSpec.objects 渲染）
   │  ├─ content/                          # FormulaCard · PitfallCard · QuizCard · SpecTable
   │  └─ ui/                               # Panel · Chip · SearchBox 等原子组件
   ├─ engine/                              # 与 React 无关的纯逻辑（可单测）
   │  ├─ spec.ts                           # SceneSpec 类型 + zod schema
   │  ├─ runtime/                          # useSolver · usePlayhead · useScript
   │  └─ solvers/                          # projectile · lorentz · shm · wave · orbit
   ├─ content/
   │  ├─ chapters.ts                       # 章节树（人教版 + 新课标）
   │  └─ scenes/*.scene.json               # 场景内容
   ├─ public/                              # 静态资源
   └─ scripts/export-standalone.ts         # 导出离线单文件 HTML
```

**分层原则**：`engine/` 不 import 任何 React 或 three 的渲染代码（求解器只用向量数学），因此可以在 Node 里单测；`components/scene/` 是唯一的"SceneSpec → R3F"翻译层。

---

## 9. 构建与部署

| 阶段 | 命令 | 产物 |
| --- | --- | --- |
| 开发 | `npm run dev` | localhost:3000 |
| 检查 | `npm run typecheck && npm run lint && npm run test` | — |
| 构建 | `npm run build` | `out/` 静态站（`output: 'export'`） |
| 部署 | 上传 `out/` 至对象存储 + CDN | 需 ICP 备案 |

**V1 演进路径**（已预留，不在 MVP 做）：移除 `output: 'export'` → 加 Route Handler + Supabase/腾讯云开发 → 班级作业与学情。

---

## 10. 风险与对策

| 风险 | 等级 | 对策 |
| --- | --- | --- |
| SceneSpec 设计过度/不足 | 🔴 | 先用 3 个差异极大的场景（洛伦兹力 / 抛体 / 凸透镜）压测 schema，之后冻结 v0.1；保留 `extensions: {}` 逃生舱 |
| three.js 拖垮首屏 | 🟠 | 播放器 `dynamic(ssr:false)` + 求解器按场景 code-split；首屏目标 < 3s |
| 物理数值与教材不一致 | 🔴 | invariants 自动化断言 + 教师审校签字 |
| 移动端 WebGL 兼容 | 🟠 | 启动时能力检测 → 2D 降级；监听 `webglcontextlost` 自动恢复 |
| R3F v9 / React 19 生态坑 | 🟡 | 锁定次版本号；drei 按需引 |

---

## 11. 附：为什么这些决定可以反悔

架构的价值在于"知道什么时候该换"。以下情况的触发条件已明确记录：

- 若首屏 JS > 200KB 且优化无果 → 考虑把内容站切 Astro，仅保留 `/topics/*` 为 Next 应用
- 若 playhead 进 Zustand 实测掉帧 → 移出 React，改为 rAF 订阅源
- 若 3D 场景 90% 都是 2D 交互 → 重新评估 three 是否必要（不太可能，电磁场/轨道必须 3D）
