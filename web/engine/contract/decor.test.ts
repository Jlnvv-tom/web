/**
 * 装饰层契约（M3 · W3 / 宪法第一条、第五条）
 *
 * 这一层存在的唯一目的：**证明"趣味"和"物理"是分开的。**
 *
 * W3 加了 hover 抬升、点击回弹、拖滑块挤压——这些都是"手感"。
 * 手感一旦渗进求解器，`sample(t)` 就不再是纯函数，时间轴拖拽与参数复现
 * 会同时坏掉。所以这里用一条硬断言钉死：**把 `decor` 整个删掉，
 * `sample(t)` 的输出必须逐值完全相同。**
 */
import { describe, expect, it } from 'vitest';
import { SCENES } from '@/content/scenes';
import { defaultParams, sceneDuration } from '@/engine/spec';
import type { SceneSpec } from '@/engine/spec';
import { solveAt } from '@/engine/solvers';
import { createPlayerStore } from '@/engine/store';

const AT = (spec: SceneSpec) => {
  const dur = sceneDuration(spec);
  return [0, dur * 0.25, dur * 0.5, dur * 0.83, dur];
};

/** 把状态压成可比较的纯数据（点/矢量/标量/元信息） */
function digest(spec: SceneSpec) {
  const params = defaultParams(spec.params);
  return AT(spec).map((t) => {
    // 注意签名是 (spec, params, t) —— 顺序写反会让两边都算成垃圾值而"假通过"
    const s = solveAt(spec, params, t);
    return {
      t: s.t,
      points: s.points,
      vectors: s.vectors,
      scalars: s.scalars,
      meta: s.meta,
    };
  });
}

const withDecor = SCENES.filter((s) => s.decor);
const withIntro = SCENES.filter((s) => s.decor?.intro);

const INTRO_KINDS = ['trail-bloom', 'wipe-in', 'light-up', 'splash', 'assemble'] as const;

describe('装饰层 · 不污染物理', () => {
  it('至少有一个场景声明了 decor（否则这条测试是空跑）', () => {
    expect(withDecor.length).toBeGreaterThan(0);
  });

  for (const spec of withDecor) {
    describe(spec.meta.id, () => {
      it('删掉 decor 后 sample() 输出逐值相同（REQ-W3-001）', () => {
        const without: SceneSpec = { ...spec };
        delete (without as { decor?: unknown }).decor;

        expect(digest(without)).toEqual(digest(spec));
      });

      it('subject 指向的对象真实存在（防止改名后留下孤儿引用）', () => {
        // 只声明 intro 的 decor 没有主角（wipe-in / light-up 不需要）——
        // W4 起 subject 是可选字段，存在性只在声明了时才断言
        const subject = spec.decor!.subject;
        if (subject === undefined) return;
        const ids = new Set(spec.objects.map((o) => o.id));
        expect(ids.has(subject), `subject=${subject}`).toBe(true);
      });

      it('squash 幅度在 (0, 0.2] 内（太大的形变会让物体看起来在"坏掉"）', () => {
        const v = spec.decor!.squash;
        if (v === undefined) return;
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(0.2);
      });

      it('decor 不进入求解器参数（scene 的 params 里没有装饰字段）', () => {
        const keys = spec.params.map((p) => p.key);
        expect(keys).not.toContain('decor');
        expect(keys).not.toContain('squash');
      });
    });
  }
});

describe('开场演出 · intro（M3 · W4 / 宪法第一、五、六条）', () => {
  it('至少有一个场景声明了 intro（否则这组测试是空跑）', () => {
    expect(withIntro.length).toBeGreaterThan(0);
  });

  // 防腐烂：5 种 kind 的渲染实现必须持续被场景消费。
  // 没有这条，某种 kind 的代码会在某次重构后静默失效半年没人发现。
  it('5 种 kind 都有场景在用（渲染实现不许腐烂成死代码）', () => {
    const used = new Set(withIntro.map((s) => s.decor!.intro!.kind));
    for (const k of INTRO_KINDS) {
      expect(used.has(k), `没有场景使用 intro kind: ${k}`).toBe(true);
    }
  });

  for (const spec of withIntro) {
    describe(spec.meta.id, () => {
      it('intro.kind 是合法枚举', () => {
        expect([...INTRO_KINDS, 'none']).toContain(spec.decor!.intro!.kind);
      });

      it('intro.duration 在 (0, 3] 内（m3-plan：0–2 秒，留余量给回弹）', () => {
        const d = spec.decor!.intro!.duration;
        if (d === undefined) return;
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThanOrEqual(3);
      });

      it('删掉 intro 后 sample() 输出逐值相同（G3 的机器保证）', () => {
        const without: SceneSpec = { ...spec, decor: { ...spec.decor } };
        delete (without.decor as { intro?: unknown }).intro;
        expect(digest(without)).toEqual(digest(spec));
      });

      it('intro 不进入求解器参数（params 里没有演出字段）', () => {
        const keys = spec.params.map((p) => p.key);
        expect(keys).not.toContain('intro');
        expect(keys).not.toContain('kind');
        expect(keys).not.toContain('duration');
      });
    });
  }
});

describe('播放器状态 · 参数脉冲', () => {
  const spec = SCENES.find((s) => s.meta.id === 'buoyancy')!;

  it('初始脉冲为 0', () => {
    const store = createPlayerStore(spec);
    expect(store.getState().paramPulse).toEqual({ n: 0, key: null });
  });

  it('每次 setParam 都 +1，并记录是哪个参数（连续拖动每次都触发）', () => {
    const store = createPlayerStore(spec);
    store.getState().setParam('rhoB', 700);
    expect(store.getState().paramPulse.n).toBe(1);
    expect(store.getState().paramPulse.key).toBe('rhoB');

    store.getState().setParam('rhoB', 800);
    store.getState().setParam('rhoB', 900);
    expect(store.getState().paramPulse.n).toBe(3);
  });

  it('重置参数不产生脉冲（它不是"手感"动作）', () => {
    const store = createPlayerStore(spec);
    store.getState().resetParams();
    expect(store.getState().paramPulse.n).toBe(0);
  });

  it('脉冲不影响求解：改参数前后的 pulse 数值不进入 sample()', () => {
    const store = createPlayerStore(spec);
    const before = solveAt(spec, store.getState().params, 1);
    store.getState().setParam('rhoB', 900);
    const after = solveAt(spec, store.getState().params, 1);
    // 物理量应当变化（因为参数变了），但变化只来自 params，不来自 pulse
    expect(after.scalars).not.toEqual(before.scalars);
    const t = solveAt(spec, { ...store.getState().params }, 1);
    expect(t).toEqual(after);
  });
});
