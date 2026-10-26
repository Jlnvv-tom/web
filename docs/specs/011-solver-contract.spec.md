# SPEC-011 · 求解器契约

```yaml
状态: Implemented
版本: 1.0
最后更新: 2026-10-25
关联代码: web/engine/solvers/types.ts, web/engine/solvers/index.ts
关联测试: web/engine/solvers/*.test.ts
```

---

## 1. 接口

```ts
export interface SolverModule {
  kind: SolverKind;
  duration(ctx: SolverCtx): number;
  sample(t: number, ctx: SolverCtx): SceneState;
  invariants?(t: number, ctx: SolverCtx): Record<string, number>;
  clampParams?(ctx: SolverCtx): ParamValues;
}
```

只有 3 个必需成员。刻意保持极小：求解器不知道渲染、不知道 DOM、不知道 React。

---

## 2. 需求

### REQ-SV-001 · 纯函数
`sample(t, ctx)` 对相同输入必须返回相同输出。禁止：模块级可变状态、`Date.now()`、
`Math.random()`、读取上一帧结果。

**允许**的例外：**纯记忆化缓存**。缓存的 key 必须覆盖所有影响输出的参数（见 REQ-SV-004），
且命中缓存时返回**同一个对象引用**。

验收：乱序调用 `sample(2.0) / sample(0.5) / sample(2.0)`，两次 `2.0` 的数值完全相等。

### REQ-SV-002 · 时间无关性声明
求解器可以合法地"时间无关"（如静电场），此时 `sample(t)` 只处理与时间相关的部分（试探电荷运动）。
但必须保证 `duration()` > 0，否则时间轴控件无法工作。

### REQ-SV-003 · 数值精度分级

| 类型 | 要求 | 断言方式 |
|---|---|---|
| 解析解（projectile / lorentz / thinLens / electricField 的静场） | 相对误差 ≤ 1e-9 | 与闭式公式直接比较 |
| 数值积分轨迹（试探电荷、场线） | 能量相对漂移 ≤ 1e-6 / 单步 | 守恒量断言 |
| 等势线（marching squares + 线性插值） | 电位残差 ≤ 1e-2 × 级别间距 | 沿线采样验证 |

> 为什么要求这么严：3D 画错比不画更糟。学生没有能力判断"这条线画歪了 5%"。

### REQ-SV-004 · 缓存规则（关键）
任何带缓存的求解器必须满足：

1. **key 稳定性**：把参数按键名字典序拼接成字符串（不能用 `JSON.stringify(params)`——
   对象键顺序在 V8 里虽稳定，但不可依赖）。
2. **key 完备性**：所有影响几何的参数都要进 key。检查方法：改任意一个参数，
   对应的几何量必须变化（写进测试）。
3. **引用稳定**：命中缓存时返回缓存的数组/对象本身，不 clone。这是渲染层判断
   「是否重建几何」的唯一依据（见 REQ-SC-005）。
4. **有界**：缓存条目上限 ≤ 8，超出按 FIFO 淘汰，避免滑块拖动造成内存增长。

### REQ-SV-005 · 不变量自检
每个求解器都应提供 `invariants(t, ctx)`，返回**误差量**（越接近 0 越好），而不是"是否通过"。
这样测试可以断言量级，也方便将来接入运行时监控。

示例（洛伦兹）：`{ speedError, rError, forceError }`。

### REQ-SV-006 · 越界裁剪
滑块理论上保证取值合法，但 URL 分享参数可能被手改。求解器内部必须对奇异值做兜底：

- 除零（`r → 0`）：用软化半径 `ε = 1e-4`，并在 `assumptions` 说明；
- 反向区间（`min > max`）：按 `min` 处理；
- 非有限值：回落到默认值。

### REQ-SV-007 · 注册即生效
新增求解器 = 实现 `SolverModule` + 在 `engine/solvers/index.ts` 的 `REGISTRY` 加一行。
未注册的 `kind` 必须抛出**带指引的错误**（列出已注册项 + 提示如何注册）。

验收：对任意未注册的 kind（如 `__unknown__`）调用 `getSolver()` 抛出错误，
且文案包含「已注册」列表与注册指引。
（写法约定见 docs/README §2：验收必须是**与时间无关的不变式**，
不得用「某 kind 当前应抛错」这类随注册表增长而变假的表述。）

---

## 3. 现有求解器（注册表全量，新增求解器时同步本表）

| kind | 场景 | 类型 | 不变量（节选） | 单测 |
|---|---|---|---|---|
| `projectile` | 抛体运动 | 解析解 | 机械能守恒、水平分速恒定、`R=v₀²sin2θ/g` | `solvers.test.ts` |
| `lorentz` | 洛伦兹力 | 解析解 | 速率恒定、r=mv⊥/qB、T=2πm/qB | `solvers.test.ts` |
| `thinLens` | 凸透镜 | 解析解 | 透镜公式残差、放大率一致 | `solvers.test.ts` |
| `electricField` | 电场与电势 | 解析场 + RK4 轨迹 | 场线切向∥E、等势线电位残差、场线⊥等势线、能量守恒 | `electricField.test.ts` |
| `capacitor` | 平行板电容器 | 解析解 | `E=U/d`、出射偏转闭式解、能量守恒 | `capacitor.test.ts` |
| `shm` | 简谐运动 | 解析解 | `T=2π√(L/g)`、周期与振幅无关、参考圆投影 | `shm.test.ts` |
| `orbit` | 天体运动 | 开普勒方程数值解 | 开普勒方程残差、面积定律双端、能量守恒 | `orbit.test.ts` |
| `reflection` | 平面镜成像 | 解析解 | 入射角=反射角、三线共面、镜转 φ → 光转 2φ | `reflection.test.ts` |
| `wave` | 机械波 | 解析解 | `v=λf`、波形平移等价、质点不迁移 | `wave.test.ts` |
| `induction` | 楞次定律 | 磁通量闭式解 | `Φ` 闭式解、`ε=−N dΦ/dt`、`F·v=−I²R` | `induction.test.ts` |
| `buoyancy` | 浮力 | 解析解 | `F浮=ρ液gV排`、部分浸入 F∝h、`h/L=ρ物/ρ液` | `buoyancy.test.ts` |
| `lever` | 杠杆平衡 | 解析解 | 力矩叉积、力臂 `L·cosθ`、力矩比与倾角无关 | `lever.test.ts` |
| `acoustics` | 声音传播（F-018） | 解析解 | `r=v·t`、`amp·r ≡ 常数`、三正交圆等径 | `acoustics.test.ts` |
| `rodInduction` | 切割磁感线（F-019） | 解析解 | `ε=BLv`、安培力方向、功率自洽 | `rodInduction.test.ts` |

---

## 4. 为什么不用物理引擎（Decision）

见 [ADR-0002](../adr/0002-numerics-and-caching.md)。一句话：

> 教学场景需要**可跳帧、可回退、与教材公式严丝合缝**，物理引擎给的是"近似真实"，
> 而我们要的是"精确符合课本"。两者目标不同，不是精度高低的问题。

---

## 5. 反模式清单

| 反模式 | 为什么错 | 正确做法 |
|---|---|---|
| 在求解器里 `import` React / three | 破坏可测试性与 SSR | 只依赖 `vec.ts` 与 `spec.ts` 的类型 |
| 用上一帧状态做增量积分 | 拖时间轴会得到不同轨迹 | 定点重放或解析解 |
| 缓存 key 漏参数 | 调参后画面不动 | 见 REQ-SV-004 |
| 返回 `new` 数组但内容相同 | 渲染层每帧重建几何 → 掉帧 | 命中缓存返回原引用 |
| `scalars` 里塞非数字 | HUD 与图表会显示 `NaN` | 非数值放 `meta` |
