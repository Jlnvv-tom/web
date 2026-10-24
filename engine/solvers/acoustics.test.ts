import { describe, expect, it } from 'vitest';
import {
  AMP_REFERENCE,
  DURATION,
  OLD_RATIOS,
  R_DISP_BASE,
  R_DISP_SCALE,
  acousticsSolver,
  ampOf,
  areaOf,
  dispRadiusOf,
  radiusOf,
  ringPoints,
  setupFromParams,
  sphereRings,
} from '@/engine/solvers/acoustics';
import type { SolverCtx } from '@/engine/solvers/types';

const ctx = (params: Record<string, number | boolean | string>): SolverCtx => ({ params, options: {} });
const close = (a: number, b: number, tol = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/* ============================================================
   参数解析
   ============================================================ */

describe('声学 · 参数解析', () => {
  it('默认值 = lessons 已验证口径（t=0.4 s, v=340 m/s）', () => {
    const s = setupFromParams({});
    expect(close(s.propT, 0.4)).toBe(true);
    expect(close(s.v, 340)).toBe(true);
  });

  it('负时间被裁剪到 0，声速下限 1 m/s', () => {
    const s = setupFromParams({ t: -5, v: 0 });
    expect(s.propT).toBe(0);
    expect(s.v).toBeGreaterThanOrEqual(1);
  });

  it('NaN / 非数字参数被忽略而非污染全场', () => {
    const s = setupFromParams({ t: NaN, v: 'x' });
    expect(Number.isFinite(s.propT)).toBe(true);
    expect(Number.isFinite(s.v)).toBe(true);
  });
});

/* ============================================================
   lessons 手算期望值（独立推得，不是从前端表达式反推）
   ============================================================ */

describe('声学 · lessons 迁移期望值', () => {
  it('波前半径 r = v·t：t=0.4 → 136 m，t=1.2 → 408 m', () => {
    expect(close(radiusOf(setupFromParams({ t: 0.4, v: 340 })), 136)).toBe(true);
    expect(close(radiusOf(setupFromParams({ t: 1.2, v: 340 })), 408)).toBe(true);
  });

  it('相对振幅 = 340/r：2.50（近）/ 0.833（远）', () => {
    expect(close(ampOf(setupFromParams({ t: 0.4, v: 340 })), 2.5, 1e-3)).toBe(true);
    expect(close(ampOf(setupFromParams({ t: 1.2, v: 340 })), 340 / 408, 1e-3)).toBe(true);
  });

  it('声速在同一介质中恒定（换 t 不变）', () => {
    const a = acousticsSolver.sample(0, ctx({ t: 0.4, v: 340 })).scalars.v;
    const b = acousticsSolver.sample(0, ctx({ t: 1.2, v: 340 })).scalars.v;
    expect(a).toBe(340);
    expect(b).toBe(340);
  });

  it('距离翻倍 → 振幅减半（球面衰减的定量形式）', () => {
    const near = ampOf(setupFromParams({ t: 0.5, v: 340 }));
    const far = ampOf(setupFromParams({ t: 1.0, v: 340 }));
    expect(close(far * 2, near, 1e-9)).toBe(true);
  });
});

/* ============================================================
   不变量（solver.invariants 自检 + 逐条断言）
   ============================================================ */

describe('声学 · 不变量', () => {
  it('amp · r ≡ 340（球面波核心不变量）', () => {
    for (const t of [0, 0.4, 1.2, 3]) {
      const s = setupFromParams({ t, v: 340 });
      if (radiusOf(s) < 1e-6) continue;
      expect(close(ampOf(s) * radiusOf(s), AMP_REFERENCE, 1e-6)).toBe(true);
    }
  });

  it('S ≡ 4πr²（波前面积）', () => {
    const s = setupFromParams({ t: 1.2, v: 340 });
    expect(close(areaOf(s), 4 * Math.PI * 408 ** 2, 1e-6)).toBe(true);
  });

  it('invariants() 全部接近 0', () => {
    for (const t of [0, 0.4, 1.2, 3]) {
      const inv = acousticsSolver.invariants!(0, ctx({ t, v: 340 }));
      for (const [k, v] of Object.entries(inv)) {
        expect(Math.abs(v), `t=${t} 时 ${k}=${v}`).toBeLessThan(1e-6);
      }
    }
  });

  it('三正交圆半径相等（球面性：缺一个圆就不是球）', () => {
    const rings = sphereRings(0.8);
    const rad = (pts: [number, number, number][]) => Math.hypot(...pts[0]!);
    expect(close(rad(rings.ringXY), 0.8)).toBe(true);
    expect(close(rad(rings.ringXZ), 0.8)).toBe(true);
    expect(close(rad(rings.ringYZ), 0.8)).toBe(true);
  });

  it('三个圆各自躺在正交平面上（xy / xz / yz 各有一个坐标为 0）', () => {
    const rings = sphereRings(0.5);
    for (const p of rings.ringXY) expect(p[2]).toBe(0);
    for (const p of rings.ringXZ) expect(p[1]).toBe(0);
    for (const p of rings.ringYZ) expect(p[0]).toBe(0);
  });
});

/* ============================================================
   几何缩放与纯函数性
   ============================================================ */

describe('声学 · 几何与纯度', () => {
  it('显示半径：t=0 → 0.28，t=3（r=1020 m）→ 2.52 m', () => {
    expect(close(dispRadiusOf(setupFromParams({ t: 0, v: 340 })), R_DISP_BASE)).toBe(true);
    expect(close(dispRadiusOf(setupFromParams({ t: 3, v: 340 })), 0.28 + 1020 * R_DISP_SCALE, 1e-9)).toBe(true);
  });

  it('sample 是纯函数：同参数两次调用深相等', () => {
    const a = acousticsSolver.sample(1.5, ctx({ t: 0.4, v: 340 }));
    const b = acousticsSolver.sample(1.5, ctx({ t: 0.4, v: 340 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('播放时间不进入任何物理读数（静态场景的参数驱动约定）', () => {
    const a = acousticsSolver.sample(0, ctx({ t: 0.4, v: 340 }));
    const b = acousticsSolver.sample(9.9, ctx({ t: 0.4, v: 340 }));
    expect(a.scalars).toEqual(b.scalars);
    expect(a.lines.ringXY).toEqual(b.lines.ringXY);
  });

  it('较早波前按 0.72 / 0.44 比例收缩', () => {
    const st = acousticsSolver.sample(0, ctx({ t: 1.2, v: 340 }));
    const R = dispRadiusOf(setupFromParams({ t: 1.2, v: 340 }));
    expect(OLD_RATIOS).toEqual([1, 0.72, 0.44]);
    expect(close(Math.hypot(...st.lines.oldringXY![0]!), R * 0.72, 1e-9)).toBe(true);
    expect(close(Math.hypot(...st.lines.olderringXY![0]!), R * 0.44, 1e-9)).toBe(true);
  });

  it('duration 固定 48 s（静态场景由脚本节奏决定）', () => {
    expect(acousticsSolver.duration(ctx({}))).toBe(DURATION);
  });

  it('珠点落在当前波前上（半径 = R，且三平面各 6 个）', () => {
    const st = acousticsSolver.sample(0, ctx({ t: 1.2, v: 340 }));
    const R = dispRadiusOf(setupFromParams({ t: 1.2, v: 340 }));
    for (let k = 0; k < 6; k++) {
      expect(close(Math.hypot(...st.points[`beadXY${k}`]!), R, 1e-9)).toBe(true);
      expect(close(Math.hypot(...st.points[`beadXZ${k}`]!), R, 1e-9)).toBe(true);
      expect(close(Math.hypot(...st.points[`beadYZ${k}`]!), R, 1e-9)).toBe(true);
    }
  });

  it('ringPoints 闭合且点数正确', () => {
    const pts = ringPoints('xy', 1, 72);
    expect(pts.length).toBe(73); // 闭合：首尾重合
    expect(close(Math.hypot(...pts[0]!), Math.hypot(...pts[36]!), 1e-9)).toBe(true);
  });
});
