import { describe, expect, it } from 'vitest';
import { defaultParams, sceneDuration, validateScene } from '@/engine/spec';
import type { SceneSpec } from '@/engine/spec';
import { SCENES } from '@/content/scenes';

const base = () => JSON.parse(JSON.stringify(SCENES[0])) as SceneSpec;

describe('SceneSpec 校验（REQ-SC-001）', () => {
  it('已发布场景全部通过', () => {
    for (const s of SCENES) expect(() => validateScene(s)).not.toThrow();
  });

  it('拒绝空讲解脚本，并在错误里指出字段路径', () => {
    const s = base();
    s.script = [];
    expect(() => validateScene(s)).toThrowError(/script/);
  });

  it('拒绝非法学段', () => {
    const s = base();
    (s.meta as unknown as { stage: string }).stage = 'college';
    expect(() => validateScene(s)).toThrowError(/meta\.stage/);
  });

  it('拒绝非数字的相机位置', () => {
    const s = base();
    (s.camera as unknown as { position: unknown }).position = ['a', 0, 0];
    expect(() => validateScene(s)).toThrowError(/camera\.position/);
  });

  it('拒绝答案索引格式错误的练习题', () => {
    const s = base();
    s.quiz = [{ type: 'single-choice', prompt: 'x', options: ['a', 'b'], answer: 1.5, explain: 'y' }];
    expect(() => validateScene(s)).toThrowError(/quiz/);
  });

  it('错误信息是"人话"：多行 + 字段路径', () => {
    const s = base();
    s.script = [];
    try {
      validateScene(s);
      throw new Error('应当抛错');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('SceneSpec 校验失败');
      expect(msg.split('\n').length).toBeGreaterThan(1);
      expect(msg).toContain('·');
    }
  });

  it('可选字段缺省时仍可校验', () => {
    const s = base();
    delete s.formulas;
    delete s.pitfalls;
    delete s.quiz;
    delete s.assumptions;
    delete s.duration;
    expect(() => validateScene(s)).not.toThrow();
  });
});

describe('工具函数', () => {
  it('defaultParams 取每个控件的默认值', () => {
    const p = base().params;
    const d = defaultParams(p);
    for (const def of p) expect(d[def.key]).toEqual(def.default);
  });

  it('sceneDuration 缺省为最后一步 + 8 秒', () => {
    const s = base();
    delete s.duration;
    const last = Math.max(...s.script.map((x) => x.at));
    expect(sceneDuration(s)).toBeCloseTo(last + 8, 9);
  });

  it('sceneDuration 优先使用显式时长', () => {
    const s = base();
    s.duration = 123;
    expect(sceneDuration(s)).toBe(123);
  });
});
