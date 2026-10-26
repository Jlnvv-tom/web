import { describe, it, expect } from 'vitest';
import { formatLabel, formatValue, plainLabel, escapeHtml } from './labelText';
import { layoutLabels, needsLeader, type LabelAnchor } from './labelLayout';

describe('formatLabel：物理量排版', () => {
  it('下划线变真下标（场景里 v_y 曾是纯文本）', () => {
    expect(formatLabel('v_y')).toBe('v<sub>y</sub>');
  });

  it('花括号形式支持多字符下标', () => {
    expect(formatLabel('F_{net}')).toBe('F<sub>net</sub>');
    expect(formatLabel('E_{k}')).toBe('E<sub>k</sub>');
  });

  it('上标同样支持', () => {
    expect(formatLabel('m^2')).toBe('m<sup>2</sup>');
    expect(formatLabel('10^{-3}')).toBe('10<sup>-3</sup>');
  });

  it('中文标签原样保留', () => {
    expect(formatLabel('浮力')).toBe('浮力');
    expect(formatLabel('N（测力计读数）')).toBe('N（测力计读数）');
  });

  it('已经用 Unicode 下标写好的（vₓ）不动它', () => {
    expect(formatLabel('vₓ')).toBe('vₓ');
  });

  it('一个标签里同时有上下标', () => {
    expect(formatLabel('a_1^2')).toBe('a<sub>1</sub><sup>2</sup>');
  });

  it('注入 HTML 会被转义，不当标签执行', () => {
    expect(formatLabel('<img onerror=x>')).toBe('&lt;img onerror=x&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('plainLabel 去掉标记，给 aria-label 用', () => {
    expect(plainLabel('v_y')).toBe('vy');
    expect(plainLabel('F_{net}')).toBe('Fnet');
    expect(plainLabel('vₓ')).toBe('vₓ');
  });
});

describe('formatValue：给标签和 HUD 同一个口径', () => {
  it('保留固定小数位（最高点的 v_y=0.00 本身是信息）', () => {
    expect(formatValue(0, 2)).toBe('0.00');
    expect(formatValue(6.3, 2)).toBe('6.30');
  });

  it('大数降精度，避免标签撑爆', () => {
    expect(formatValue(1234.56, 2)).toBe('1235');
    expect(formatValue(156.7, 2)).toBe('156.7');
  });

  it('非有限值给破折号，不给 NaN', () => {
    expect(formatValue(NaN)).toBe('—');
    expect(formatValue(Infinity)).toBe('—');
  });
});

describe('layoutLabels：标签不许叠在一起', () => {
  const base: Omit<LabelAnchor, 'id' | 'x' | 'y'> = { w: 40, h: 14, priority: 0 };
  const vp = { width: 800, height: 600 };

  it('单个标签留在原位', () => {
    const out = layoutLabels([{ ...base, id: 'a', x: 100, y: 100 }], vp);
    expect(out[0]!.hidden).toBe(false);
    expect(out[0]!.dy).toBe(0);
    expect(needsLeader(out[0]!)).toBe(false);
  });

  it('10 个标签挤在同一点：全部可见且互不重叠', () => {
    const anchors: LabelAnchor[] = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      id: `l${i}`,
      x: 400,
      y: 300,
      priority: i === 0 ? 10 : 0,
    }));
    const out = layoutLabels(anchors, vp);
    const visible = out.filter((p) => !p.hidden);
    expect(visible.length).toBe(10);
    // 两两距离必须大于标签高度
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        expect(Math.abs(visible[i]!.y - visible[j]!.y)).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it('优先级高的留在原位，低的被推开并需要引线', () => {
    const out = layoutLabels(
      [
        { ...base, id: 'low', x: 400, y: 300, priority: 0 },
        { ...base, id: 'high', x: 400, y: 300, priority: 9 },
      ],
      vp
    );
    const high = out.find((p) => p.id === 'high')!;
    const low = out.find((p) => p.id === 'low')!;
    expect(high.dy).toBe(0);
    expect(low.dy).not.toBe(0);
    expect(needsLeader(low)).toBe(true);
  });

  it('输出顺序与输入一致（调用方按下标更新 DOM）', () => {
    const anchors: LabelAnchor[] = [
      { ...base, id: 'z', x: 10, y: 10, priority: 0 },
      { ...base, id: 'a', x: 400, y: 300, priority: 5 },
      { ...base, id: 'm', x: 300, y: 200, priority: 1 },
    ];
    expect(layoutLabels(anchors, vp).map((p) => p.id)).toEqual(['z', 'a', 'm']);
  });

  it('锚点跑到画布外就不画', () => {
    const out = layoutLabels([{ ...base, id: 'off', x: -50, y: -50 }], vp);
    expect(out[0]!.hidden).toBe(true);
  });

  it('推到边界时被夹住，不会跑出画布', () => {
    const out = layoutLabels([{ ...base, id: 'edge', x: 400, y: 2 }], vp);
    expect(out[0]!.y).toBeGreaterThanOrEqual(7);
  });

  it('同输入同输出（跳帧/回放可复现）', () => {
    const anchors: LabelAnchor[] = Array.from({ length: 6 }, (_, i) => ({
      ...base,
      id: `l${i}`,
      x: 300 + i * 2,
      y: 300,
    }));
    expect(layoutLabels(anchors, vp)).toEqual(layoutLabels(anchors, vp));
  });

  it('放不下就藏，不叠上去（宁可少一个，不能糊一团）', () => {
    const anchors: LabelAnchor[] = Array.from({ length: 40 }, (_, i) => ({
      ...base,
      id: `l${i}`,
      x: 400,
      y: 300,
      w: 200,
      h: 30,
      priority: 0,
    }));
    const out = layoutLabels(anchors, vp);
    expect(out.some((p) => p.hidden)).toBe(true);
  });
});
