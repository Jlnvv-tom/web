/**
 * 播放器 store 语义测试
 *
 * 这里测的不是 UI，而是"调参之后时间轴该怎么动"这条容易被改坏的规则：
 *   - 用户点「验证」→ 回到 t=0 重新播放（否则看到的是旧参数下的残影）
 *   - 讲解脚本自动应用参数 → **不**重置时间轴（否则会打断正在播的旁白）
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayerStore } from '@/engine/store';
import { SCENES } from '@/content/scenes';

const spec = SCENES[0]!;

let store: ReturnType<typeof createPlayerStore>;

beforeEach(() => {
  store = createPlayerStore(spec);
});

describe('player store', () => {
  it('初始参数为默认值，播放中、时间为 0', () => {
    const s = store.getState();
    expect(s.params).toEqual(Object.fromEntries(spec.params.map((p) => [p.key, p.default])));
    expect(s.playing).toBe(true);
    expect(s.time).toBe(0);
    expect(s.stepIndex).toBe(-1);
  });

  it('用户调参 → 时间轴回到起点（applyParams 语义）', () => {
    store.getState().pushTime(12);
    store.getState().setPlaying(false);
    store.getState().applyParams({ [spec.params[0]!.key]: 3 });

    const s = store.getState();
    expect(s.time).toBe(0);
    expect(s.seekRequest).toBe(0);
    expect(s.stepIndex).toBe(-1);
    expect(s.params[spec.params[0]!.key]).toBe(3);
  });

  it('滑块 setParam 也会重置时间轴', () => {
    store.getState().pushTime(9);
    store.getState().setParam(spec.params[0]!.key, 2);
    expect(store.getState().seekRequest).toBe(0);
    expect(store.getState().time).toBe(0);
  });

  it('讲解脚本应用参数不打断播放', () => {
    store.getState().pushTime(20);
    store.getState().setStepIndex(2);
    store.getState().applyScriptParams({ [spec.params[0]!.key]: 1 });

    const s = store.getState();
    expect(s.time).toBe(20);
    expect(s.stepIndex).toBe(2);
    expect(s.params[spec.params[0]!.key]).toBe(1);
  });

  it('seek 只消费一次', () => {
    store.getState().requestSeek(7);
    expect(store.getState().consumeSeek()).toBe(7);
    expect(store.getState().consumeSeek()).toBeNull();
  });

  it('resetParams 恢复默认并回到起点', () => {
    const k = spec.params[0]!.key;
    store.getState().setParam(k, 2);
    store.getState().pushTime(30);
    store.getState().resetParams();
    const s = store.getState();
    expect(s.params[k]).toBe(spec.params[0]!.type === 'slider' ? spec.params[0]!.default : undefined);
    expect(s.time).toBe(0);
  });

  it('播放控制开关与倍速', () => {
    store.getState().togglePlaying();
    expect(store.getState().playing).toBe(false);
    store.getState().togglePlaying();
    expect(store.getState().playing).toBe(true);
    store.getState().setSpeed(2);
    expect(store.getState().speed).toBe(2);
  });

  it('HUD 快照被整体替换（不做深合并，避免脏读数残留）', () => {
    store.getState().pushHud({ scalars: { a: 1 }, meta: {}, series: {} });
    store.getState().pushHud({ scalars: { b: 2 }, meta: {}, series: {} });
    expect(store.getState().hud.scalars).toEqual({ b: 2 });
  });
});
