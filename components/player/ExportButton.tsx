'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Download, Loader2 } from 'lucide-react';
import type { SceneSpec } from '@/engine/spec';
import { buildStandaloneHtml, standaloneFilename } from '@/lib/standalone';
import { downloadText } from '@/lib/download';

/**
 * 「导出离线版」按钮
 *
 * 运行时（runtime.js）与样式（standalone.css）是**站点内的静态资源**，
 * 点击时 fetch 回来、和当前场景 JSON 拼成一个自包含的 HTML 再下载。
 * 这样磁盘上只需要存一份运行时，而用户拿到的仍然是单文件。
 *
 * 拼装逻辑放在 lib/standalone.ts 里，纯函数、有单测；
 * 这里只负责取资源、给反馈。
 */

const RUNTIME = 'runtime.js';
const STYLE = 'standalone.css';

/** 兼容根路径部署、带 trailingSlash 的子路径、以及预览壳的子目录 */
function candidates(file: string): string[] {
  return [`/standalone/${file}`, `../standalone/${file}`, `../../standalone/${file}`];
}

async function fetchFirst(file: string): Promise<string> {
  let lastErr = '';
  for (const url of candidates(file)) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) return await res.text();
      lastErr = `${url} → HTTP ${res.status}`;
    } catch (e) {
      lastErr = `${url} → ${(e as Error).message}`;
    }
  }
  throw new Error(lastErr || '未知错误');
}

let cache: { js: string; css: string } | null = null;

async function loadAssets(): Promise<{ js: string; css: string }> {
  if (cache) return cache;
  const [js, css] = await Promise.all([fetchFirst(RUNTIME), fetchFirst(STYLE)]);
  if (!js.trim()) throw new Error('runtime.js 是空文件');
  cache = { js, css };
  return cache;
}

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'error'; msg: string };

export function ExportButton({ spec }: { spec: SceneSpec }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = async () => {
    if (state.kind === 'busy') return;
    setState({ kind: 'busy' });
    try {
      const { js, css } = await loadAssets();
      const html = buildStandaloneHtml({ spec, runtimeJs: js, css });
      downloadText(standaloneFilename(spec), html, 'text/html;charset=utf-8');
      setState({ kind: 'done' });
      setTimeout(() => setState({ kind: 'idle' }), 2600);
    } catch (e) {
      setState({ kind: 'error', msg: (e as Error).message });
    }
  };

  const busy = state.kind === 'busy';

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={run}
        disabled={busy}
        className="btn !px-2.5 !py-1 !text-[11px]"
        title="下载单个 HTML 文件，双击即可离线使用"
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : state.kind === 'done' ? (
          <Check size={12} className="text-emerald-400" />
        ) : (
          <Download size={12} />
        )}
        {busy ? '正在打包…' : state.kind === 'done' ? '已下载' : '导出离线版'}
      </button>

      {state.kind === 'error' ? (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-amber-300/90"
          title={state.msg}
        >
          <AlertTriangle size={10} />
          未找到离线运行时，请先执行 <code className="font-mono">npm run build:standalone</code>
        </span>
      ) : null}
    </div>
  );
}
