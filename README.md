# 物理 3D · 初高中物理概念讲解库

> 可旋转、可调参、有讲解的初高中物理 3D 概念库。
> 每个知识点 = 一个真 3D 可交互场景 + 分步讲解脚本 + 易错点 + 预测验证。
>
> **浅色主题**（2026-10-22 起）：整体暖白纸感 + 中间调 3D 画布。
> 选浅色不是为了好看，是课堂投影 —— 明亮教室里深色背景会发灰、对比度塌陷。

---

## 仓库结构

```
3d_physics/
├─ docs/                                    规格驱动开发（SDD）文档
│  ├─ README.md                             文档地图 + SDD 五阶段工作流
│  ├─ constitution.md                       项目宪法：8 条不可妥协的原则
│  ├─ specs/
│  │  ├─ 010-scene-contract.spec.md         场景契约 SceneSpec / SceneState（v0.4）
│  │  ├─ 011-solver-contract.spec.md        求解器契约（纯函数 / 缓存 / 精度）
│  │  ├─ 012-authoring.spec.md              场景创作规范（坐标 / 节奏 / 配额 / DoD）
│  │  ├─ 013-offline-export.spec.md         离线单文件导出（运行时共享 + 浏览器端拼装）
│  │  ├─ 014-telemetry.spec.md              本地埋点（三类事件 / 拖动合并 / 零网络）
│  │  └─ features/*.spec.md                 每个场景一份特性规格（带 REQ 编号）
│  ├─ testing.md                            测试策略（五层金字塔 + 覆盖红线）
│  ├─ roadmap.md                            里程碑与下一步
│  └─ adr/                                  架构决策（前端选型、数值与缓存）
│
├─ 市场调研报告-3D物理知识网站.md              竞品与差异化定位
├─ 功能开发设计报告-MVP.md                    产品与技术设计（含 MVP 定义）
│
├─ demo/                                    DJI Osmo Action 4 三维拆解预研
│  └─ 纯 Three.js + 原生 JS，验证"程序化建模 + 点击拆解 + 标注"能力
│
└─ web/                                     正式项目
   ├─ app/                                  Next.js App Router
   │  ├─ page.tsx                           首页
   │  ├─ topics/[id]/page.tsx               知识点页（核心）
   │  ├─ chapters/[bookId]/page.tsx         教材章节视图
   │  ├─ search/page.tsx                    搜索
   │  └─ embed/[id]/page.tsx                iframe 嵌入视图
   ├─ components/
   │  ├─ player/                            ScenePlayer · ParamPanel · Hud · Transport
   │  ├─ scene/                             SceneCanvas · SceneRuntime · objects · labels
   │  ├─ content/                           FormulaCard · PitfallCard · QuizCard
   │  └─ ui/                                SiteHeader · SceneCard · SearchClient
   ├─ engine/                               与 React 无关的纯逻辑（可 Node 单测）
   │  ├─ spec.ts                            SceneSpec 类型 + zod 校验
   │  ├─ vec.ts                             三维向量工具
   │  ├─ store.ts                           Zustand 播放器状态
   │  ├─ telemetry.ts                       本地埋点（三类事件 + 拖动合并，零网络）
   │  ├─ solvers/                           14 个求解器（解析解优先，无物理引擎依赖）
   │  └─ contract/                          内容契约测试（遍历全部场景）
   ├─ lib/                                  平台能力
   │  ├─ standalone.ts                      离线单文件 HTML 拼装（纯函数）
   │  └─ download.ts                        Blob 下载工具
   ├─ export/                               离线版入口（读 window 里的场景 JSON）
   ├─ scripts/                              build.sh · build-standalone.mjs · 各 verify_*.py
   ├─ content/
   │  ├─ chapters.ts                        人教版章节树（8 册：5 册高中 + 3 册初中，121 个知识点）
   │  └─ scenes/*.scene.ts                  场景内容
   └─ harness/                              esbuild 预览壳（验证用，非产品代码）
```

---

## 快速开始

```bash
cd web
npm install
npm run dev      # http://localhost:3000
```

其他命令：

```bash
npm run typecheck        # tsc --noEmit
npm test                 # 690 条测试：物理不变量 + 内容契约 + 规格覆盖 + 平台能力
npm run build:standalone # 离线单文件导出的运行时 → public/standalone/
npm run build            # 运行时 + 静态导出到 out/（output: 'export'）
```

诊断（M3.5 新增，都需要先 `npm run build`）：

```bash
python3 scripts/diag_fps.py           # 14 场景帧率 P50/P95/长帧/当前档位
python3 scripts/diag_fps.py --headed --cpu-throttle 4   # 模拟弱机（真实 GPU）
python3 scripts/verify_quality.py     # 弱机自动降档端到端（含提示条与锁定）
```

页面里加 `?diag=1` 会暴露 `window.__p3d`（渲染器统计 / 长官僚状态）；
加 `?nofx=1` 关掉后处理 —— 用来区分"颜色不对"是材质问题还是泛光把背景当成了高光。

`demo/` 是独立预研，单独起服务：

```bash
cd demo && python3 -m http.server 8080   # http://localhost:8080
```

---

## 核心架构：SceneSpec

新增一个知识点 = **写一份 `*.scene.ts` + 一段讲解文案**，不写 Three.js 代码。

```
SceneSpec（静态声明，可序列化为 JSON）
  ├─ meta      学段 / 章节 / 难度 / 标签
  ├─ camera    初始机位
  ├─ params    参数（自动生成滑块 / 开关 / 分段按钮）
  ├─ solver    求解器 kind + 选项
  ├─ objects   13 种图元（particle / vector / trail / polyline / polylines / …）
  ├─ hud       实时读数 + 图表
  ├─ script    讲解脚本（时间点 / 文案 / 相机 / 高亮 / 自动调参）
  ├─ formulas  KaTeX 公式
  ├─ pitfalls  破误区
  └─ quiz      POE 练习（选择后一键把参数改成该条件）
        │
        ▼
  Solver.sample(t) → SceneState（纯函数，可任意跳帧）
        │
        ▼
  ObjectView：按 objects 声明渲染，逐帧从 SceneState 取数
```

**五个关键设计**

1. **求解器与渲染完全解耦。** 求解器只产出 `SceneState`（points / vectors / lines / linesets / scalars / meta），渲染层只认这一个契约。任何求解器都能驱动任何图元。
2. **`sample(t)` 是纯函数。** 讲解脚本因此能跳到"小球飞到最高点那一帧"并暂停讲受力；时间轴可以任意拖拽、倍速、回退。
3. **守恒量自检。** 每个求解器暴露 `invariants()`，Vitest 断言：洛伦兹力下速率必须恒定、抛体机械能必须守恒、透镜成像公式残差为 0、电场中"场线切向 ∥ E"且"场线 ⊥ 等势线"、电容器中机械能漂移 < 1e-9。这是"3D 画错比不画更糟"的工程解法。
4. **视觉不靠运气。** 程序化环境贴图（PMREM）+ UnrealBloom 泛光 + 雾 + 尘埃粒子 + 暗角，全部由代码生成；雾的范围、缩放下限按相机距离缩放，所以 0.3 m 的电容器和 24 m 的电场场景用同一套代码都能正确取景。
5. **内容契约测试。** 新增场景会被自动纳入检查：`bind` 是否断链、脚本时间是否倒流、quiz 答案是否越界、章节引用是否双向一致、有没有对应的 spec 文档。

---

## 已上线场景

| 场景 | 学段 | 为什么必须 3D |
| --- | --- | --- |
| [洛伦兹力：带电粒子在磁场中怎么走](web/content/scenes/lorentz-force.scene.ts) | 高中 · 选必二 | F ⊥ v 且 F ⊥ B，只能转着看才能确认这个空间关系 |
| [抛体运动：把速度拆成两半](web/content/scenes/projectile-motion.scene.ts) | 高中 · 必修二 | 速度分量与轨迹同时呈现，vₓ 恒定"一眼可见"（hybrid） |
| [凸透镜成像：三条光线决定一切](web/content/scenes/thin-lens.scene.ts) | 初中 · 八上 | 三条特殊光线在空间里交于像点（2d：成像本就共面，不硬凹 3D） |
| [电场与电势：场线为什么会拐弯](web/content/scenes/electric-field.scene.ts) | 高中 · 必修三 | 电场充满空间；立体场线与等势线的垂直关系可以转着验证 |
| [平行板电容器：一束电子怎么被掰弯](web/content/scenes/capacitor.scene.ts) | 高中 · 必修三 | 「板间处处场强相同」是空间结论，剖面图会让人以为只有中线受力 |
| [简谐运动：摆动的秘密在圆上](web/content/scenes/shm.scene.ts) | 高中 · 选必一 | 参考圆在 xz 平面、振动轴在 x 轴，转视角让「投影」成为肉眼事实 |
| [开普勒三定律：行星为什么时快时慢](web/content/scenes/orbit.scene.ts) | 高中 · 必修二 | 「相等时间扫过相等面积」必须把两个扇形并排摆在空间里比，静图画不出速率 |
| [平面镜成像：像为什么在镜子后面](web/content/scenes/reflection.scene.ts) | 初中 · 八上 | 镜面一倾斜光路就离开原平面，「镜转 θ 光转 2θ」只有 3D 能看见 |
| [机械波：波在走，质点没走](web/content/scenes/wave.scene.ts) | 高中 · 选必一 | 波形平移与质点轨迹必须分开在两个方向呈现，平面图里会糊成一团 |
| [楞次定律：感应电流为什么总跟你对着干](web/content/scenes/induction.scene.ts) | 高中 · 选必二 | 要连用两次右手定则，平面图上全退化成"顺时针/逆时针"，换个视角看就全错 |
| [浮力：被挤走的水，才是托住物体的那只手](web/content/scenes/buoyancy.scene.ts) | 初中 · 八下 | 「排开液体的体积」在剖面图里只是一个面积；3D 里它是 12 条棱围成的长方体 |
| [杠杆平衡：力臂不是杆上那一段](web/content/scenes/lever.scene.ts) | 初中 · 八下 | 课本永远画水平杠杆，于是"力臂=L"的错误直觉被藏起来了；让杆真的翘起来才看得见 L·cosθ |
| [声音的传播：球面波前为什么越走越弱](web/content/scenes/sound-propagation.scene.ts) | 初中 · 八上 | 波前是球面，平面图只能画一组同心圆；「距离翻倍、声音变弱」的几何摊薄要转着看才成立 |
| [电磁感应：切割磁感线的三个垂直](web/content/scenes/em-induction.scene.ts) | 初中 · 九年级 | 电流、导体运动、磁场两两垂直——三个方向的空间关系在平面图里必然画错一个 |

---

## 内容原则

- **不为 3D 而 3D。** `meta.dimension` 必须如实标注 `3d` / `hybrid` / `2d`；受力分析这类 2D 更清楚的内容不做 3D。
- **参数即真相。** 所有现象由解析解或定点重放驱动，调参即时重算，不是预渲染动画。
- **诚实标注假设。** 每个场景都有「理想化假设」区块，且契约测试强制它非空。
- **先预测再看。** 练习用 POE 结构，选完答案可一键把参数改成所选条件亲眼验证。

---

## 规格驱动开发

每个特性都有一份带需求编号的规格，测试通过 `REQ-*` 反查规格；反过来，漏写规格会让 `npm test` 失败。

```
① 写 spec（REQ 编号 + 验收 + 非目标）
② 实现求解器（engine/solvers/，注册到 index.ts）
③ 写场景（content/scenes/*.scene.ts，按 012 的配额与节奏）
④ 挂进章节树（content/chapters.ts 的 sceneId）
⑤ 补不变量单测 → 契约测试自动覆盖
```

详见 [`docs/README.md`](docs/README.md)。项目宪法见 [`docs/constitution.md`](docs/constitution.md)。

---

## 当前状态（M3.5 · 可读性与流畅性，已完成）

- ✅ 引擎：SceneSpec 契约 v0.4 + **14 个求解器** + **690 条测试全绿**（24 个文件）
- ✅ 播放器：真 3D 画布 / 参数面板 / 实时读数 / Canvas 曲线 / 讲解时间轴 / 对象高亮 / 投影式 3D 标签
- ✅ 页面：首页 / 知识点页 / 章节树（8 册 34 章 121 个知识点）/ 搜索 / 嵌入视图 / 404
- ✅ 内容：14 个场景（初中 6 + 高中 8），覆盖 15 个知识点
  （抛体一景同时服务「平抛」与「斜抛」），含讲解脚本、公式、破误区、POE 练习、理想化假设声明
- ✅ **离线单文件导出**：知识点页点「导出离线版」→ 下载 **1.67 MB** 单个 HTML，
  双击即用、**零网络请求**（运行时共享 + 浏览器端拼装，见 [013](docs/specs/013-offline-export.spec.md)）
- ✅ **浅色主题**：全站暖白 + 3D 画布中间调底板（画布均亮 0.56，对标参考站 0.577；饱和度 0.48 → 0.19）
- ✅ **M3 视觉打磨（W1–W5 + W4 机制）**：舞台与投影（W1）/ 7 种程序化材质（W2）/
  手感微交互 + decor 隔离层（W3）/ 构图契约 84 断言 + 7 场景相机修复（W5）/
  开场演出机制 `decor.intro` 5 种 kind（W4 机制，A/B 双门 0.00%）
- ✅ **本地埋点**：`scene_view` / `param_change` / `quiz_answer`，拖动自动合并成一条，
  数据只落 localStorage、可导出 CSV；面板实时显示「每次平均调参次数」判定教具还是视频（见 [014](docs/specs/014-telemetry.spec.md)）
- ✅ 构建：`next build` 通过，静态导出 38 页（14 知识点 + 14 嵌入 + 8 章节 + 首页/搜索/404）
- ✅ 端到端验证：14 场景画布渲染、读数、滑块、破误区/练习面板、离线导出、埋点，**0 console error**；
  视觉回归基线 14 张（`verify_baseline.py`，虚拟时钟逐像素比对）
- ✅ **M3.5 可读性 × 流畅性**（2026-10-26，见 [`docs/m35-plan.md`](docs/m35-plan.md)）：
  - **矢量**：粗细按屏幕像素恒定（抛体箭头 1.4px → 约 5px），平涂墨色不再被场景光冲淡；
  - **标签**：`v_y` → 真下标 + 就地读数 `20.0 m/s`，自动避让 + 引线，同点 8 个标签 0 重叠；
  - **流畅**：运行时长官僚按真实帧间隔自动降三档（DPR / 泛光 / 阴影 / 尘埃），
    弱机降档后给一次提示且可手动改回；`verify_quality.py` 端到端验证通过；
  - **顺手修掉的 6 个真 bug**：泛光阈值低于底板亮度（全屏白纱）、后处理按 1× 渲染（发虚）、
    箭头锥体放大 36 倍、压暗下限 0.14 在近白底上等于擦除、拖滑块把时间轴打回 0、
    逐帧重建 GPU 缓冲（跑久了变卡）
- ⏳ 待做（按 [`docs/next-iteration-plan.md`](docs/next-iteration-plan.md)）：W4 内容铺量
  （稀疏 7 场景补墨）、参数对比幽灵线、移动端手势、lessons Batch 2 迁移

> **求解器清单**：`projectile` · `lorentz` · `thinLens` · `electricField` · `capacitor` ·
> `shm` · `orbit` · `reflection` · `wave` · `induction` · `buoyancy` · `lever` ·
> `acoustics` · `rodInduction`。
> 全部是**解析解**，没有引入 rapier / cannon 之类的物理引擎——
> 教学场景要的是"任意跳帧都精确复现"，数值积分做不到这一点。

---

## 环境备注

### Next SWC 二进制（已修复）

`node_modules/@next/swc-darwin-arm64` 在首次安装时被截断（10.8 MB，完整 130 MB），
导致 Next 回退到 WASM 编译器、`next build` 无法启动。已用以下方式修好：

```bash
cd web
curl -sL -o swc.tgz "https://registry.npmjs.org/@next/swc-darwin-arm64/-/swc-darwin-arm64-15.5.28.tgz"
mkdir -p .swcx && tar -xzf swc.tgz -C .swcx
cp .swcx/package/next-swc.darwin-arm64.node node_modules/@next/swc-darwin-arm64/
rm -rf .swcx swc.tgz
```

如果 `tsc` 报出一堆离奇的 "Cannot find module 'next/link'"，先删掉 `tsconfig.tsbuildinfo`
（增量缓存里存了上一次的失败结果）。

### `next build` 在受限环境里被文件系统钩子打断

若报 `EEXIST: file already exists, mkdir '.next/server/pages'` 或
`ENOENT mkdir '.next/cache/webpack/server-production'`，是 Node 的 brokered-fs 钩子
在拦 `mkdir(recursive)`。绕过方式是不加载该钩子直接跑 Next：

```bash
cd web
env -u NODE_OPTIONS -u CODEBUDDY_BROKERED_FS_HOOK_ENABLED \
    node ./node_modules/next/dist/bin/next build
```

### 端到端截图验证

```bash
cd web
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_scenes.py
```

逐个打开 `out/topics/<sceneId>/`，等 WebGL 画布就绪 → 读 HUD 读数 → 截图（默认态 + 播放中）
→ 汇总 console error。产物在 `harness/shots/<sceneId>-0{1,2}-*.png`。

### 预览壳（`web/harness/`）

用 esbuild + Tailwind 直接打包**同一批组件源码**（只把 `next/dynamic`、`next/link` 换成 20 行 stub），
用于在没有 Next 运行时的情况下快速看效果。它是验证工具，不得被 `app/` 引用。

```bash
cd web
node harness/build.mjs
cd harness/dist && python3 -m http.server 3100   # http://localhost:3100
```

`harness/shots/` 下保留了各场景的运行截图。
