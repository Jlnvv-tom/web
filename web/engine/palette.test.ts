/**
 * 画布墨色适配测试（M3 · Phase 0）
 *
 * 这一层是"可见性"的唯一判据 —— 截图只负责构图回归，不承担"看得见"的举证责任。
 * 所以这里的断言必须比"看起来对"更严：每一条都是可计算的数值判据。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANVAS_BACKDROP,
  INK_TARGET,
  LIGHT_INK_MAP,
  LIGHT_STRUCTURE_MAP,
  STAGE_BACKDROP,
  STRUCTURE_TARGET,
  contrastRatio,
  deepenForContrast,
  ink,
  parseHex,
  relativeLuminance,
  resetInkCache,
  toHex,
  toOklch,
} from './palette';

const BACKDROPS = [CANVAS_BACKDROP, STAGE_BACKDROP];

describe('色彩工具', () => {
  it('parseHex 支持 6 位与 3 位写法', () => {
    expect(parseHex('#0e7490')).toEqual([14, 116, 144]);
    expect(parseHex('0e7490')).toEqual([14, 116, 144]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('nope')).toBeNull();
  });

  it('toHex 会裁剪越界值', () => {
    expect(toHex([14, 116, 144])).toBe('#0e7490');
    expect(toHex([-10, 300, 0])).toBe('#00ff00');
  });

  it('对比度与 WCAG 已知值一致（黑/白 = 21:1）', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    // 同色对比度为 1
    expect(contrastRatio('#0e7490', '#0e7490')).toBeCloseTo(1, 5);
  });

  it('relativeLuminance：白 1.0、黑 0.0', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
  });

  it('toOklch：中性灰彩度接近 0，纯红色相约 29°', () => {
    expect(toOklch([128, 128, 128]).c).toBeLessThan(0.01);
    expect(toOklch([255, 0, 0]).h).toBeGreaterThan(20);
    expect(toOklch([255, 0, 0]).h).toBeLessThan(40);
  });
});

describe('映射表 · 每一对都必须达标', () => {
  it('语义墨色表：对所有底板 ≥ 4.5:1', () => {
    for (const [from, to] of Object.entries(LIGHT_INK_MAP)) {
      for (const bg of BACKDROPS) {
        const cr = contrastRatio(to, bg);
        expect(cr, `${from} → ${to} 对 ${bg} 只有 ${cr.toFixed(2)}:1`).toBeGreaterThanOrEqual(INK_TARGET);
      }
    }
  });

  it('结构色表：对所有底板 ≥ 3:1', () => {
    for (const [from, to] of Object.entries(LIGHT_STRUCTURE_MAP)) {
      for (const bg of BACKDROPS) {
        const cr = contrastRatio(to, bg);
        expect(cr, `${from} → ${to} 对 ${bg} 只有 ${cr.toFixed(2)}:1`).toBeGreaterThanOrEqual(STRUCTURE_TARGET);
      }
    }
  });

  it('映射表键都是合法 6 位 hex', () => {
    for (const k of [...Object.keys(LIGHT_INK_MAP), ...Object.keys(LIGHT_STRUCTURE_MAP)]) {
      expect(k, k).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('两张表没有重叠键（避免角色歧义）', () => {
    const inkKeys = new Set(Object.keys(LIGHT_INK_MAP));
    const dup = Object.keys(LIGHT_STRUCTURE_MAP).filter((k) => inkKeys.has(k));
    expect(dup).toEqual([]);
  });
});

describe('兜底函数 deepenForContrast', () => {
  it('已达标就原样返回（小写）', () => {
    expect(deepenForContrast('#0E7490', CANVAS_BACKDROP, 4.5)).toBe('#0e7490');
  });

  it('未达标时压暗到刚好达标', () => {
    const out = deepenForContrast('#22d3ee', CANVAS_BACKDROP, 4.5);
    expect(contrastRatio(out, CANVAS_BACKDROP)).toBeGreaterThanOrEqual(4.5);
  });

  it('有限步收敛：24 步内必然达标', () => {
    // 从最亮的一端开始，24 步 ×0.93 足以压到 L<0.02
    const out = deepenForContrast('#ffffff', CANVAS_BACKDROP, 4.5);
    expect(contrastRatio(out, CANVAS_BACKDROP)).toBeGreaterThanOrEqual(4.5);
  });

  it('色相保持：映射前后色相差 ≤ 60°（宽松下限，防变成另一色系）', () => {
    for (const hex of ['#22d3ee', '#4ade80', '#ef4444', '#facc15', '#a78bfa', '#f472b6']) {
      const out = deepenForContrast(hex, CANVAS_BACKDROP, 4.5);
      const dh = Math.abs(toOklch(parseHex(out)!).h - toOklch(parseHex(hex)!).h);
      const diff = Math.min(dh, 360 - dh);
      expect(diff, `${hex} → ${out} 色相漂了 ${diff.toFixed(0)}°`).toBeLessThanOrEqual(60);
    }
  });

  it('非法输入原样返回，不抛异常', () => {
    expect(deepenForContrast('not-a-color', CANVAS_BACKDROP, 4.5)).toBe('not-a-color');
  });
});

describe('统一入口 ink()', () => {
  beforeEach(() => resetInkCache());

  it('已达标色恒等返回（labels.tsx 手工修过的两处即此路径）', () => {
    expect(ink('#0e7490', '#000')).toBe('#0e7490');
    expect(ink('#57534e', '#000')).toBe('#57534e');
  });

  it('未声明色时用 fallback', () => {
    expect(ink(undefined, '#22d3ee')).toBe(LIGHT_INK_MAP['#22d3ee']);
  });

  it('命中策展表', () => {
    expect(ink('#22d3ee', '#22d3ee')).toBe('#0e7490');
    expect(ink('#ef4444', '#ef4444')).toBe('#b91c1c');
    expect(ink('#4ade80', '#4ade80')).toBe('#166534');
  });

  it('role=structure 走 3:1 档，不会被压成粗黑线', () => {
    const out = ink('#16394a', '#16394a', { role: 'structure' });
    expect(contrastRatio(out, CANVAS_BACKDROP)).toBeGreaterThanOrEqual(3);
    // 且不应比语义墨色更暗（结构色要退后）
    const inkOut = ink('#16394a', '#16394a');
    expect(relativeLuminance(parseHex(out)!)).toBeGreaterThan(relativeLuminance(parseHex(inkOut)!));
  });

  it('表外色走兜底且达标', () => {
    const out = ink('#123456', '#123456');
    expect(contrastRatio(out, CANVAS_BACKDROP)).toBeGreaterThanOrEqual(INK_TARGET);
  });

  it('幂等：ink(ink(x)) === ink(x)', () => {
    for (const hex of ['#22d3ee', '#ef4444', '#123456', '#0e7490', '#facc15', '#16394a']) {
      expect(ink(ink(hex, hex), ink(hex, hex))).toBe(ink(hex, hex));
    }
  });

  it('展台底板也能达标', () => {
    for (const hex of ['#22d3ee', '#ef4444', '#4ade80', '#fbbf24', '#a78bfa']) {
      const out = ink(hex, hex, { bg: STAGE_BACKDROP });
      expect(contrastRatio(out, STAGE_BACKDROP), `${hex} → ${out}`).toBeGreaterThanOrEqual(INK_TARGET);
    }
  });
});

describe('宪法第六条守卫', () => {
  it('palette.ts 不得出现任何场景 id 字面量（内容即数据，不许特判）', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'engine/palette.ts'), 'utf8');
    const ids = [
      'lorentz-force', 'projectile-motion', 'thin-lens', 'electric-field', 'capacitor',
      'shm', 'orbit', 'reflection', 'wave', 'induction', 'buoyancy', 'lever',
    ];
    for (const id of ids) {
      expect(src.includes(id), `palette.ts 里出现了场景 id：${id}`).toBe(false);
    }
    // 也不该出现对象 id 级别的特判
    expect(src).not.toMatch(/def\.id\s*===/);
  });
});
