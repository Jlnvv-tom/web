import { describe, expect, it } from 'vitest';
import {
  PARTICLE_COUNT,
  STRING_LENGTH,
  displacement,
  kOf,
  omegaOf,
  periodOf,
  reverseY,
  setupFromParams,
  speedOf,
  travelY,
  waveSolver,
} from '@/engine/solvers/wave';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const TRAVEL = { mode: 'travel', lambda: 2, A: 0.3, f: 0.5 };
const STANDING = { mode: 'standing', lambda: 2, A: 0.3, f: 0.5 };

/* ============================================================
   基本关系
   ============================================================ */

describe('机械波 · 基本关系', () => {
  it('波速 v = λf', () => {
    const s = setupFromParams(TRAVEL);
    expect(close(speedOf(s), 1, 1e-12)).toBe(true); // 2 m × 0.5 Hz
    const s2 = setupFromParams({ lambda: 3, A: 0.2, f: 1.5 });
    expect(close(speedOf(s2), 4.5, 1e-12)).toBe(true);
  });

  it('周期 T = 1/f', () => {
    expect(close(periodOf(setupFromParams(TRAVEL)), 2, 1e-12)).toBe(true);
  });

  it('波数与角频率 ω = 2πf、k = 2π/λ', () => {
    const s = setupFromParams(TRAVEL);
    expect(close(omegaOf(s), Math.PI, 1e-12)).toBe(true);
    expect(close(kOf(s), Math.PI, 1e-12)).toBe(true);
  });
});

/* ============================================================
   行波
   ============================================================ */

describe('机械波 · 行波', () => {
  it('波形整体平移：y(x, t+Δt) = y(x − vΔt, t)', () => {
    const s = setupFromParams(TRAVEL);
    const v = speedOf(s);
    for (const [x, t, dt] of [
      [0.5, 0.3, 0.2],
      [1.7, 1.1, 0.5],
      [3.3, 0.7, 0.35],
    ]) {
      expect(close(travelY(x, t + dt, s), travelY(x - v * dt, t, s), 1e-9)).toBe(true);
    }
  });

  it('单个质点的最大速度 = Aω', () => {
    const s = setupFromParams(TRAVEL);
    const st = waveSolver.sample(0.5, ctx(TRAVEL));
    expect(st.scalars.vMax!).toBeCloseTo(s.A * omegaOf(s), 9);
  });

  it('质点只在原地上下振动，不随波迁移', () => {
    const st1 = waveSolver.sample(0, ctx(TRAVEL));
    const st2 = waveSolver.sample(1.7, ctx(TRAVEL));
    // 中点质点的 x 坐标不变，只有 y 在变
    expect(st1.points.mid![0]).toBeCloseTo(STRING_LENGTH / 2, 9);
    expect(st2.points.mid![0]).toBeCloseTo(STRING_LENGTH / 2, 9);
  });

  it('同一时刻波形是正弦，一个波长内完成一次全振动', () => {
    const s = setupFromParams({ ...TRAVEL, lambda: 2 });
    // x = 0 与 x = λ 处位移相同
    expect(close(travelY(0, 0.4, s), travelY(s.lambda, 0.4, s), 1e-9)).toBe(true);
  });
});

/* ============================================================
   驻波
   ============================================================ */

describe('机械波 · 驻波', () => {
  it('节点处位移恒为 0（x = nλ/2）', () => {
    const s = setupFromParams(STANDING);
    for (const x of [0, 1, 2, 3]) {
      // x = n·λ/2 = n·1
      for (const t of [0, 0.3, 0.9, 1.5, 2.4]) {
        expect(Math.abs(displacement(x, t, s))).toBeLessThan(1e-12);
      }
    }
  });

  it('波腹振幅 = 2A（两列波叠加）', () => {
    const s = setupFromParams(STANDING);
    const st = waveSolver.sample(0, ctx(STANDING));
    expect(st.scalars.amp!).toBeCloseTo(2 * s.A, 9);
    // 取 x = λ/4（波腹）
    const x = s.lambda / 4;
    let maxY = 0;
    for (let i = 0; i <= 200; i++) {
      const y = Math.abs(displacement(x, (i / 200) * periodOf(s), s));
      if (y > maxY) maxY = y;
    }
    expect(maxY).toBeCloseTo(2 * s.A, 6);
  });

  it('驻波不传播：包络不动', () => {
    const s = setupFromParams(STANDING);
    // 同一质点在不同时刻的振幅包络相同（在波腹处取到 2A，在节点处取到 0）
    const x = s.lambda / 4;
    const a = displacement(x, 0.2, s);
    const b = displacement(x, 0.2 + periodOf(s) / 2, s);
    expect(close(a, -b, 1e-9)).toBe(true); // 半个周期后反相
  });

  it('驻波由两列反向行波叠加而成', () => {
    const s = setupFromParams(STANDING);
    const t = 0.6;
    for (const x of [0.3, 1.1, 2.7]) {
      const sum = travelY(x, t, s) + reverseY(x, t, s); // 正向 + 反向行波
      expect(close(displacement(x, t, s), sum, 1e-9)).toBe(true);
    }
  });

  it('节点个数与绳长/波长有关', () => {
    const st = waveSolver.sample(0, ctx(STANDING));
    // 绳长 4 m、波长 2 m → x = 0,1,2,3 共 4 个节点（质点采样）
    expect(st.scalars.nodeCount!).toBeGreaterThanOrEqual(3);
  });
});

/* ============================================================
   工程性质
   ============================================================ */

describe('机械波 · 工程性质', () => {
  it('边界参数（短波、高频、小振幅）不出 NaN', () => {
    const combos = [
      { mode: 'travel', lambda: 0.4, A: 0.02, f: 2 },
      { mode: 'travel', lambda: 4, A: 0.6, f: 0.05 },
      { mode: 'standing', lambda: 0.5, A: 0.6, f: 2 },
      { mode: 'standing', lambda: 4, A: 0.02, f: 0.05 },
    ];
    for (const p of combos) {
      for (const t of [0, 0.5, 3]) {
        const st = waveSolver.sample(t, ctx(p));
        for (const [k, v] of Object.entries(st.scalars)) {
          expect(Number.isFinite(v), `${JSON.stringify(p)} ${k}=${v}`).toBe(true);
        }
        expect(st.lines.curve!.length).toBeGreaterThan(50);
      }
    }
  });

  it('每个参数都有可见影响（无死值）', () => {
    const base = waveSolver.sample(0.4, ctx(TRAVEL));
    for (const [key, value] of [
      ['lambda', 3],
      ['A', 0.5],
      ['f', 1.2],
      ['mode', 'standing'],
    ] as const) {
      const s = waveSolver.sample(0.4, ctx({ ...TRAVEL, [key]: value }));
      const diff = Object.keys(s.scalars).some((k) => s.scalars[k] !== base.scalars[k]);
      const lineDiff = s.lines.curve![5]![1] !== base.lines.curve![5]![1];
      expect(diff || lineDiff, `参数 ${key} 无可见影响`).toBe(true);
    }
  });

  it('sample 是纯函数', () => {
    const c = ctx(TRAVEL);
    const a = waveSolver.sample(1.3, c);
    waveSolver.sample(0.2, c);
    const b = waveSolver.sample(1.3, c);
    expect(a.points.mid).toEqual(b.points.mid);
    expect(a.scalars).toEqual(b.scalars);
  });

  it('质点数量与绳长固定（25 个点 / 4 m）', () => {
    const st = waveSolver.sample(0, ctx(TRAVEL));
    expect(PARTICLE_COUNT).toBe(25);
    expect(STRING_LENGTH).toBe(4);
    expect(st.lines.curve!.length).toBe(161);
  });

  it('duration > 0', () => {
    expect(waveSolver.duration(ctx(TRAVEL))).toBeGreaterThan(0);
  });
});
