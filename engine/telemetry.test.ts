import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTelemetry,
  getTelemetry,
  telemetryEnabled,
  TELEMETRY_STORAGE_KEY,
  type StorageLike,
} from './telemetry';

/* ------------------------------------------------------------
   测试用内存 storage
   ------------------------------------------------------------ */
function memStorage(seed?: string): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(TELEMETRY_STORAGE_KEY, seed);
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** 可复现的时间源 */
function clock(start = 1_700_000_000_000) {
  let t = start;
  return () => (t += 1000);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('埋点 · 基础写入', () => {
  it('track 入队，seq 从 1 递增，同一会话共享 session', () => {
    const tel = createTelemetry({ storage: null, now: clock(), session: 's1' });
    tel.track('scene_view', 'shm');
    tel.track('scene_view', 'orbit');

    const ev = tel.events();
    expect(ev.map((e) => e.seq)).toEqual([1, 2]);
    expect(ev.every((e) => e.session === 's1')).toBe(true);
    expect(ev.map((e) => e.sceneId)).toEqual(['shm', 'orbit']);
  });

  it('events() 返回副本，外部改动不影响内部状态', () => {
    const tel = createTelemetry({ storage: null, now: clock() });
    tel.track('scene_view', 'shm', { a: 1 });
    const ev = tel.events();
    ev[0]!.data.a = 999;
    ev.push({} as never);
    expect(tel.events()).toHaveLength(1);
    expect(tel.events()[0]!.data.a).toBe(1);
  });

  it('scene_exit 带上停留时长这类自定义字段', () => {
    const tel = createTelemetry({ storage: null, now: clock() });
    tel.track('scene_view', 'lever');
    tel.track('scene_exit', 'lever', { dwellMs: 12345 });
    expect(tel.events()[1]!.data).toEqual({ dwellMs: 12345 });
  });
});

describe('埋点 · 持久化', () => {
  it('落盘后重建能恢复，并且 seq 从旧的最大值续上', () => {
    const storage = memStorage();
    const a = createTelemetry({ storage, now: clock(), session: 's1' });
    a.track('scene_view', 'shm');
    a.track('scene_view', 'orbit');

    const b = createTelemetry({ storage, now: clock(), session: 's2' });
    expect(b.events()).toHaveLength(2);
    b.track('scene_view', 'wave');
    expect(b.events().map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('超过 cap 时丢弃最旧的，只保留最新的 cap 条', () => {
    const tel = createTelemetry({ storage: memStorage(), now: clock(), cap: 3 });
    for (const id of ['a', 'b', 'c', 'd', 'e']) tel.track('scene_view', id);
    const ev = tel.events();
    expect(ev).toHaveLength(3);
    expect(ev.map((e) => e.sceneId)).toEqual(['c', 'd', 'e']);
    expect(ev.map((e) => e.seq)).toEqual([3, 4, 5]);
  });

  it('存储里是坏 JSON 时重置为空而不是抛错', () => {
    const tel = createTelemetry({ storage: memStorage('{not json'), now: clock() });
    expect(tel.events()).toEqual([]);
    tel.track('scene_view', 'shm');
    expect(tel.events()).toHaveLength(1);
  });

  it('存储写满抛异常时降级为纯内存，不中断使用', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    const tel = createTelemetry({ storage, now: clock() });
    expect(() => tel.track('scene_view', 'shm')).not.toThrow();
    expect(tel.events()).toHaveLength(1);
    expect(() => tel.clear()).not.toThrow();
  });
});

describe('埋点 · param_change 合并', () => {
  it('同一参数连续拖动只产出一条事件，保留首尾值与原始次数', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 600 });
    for (const v of [10, 20, 30, 40, 50]) tel.trackParam('shm', 'L', v === 10 ? 0 : 10, v);

    expect(tel.events()).toHaveLength(0); // 还在防抖窗口内
    vi.advanceTimersByTime(600);

    const ev = tel.events();
    expect(ev).toHaveLength(1);
    expect(ev[0]!.name).toBe('param_change');
    expect(ev[0]!.data).toEqual({ key: 'L', from: 0, to: 50, n: 5 });
  });

  it('不同参数互不合并', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 100 });
    tel.trackParam('shm', 'L', 0, 1);
    tel.trackParam('shm', 'g', 9.8, 10);
    vi.advanceTimersByTime(100);
    expect(tel.events()).toHaveLength(2);
    expect(tel.events().map((e) => e.data.key)).toEqual(['L', 'g']);
  });

  it('不同场景的同名参数互不合并', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 100 });
    tel.trackParam('shm', 'L', 0, 1);
    tel.trackParam('lever', 'L', 0, 2);
    vi.advanceTimersByTime(100);
    const ev = tel.events();
    expect(ev).toHaveLength(2);
    expect(ev.map((e) => e.sceneId)).toEqual(['shm', 'lever']);
  });

  it('拖动过程中每次触发都会重置计时器（不会中途落盘）', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 100 });
    tel.trackParam('shm', 'L', 0, 1);
    vi.advanceTimersByTime(80);
    tel.trackParam('shm', 'L', 1, 2);
    vi.advanceTimersByTime(80);
    expect(tel.events()).toHaveLength(0);
    vi.advanceTimersByTime(20);
    expect(tel.events()).toHaveLength(1);
    expect(tel.events()[0]!.data.n).toBe(2);
  });

  it('flushPending 立即结算挂起的拖动', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 5000 });
    tel.trackParam('buoyancy', 'rhoB', 600, 900);
    expect(tel.events()).toHaveLength(0);
    tel.flushPending();
    expect(tel.events()).toHaveLength(1);
    // 再 flush 一次不应重复产出
    tel.flushPending();
    expect(tel.events()).toHaveLength(1);
  });

  it('布尔与字符串参数也能记录', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 10 });
    tel.trackParam('shm', 'mode', 'pendulum', 'spring');
    tel.trackParam('shm', 'showGhost', true, false);
    vi.advanceTimersByTime(10);
    expect(tel.events().map((e) => e.data.to)).toEqual(['spring', false]);
  });
});

describe('埋点 · quiz_answer', () => {
  it('作答时先结算挂起的拖动，保证事件顺序符合直觉', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 5000, session: 's' });
    tel.trackParam('lever', 'm2', 4, 8);
    tel.trackQuiz('lever', 0, 2, 1);

    const ev = tel.events();
    expect(ev.map((e) => e.name)).toEqual(['param_change', 'quiz_answer']);
    expect(ev[1]!.data).toMatchObject({ quiz: 0, picked: 2, correct: false });
  });

  it('答对时 correct 为 true', () => {
    const tel = createTelemetry({ storage: null, now: clock() });
    tel.trackQuiz('lever', 1, 3, 3);
    expect(tel.events()[0]!.data.correct).toBe(true);
  });
});

describe('埋点 · 汇总统计', () => {
  it('stats 给出调参次数、涉及参数个数、作答正确率、各场景打开次数', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 10 });

    tel.track('scene_view', 'shm');
    tel.track('scene_view', 'shm');
    tel.track('scene_view', 'lever');

    tel.trackParam('shm', 'L', 0, 1);
    tel.trackParam('shm', 'L', 1, 2); // 同一 key，合并
    vi.advanceTimersByTime(10);

    tel.trackParam('shm', 'g', 9.8, 10);
    vi.advanceTimersByTime(10);

    tel.trackQuiz('shm', 0, 1, 1);
    tel.trackQuiz('shm', 1, 0, 2);

    const s = tel.stats();
    expect(s.byName.scene_view).toBe(3);
    expect(s.byName.param_change).toBe(2);
    expect(s.params.byKey).toEqual({ L: 1, g: 1 });
    expect(s.params.distinctKeys).toBe(2);
    expect(s.params.rawUpdates).toBe(3);
    expect(s.quiz).toEqual({ answered: 2, correct: 1 });
    expect(s.viewsByScene).toEqual({ shm: 2, lever: 1 });
    expect(s.total).toBe(7);
  });

  it('空队列的 stats 结构完整（UI 首次渲染不炸）', () => {
    const tel = createTelemetry({ storage: null, now: clock() });
    const s = tel.stats();
    expect(s.total).toBe(0);
    expect(s.params).toEqual({ byKey: {}, distinctKeys: 0, rawUpdates: 0 });
    expect(s.byName.scene_exit).toBe(0);
  });
});

describe('埋点 · 导出', () => {
  it('toJson 带上版本号与 session，且是合法 JSON', () => {
    const tel = createTelemetry({ storage: null, now: clock(), session: 'abc12345' });
    tel.track('scene_view', 'wave');
    const obj = JSON.parse(tel.toJson());
    expect(obj.version).toBe(1);
    expect(obj.session).toBe('abc12345');
    expect(obj.events).toHaveLength(1);
  });

  it('toCsv 有表头，且含逗号/引号/换行的字段被正确转义', () => {
    const tel = createTelemetry({ storage: null, now: clock(), session: 's' });
    tel.track('scene_view', 'wave', { note: 'a,b"c\nd' });
    const csv = tel.toCsv();
    const lines = csv.split('\n');
    expect(lines[0]).toBe('seq,at,iso,name,session,sceneId,data');
    // 转义后字段内不再有裸换行，整表行数 = 表头 + 1
    expect(lines).toHaveLength(2);
    expect(csv).toContain('""');
  });

  it('导出前会先结算挂起的拖动', () => {
    const tel = createTelemetry({ storage: null, now: clock(), paramDebounceMs: 9999 });
    tel.trackParam('wave', 'A', 0.1, 0.3);
    expect(JSON.parse(tel.toJson()).events).toHaveLength(1);
    expect(tel.toCsv().split('\n')).toHaveLength(2);
  });
});

describe('埋点 · 清理与订阅', () => {
  it('clear 清空内存、挂起队列与存储', () => {
    const storage = memStorage();
    const tel = createTelemetry({ storage, now: clock(), paramDebounceMs: 9999 });
    tel.track('scene_view', 'shm');
    tel.trackParam('shm', 'L', 0, 1);

    tel.clear();
    expect(tel.events()).toEqual([]);
    expect(storage.getItem(TELEMETRY_STORAGE_KEY)).toBeNull();
    // 挂起的拖动不会被延迟写回
    vi.advanceTimersByTime(9999);
    expect(tel.events()).toEqual([]);
  });

  it('clear 之后 seq 从 1 重新开始', () => {
    const tel = createTelemetry({ storage: null, now: clock() });
    tel.track('scene_view', 'a');
    tel.track('scene_view', 'b');
    tel.clear();
    tel.track('scene_view', 'c');
    expect(tel.events()[0]!.seq).toBe(1);
  });

  it('subscribe 能收到新事件，退订后不再收到', () => {
    const tel = createTelemetry({ storage: null, now: clock() });
    const seen: string[] = [];
    const off = tel.subscribe((e) => seen.push(e.name));
    tel.track('scene_view', 'shm');
    off();
    tel.track('scene_view', 'orbit');
    expect(seen).toEqual(['scene_view']);
  });

  it('onEvent 选项与 subscribe 同时生效', () => {
    const seen: string[] = [];
    const tel = createTelemetry({
      storage: null,
      now: clock(),
      onEvent: (e) => seen.push(`opt:${e.name}`),
    });
    tel.subscribe((e) => seen.push(`sub:${e.name}`));
    tel.track('quiz_answer', 'shm', { correct: true });
    expect(seen).toEqual(['opt:quiz_answer', 'sub:quiz_answer']);
  });
});

describe('埋点 · 关闭开关', () => {
  it('没有 window（服务端）时 telemetryEnabled 为 false', () => {
    expect(telemetryEnabled()).toBe(false);
  });

  it('离线导出页注入 __NO_TELEMETRY__ 后关闭', () => {
    vi.stubGlobal('window', { __NO_TELEMETRY__: true });
    expect(telemetryEnabled()).toBe(false);
  });

  it('正常浏览器环境开启', () => {
    vi.stubGlobal('window', {});
    expect(telemetryEnabled()).toBe(true);
  });

  it('关闭时 getTelemetry 返回空实现，所有方法都可安全调用', () => {
    vi.stubGlobal('window', { __NO_TELEMETRY__: true });
    const tel = getTelemetry();
    expect(() => {
      tel.track('scene_view', 'shm');
      tel.trackParam('shm', 'L', 0, 1);
      tel.trackQuiz('shm', 0, 1, 1);
      tel.flushPending();
      tel.clear();
    }).not.toThrow();
    expect(tel.events()).toEqual([]);
    expect(tel.stats().total).toBe(0);
    expect(tel.toCsv().split('\n')).toHaveLength(1);
  });
});
