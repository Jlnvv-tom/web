import type { SceneSpec } from '@/engine/spec';
import { DIFFICULTY_LABEL, STAGE_LABEL } from '@/engine/spec';

/**
 * 离线单文件 HTML 的拼装（M2 · 任务 #17）
 *
 * 拆成纯函数是为了能单测：真正的坑全在**转义**上——
 * 场景 JSON 里只要有 `</script>`，整段就会被浏览器提前截断，
 * 而 scene 的 `script[].text` 是中文长句，谁也不能保证它不含 `<`。
 */

/** 把任意文本塞进 <script> 内部时，只需要打断 `</script` 与 `<!--` 两种序列 */
export function escapeForScript(s: string): string {
  return s
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildStandaloneHtml(opts: {
  spec: SceneSpec;
  runtimeJs: string;
  css: string;
}): string {
  const { spec, runtimeJs, css } = opts;
  const title = `${spec.meta.title}｜${STAGE_LABEL[spec.meta.stage]}物理 3D 演示`;
  const specJson = escapeForScript(JSON.stringify(spec));
  const js = escapeForScript(runtimeJs);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="physics3d offline export">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(spec.meta.pitch)}">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>

<!-- 场景数据：走 JSON 而不是 JS 字面量，转义只需处理 script 边界 -->
<script id="scene-data" type="application/json">${specJson}</script>

<!-- 离线版不写 localStorage，避免在别人的电脑上留痕 -->
<script>window.__NO_TELEMETRY__ = true;</script>

<!-- 播放器运行时（含 three.js / React / 全部渲染组件） -->
<script>${js}</script>

<!-- 兜底：JS 没跑起来时至少告诉用户发生了什么 -->
<script>
setTimeout(function () {
  var r = document.getElementById('root');
  if (r && !r.firstChild) {
    r.innerHTML =
      '<div style="padding:40px;font:14px/1.8 system-ui;color:#94a3b8">' +
      '<b style="color:#e2e8f0">三维场景未能启动</b><br>' +
      '这个文件需要 WebGL 与较新的浏览器。请用 Chrome / Edge / Safari 最新版打开，' +
      '并确认没有禁用硬件加速。' +
      '</div>';
  }
}, 4000);
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 导出文件名的安全化：只保留 id 允许的字符 */
export function standaloneFilename(spec: SceneSpec): string {
  const id = spec.meta.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `physics3d-${id}.html`;
}

/** 给老师看的说明行 */
export function standaloneBadge(spec: SceneSpec): string {
  return `${STAGE_LABEL[spec.meta.stage]} · ${DIFFICULTY_LABEL[spec.meta.difficulty]} · 约 ${spec.meta.minutes} 分钟`;
}
