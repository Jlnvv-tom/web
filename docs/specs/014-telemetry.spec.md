# 014 · 本地埋点

```yaml
状态: Implemented
版本: 1.0
最后更新: 2026-10-22
类型: 平台规格（不绑定单个场景）
需求: REQ-TM-001 … REQ-TM-010
关联代码: web/engine/telemetry.ts, web/components/player/TelemetryPanel.tsx
关联测试: web/engine/telemetry.test.ts
```

> 不写 `场景:` 行，理由同 013。

---

## 1. 背景：这个指标决定产品是否成立

路线图里有一条 Go/No-Go 判据：

> **平均调参次数 ≥ 3。** 如果用户点开就看、从不拖滑块，说明这是"视频"而不是"教具"，
> 那差异化定位就不成立，应该回头改交互而不是继续加场景。

在此之前，这个指标**无法度量**——技术债表里写着"埋点为 0，Go/No-Go 第 2 条无法度量"。

但这里有个尖锐的取舍：**我们没有后端，也不想在 MVP 阶段引入后端。**
而且这个产品的用户是未成年学生，把行为数据传到服务器需要一整套合规成本
（告知、同意、脱敏、留存期限）。

所以结论是：**只做本地埋点**。数据落在用户自己的浏览器里，
老师和研究者可以主动导出 CSV。收集不到"全站大盘"，但能回答
"这一版场景到底有没有人玩"这个问题——正好是当前阶段需要回答的那个。

## 2. 事件设计

只记三类（外加一个会话收尾），每类都对应一个具体决策：

| 事件 | 触发 | 回答什么问题 |
|---|---|---|
| `scene_view` | 场景挂载 | 哪些知识点真的被打开了 |
| `scene_exit` | 场景卸载（带 `dwellMs`） | 停留 3 秒还是 3 分钟 |
| `param_change` | 用户拖滑块/切选项（带 `from` / `to` / `n`） | **核心指标**：有没有在玩 |
| `quiz_answer` | 练习首次作答（带 `picked` / `answer` / `correct`） | 预测环节有没有被使用 |

`quiz_answer` 只记**首次作答**。点「重做」时答案已经被看过，再选对不能算会了；
若把重做也计入，正确率会虚高，这个指标就废了。

## 3. 关键设计：拖动合并

滑块以约 60 Hz 触发 `onChange`。如果逐次记录，
"调参次数"会瞬间破千而失去意义——一次拖动就变成一百次。

所以 `trackParam` 按 `(sceneId, paramKey)` 合并：

```
拖动 L: 10 → 20 → 30 → 40 → 50（5 次 onChange）
        ↓ 600ms 无新事件
产出： { key: 'L', from: 10, to: 50, n: 5 }
```

- `n` 是原始更新次数，单独保留 —— 它衡量"拖得多用力"，和"拖了几个参数"是两个信息。
- 合并窗口用 `setTimeout` 重置（每次新值都重置计时器），
  所以持续拖动期间不会落库。
- 切页 / 卸载 / 导出前必须 `flushPending()`，否则最后一次拖参会丢。
  这条在 `PlayerProvider` 的 cleanup 里做了。

## 4. 用户故事

1. 作为产品负责人，我想看到「每次打开平均调参几次」，
   以便判断这个场景是教具还是视频。
2. 作为老师，我想导出自己班上学生的使用记录，
   以便知道哪些知识点学生真的动手了。
3. 作为学生，我不想我的学习行为被上传到任何服务器。
4. 作为开发者，我想在离线导出页里彻底关掉埋点，
   以便不在别人的电脑上留任何痕迹。

## 5. 需求与验收

### REQ-TM-001 · 事件结构稳定
验收：每条事件含 `seq`（会话内自增，1 起）、`name`、`at`（ms）、`session`（匿名）、
`sceneId`、`data`。`events()` 返回副本，外部修改不影响内部状态。

### REQ-TM-002 · 持久化与恢复
验收：写入 `localStorage` 键 `phys3d.telemetry.v1`；
重新 `createTelemetry` 后能恢复，且 `seq` 从旧最大值续上，不与历史冲突。

### REQ-TM-003 · 容量上限
验收：超过 `cap`（默认 800）时丢弃最旧的，只保留最新 `cap` 条，
`seq` 继续递增不重置。

### REQ-TM-004 · 存储异常不致命
验收：`localStorage` 读不到 / 是坏 JSON / 写入抛 `QuotaExceededError` 时，
降级为纯内存，`track` 不抛错，`clear` 不抛错。

### REQ-TM-005 · 参数拖动合并
验收：同一 `(sceneId, key)` 连续 5 次 `trackParam` 只产生 **1 条** `param_change`，
`from` 为首值、`to` 为末值、`n === 5`；不同参数、不同场景的同名参数不合并。

### REQ-TM-006 · 挂起事件可结算
验收：`flushPending()` 立即产生事件且**幂等**（再次调用不重复产出）；
`toJson` / `toCsv` / `stats` / `trackQuiz` 内部都会先结算。

### REQ-TM-007 · 汇总指标
验收：`stats()` 给出 `byName`、`params.byKey`、`params.distinctKeys`、
`params.rawUpdates`（原始次数之和）、`quiz.{answered,correct}`、`viewsByScene`。
空队列时结构完整、不抛错。

### REQ-TM-008 · 导出格式可用
验收：`toJson` 合法且带 `version: 1`；
`toCsv` 首行为 `seq,at,iso,name,session,sceneId,data`，
含逗号/引号/换行的字段按 RFC 4180 转义（字段内不出现裸换行）。

### REQ-TM-009 · 清理彻底
验收：`clear()` 清空内存、挂起队列与存储键；之后 `seq` 从 1 重新开始；
已被 `clear` 的挂起拖动不会被延迟写回。

### REQ-TM-010 · 可关闭
验收：`telemetryEnabled()` 在无 `window`（服务端）或
`window.__NO_TELEMETRY__ === true`（离线导出页）时为 `false`；
此时 `getTelemetry()` 返回空实现，所有方法可安全调用、不产生任何事件。

## 6. 隐私边界（硬约束）

明确**不记录**：

- 任何 URL（含 query）、Referer
- User-Agent、屏幕尺寸、IP（本地也拿不到）
- 姓名、学号、任何可识别个人的字段
- 键盘输入内容

只有：匿名 8 位 session id（每次打开页面新生成）+ 场景 id + 参数名/取值 + 作答选项。

**零网络是结构性保证，不是配置项**：`engine/telemetry.ts` 里**没有**
`fetch` / `sendBeacon` / `XMLHttpRequest` 任何一处调用，也没有 `endpoint` 之类的开关。
设计时曾考虑留一个可选的 `endpoint`，最后决定不留——
留着就等于留了一个"以后顺手打开"的口子，而合规评审会问"现在能不能传"。
现在这个问题的答案是结构性的：**看代码就知道不能**。

## 7. 非目标

- ❌ 服务端上报 / 用户账号 / 跨设备同步（那是 M3 的事，且需要合规流程）
- ❌ 漏斗分析、留存分析（本地队列做不了，也不该在 MVP 做）
- ❌ 记录 3D 相机的旋转角度（数据量大、意义低）
- ❌ 全站页面浏览统计（只记场景，`scene_view` 已足够）

## 8. 测试映射

| 需求 | 测试用例 | 断言方式 |
|---|---|---|
| REQ-TM-001 | 埋点 · 基础写入（3 例） | `seq` 序列、`session` 一致、副本隔离 |
| REQ-TM-002 | 埋点 · 持久化 › 落盘后重建能恢复 | 重建后长度与 `seq` |
| REQ-TM-003 | › 超过 cap 时丢弃最旧的 | `cap: 3` + 5 条 |
| REQ-TM-004 | › 坏 JSON / › 写满抛异常 | 不抛错、降级可用 |
| REQ-TM-005 | 埋点 · param_change 合并（6 例） | `data` 深比较、`n` 计数 |
| REQ-TM-006 | › flushPending 立即结算 + › 导出前会先结算 | 幂等、顺序 |
| REQ-TM-007 | 埋点 · 汇总统计（2 例） | 各字段数值 |
| REQ-TM-008 | 埋点 · 导出（3 例） | `JSON.parse`、CSV 行数与转义 |
| REQ-TM-009 | 埋点 · 清理与订阅 › clear 两例 | 存储键为 null、定时器不再写回 |
| REQ-TM-010 | 埋点 · 关闭开关（4 例） | `telemetryEnabled` 三态 + 空实现 |

合计 **28 条**，`engine/telemetry.test.ts` 全绿。

## 9. 面板

`TelemetryPanel` 挂在知识点页底部，默认折叠。展开后四个指标卡：

| 卡片 | 数据来源 | 备注 |
|---|---|---|
| 开口次数 | `byName.scene_view` | |
| 调参次数 | `params.rawUpdates` | 原始 onChange 次数 |
| **每次平均调参** | `rawUpdates / scene_view` | **≥ 3 显示绿色**，> 0 显示琥珀色 |
| 练习正确率 | `quiz.correct / quiz.answered` | 括号里注明"首次作答" |

配色直接用绿/琥珀回应该判据，避免"看了一眼数字还得自己去比"。

## 10. 开发过程中抓到的真 bug

1. **合并时把内部复合键当成了参数名**：为了区分「不同场景的同名参数」，
   `pending` 表的键是 `sceneId::paramKey`，但 `settle()` 直接把这个复合键
   写进了事件的 `key` 字段，于是落库变成 `key: 'shm::L'`。
   后果是 `stats().params.byKey` 出现一堆带前缀的键，
   「涉及几个参数」这个指标直接算错。3 条断言同时挂掉才暴露。
   修法：`Pending` 结构里单独保存裸 `paramKey`，键只用于查表。

2. **`TelemetryPanel` 在渲染期读 `window` 导致水合失败**（React #418）：
   面板开头写的是 `const enabled = telemetryEnabled(); if (!enabled) return null;`。
   服务端没有 `window` → `enabled = false` → 渲染 `null`；
   客户端首帧 → `enabled = true` → 渲染整块面板。
   服务端 HTML 与客户端首帧结构不同，React 直接抛
   `Minified React error #418`（Hydration failed）。
   修法：改成初值为 `false` 的 state，在 `useEffect` 里再打开，
   这样服务端与客户端首帧都是 `null`，第 2 帧才出现面板。

   > 教训：**任何依赖 `window` 的开关都不能参与首帧渲染判断**。
   > 这类 bug 有个讨厌的性质：`tsc` 通过、单测通过、页面"看起来"也正常，
   > 只在浏览器控制台里报一条 minified 错误。所以 L4 的
   > 「0 console error」断言不是走过场——它就是唯一能抓住这类问题的网。

## 11. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| `localStorage` 被清 / 无痕模式 | 数据丢失 | 本来就是样本级用途，不承诺留存；面板显示的是"本机累计" |
| 合并窗口 600ms 对慢速拖动过度合并 | `n` 偏小 | `n` 只是辅助信息，核心指标是"有没有调"，不影响判据 |
| 学生把面板当"排行榜" | 分心 | 默认折叠，且只有调参/正确率，无排名与积分 |
| 埋点代码侵入播放器 | 影响性能 | 只挂在三个组件的离散回调上，不在 60fps 循环里 |
| 内部存储格式（裸数组）与导出格式（带 version/object）不一致 | 外部脚本直接读 localStorage 会拿到数组 | 有意如此：存储是私有实现，`toJson` 才是对外契约；已在 `verify_telemetry.py` 注释里写明 |

---

## 完成定义（DoD）

```
[x] engine/telemetry.ts 可注入 now/storage/session，模块顶层不碰 window
[x] 28 条单测全绿
[x] PlayerProvider / ParamPanel / QuizCard 三处接线
[x] TelemetryPanel 面板 + JSON/CSV 导出 + 清空
[x] 离线导出页通过 __NO_TELEMETRY__ 关闭
[x] 记录到 roadmap 的 Go/No-Go 第 2 条
[x] tsc --noEmit 通过
```
