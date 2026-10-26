# 013 · 离线单文件导出

```yaml
状态: Implemented
版本: 1.0
最后更新: 2026-10-22
类型: 平台规格（不绑定单个场景）
需求: REQ-OE-001 … REQ-OE-010
关联代码: web/lib/standalone.ts, web/export/standalone.tsx, web/export/StandaloneApp.tsx,
         web/components/player/ExportButton.tsx, web/scripts/build-standalone.mjs
关联测试: web/lib/standalone.test.ts, web/scripts/verify_offline.py
```

> 本规格**不写 `场景:` 行**——它服务全部注册场景，不是某个场景的特性。
> `engine/contract/spec-coverage.test.ts` 只校验带 `场景:` 行的文件，因此不会被误判为孤儿规格。

---

## 1. 背景：为什么做这个

教室里的真实约束，按出现频率排序：

1. **学校网络不稳或直接屏蔽**。教研室的机器常常连不上外网，或者被统一网关拦掉 CDN。
2. **机房/班班通是老旧 Windows + 老版浏览器**，装不了插件，也不允许随意装软件。
3. **老师要"带走"**。把某个知识点塞进 U 盘、发到班级群、嵌进自己的课件包，
   这是最自然的分发方式；让他"记得我们的网址"基本等于不会再用。
4. **演示型产品最怕现场翻车**。讲台上的网络抖动一次，这个工具就再也不会上第二次。

所以"静态导出"还不够——静态导出仍然是一个**站点**，需要 HTTP 服务。
真正的判据是：**把单个 HTML 拷到 U 盘，双击就能用**。

## 2. 为什么是"运行时共享 + 浏览器端拼装"

最直觉的做法是构建期生成 12 个自包含 HTML。算一下代价：

| 方案 | 站点体积 | 用户拿到的文件 | 改一版样式要重编 |
|---|---|---|---|
| A. 构建期预生成 N 份（N = 场景数） | 14 × 1.6 MB ≈ 22 MB，随场景数线性膨胀 | 1.6 MB 单文件 ✅ | 全部 N 份重写 |
| B. 运行时共享 + 点击时拼装 | **1.6 MB 一份** | 1.6 MB 单文件 ✅ | 只重编 1 份 |

方案 B 的关键观察：**运行时（three.js / React / 渲染组件）与场景内容是正交的**。
把场景数据从 bundle 里拿出来，改成运行时从页面里读一段 JSON，
同一份 `runtime.js` 就能服务全部场景。

于是 `ExportButton` 在点击时做三件事：

```
fetch('/standalone/runtime.js')  ┐
fetch('/standalone/standalone.css') ├→ 拼成 HTML 字符串 → Blob → <a download>
当前页面已有的 spec JSON           ┘
```

产物仍然是**一个文件**，仍然零网络请求。站点只多背 1.6 MB，而不是 19 MB。

## 3. 用户故事

1. 作为物理老师，我想把「杠杆平衡」下载成一个文件发到班级群，
   以便学生在自己电脑上打开，不用注册、不用联网。
2. 作为老师，我想在断网的教室里打开 U 盘里的 HTML 直接投屏，
   以便公开课不依赖学校网络。
3. 作为教研员，我想把全部场景分别导出、按章节重命名归档，
   以便做成一套可离线分发的教具包。

## 4. 架构与约束

### 4.1 产物形态

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <style>/* standalone.css 全文内联 */</style>
</head>
<body>
  <div id="root"></div>
  <script id="scene-data" type="application/json">{...spec...}</script>
  <script>window.__NO_TELEMETRY__ = true;</script>
  <script>/* runtime.js 全文内联 */</script>
  <script>/* 4s 后若 #root 仍为空，提示 WebGL 不可用 */</script>
</body>
</html>
```

**没有 `<link>`，没有 `src=`，没有任何 http(s) 引用。** 这是可断言的硬约束。

### 4.2 场景数据走 JSON 而不是 JS 字面量

`<script type="application/json">` 里的内容不会被当作 JS 执行，
所以只需要处理一个转义问题：把 `</script` 与 `<!--` 切断。
如果写成 `<script>window.__SCENE__ = {...}</script>`，则还要额外处理
`</script>` 之外的 JS 语法边界，转义面更大。

### 4.3 公式改用 MathML

线上页用 KaTeX 的 HTML 输出，它依赖 `katex.min.css` + 二十多个 woff2 字体。
把字体 base64 内联进单文件要再加 **600 KB 以上**。

离线版改用 `output: 'mathml'`，由浏览器原生渲染，零额外资源。
代价是字形不如 KaTeX（尤其上下标间距），但换来：

- 单文件从 ~2.3 MB 降到 **1.67 MB**
- 少一层 CSS 依赖，离线环境更不容易出问题

这是一个显式记录的**降级交换**，不是疏忽。

### 4.4 运行时体积构成（实测）

| 依赖 | 说明 |
|---|---|
| three.js | 3D 核心，无法再砍 |
| React + ReactDOM | 播放器框架 |
| @react-three/fiber | three 的 React 绑定 |
| katex | 把 TeX 转成 MathML（不含 CSS/字体） |
| 业务代码 | 全部场景的渲染组件 + 播放器 |

`hls.js`、`@mediapipe/tasks-vision` 这类 drei 桶导入带进来的大包
**已被 esbuild tree-shaking 干净剔除**（在产物里 grep 计数为 0）。
最终 `runtime.js` **1597 KB / `standalone.css` 57 KB**。

## 5. 需求与验收

### REQ-OE-001 · 导出的 HTML 是完整文档
验收：以 `<!doctype html>` 开头、`</html>` 结尾，含 `charset` 与 `viewport`。

### REQ-OE-002 · 零外部资源
验收：产物中不出现 `<link`，也不存在指向 `http(s):` 的 `src` / `href`。
端到端：`file://` 打开时**网络请求数 = 0**（`verify_offline.py` 实测请求总数 1，
即文档本身，走 http(s) 的为 0）。

### REQ-OE-003 · 场景 JSON 可无损往返
验收：把 `#scene-data` 的内容 `JSON.parse` 后，`meta.id` / `script.length` /
`objects.length` 与源 spec 完全一致；全部注册场景通过（测试遍历场景注册表）。

### REQ-OE-004 · 转义不可被突破
验收：即使 `script[].text` 里含 `</script>`，数据块内也不出现裸的结束标签，
且解析回来原文完整。标题里的 `<` `>` `&` `"` 做 HTML 转义。

### REQ-OE-005 · 离线版不写本地存储
验收：产物含 `window.__NO_TELEMETRY__ = true`；
在离线页作答/调参后，`localStorage` 不新增 `phys3d.telemetry.v1` 键。

### REQ-OE-006 · 文件名安全
验收：`standaloneFilename` 只输出 `physics3d-<id>.html`，id 中的
`/`、空格等非 `[a-zA-Z0-9_-]` 字符被替换成 `-`，不会产生路径穿越。

### REQ-OE-007 · 运行时与样式由构建脚本产出
验收：`node scripts/build-standalone.mjs` 产出
`public/standalone/runtime.js` 与 `public/standalone/standalone.css`；
脚本自检 `standalone.css` 必须包含 `.panel` / `.chip` / `.btn` / `.formula`，
否则以非零码退出（防止 Tailwind 扫描范围失配导致裸样式）。

### REQ-OE-008 · 下载失败有可读提示
验收：`runtime.js` 取不到时，按钮旁显示
「未找到离线运行时，请先执行 `npm run build:standalone`」，而不是静默失败。

### REQ-OE-009 · 多种部署路径可用
验收：`fetchFirst` 依次尝试 `/standalone/*`、`../standalone/*`、`../../standalone/*`，
根路径部署、带 `trailingSlash` 的子路径、预览壳子目录都能取到资源。

### REQ-OE-010 · WebGL 不可用时不白屏
验收：产物含 4 秒兜底脚本，`#root` 仍为空时渲染中文提示，
说明需要 WebGL 与新浏览器。

## 6. 非目标

- ❌ 导出成 PDF / 视频。要交互，不要快照。
- ❌ 多场景打包成一个 HTML（那会变成"离线站点"，又需要索引页）。
- ❌ 离线版保留搜索、面包屑、上下篇——它们指向站内其它页面，离线时是死链。
- ❌ 离线版写埋点。数据留在别人电脑上是负担，也无法回收。
- ❌ 用 Service Worker 做离线缓存。老师要的是**文件**，不是"访问过一次的站点"。

## 7. 测试映射

| 需求 | 测试用例 | 断言方式 |
|---|---|---|
| REQ-OE-001 | `lib/standalone.test.ts` › 是完整 HTML 文档 | 字符串首尾与必需标签 |
| REQ-OE-002 | › 内联样式与运行时，不引用任何外部资源 + `verify_offline.py` | 正则不含 `<link`/`http(s):`；请求表过滤 |
| REQ-OE-003 | › 场景 JSON 能被原样解析回来 + › 全部场景都能拼装且 JSON 可解析 | parse 后逐字段比对 |
| REQ-OE-004 | › 打断 `</script` 序列 + › 标题做了 HTML 转义 + › 场景文本里含 `</script>` | 转义后仍可 parse |
| REQ-OE-005 | › 注入关闭埋点的开关 | 产物含 `__NO_TELEMETRY__` |
| REQ-OE-006 | › 文件名只用 id + › 非法字符被替换 | 字符串相等 |
| REQ-OE-007 | `build-standalone.mjs` 自检 | 缺类时 exit ≠ 0 |
| REQ-OE-008 | 人工 + 组件分支 | 错误态文案 |
| REQ-OE-009 | `ExportButton.candidates` | 三个候选路径 |
| REQ-OE-010 | › 带上 WebGL 起不来时的兜底提示 | 产物含提示文案 |

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 单文件 1.67 MB，通过微信传可能被限速 | 老师嫌慢 | 微信文件上限 100 MB，1.67 MB 属于很小；若将来超 5 MB 再考虑拆包 |
| 老版浏览器不支持 MathML Core（Chrome < 109） | 公式显示为线性文本 | 页脚已提示"请用最新版浏览器"；MathML 降级显示仍是可读的 TeX 排布 |
| esbuild 打包与 Next 的行为漂移 | 离线版与线上不一致 | 两者共用同一批组件源码；`next/dynamic` 用 stub 对齐 |
| `public/standalone/` 被误提交旧版本 | 导出旧运行时 | `build.sh` 每次先重编运行时再 `next build` |

---

## 完成定义（DoD）

```
[x] lib/standalone.ts 纯函数 + 15 条单测
[x] build-standalone.mjs 产出 runtime.js / standalone.css 并自检
[x] ExportButton 接线（含失败提示与多路径兜底）
[x] 端点测试 verify_offline.py：file:// 打开 + 零网络请求断言
[x] 全部场景可拼装且 JSON 往返一致
[x] npm test 全绿
[x] tsc --noEmit 通过
[x] next build 37/37 静态页
```

## 附：实测数据（2026-10-22）

```
runtime.js       1597 KB
standalone.css     57 KB
physics3d-lever.html      1665 KB   画布就绪 · 15 条 HUD · 8 处公式 · 0 网络请求 · 0 报错
```
