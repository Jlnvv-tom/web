/**
 * 离线单文件导出的运行时入口
 *
 * 场景数据不从 bundle 里 import，而是从 HTML 里的 <script type="application/json">
 * 读 —— 这样同一个运行时文件可以配 12 个不同的场景，导出产物才能只有一个
 * 共享的 runtime.js（而不是每个场景各打包一份 1 MB 的 three.js）。
 */
import { createRoot } from 'react-dom/client';
import type { SceneSpec } from '@/engine/spec';
import { StandaloneApp } from './StandaloneApp';

function readSpec(): SceneSpec | null {
  const el = document.getElementById('scene-data');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as SceneSpec;
  } catch {
    return null;
  }
}

const host = document.getElementById('root');
const spec = readSpec();

if (!host) {
  throw new Error('离线导出文件缺少 #root 容器');
} else if (!spec) {
  host.innerHTML =
    '<div style="padding:40px;font:14px/1.8 system-ui;color:#fca5a5">' +
    '场景数据损坏：<code>#scene-data</code> 不是合法 JSON。</div>';
} else {
  createRoot(host).render(<StandaloneApp spec={spec} />);
}
