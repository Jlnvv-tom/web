'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import type { SceneSummary } from '@/content/scenes';

export type SearchItem = {
  kind: 'scene' | 'point';
  title: string;
  sub: string;
  href?: string;
  tags: string[];
  stage: 'junior' | 'senior';
};

export function SearchClient({ items }: { items: SearchItem[] }) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<'all' | 'junior' | 'senior'>('all');

  const results = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((it) => {
      if (stage !== 'all' && it.stage !== stage) return false;
      if (!kw) return true;
      return (
        it.title.toLowerCase().includes(kw) ||
        it.sub.toLowerCase().includes(kw) ||
        it.tags.some((t) => t.toLowerCase().includes(kw))
      );
    });
  }, [items, q, stage]);

  const sceneHits = results.filter((r) => r.kind === 'scene');
  const pointHits = results.filter((r) => r.kind === 'point');

  return (
    <div>
      <div className="panel mb-4 flex items-center gap-2 px-3 py-2">
        <Search size={14} className="shrink-0 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索知识点、章节或关键词，例如「洛伦兹力」「抛体」「透镜」"
          className="w-full bg-transparent text-[12.5px] text-slate-100 outline-none placeholder:text-slate-600"
          autoFocus
        />
        {q ? (
          <button onClick={() => setQ('')} className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300">
            清空
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['all', '全部'],
            ['junior', '初中'],
            ['senior', '高中'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setStage(k)}
            className={`rounded-full border px-3 py-1 text-[11px] transition ${
              stage === k
                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-200'
                : 'border-white/10 text-slate-500 hover:border-white/25'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto self-center text-[10.5px] text-slate-600">
          {results.length} 条结果
        </span>
      </div>

      {sceneHits.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.16em] text-slate-400">
            <Sparkles size={11} className="text-cyan-400" />
            可用 3D 场景
          </h2>
          <div className="space-y-1.5">
            {sceneHits.map((r) => (
              <Link
                key={r.href}
                href={r.href!}
                className="panel flex items-center gap-3 px-3.5 py-2.5 transition hover:border-cyan-400/35"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-slate-100">{r.title}</div>
                  <div className="truncate text-[10.5px] text-slate-600">{r.sub}</div>
                </div>
                <span className="shrink-0 rounded-full bg-cyan-400/12 px-2 py-[2px] text-[9.5px] text-cyan-300">
                  打开
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {pointHits.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-slate-400">
            知识点（规划中）
          </h2>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {pointHits.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/6 px-3 py-2">
                <span className="text-[11.5px] text-slate-400">{r.title}</span>
                <span className="ml-auto shrink-0 text-[9.5px] text-slate-700">{r.sub}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {results.length === 0 ? (
        <p className="py-12 text-center text-[12px] text-slate-600">
          没有找到匹配的内容。试试「洛伦兹力」「抛体」「透镜」。
        </p>
      ) : null}
    </div>
  );
}
