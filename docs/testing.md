# 测试策略

```yaml
状态: 生效中
最后更新: 2026-10-24
命令: npm test · npm run typecheck · node harness/build.mjs · python scripts/verify_baseline.py
```

这个项目最容易出的不是"崩溃"，而是**静默画错**。页面照常渲染，但半径画错了 8%、
等势线与场线不再垂直、脚本第三步的 `highlight` 指向了一个不存在的 id。
用户不会报错，他们只会默默关掉页面。

所以测试的重点是：**把物理定律和内容契约变成可执行的断言。**

---

## 五层金字塔

```
   L5  视觉回归       14 场景默认帧像素比对（虚拟时钟，逐像素确定性）
  ──────────────────────────────────────────────────────────────
   L4  构建与运行     next build → out/ 静态导出可用；harness 冒烟无 console error
  ──────────────────────────────────────────────────────────────
   L3  内容契约       每个场景的 bind / 脚本 / quiz / 章节引用 / 规格覆盖
  ──────────────────────────────────────────────────────────────
   L2  物理不变量     守恒量、闭式公式、几何关系（这是投入产出比最高的一层）
  ──────────────────────────────────────────────────────────────
   L1  纯函数单测     vec / 参数默认值 / 场景校验 / store 语义
```

| 层 | 文件 | 用例数 | 运行耗时 | 何时跑 |
|---|---|---|---|---|
| L1 | `vec` / `spec` / `store` | 25 | < 100 ms | 每次保存 |
| L2 | `solvers` / `electricField` / `capacitor` / `shm` / `orbit` / `reflection` / `wave` / `induction` / `buoyancy` / `lever` / `acoustics` / `rodInduction` | 240 | ~ 3 s | 每次保存 |
| L2.5 | `telemetry` / `lib/standalone` / `materials` / `palette` / `intro` | 93（28 + 15 + 16 + 22 + 12） | < 200 ms | 每次保存 |
| L3 | `contract/scene-contract` / `contract/spec-coverage` / `contract/framing` / `contract/decor`（含 intro 22 条） | 14 场景 × 12 项 + 3 项 + 84 + 36 | ~ 12 s | 提交前 |
| L4 | `scripts/verify_scenes.py` + `verify_offline.py` + `verify_telemetry.py`（Python Playwright） | 12 条场景 + 3 条离线 + 1 条埋点 | ~ 2 min | 合并前 |
| L5 | `scripts/verify_baseline.py`（虚拟时钟 + 像素比对） | 14 场景 × 2 阈值 | ~ 3 min | **每次改渲染层/样式后** |

> 当前合计 **24 个文件 / 690 条用例**，全绿。<br>
>
> L2.5 是给**平台能力**（埋点、离线导出）留的一层：它们不是物理不变量，
> 但同样是纯函数、同样值得严格断言。放在 L2/L3 之间是因为
> 不加场景也会增长，与场景数无关。<br>
> 执行：`npm test`（vitest run）。
>
> 用例数会随场景数线性增长——L3 是**自动遍历注册表**的，加一个场景就自动多 12 条，
> 不需要改测试文件。这也是为什么 L3 的数量增长不代表工作量增长。

---

## L2：物理不变量（核心）

**判据**：一条测试必须是「物理恒等式」，不是「值没变」。

```ts
// ✗ 这是快照，不是测试
expect(state.scalars.r).toBeCloseTo(5.0);

// ✓ 这是把公式钉住
expect(Math.abs(state.scalars.r! - (m * vPerp) / (Math.abs(q) * B))).toBeLessThan(1e-9);
```

现有清单（节选，完整见测试文件）：

| 求解器 | 断言 | 文件 |
|---|---|---|
| `lorentz` | 速率恒定、`r=mv⊥/qB`、`T=2πm/qB`、逐点等距、θ 分段、负电荷反向、螺距、`F·v=0` | `solvers.test.ts` |
| `projectile` | 机械能守恒、`vₓ` 恒定、最高点 `v_y=0`、`R=v₀²sin2θ/g`、45° 最大、不下穿 | `solvers.test.ts` |
| `thinLens` | 成像公式残差、放大率、`u=2f`、`u<f`、`u=f`、光线条数、像高 | `solvers.test.ts` |
| `electricField` | 场线切向∥E、等势线电位残差、场线⊥等势线、能量守恒、中垂面 V=0 而 E≠0、中性点 | `electricField.test.ts` |
| `capacitor` | `E=U/d`、出射偏转闭式解、偏转与入射高度无关、撞板判定、C/Q/W 自洽、能量守恒 | `capacitor.test.ts` |
| `shm` | `T=2π√(L/g)`、`T=2π√(m/k)`、周期与振幅无关、`ẍ=−ω²x`（数值二阶导）、参考圆投影、摆长守恒、能量守恒 | `shm.test.ts` |
| `orbit` | 开普勒方程残差、椭圆两焦点距离和=2a、三定律、面积速率（近+远双端）、比耐能量守恒、AU 单位口径 | `orbit.test.ts` |
| `reflection` | 入射角=反射角、三线共面、反射点在镜面、光路可逆、像距=物距、镜转 φ → 光转 2φ、`z≠0` | `reflection.test.ts` |
| `wave` | `v=λf`、波形平移等价 `y(x,t+Δt)=y(x−vΔt,t)`、质点不迁移、节点位移恒 0、波腹=2A、包络不动 | `wave.test.ts` |
| `induction` | `Φ=μ₀a²(m·n̂)/2(a²+x²)^{3/2}`、`ε=−N dΦ/dt`、ε 与 Φ 极值错相位、`F·v=−I²R`、增反减同 | `induction.test.ts` |
| `buoyancy` | `F浮=ρ液gV排`、部分浸入 F∝h、全浸没后恒定、`N=G−F浮`、`h/L=ρ物/ρ液`、支持力 | `buoyancy.test.ts` |
| `lever` | `τ=(r×F)_z`、力臂 `L·cosθ`（≠杆长）、力矩比与倾角无关、`m₁L₁=m₂L₂` 与 g 无关、刚体不变长 | `lever.test.ts` |

**新求解器的门槛**：≥ 5 条恒等式断言 + 1 条 `invariants()` 自检。

电场求解器与电容器求解器是目前断言最密的两个（各 19–28 条），因为它们分别包含
「解析场 + 流线积分 + marching squares」与「匀强场 + 抛体轨迹 + 电容三量」多种方法，
任何一处写错都会表现为"线画歪了"而不是"程序崩了"。

`lever` 的断言密度也值得一提（34 条）：它把一个**初中知识点**拆成了
叉积定义、力臂投影、力矩比不变量、量纲约简（g 消去）、刚体约束五组，
每一组都能独立证伪——这样"力臂画短了 10%"这种错误会被立刻抓住。

**三类断言值得单独说**：

1. **数值微分代替公式代入**。`shm` 的 `ẍ=−ω²x` 用二阶差分算，而不是把 `x=Acosωt`
   代进去自己验自己——后者永远通过，等于没测。
2. **双端断言**。`orbit` 的面积定律必须**同时**测近日点和远日点：只测一端，等于没测。
3. **单位口径断言**。`orbit` 的场景单位是 AU，另有一条测试专门确认
   「`points` 是 AU 量级、`scalars.r` 仍是 SI 米」。这条抓到了 HUD 标 AU 却输出米的问题
   （读数差 11 个数量级，但画面上完全看不出来）。
4. **"不变量与时间无关"断言**。`lever` 的力矩比 τ₁/τ₂ 必须在**两个不同倾角**下相等，
   否则"cosθ 两边同步约掉"这句话就只是注释而不是事实。
5. **取景断言**。`buoyancy` 有一条测试专门锁住「t=0 恰好半浸没」——
   这不是物理定律，而是**首帧必须包含水线与排开体积**这个产品约束。
   它同样是可执行的，因此不会在后续调参时被悄悄破坏。

> 电容器求解器的机械能测试当场抓到一个真 bug：`Evec = [0,0,−E]` 与轨迹 `+½at²` 方向矛盾
> （力向左、人往右），能量漂移 4e-4。这就是"不变量测试"存在的意义。

---

## L3：内容契约（防"内容腐坏"）

`engine/contract/scene-contract.test.ts` 会遍历 `content/scenes` 注册表里的**每一个场景**，
在 `t ∈ {0, dur/2, dur}` 三个时刻做全量检查：

| 检查 | 对应需求 |
|---|---|
| `validateScene(spec)` 通过 | REQ-SC-001 |
| 每个 `bind` 至少 2 个点（`trail` 1 个；`optional` 允许空数组） | REQ-SC-003 |
| 对象 id 唯一、`meta.id` 全局唯一 | REQ-SC-002 |
| 每一处 `bind` 都能解析（含 `linesets`） | REQ-SC-003 |
| `script[].at` 严格递增 | REQ-SC-007 |
| `quiz[].answer` 合法、`applyParams` 在参数域内 | REQ-SC-008 |
| 章节树双向一致（`chapterId` ↔ `sceneId`） | REQ-SC-009 |
| `assumptions.length >= 1` | REQ-SC-011 |
| 每个场景有对应 spec 文档 | REQ-SC-012 |
| 内容配额（formulas/pitfalls/quiz 数量） | SPEC-012 §4 |

**为什么值得写**：新增场景时最容易忘记的不是物理，而是「注册了场景但忘了挂到章节树」
「quiz 答案索引写成 4 但只有 3 个选项」。这类 bug 在 UI 上表现为"按钮没反应"，很难查。

`engine/contract/spec-coverage.test.ts` 做一件更"文档学"的事：
扫描 `docs/specs/features/*.spec.md` 的 `场景: <id>` 行，与注册表做双向差集。
**漏写规格 = 构建失败**，这让"先写 spec"从口号变成机制。

---

## L4：构建与运行

| 检查 | 方法 | 通过标准 |
|---|---|---|
| 类型 | `tsc --noEmit` | 0 error |
| 静态导出 | `next build`（`output: 'export'`） | 生成 `out/`，首页可打开 |
| 渲染 | `scripts/verify_scenes.py <sceneId>` | 画布有像素、HUD 有读数、0 console error、截图落 `harness/shots/` |
| 交互 | 同上（自动点一次播放，2.6 s 后再截一张） | 时间轴前进；切场景不崩 |
| 过曝 | `scripts/diag_scrub.py <sceneId>`（暂停后按时间轴逐点扫） | 单帧"三通道全 >248"像素 < 200，且不得成片 |
| 取景 | `scripts/shot_canvas.py <sceneId>`（只截 canvas，排除 UI） | 主体占画面高度 ≥ 60% |
| 离线导出 | `scripts/verify_offline.py <sceneId…>` | 下载 → `file://` 打开 → 画布就绪、HUD ≥ 8 条、公式 > 0、**走网络请求 0 个**、无埋点键、0 console error |
| 埋点 | `scripts/verify_telemetry.py <sceneId>` | 拖 4 下同一滑块 → 合并成 1 条且 `n=4`、`from≠to`；作答产生 `quiz_answer`；0 console error |

> `harness/` 是 esbuild 打的预览壳（把 `next/*` 换成 20 行 stub），
> 用于在 `next build` 因环境问题不可用时仍能端到端验证同一批源码。
> **它是验证工具，不是产品的一部分**，不得被 `app/` 引用。

---

## L5：视觉回归（虚拟时钟 + 像素比对）

`scripts/verify_baseline.py`：14 个场景的默认帧截图与 `baseline/<sceneId>.png` 逐像素比对，
双阈值判定（maxΔ>8 像素占比 ≤1%、maxΔ>24 像素占比 ≤0.2%），尺寸变化直接 FAIL。

**它解决的是一个特定问题：改渲染层会"悄悄改坏"画面。** 阴影参数动一动、材质配方换一档、
`envMapIntensity` 调 0.1——`tsc` 和单测全绿，但某个场景的默认帧已经变了样。
这类回归只有比对像素能发现，而人工看 12 张图是看不出"差了 3%"的。

**为什么不能用「点暂停 + 拖时间轴」获得确定状态**（第一个想到的办法，实测不可行）：
播放器 `playing: true` 自动播放，且讲解脚本的 params / camera 是**粘性**的——
`SceneRuntime` 只在跨越步骤瞬间 `applyScriptParams`，seek 回 0 不会撤销已应用的步骤。
于是「播一会儿→暂停→拖回 0」得到的参数取决于暂停前真实过了多久，跨机器、跨负载都不确定。

**虚拟时钟方案**：init script 劫持 `performance.now` 与 `requestAnimationFrame`，
由脚本逐帧泵帧（每帧 16.7ms）。脚本步骤、相机缓动（0.85 s）、求解、图表
全部按确定节奏推进。实测同一 commit 连续两次运行：13/14 场景 r8 ≤ 0.06%、
maxΔ ≤ 13（SwiftShader 抗锯齿级抖动）；`sound-propagation` 稳定在 0.3% 左右
（细发光波前线），远低于 1% 阈值。

> **2026-10-25 重要修正**：泵帧步长必须 ≤50ms。`SceneRuntime` 与 intro 都有
> `Math.min(delta, 0.05)` 的 dt 钳制（防切标签页大跳变），原先"一次
> `__advance(167ms)` 泵 10 帧"被钳成 50ms —— **整个时钟按比例放慢到 1/3，
> 而捕获仍然确定**，所以从不报错，只是"t=3.0"实际是 t≈0.9。
> 现在统一用页面内逐帧泵（`__advanceFrames(n, 16.7)`），并用 HUD 时间位对位校验
> （标称 t=1.0 → 界面显示 1.0s）。所有基线图已按修正后的时钟重建。

**开场演出的专属判据**（`scripts/verify_intro.py`，git stash 对照实验）：
旧代码也要用同一配置取样，三条门都要求同布局比对（reduced-motion 会把入场
缩放动画冻结在 97%，禁用态帧与普通基线尺寸不同，不能混比）。

| 门 | 内容 | 实测 |
|---|---|---|
| A 零回归 | intro 禁用（reduced）t=1.0，新 vs 旧 | **5/5 = 0.00%**（2026-10-25 任务 4.5 后复测仍 0.00%：reduced-motion 保持旧路径即时压暗） |
| B 稳态 | intro 已结束 t=3.0，新 vs 旧 | **5/5 ≤ 0.04%**（4.5 后复测；压暗推迟落地但终态逐像素一致） |
| C 演出量（信息项） | t=1.0 开启 vs 旧代码 | 0.09–0.79%（4.5 后：演出窗口内不再压暗，此差值是**预期行为变化**，不设门） |

> **任务 4.5 的推广（2026-10-25 第二轮）**：压暗宽限窗从 intro 场景推广到**全部场景**——
> 无 intro 的场景也有 1.6s 默认宽限（第 0 步 highlight 不再把开场变成 0.14 的灰画，
> 实测 projectile 的 t=1.2 帧从"灰画"变为全亮）。这改变了 9 个非 intro 场景的
> t=1.0 基线帧（属预期行为变化），基线已全量重建。reduced-motion 下保持即时压暗，
> 因此 A 门的"禁用态零回归"语义仍然成立。

**边界（诚实记录）**：

- 只截 3D 画布元素。UI 的 CSS transition 由合成器**真实**时钟驱动，虚拟时钟管不到；
  M3 的打磨面正是画布，UI 回归交给人工评审。
- 采样时刻默认 t=1.0 s（`--at` 可调）：覆盖初始相机缓动（0.85 s）与早期脚本步骤，
  即「用户打开页面第一眼看到的构图」。
- 基线图是二进制产物，**必须随渲染层改动一起提交**（`--update` 后 `git add baseline/`）。

---

## L3.5：构图契约（M3 · W5）

`engine/contract/framing.test.ts`：把 m3-plan §4.5 的取景规则变成断言，
**解析计算，不依赖截图**——遍历全部场景、5 个采样时刻、跟随脚本相机：

| 规则 | 判据 |
|---|---|
| 主体充分填充 | max(竖直张角, 水平张角) / 对应 fov ≥ 62% |
| 主体非细带 | min(两轴填充率) ≥ 15% |
| 相机瞄准主体 | 主体世界包围盒中心的屏幕偏移 ≤ 15%（两轴） |
| 主体在相机前 | ≥ 95% 的顶点在相机前方 |

实测第一版规则（竖直-only 62% + 150% 上限）抓到 52 处失败，但其中大量是
**规则本身错了**：宽扁型主体（透镜装置 7.8×1.68、绳波 4×1.2、抛体 40×10）
天然受水平约束，竖直填满 62% 必然水平溢出；体积型主体（电场 191%、线圈
特写 351%）刻意大于画面。修正为"最大轴填充 + 溢出豁免居中"后，
真实失败收敛到 7 个场景的 26 处，逐一修复相机后全绿
（lorentz/projectile/thin-lens/shm 补距离，capacitor 微距，
lever/em-induction 重瞄 target）。

**与 L5 像素基线分工**：像素基线对细线主体不敏感——实测 lorentz 相机
移动 12% 只有 0.53% 像素差（线只有 2 px 宽，移动产生的差异区太小）。
构图回归由本契约负责（解析式，对移动敏感）；像素基线负责材质/外观
（颜色、填充、物体显隐）。两者互补，不能互相替代。

---

## 覆盖红线（不达标不许合并）

1. L2 全绿，且**没有任何一条断言被 skip**；
2. L3 覆盖到注册表里的 100% 场景；
3. L3.5 构图契约全绿（新场景/改相机后必跑）；
4. `tsc --noEmit` 0 error；
5. 新增求解器必须有 `invariants()`；
6. 新增场景必须有 spec 文档与 ≥1 条 `assumptions`。

覆盖率数字（行覆盖）本阶段不作为指标——物理测试的价值在断言质量，不在行数。

---

## 如何运行

```bash
cd web
npm test                 # vitest run（L1+L2+L2.5+L3+L3.5）
npm run typecheck        # tsc --noEmit
node harness/build.mjs   # 构建预览壳
node harness/serve.mjs   # 起本地静态服务（或 python3 -m http.server）
```

端到端截图冒烟（读 `out/`，需要先 `next build`）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_scenes.py
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_scenes.py shm orbit
```

只截 3D 画布（排除侧栏与标题，便于用像素分析判断过曝/取景）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/shot_canvas.py buoyancy lever
```

暂停后按时间轴逐点扫过曝（**必须先暂停**，否则读数会滞后一帧，测不准）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/diag_scrub.py induction
```

离线单文件导出（下载 → `file://` 打开 → 断言零网络请求）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_offline.py lever
```

埋点（拖滑块 + 作答 → 读回 localStorage）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_telemetry.py lever
```

视觉回归基线（改渲染层/样式后必跑；`--update` 重建基线并随改动提交）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_baseline.py
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_baseline.py --update
~/.workbuddy/binaries/python/envs/default/bin/python scripts/verify_baseline.py shm orbit --at 1.0
```

10 秒测试拼图（t=1.2s 全场景默认帧 → 带/不带标题两张网格图；
对应 m3-plan §8.2 人工判据与 W4「第 1.2 秒单帧当封面」判据）：

```bash
~/.workbuddy/binaries/python/envs/default/bin/python scripts/shot_contact.py
~/.workbuddy/binaries/python/envs/default/bin/python scripts/shot_contact.py buoyancy --at 3.5
# 产物：harness/shots/contact-sheet.png（带标题）/ -bare.png（无标题）/ review-<sid>.png
```

单个文件：

```bash
npx vitest run engine/solvers/electricField.test.ts
```

---

## 已知盲区（诚实记录）

| 盲区 | 现状 | 计划 |
|---|---|---|
| 视觉回归 | ~~有像素级**过曝**与**取景占比**自动检查，但无基线比对~~ | ✅ 已补：`verify_baseline.py` 虚拟时钟 + 14 场景基线（2026-10-24，L5） |
| 移动端手势 | 只在桌面 Chromium 验证 | M2 加 mobile viewport 冒烟 |
| 性能 | 手工看 fps，无自动化 | M2 加 rAF 间隔采集 |
| 无障碍 | 未测 | M3 处理（键盘可达、对比度） |
| 大参数压力 | 已覆盖边界组合，但只针对 `electricField` | 后续做成通用"参数边界遍历" |
| 场景单位口径 | 只有 `orbit`（AU/年）有专门断言 | 后续把"场景单位"写进 `world`，由契约统一约束 |
| 多模式覆盖 | `shm`/`wave` 的 `mode` 分支只在默认模式下过契约测试（`t ∈ {0, dur/2, dur}` 用的是默认参数） | 契约测试增加"每个 select 的每个选项跑一遍" |
