'use client';

import { useEffect, useRef } from 'react';
import type { ChartDef } from '@/engine/spec';

/**
 * 实时曲线：自绘 Canvas
 *
 * 为什么不用图表库：60fps 下每条曲线每秒追加 ~20 个点，
 * 通用图表库的 diff / 布局计算会成为瓶颈。
 */
export function SeriesChart({ chart, all }: { chart: ChartDef; all: Record<string, number[]> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 30;
    const padR = 6;
    const padT = 20;
    const padB = 16;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const seriesData = chart.series.map((s) => ({ s, data: all[s.bind] ?? [] }));
    const allVals = seriesData.flatMap((x) => x.data).filter((v) => Number.isFinite(v));
    if (allVals.length < 2) {
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('等待数据…', padL, padT + plotH / 2);
      return;
    }

    let min = Math.min(...allVals);
    let max = Math.max(...allVals);
    if (max - min < 1e-6) {
      const mid = (max + min) / 2;
      min = mid - Math.max(Math.abs(mid) * 0.1, 0.5);
      max = mid + Math.max(Math.abs(mid) * 0.1, 0.5);
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;

    // 网格
    ctx.strokeStyle = 'rgba(96,165,250,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    // 刻度
    ctx.fillStyle = 'rgba(100,116,139,0.9)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(fmtTick(max), padL - 4, padT + 4);
    ctx.fillText(fmtTick(min), padL - 4, padT + plotH + 3);

    // 曲线
    const n = Math.max(...seriesData.map((x) => x.data.length));
    const colors = ['#22d3ee', '#ff8a3d', '#a3e635', '#f472b6'];
    seriesData.forEach((sd, si) => {
      ctx.strokeStyle = sd.s.color ?? colors[si % colors.length]!;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const len = sd.data.length;
      for (let i = 0; i < len; i++) {
        const x = padL + (plotW * i) / Math.max(n - 1, 1);
        const y = padT + plotH * (1 - (sd.data[i]! - min) / (max - min));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // 图例
    ctx.textAlign = 'left';
    ctx.font = '9px -apple-system, sans-serif';
    let lx = padL + 2;
    const ly = padT + 9;
    seriesData.forEach((sd, si) => {
      const col = sd.s.color ?? colors[si % colors.length]!;
      ctx.fillStyle = col;
      ctx.fillRect(lx, ly - 4, 8, 2);
      ctx.fillStyle = 'rgba(203,213,225,0.85)';
      ctx.fillText(sd.s.label, lx + 11, ly);
      lx += ctx.measureText(sd.s.label).width + 22;
    });
  });

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold text-slate-400">{chart.title}</span>
        {chart.yLabel ? <span className="text-[9px] text-slate-600">{chart.yLabel}</span> : null}
      </div>
      <canvas ref={ref} className="block h-[68px] w-full" />
      {chart.note ? <p className="mt-1 text-[9.5px] leading-relaxed text-slate-600">{chart.note}</p> : null}
    </div>
  );
}

function fmtTick(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
