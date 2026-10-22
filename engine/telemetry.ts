'use client';

/* ============================================================
   本地埋点（M2 · 任务 #18）

   设计约束（见 docs/specs/features/014-telemetry.spec.md）：
   1. **零网络**。默认不发请求，只落 localStorage；`flush(endpoint)` 才可选上报。
   2. **零 PII**。不记 URL、不记 UA、不记 IP；只有匿名 session id + 场景 id + 用户行为。
   3. **可测**。时间、存储、随机数全部可注入，不在模块顶层碰 `window`。
   4. **合并抖动**。拖动滑块会以 60 Hz 触发 onChange，若逐次记录，
      "调参次数"这个核心指标会瞬间破千而失去意义。按 (sceneId, key) 合并，
      只保留首尾值与原始更新次数：一次拖动 = 一条事件。
   ============================================================ */

export const TELEMETRY_STORAGE_KEY = 'phys3d.telemetry.v1';
export const TELEMETRY_DEFAULT_CAP = 800;
export const PARAM_DEBOUNCE_MS = 600;

export type TelemetryName = 'scene_view' | 'scene_exit' | 'param_change' | 'quiz_answer';

export type TelemetryEvent = {
  /** 会话内自增序号，1 起 */
  seq: number;
  name: TelemetryName;
  /** 毫秒时间戳 */
  at: number;
  /** 匿名会话 id（每次打开页面新生成） */
  session: string;
  sceneId: string | null;
  data: Record<string, unknown>;
};

/** 只依赖这三个方法，方便测试里塞内存实现 */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type TelemetryOptions = {
  storage?: StorageLike | null;
  /** 注入时间源，默认 Date.now */
  now?: () => number;
  /** 注入会话 id，默认随机 */
  session?: string;
  /** 环形上限，超出丢弃最旧的 */
  cap?: number;
  paramDebounceMs?: number;
  /** 事件落地后的回调（UI 订阅用） */
  onEvent?: (e: TelemetryEvent) => void;
};

export type ParamStats = {
  /** 发生过变化的参数 key → 事件条数（已合并拖动） */
  byKey: Record<string, number>;
  /** 不同参数的个数 */
  distinctKeys: number;
  /** 原始 onChange 次数之和（真正衡量"玩了多少下"） */
  rawUpdates: number;
};

export type TelemetryStats = {
  total: number;
  byName: Record<TelemetryName, number>;
  params: ParamStats;
  quiz: { answered: number; correct: number };
  /** 每个场景被打开的次数 */
  viewsByScene: Record<string, number>;
};

export type Telemetry = {
  track: (name: TelemetryName, sceneId: string | null, data?: Record<string, unknown>) => void;
  /** 合并同一 key 的连续拖动；一次拖动最终产出一条 param_change */
  trackParam: (sceneId: string, key: string, from: ParamValue, to: ParamValue) => void;
  trackQuiz: (sceneId: string, quizIndex: number, picked: number, answer: number) => void;
  /** 立刻结算所有挂起的 param_change（切页/卸载前调用） */
  flushPending: () => void;
  events: () => TelemetryEvent[];
  stats: () => TelemetryStats;
  toJson: () => string;
  toCsv: () => string;
  clear: () => void;
  subscribe: (fn: (e: TelemetryEvent) => void) => () => void;
};

export type ParamValue = number | boolean | string;

/* ------------------------------------------------------------
   工具
   ------------------------------------------------------------ */

const EMPTY_BY_NAME = (): Record<TelemetryName, number> => ({
  scene_view: 0,
  scene_exit: 0,
  param_change: 0,
  quiz_answer: 0,
});

function randomSession(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

/** localStorage 可能在隐私模式/沙箱里抛异常，统一降级成 null */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__phys3d_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function csvCell(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v) ?? '';
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ------------------------------------------------------------
   工厂
   ------------------------------------------------------------ */

export function createTelemetry(opts: TelemetryOptions = {}): Telemetry {
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  const now = opts.now ?? (() => Date.now());
  const session = opts.session ?? randomSession();
  const cap = Math.max(1, opts.cap ?? TELEMETRY_DEFAULT_CAP);
  const debounceMs = Math.max(0, opts.paramDebounceMs ?? PARAM_DEBOUNCE_MS);

  let seq = 0;
  let list: TelemetryEvent[] = [];
  const listeners = new Set<(e: TelemetryEvent) => void>();

  /**
   * 挂起的拖动。map 的 key 是 `sceneId::paramKey`（同名参数在不同场景要分开），
   * 但落库时只写裸的 paramKey —— 场景已经记在 event.sceneId 上了。
   */
  type Pending = {
    paramKey: string;
    first: ParamValue;
    last: ParamValue;
    n: number;
    sceneId: string;
    timer: ReturnType<typeof setTimeout> | null;
  };
  const pending = new Map<string, Pending>();

  /* ---- 持久化 ---- */
  function persist() {
    if (!storage) return;
    try {
      storage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* 配额满了就放弃持久化，内存里仍然可用 */
    }
  }

  function load() {
    if (!storage) return;
    try {
      const raw = storage.getItem(TELEMETRY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      list = parsed.filter(
        (e): e is TelemetryEvent =>
          !!e && typeof e === 'object' && typeof (e as TelemetryEvent).name === 'string'
      );
      // 续上序号，避免同一次会话内 seq 重复
      seq = list.reduce((m, e) => Math.max(m, typeof e.seq === 'number' ? e.seq : 0), 0);
    } catch {
      list = [];
    }
  }

  load();

  /* ---- 写入 ---- */
  function push(name: TelemetryName, sceneId: string | null, data: Record<string, unknown>) {
    const e: TelemetryEvent = { seq: ++seq, name, at: now(), session, sceneId, data };
    list.push(e);
    if (list.length > cap) list = list.slice(list.length - cap);
    persist();
    opts.onEvent?.(e);
    for (const fn of listeners) fn(e);
    return e;
  }

  function settle(key: string) {
    const p = pending.get(key);
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    pending.delete(key);
    push('param_change', p.sceneId, { key: p.paramKey, from: p.first, to: p.last, n: p.n });
  }

  function flushPending() {
    for (const key of [...pending.keys()]) settle(key);
  }

  /* ---- 公开 API ---- */
  const api: Telemetry = {
    track(name, sceneId, data = {}) {
      push(name, sceneId, data);
    },

    trackParam(sceneId, key, from, to) {
      const k = `${sceneId}::${key}`;
      const cur = pending.get(k);
      if (cur) {
        cur.last = to;
        cur.n += 1;
        if (cur.timer) clearTimeout(cur.timer);
        cur.timer = setTimeout(() => settle(k), debounceMs);
        return;
      }
      const p: Pending = { paramKey: key, first: from, last: to, n: 1, sceneId, timer: null };
      p.timer = setTimeout(() => settle(k), debounceMs);
      pending.set(k, p);
    },

    trackQuiz(sceneId, quizIndex, picked, answer) {
      // 作答先结算挂起的拖动，保证事件顺序符合直觉
      flushPending();
      push('quiz_answer', sceneId, {
        quiz: quizIndex,
        picked,
        answer,
        correct: picked === answer,
      });
    },

    flushPending,

    events() {
      return list.map((e) => ({ ...e, data: { ...e.data } }));
    },

    stats() {
      flushPending();
      const byName = EMPTY_BY_NAME();
      const byKey: Record<string, number> = {};
      const viewsByScene: Record<string, number> = {};
      let rawUpdates = 0;
      let answered = 0;
      let correct = 0;

      for (const e of list) {
        if (e.name in byName) byName[e.name] += 1;
        if (e.name === 'scene_view' && e.sceneId) {
          viewsByScene[e.sceneId] = (viewsByScene[e.sceneId] ?? 0) + 1;
        }
        if (e.name === 'param_change') {
          const key = String(e.data.key ?? '?');
          byKey[key] = (byKey[key] ?? 0) + 1;
          rawUpdates += typeof e.data.n === 'number' ? e.data.n : 1;
        }
        if (e.name === 'quiz_answer') {
          answered += 1;
          if (e.data.correct === true) correct += 1;
        }
      }

      return {
        total: list.length,
        byName,
        params: { byKey, distinctKeys: Object.keys(byKey).length, rawUpdates },
        quiz: { answered, correct },
        viewsByScene,
      };
    },

    toJson() {
      flushPending();
      return JSON.stringify({ version: 1, session, events: list }, null, 2);
    },

    toCsv() {
      flushPending();
      const head = 'seq,at,iso,name,session,sceneId,data';
      const rows = list.map((e) =>
        [
          e.seq,
          e.at,
          new Date(e.at).toISOString(),
          e.name,
          e.session,
          e.sceneId ?? '',
          JSON.stringify(e.data),
        ]
          .map(csvCell)
          .join(',')
      );
      return [head, ...rows].join('\n');
    },

    clear() {
      for (const p of pending.values()) if (p.timer) clearTimeout(p.timer);
      pending.clear();
      list = [];
      seq = 0;
      if (storage) {
        try {
          storage.removeItem(TELEMETRY_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  return api;
}

/* ------------------------------------------------------------
   单例
   ------------------------------------------------------------ */

let singleton: Telemetry | null = null;

/**
 * 埋点默认关闭：
 *  - 服务端渲染阶段（没有 window）
 *  - 离线单文件导出（页面里注入 window.__NO_TELEMETRY__）
 * 这两种情况下返回一个空实现，调用方不必到处写 if。
 */
export function telemetryEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return !(window as { __NO_TELEMETRY__?: boolean }).__NO_TELEMETRY__;
}

function noopTelemetry(): Telemetry {
  const stats: TelemetryStats = {
    total: 0,
    byName: EMPTY_BY_NAME(),
    params: { byKey: {}, distinctKeys: 0, rawUpdates: 0 },
    quiz: { answered: 0, correct: 0 },
    viewsByScene: {},
  };
  return {
    track: () => {},
    trackParam: () => {},
    trackQuiz: () => {},
    flushPending: () => {},
    events: () => [],
    stats: () => stats,
    toJson: () => JSON.stringify({ version: 1, session: 'disabled', events: [] }),
    toCsv: () => 'seq,at,iso,name,session,sceneId,data',
    clear: () => {},
    subscribe: () => () => {},
  };
}

export function getTelemetry(): Telemetry {
  if (!telemetryEnabled()) return noopTelemetry();
  if (!singleton) singleton = createTelemetry();
  return singleton;
}
