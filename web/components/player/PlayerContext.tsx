'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { SceneSpec, SceneState } from '@/engine/spec';
import { emptyState } from '@/engine/spec';
import { createPlayerStore, type PlayerStoreApi } from '@/engine/store';
import { getTelemetry } from '@/engine/telemetry';
import type { StateRef } from '@/components/scene/objects';

type Ctx = { spec: SceneSpec; store: PlayerStoreApi; stateRef: StateRef };

const PlayerCtx = createContext<Ctx | null>(null);

/**
 * 播放器作用域
 *
 * 把 store 提到 page 层，是为了让「预测→验证」练习（QuizCard）能直接改参数、
 * 驱动 3D 场景——这是 POE 教学法能闭环的前提。
 * 同时只有这一小块是 client island，其余内容仍是 Server Component。
 */
export function PlayerProvider({ spec, children }: { spec: SceneSpec; children: ReactNode }) {
  const store = useMemo(() => createPlayerStore(spec), [spec.meta.id]);
  const stateRef = useRef<SceneState>(emptyState()) as StateRef;
  const value = useMemo(() => ({ spec, store, stateRef }), [spec, store]);

  /* 场景打开 / 离开（埋点只落本地，不发网络；离线导出页已注入开关自动关闭） */
  useEffect(() => {
    const tel = getTelemetry();
    const enteredAt = Date.now();
    tel.track('scene_view', spec.meta.id, { title: spec.meta.title });
    return () => {
      // 离开前把还没结算的参数拖动写掉，否则最后一次调参会丢
      tel.flushPending();
      tel.track('scene_exit', spec.meta.id, { dwellMs: Date.now() - enteredAt });
    };
  }, [spec.meta.id, spec.meta.title]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayer(): Ctx {
  const ctx = useContext(PlayerCtx);
  if (!ctx) throw new Error('usePlayer 必须在 <PlayerProvider> 内使用');
  return ctx;
}
