'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Crosshair, Eye, EyeOff, Tag } from 'lucide-react';
import type { ObjectDef } from '@/engine/spec';
import { ParamPanel } from './ParamPanel';
import { Hud } from './Hud';
import { Transport } from './Transport';
import { usePlayer } from './PlayerContext';

const SceneCanvas = dynamic(
  () => import('@/components/scene/SceneCanvas').then((m) => m.SceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-700/25 border-t-cyan-400" />
          <span className="text-[11px] text-stone-600">正在编译三维场景…</span>
        </div>
      </div>
    ),
  }
);

export function ScenePlayer() {
  const { spec, store, stateRef } = usePlayer();

  const selectedId = store((s) => s.selectedId);
  const labelsVisible = store((s) => s.labelsVisible);
  const select = store((s) => s.select);
  const toggleLabels = store((s) => s.toggleLabels);

  /* 键盘快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const st = store.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        st.togglePlaying();
      } else if (e.code === 'ArrowRight') {
        st.requestSeek(st.time + 1);
      } else if (e.code === 'ArrowLeft') {
        st.requestSeek(Math.max(st.time - 1, 0));
      } else if (e.code === 'Escape') {
        st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const selectedObj = selectedId ? spec.objects.find((o) => o.id === selectedId) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_312px]">
      <div className="min-w-0 space-y-3">
        <div className="panel relative h-[380px] overflow-hidden sm:h-[460px] lg:h-[540px]">
          <SceneCanvas spec={spec} store={store} stateRef={stateRef} />

          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
            <span className="chip !text-[10px]">
              {spec.meta.dimension === '3d' ? '真 3D' : spec.meta.dimension === '2d' ? '2D 交互' : '2.5D'}
            </span>
            <span className="rounded-full border border-stone-900/14 bg-white/85 px-2 py-[3px] text-[10px] text-stone-600 backdrop-blur">
              左键旋转 · 滚轮缩放 · 右键平移
            </span>
          </div>

          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              onClick={toggleLabels}
              title={labelsVisible ? '隐藏对象标注' : '显示对象标注'}
              className={`grid h-7 w-7 place-items-center rounded-lg border backdrop-blur transition ${
                labelsVisible
                  ? 'border-cyan-700/40 bg-cyan-600/12 text-cyan-800'
                  : 'border-stone-900/14 bg-white/85 text-stone-600 hover:text-stone-700'
              }`}
            >
              <Tag size={13} />
            </button>
          </div>

          {selectedObj ? (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 rounded-xl border border-cyan-700/25 bg-white/92 px-3 py-2 backdrop-blur">
              <div className="flex min-w-0 items-center gap-2">
                <Crosshair size={13} className="shrink-0 text-cyan-700" />
                <span className="truncate text-[11.5px] text-stone-800">{labelOf(selectedObj)}</span>
              </div>
              <button
                onClick={() => select(null)}
                className="shrink-0 text-[10px] text-stone-600 transition hover:text-cyan-800"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-stone-500">
              <span className="inline-flex items-center gap-1">
                {labelsVisible ? <Eye size={10} /> : <EyeOff size={10} />}
                点击画面中的对象可高亮查看
              </span>
            </div>
          )}
        </div>

        <Transport spec={spec} store={store} />
      </div>

      <div className="space-y-3">
        <ParamPanel spec={spec} store={store} />
        <Hud readouts={spec.hud.readouts} charts={spec.hud.charts} store={store} />
      </div>
    </div>
  );
}

function labelOf(o: ObjectDef): string {
  switch (o.type) {
    case 'vector':
      return o.label ?? `矢量 ${o.bind}`;
    case 'trail':
      return '运动轨迹';
    case 'lens':
      return '凸透镜';
    case 'plane':
      return '光屏 / 平面';
    case 'disc':
      return '参考圆';
    case 'text':
      return o.text;
    case 'arrowLine':
      return o.label ?? '物 / 像';
    case 'particle':
      return '质点';
    default:
      return o.id;
  }
}
