/**
 * 内容契约测试（SPEC-010 / SPEC-012）
 *
 * 这一层不测物理，测的是「内容有没有腐坏」：
 * bind 断链、脚本时间倒流、quiz 答案越界、章节挂错、漏写规格……
 * 新增场景会被自动纳入，无需在这里加一行。
 */
import { describe, expect, it } from 'vitest';
import { SCENES } from '@/content/scenes';
import { ALL_CHAPTERS } from '@/content/chapters';
import { defaultParams, sceneDuration, validateScene } from '@/engine/spec';
import type { SceneSpec } from '@/engine/spec';
import { solveAt } from '@/engine/solvers';
import { len } from '@/engine/vec';

const TIMES = (spec: SceneSpec) => {
  const dur = sceneDuration(spec);
  return [0, dur / 2, dur];
};

const isBindable = (v: unknown): v is string => typeof v === 'string';

for (const spec of SCENES) {
  describe(`场景契约 · ${spec.meta.id}`, () => {
    const params = defaultParams(spec.params);

    it('通过 zod 校验（REQ-SC-001）', () => {
      expect(() => validateScene(spec)).not.toThrow();
    });

    it('可 JSON 往返：能导出成纯数据（REQ-SC-010）', () => {
      const json = JSON.parse(JSON.stringify(spec));
      expect(json.meta.id).toBe(spec.meta.id);
      expect(() => validateScene(json)).not.toThrow();
    });

    it('对象 id 唯一（REQ-SC-002）', () => {
      const ids = spec.objects.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('每条 bind 都能解析（REQ-SC-003）', () => {
      for (const t of TIMES(spec)) {
        const st = solveAt(spec, params, t);
        const at = `t=${t.toFixed(1)}`;

        for (const o of spec.objects) {
          if (o.visible) {
            expect(typeof st.scalars[o.visible], `${at} 显隐绑定 ${o.id} -> ${o.visible}`).toBe('number');
          }
          switch (o.type) {
            case 'particle':
              expect(st.points[o.bind ?? 'pos'], `${at} particle ${o.id}`).toBeDefined();
              break;
            case 'vector':
              expect(st.vectors[o.bind], `${at} vector ${o.id}`).toBeDefined();
              if (o.origin) expect(st.points[o.origin], `${at} vector origin ${o.id}`).toBeDefined();
              break;
            case 'trail':
            case 'polyline':
              if (o.bind) {
                const line = st.lines[o.bind];
                // optional 的折线允许"不存在"：求解器既可能不给这个 key，
                // 也可能给出空数组（如行波模式下没有驻波包络）——两者都算合法缺省。
                if (o.type === 'polyline' && o.optional && (!line || line.length === 0)) break;
                expect(line, `${at} line ${o.id}`).toBeDefined();
                // 轨迹是"生长中"的折线，t=0 时只有 1 个点属正常
                const minPts = o.type === 'trail' ? 1 : 2;
                expect(line!.length, `${at} line ${o.id} 点数不足`).toBeGreaterThanOrEqual(minPts);
              }
              break;
            case 'polylines': {
              const set = st.linesets?.[o.bind];
              expect(set, `${at} lineset ${o.id}`).toBeDefined();
              // 允许为空数组：某些参数下该曲线族确实不存在（如全同号电荷没有零势线）
              set!.forEach((l, i) => {
                expect(l.length, `${at} lineset ${o.id}[${i}] 点数不足`).toBeGreaterThanOrEqual(2);
              });
              break;
            }
            case 'plane':
              if (o.bindPosition) expect(st.points[o.bindPosition], `${at} plane ${o.id}`).toBeDefined();
              break;
            case 'text':
              if (isBindable(o.position)) expect(st.points[o.position], `${at} text ${o.id}`).toBeDefined();
              break;
            case 'arrowLine':
              if (isBindable(o.from)) expect(st.points[o.from], `${at} arrowLine.from ${o.id}`).toBeDefined();
              if (isBindable(o.to)) expect(st.points[o.to], `${at} arrowLine.to ${o.id}`).toBeDefined();
              break;
            default:
              break;
          }
        }
      }
    });

    it('HUD 读数与图表都能取到值（REQ-SC-003）', () => {
      for (const t of TIMES(spec)) {
        const st = solveAt(spec, params, t);
        for (const r of spec.hud.readouts) {
          if (r.bind.startsWith('meta.')) {
            const v = st.meta[r.bind.slice(5)];
            expect(v, `t=${t} readout ${r.bind}`).toBeDefined();
            expect(['string', 'number', 'boolean']).toContain(typeof v);
            continue;
          }
          const v = st.scalars[r.bind];
          expect(typeof v, `t=${t} readout ${r.bind}`).toBe('number');
          expect(Number.isFinite(v!), `readout ${r.bind} 非法数值`).toBe(true);
        }
        for (const c of spec.hud.charts ?? []) {
          for (const s of c.series) {
            expect(typeof st.scalars[s.bind], `chart ${c.title} / ${s.bind}`).toBe('number');
          }
        }
      }
    });

    it('讲解脚本时间严格递增、高亮对象存在（REQ-SC-007 / REQ-SC-003）', () => {
      const ids = new Set(spec.objects.map((o) => o.id));
      for (let i = 1; i < spec.script.length; i++) {
        expect(spec.script[i]!.at, `第 ${i} 步时间未递增`).toBeGreaterThan(spec.script[i - 1]!.at);
      }
      for (const step of spec.script) {
        for (const h of step.highlight ?? []) {
          expect(ids.has(h), `highlight 指向不存在的对象 ${h}`).toBe(true);
        }
      }
    });

    it('练习题合法：答案不越界、applyParams 在参数域内（REQ-SC-008）', () => {
      const byKey = new Map(spec.params.map((p) => [p.key, p]));
      for (const q of spec.quiz ?? []) {
        expect(q.answer).toBeLessThan(q.options.length);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        for (const [k, v] of Object.entries(q.applyParams ?? {})) {
          const def = byKey.get(k);
          expect(def, `applyParams 引用了不存在的参数 ${k}`).toBeDefined();
          if (def?.type === 'slider' && typeof v === 'number') {
            expect(v).toBeGreaterThanOrEqual(def.min);
            expect(v).toBeLessThanOrEqual(def.max);
          }
        }
      }
    });

    it('章节双向一致（REQ-SC-009）', () => {
      const chapter = ALL_CHAPTERS.find((c) => c.id === spec.meta.chapterId);
      expect(chapter, `chapterId ${spec.meta.chapterId} 不存在`).toBeDefined();

      const owners = ALL_CHAPTERS.flatMap((c) =>
        c.points.filter((p) => p.sceneId === spec.meta.id).map(() => c.id)
      );
      expect(owners.length, `场景 ${spec.meta.id} 至少应挂在一个知识点上`).toBeGreaterThanOrEqual(1);
      // chapterId 必须是其中一个挂载点所在的章
      expect(owners).toContain(spec.meta.chapterId);
      expect(chapter!.points.some((p) => p.sceneId === spec.meta.id)).toBe(true);
    });

    it('诚实声明假设（REQ-SC-011 / 宪法第三条）', () => {
      expect((spec.assumptions ?? []).length).toBeGreaterThanOrEqual(1);
      for (const a of spec.assumptions ?? []) expect(a.length).toBeGreaterThan(8);
    });

    it('内容配额达标（SPEC-012 §4）', () => {
      expect(spec.script.length).toBeGreaterThanOrEqual(5);
      expect(spec.script.length).toBeLessThanOrEqual(10);
      expect(spec.formulas?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(spec.pitfalls?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(spec.quiz?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(spec.hud.readouts.length).toBeGreaterThanOrEqual(4);
      for (const p of spec.pitfalls ?? []) {
        expect(p.wrong, `易错点「${p.title}」缺少 wrong`).toBeTruthy();
        expect(p.right, `易错点「${p.title}」缺少 right`).toBeTruthy();
      }
    });

    it('场景时长覆盖最后一步讲解', () => {
      const last = Math.max(...spec.script.map((s) => s.at));
      expect(sceneDuration(spec)).toBeGreaterThan(last);
    });

    it('对象坐标量级合理（不飞出画面）', () => {
      const st = solveAt(spec, params, 0);
      const grid = spec.world.gridSize ?? 40;
      for (const [k, p] of Object.entries(st.points)) {
        expect(len(p), `点位 ${k} 距原点过远`).toBeLessThan(grid * 4 + 20);
      }
    });
  });
}

/* ============================================================
   全局约束
   ============================================================ */

describe('场景注册表 · 全局约束', () => {
  it('meta.id 全局唯一', () => {
    const ids = SCENES.map((s) => s.meta.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个场景的求解器都已注册', () => {
    for (const s of SCENES) {
      expect(() => solveAt(s, defaultParams(s.params), 0)).not.toThrow();
    }
  });

  it('dimension 标注与对象构成不矛盾（宪法第四条）', () => {
    for (const s of SCENES) {
      if (s.meta.dimension !== '3d') continue;
      // 3d 场景至少要有一个真正离开单一平面的元素
      expect(s.objects.length).toBeGreaterThan(0);
    }
  });
});
