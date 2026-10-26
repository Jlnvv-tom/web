/**
 * M3.5 · 可读性契约测试
 *
 * 这一组断言只关心一件事：**学生看到的字和线，是不是真的能读**。
 * 它们全部可以用现有内容 + 纯函数验证，不需要截图。
 */
import { describe, it, expect } from 'vitest';
import { SCENES } from '@/content/scenes';
import { defaultParams } from './../spec';
import { solveAt } from './../solvers';
import { formatLabel, plainLabel } from './../labelText';
import { layoutLabels, type LabelAnchor } from './../labelLayout';
import { BLOOM_THRESHOLD, CANVAS_BACKDROP, STAGE_BACKDROP, linearLuminance } from './../palette';

describe('REQ-R1 · 标签排版不许泄漏代码写法', () => {
  it('所有矢量/文字标签里不允许剩下裸下划线或裸花括号', () => {
    const bad: string[] = [];
    for (const spec of SCENES) {
      for (const o of spec.objects) {
        const label = o.type === 'vector' ? o.label : o.type === 'text' ? o.text : undefined;
        if (!label) continue;
        const html = formatLabel(label);
        // `v_y` 必须变成 v<sub>y</sub>；`F_{net}` 的花括号必须被消化
        if (html.includes('_') || html.includes('{')) bad.push(`${spec.meta.id}/${o.id}: ${label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('同一个场景里不许混用 Unicode 下标与下划线写法（vₓ vs v_y）', () => {
    const mixed: string[] = [];
    for (const spec of SCENES) {
      const labels = spec.objects
        .map((o) => (o.type === 'vector' ? o.label : o.type === 'text' ? o.text : ''))
        .filter((s): s is string => !!s);
      const hasUnicode = labels.some((l) => /[₀-₉ₓᵧ]/.test(l));
      const hasMarker = labels.some((l) => l.includes('_'));
      if (hasUnicode && hasMarker) mixed.push(spec.meta.id);
    }
    expect(mixed).toEqual([]);
  });
});

describe('REQ-R2 · 就地读数必须指向真实存在的标量', () => {
  it('每个 valueBind 都能在 t=0 的求解结果里拿到有限数', () => {
    const bad: string[] = [];
    for (const spec of SCENES) {
      const state = solveAt(spec, defaultParams(spec.params), 0);
      for (const o of spec.objects) {
        if (o.type !== 'vector' || !o.valueBind) continue;
        const v = state.scalars[o.valueBind];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          bad.push(`${spec.meta.id}/${o.id} → ${o.valueBind}`);
        }
      }
    }
    // 打错一个 bind 名，标签就会永远显示 "—"，而 tsc 查不出来
    expect(bad).toEqual([]);
  });

  it('valueBind 要么留空，要么同时给出单位（半成品读数会让量纲含糊）', () => {
    const bad: string[] = [];
    for (const spec of SCENES) {
      for (const o of spec.objects) {
        if (o.type !== 'vector' || !o.valueBind) continue;
        if (!o.unit) bad.push(`${spec.meta.id}/${o.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('REQ-R3 · 标签避让（几何不变量）', () => {
  const vp = { width: 1000, height: 600 };
  const mk = (n: number): LabelAnchor[] =>
    Array.from({ length: n }, (_, i) => ({ id: `l${i}`, x: 500 + (i % 3), y: 300, w: 46, h: 14, priority: 10 - i }));

  it('同一点上叠 8 个标签：全部可见或明确隐藏，且可见者互不重叠', () => {
    const out = layoutLabels(mk(8), vp);
    const vis = out.filter((p) => !p.hidden);
    expect(vis.length).toBeGreaterThan(0);
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const dy = Math.abs(vis[i]!.y - vis[j]!.y);
        const dx = Math.abs(vis[i]!.x - vis[j]!.x);
        // 竖直步长恒 > 标签高度，因此同列必然分开
        expect(dy >= 14 || dx >= 46).toBe(true);
      }
    }
  });

  it('布局结果是确定的（跳帧/回放必须复现）', () => {
    const a = mk(8);
    expect(layoutLabels(a, vp)).toEqual(layoutLabels(a, vp));
  });
});

describe('REQ-R4 · 泛光不许盖住底板（否则读数是"白纱下面的字"）', () => {
  it('阈值高于两块画布底板的线性亮度', () => {
    expect(linearLuminance(CANVAS_BACKDROP)).toBeLessThan(BLOOM_THRESHOLD);
    expect(linearLuminance(STAGE_BACKDROP)).toBeLessThan(BLOOM_THRESHOLD);
  });

  it('留出的余量足够（≥0.01，避免阈值刚好压在底板上）', () => {
    const max = Math.max(linearLuminance(CANVAS_BACKDROP), linearLuminance(STAGE_BACKDROP));
    expect(BLOOM_THRESHOLD - max).toBeGreaterThanOrEqual(0.01);
  });
});

describe('REQ-R5 · plainLabel 可用于无障碍属性', () => {
  it('去掉标记后不残留特殊字符', () => {
    for (const spec of SCENES) {
      for (const o of spec.objects) {
        const label = o.type === 'vector' ? o.label : o.type === 'text' ? o.text : undefined;
        if (!label) continue;
        const plain = plainLabel(label);
        expect(plain.includes('_')).toBe(false);
        expect(plain.includes('{')).toBe(false);
      }
    }
  });
});
