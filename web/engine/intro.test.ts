/**
 * 开场演出（M3 · W4）纯函数单测
 *
 * 最重要的两条性质：
 * 1. **演出结束 = 恒等**：progress 到 1 时所有 kind 的乘子收敛到 1，
 *    与没有 intro 的画面逐像素一致——这是"演出只是装饰"的底线。
 * 2. **开场瞬间主体不可见**：progress=0 时 alpha≈0，
 *    保证"第 1.2 秒当封面图"之前画面是逐渐显影的，不会闪一下全量内容。
 */
import { describe, expect, it } from 'vitest';
import { INTRO_DEFAULT_DURATION, INTRO_IDLE, advanceIntro, introFx, makeIntro } from './intro';

const KINDS = ['trail-bloom', 'wipe-in', 'light-up', 'splash', 'assemble'] as const;

describe('intro 时钟', () => {
  it('kind 缺失或 none → 禁用态', () => {
    expect(makeIntro(undefined)).toBe(INTRO_IDLE);
    expect(makeIntro('none')).toBe(INTRO_IDLE);
  });

  it('默认时长 1.6s；显式时长生效', () => {
    expect(makeIntro('assemble').duration).toBe(INTRO_DEFAULT_DURATION);
    expect(makeIntro('assemble', 2).duration).toBe(2);
  });

  it('非正时长回退默认值（防止除零）', () => {
    expect(makeIntro('assemble', 0).duration).toBe(INTRO_DEFAULT_DURATION);
    expect(makeIntro('assemble', -1).duration).toBe(INTRO_DEFAULT_DURATION);
  });

  it('推进：进度线性到 1 后钉住，active 关闭', () => {
    const s = makeIntro('assemble', 1);
    advanceIntro(s, 0.5);
    expect(s.progress).toBeCloseTo(0.5);
    expect(s.active).toBe(true);
    advanceIntro(s, 0.5);
    expect(s.progress).toBe(1);
    expect(s.active).toBe(false);
    advanceIntro(s, 1);
    expect(s.progress).toBe(1);
  });

  it('禁用态推进是空操作', () => {
    advanceIntro(INTRO_IDLE, 1);
    expect(INTRO_IDLE.progress).toBe(1);
    expect(INTRO_IDLE.active).toBe(false);
  });
});

describe('intro 视觉效果', () => {
  it('禁用态所有乘子恒等', () => {
    expect(introFx(INTRO_IDLE)).toEqual({ scale: 1, alpha: 1, emissive: 1, halo: 1 });
    expect(introFx(INTRO_IDLE, true)).toEqual({ scale: 1, alpha: 1, emissive: 1, halo: 1 });
  });

  it('演出结束（progress=1）所有 kind 收敛到恒等——与没有 intro 一致', () => {
    for (const kind of KINDS) {
      const s = makeIntro(kind, 1);
      advanceIntro(s, 1);
      const fx = introFx(s, true);
      expect(fx.scale, `${kind} scale`).toBeCloseTo(1);
      expect(fx.alpha, `${kind} alpha`).toBeCloseTo(1);
      expect(fx.emissive, `${kind} emissive`).toBeCloseTo(1);
      expect(fx.halo, `${kind} halo`).toBeCloseTo(1);
    }
  });

  it('开场瞬间（progress=0）主体不可见', () => {
    for (const kind of KINDS) {
      expect(introFx(makeIntro(kind, 1), true).alpha, `${kind} alpha`).toBeLessThanOrEqual(0.001);
    }
  });

  it('light-up 的自发光点亮滞后于淡入', () => {
    const s = makeIntro('light-up', 1);
    advanceIntro(s, 0.5);
    const fx = introFx(s);
    expect(fx.alpha).toBeCloseTo(1); // 前半段淡入已完成
    expect(fx.emissive).toBeCloseTo(0.5); // 自发光点到一半
  });

  it('trail-bloom 的主角有光晕加成，非主角恒等', () => {
    const s = makeIntro('trail-bloom', 1);
    advanceIntro(s, 0.3);
    expect(introFx(s, true).halo).toBeGreaterThan(1);
    expect(introFx(s, false).halo).toBe(1);
    expect(introFx(s, false).scale).toBe(1);
  });

  it('alpha 随时间单调不倒退（否则会"闪"）', () => {
    const s = makeIntro('assemble', 2);
    let last = -1;
    for (let i = 0; i <= 20; i++) {
      advanceIntro(s, 0.1);
      const a = introFx(s).alpha;
      expect(a).toBeGreaterThanOrEqual(last - 1e-9);
      last = a;
    }
    expect(last).toBeCloseTo(1);
  });
});
