'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronDown, Download, Trash2 } from 'lucide-react';
import { getTelemetry, telemetryEnabled, type TelemetryStats } from '@/engine/telemetry';
import { downloadText, stamp } from '@/lib/download';

const ZERO: TelemetryStats = {
  total: 0,
  byName: { scene_view: 0, scene_exit: 0, param_change: 0, quiz_answer: 0 },
  params: { byKey: {}, distinctKeys: 0, rawUpdates: 0 },
  quiz: { answered: 0, correct: 0 },
  viewsByScene: {},
};

/**
 * 使用数据面板（M2 · 任务 #18）
 *
 * 为什么要有：产品定位的核心假设是「这是教具，不是视频」。
 * 如果学生点开就看、从不拖滑块，这个假设不成立。所以必须能当场看到
 * 「每次打开平均调了几次参数」——它就是 Go/No-Go 的第 2 条判据。
 *
 * 数据**只存本机 localStorage**，不上报、不含任何个人信息。
 * 老师/研究者可以导出 CSV 自行分析。
 */
export function TelemetryPanel({ sceneId }: { sceneId?: string }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<TelemetryStats>(ZERO);
  /**
   * 注意：**不能**在渲染期调用 `telemetryEnabled()`。
   * 服务端没有 window → false → 渲染 null；客户端首帧 → true → 渲染整块面板，
   * 两边 DOM 结构不同，React 会直接抛水合错误 #418。
   * 所以这里用一个初值为 false 的 state，挂载后才打开——服务端与首帧都是 null，
   * 结构一致，第 2 帧再显示。
   */
  const [enabled, setEnabled] = useState(false);

  const refresh = useCallback(() => {
    setStats(getTelemetry().stats());
  }, []);

  useEffect(() => {
    if (!telemetryEnabled()) return;
    setEnabled(true);
    refresh();
    return getTelemetry().subscribe(refresh);
  }, [refresh]);

  if (!enabled) return null;

  const s = stats;
  const views = s.byName.scene_view;
  const perView = views > 0 ? s.params.rawUpdates / views : 0;
  const accuracy = s.quiz.answered > 0 ? Math.round((100 * s.quiz.correct) / s.quiz.answered) : null;

  const onExportCsv = () => {
    const tel = getTelemetry();
    // 导出前把挂起的拖动结算掉，否则刚拖的那一下会丢
    tel.flushPending();
    downloadText(`physics3d-usage-${stamp()}.csv`, tel.toCsv(), 'text/csv;charset=utf-8');
    refresh();
  };
  const onExportJson = () => {
    const tel = getTelemetry();
    tel.flushPending();
    downloadText(`physics3d-usage-${stamp()}.json`, tel.toJson(), 'application/json;charset=utf-8');
    refresh();
  };
  const onClear = () => {
    getTelemetry().clear();
    refresh();
  };

  return (
    <section className="panel mt-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <Activity size={13} className="text-cyan-400" />
        <span className="text-[11px] font-bold tracking-[0.18em] text-slate-300">使用数据</span>
        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[9.5px] text-slate-500">仅存本地</span>
        {s.total > 0 ? (
          <span className="ml-1 font-mono text-[10px] tabular-nums text-slate-600">{s.total} 条事件</span>
        ) : null}
        <span className="ml-auto text-[10px] text-slate-600">{open ? '收起' : '展开'}</span>
        <ChevronDown
          size={13}
          className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="border-t border-white/6 px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="开口次数" value={num(views)} hint="scene_view" />
            <Tile
              label="调参次数"
              value={num(s.params.rawUpdates)}
              hint={`涉及 ${s.params.distinctKeys} 个参数`}
            />
            <Tile
              label="每次平均调参"
              value={perView ? perView.toFixed(1) : '—'}
              hint="核心判据：≥ 3 才算教具"
              tone={perView >= 3 ? 'ok' : perView > 0 ? 'warn' : 'muted'}
            />
            <Tile
              label="练习正确率"
              value={accuracy === null ? '—' : `${accuracy}%`}
              hint={`${s.quiz.correct}/${s.quiz.answered} 题（首次作答）`}
            />
          </div>

          {sceneId && s.viewsByScene[sceneId] ? (
            <p className="mt-2.5 text-[10px] text-slate-600">
              本场景已打开 {s.viewsByScene[sceneId]} 次。
            </p>
          ) : null}

          <p className="mt-3 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
            记录 <code className="text-slate-400">scene_view</code> /{' '}
            <code className="text-slate-400">param_change</code> /{' '}
            <code className="text-slate-400">quiz_answer</code>{' '}
            三类事件，只写在你自己浏览器的 localStorage 里，不上传、不含个人信息。
            导出 CSV 后可自行统计。
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={onExportCsv} className="btn !px-2.5 !py-1 !text-[11px]" title="导出 CSV">
              <Download size={12} /> 导出 CSV
            </button>
            <button onClick={onExportJson} className="btn !px-2.5 !py-1 !text-[11px]" title="导出 JSON">
              <Download size={12} /> 导出 JSON
            </button>
            <button
              onClick={onClear}
              className="btn !px-2.5 !py-1 !text-[11px] text-red-300/80 hover:text-red-200"
              title="清空本地记录"
            >
              <Trash2 size={12} /> 清空
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function num(n: number): string {
  return n.toLocaleString('zh-CN');
}

function Tile({
  label,
  value,
  hint,
  tone = 'muted',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'muted';
}) {
  const valueCls =
    tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.025] px-2.5 py-2">
      <div className="text-[9.5px] tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-[16px] font-semibold tabular-nums ${valueCls}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[9px] leading-snug text-slate-600">{hint}</div> : null}
    </div>
  );
}
