'use client';

import { create } from 'zustand';
import type { ParamValues, SceneSpec } from '@/engine/spec';
import { defaultParams } from '@/engine/spec';

export type HudSnapshot = {
  scalars: Record<string, number>;
  meta: Record<string, number | string | boolean>;
  series: Record<string, number[]>;
};

type PlayerStore = {
  /** 参数（用户可调） */
  params: ParamValues;
  /**
   * 用户改参数的脉冲计数（M3 · W3）。
   *
   * 只给**装饰层**用：滑块一动，主角物体做一次挤压回弹，让"我改的东西生效了"
   * 有触感。它不进入求解器、不参与任何物理量——`sample(t)` 里拿不到它。
   * 用计数器而不是布尔量，是因为连续拖动需要"每次都触发"，而不是"一直为真"。
   */
  paramPulse: { n: number; key: string | null };
  setParam: (key: string, value: number | boolean | string) => void;
  /** 用户点击"验证"时应用参数：重置时间轴 */
  applyParams: (patch: ParamValues) => void;
  /** 讲解脚本自动应用参数：**不**重置时间轴（否则会打断播放） */
  applyScriptParams: (patch: ParamValues) => void;
  resetParams: () => void;

  /** 播放控制 */
  playing: boolean;
  speed: number;
  /** UI 可见的播放头（由 3D 循环以 ~20Hz 推送，避免 60fps 重渲染） */
  time: number;
  setPlaying: (v: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (v: number) => void;
  pushTime: (t: number) => void;
  /** 请求跳转（3D 循环消费后清空） */
  seekRequest: number | null;
  requestSeek: (t: number) => void;
  consumeSeek: () => number | null;

  /** 讲解步骤索引（-1 表示不在任何一步） */
  stepIndex: number;
  setStepIndex: (i: number) => void;
  /** 暂停在脚本步骤上等待用户继续 */
  waiting: boolean;
  setWaiting: (v: boolean) => void;

  /** 交互 */
  selectedId: string | null;
  select: (id: string | null) => void;
  labelsVisible: boolean;
  toggleLabels: () => void;
  showGhost: boolean;
  toggleGhost: () => void;
  hud: HudSnapshot;
  pushHud: (h: HudSnapshot) => void;
};

export const createPlayerStore = (spec: SceneSpec) =>
  create<PlayerStore>((set, get) => ({
    params: defaultParams(spec.params),
    paramPulse: { n: 0, key: null },
    /**
     * 改参数（M3.5 · W4.1）
     *
     * **不再把时间轴打回 0。** 旧实现每次 input 事件都写 `seekRequest: 0`，
     * 于是拖滑块的过程中画面被反复按回 t=0：抛体/洛伦兹/波动这些场景
     * 的核心信息全在轨迹上，而 trail 是 `sample(0..t)` 采出来的——
     * t 恒为 0 就等于"拖滑块时轨迹永远是空的"。
     * 学生看到的不是"v₀ 变大→射程变远"，而是"同一颗球在起点抖"。
     * 这与 Go/No-Go 第 2 条（平均调参 ≥3）直接冲突：不是不愿调，是调了没反馈。
     *
     * 现在保持当前时刻，用新参数在**同一时刻**重算：轨迹形状、矢量长度、
     * 读数立刻跟着变；"从头看"交给播放器的重播按钮。
     */
    setParam: (key, value) =>
      set((s) => ({
        params: { ...s.params, [key]: value },
        paramPulse: { n: s.paramPulse.n + 1, key },
      })),
    applyParams: (patch) =>
      set((s) => ({
        params: { ...s.params, ...patch },
        time: 0,
        seekRequest: 0,
        stepIndex: -1,
        waiting: false,
      })),
    applyScriptParams: (patch) =>
      set((s) => ({ params: { ...s.params, ...patch } })),
    resetParams: () =>
      set({
        params: defaultParams(spec.params),
        time: 0,
        seekRequest: 0,
        stepIndex: -1,
        waiting: false,
      }),

    playing: true,
    speed: 1,
    time: 0,
    setPlaying: (v) => set({ playing: v }),
    togglePlaying: () => set((s) => ({ playing: !s.playing })),
    setSpeed: (v) => set({ speed: v }),
    pushTime: (t) => set({ time: t }),
    seekRequest: null,
    requestSeek: (t) => set({ seekRequest: t, time: t, waiting: false }),
    consumeSeek: () => {
      const v = get().seekRequest;
      if (v !== null) set({ seekRequest: null });
      return v;
    },

    stepIndex: -1,
    setStepIndex: (i) => set({ stepIndex: i }),
    waiting: false,
    setWaiting: (v) => set({ waiting: v }),

    selectedId: null,
    select: (id) => set({ selectedId: id }),
    labelsVisible: true,
    toggleLabels: () => set((s) => ({ labelsVisible: !s.labelsVisible })),
    showGhost: true,
    toggleGhost: () => set((s) => ({ showGhost: !s.showGhost })),
    hud: { scalars: {}, meta: {}, series: {} },
    pushHud: (h) => set({ hud: h }),
  }));

export type PlayerStoreApi = ReturnType<typeof createPlayerStore>;
