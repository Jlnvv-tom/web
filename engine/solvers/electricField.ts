/**
 * 电场求解器 —— 双点电荷（vp 静电场 + 试探电荷动力学）
 *
 * 对应规格：docs/specs/features/001-electric-field.spec.md
 *
 * 三块内容：
 *   1. 场量      V = kΣq/r、E = kΣq r̂/r²  —— 解析解，任意点可求
 *   2. 场线      dr/ds = Ê，RK4 沿弧长积分（解析式无法给出流线闭式解）
 *   3. 等势线    y=0 平面 marching squares + 线段拼接
 *
 * 缓存策略见 SPEC-011 REQ-SV-004 与 ADR-0002：
 *   key = 参数字典序拼接；命中返回**原引用**（渲染层靠引用判断是否重建几何）。
 */
import type { Vec3 } from '../vec';
import { dot, len, normalize, sub } from '../vec';
import type { ParamValues, SceneState } from '../spec';
import type { SolverCtx, SolverModule } from './types';
import { num, str } from './types';

/* ============================================================
   常量
   ============================================================ */

/** 库仑常数 k = 1/(4πε₀) */
export const K_E = 8.99e9;
/** 电荷单位换算：参数用 nC，内部用 C */
const NC = 1e-9;
/** 软化半径：r → 0 时 1/r² 发散，用 r² + ε² 兜底（见 assumptions） */
export const SOFT = 1e-4;

/** 场线积分步长（弧长，单位 m） */
const TRACE_STEP = 0.22;
/** 单条场线最多积分步数（≈ 88 m 弧长，足够跨出计算域） */
const TRACE_MAX_STEPS = 400;
/** 计算域半径：超出即认为"去了无穷远" */
const TRACE_MAX_R = 24;
/** 认为"抵达电荷"的距离 */
const HIT_R = 0.4;
/** 种子环半径 */
export const SEED_R = 0.45;
/** 平面模式每电荷种子数 */
export const PLANE_SEEDS = 32;
/** 立体模式每电荷种子数 */
export const SPHERE_SEEDS = 26;

/** 等势线网格：x,z ∈ [-GRID_L, GRID_L] */
export const GRID_N = 132;
export const GRID_L = 14;

/** 试探电荷积分：内步长 1 ms，每 8 步记录一次 → 输出 8 ms 一帧 */
const INNER_DT = 0.001;
const OUT_EVERY = 8;
export const OUT_DT = INNER_DT * OUT_EVERY;
const TRAJ_STEPS = 400;
/**
 * 示教粒子质量（kg）
 *
 * 取 1e-9 kg 是为了让 q/m = 1 C/kg 这个量级成立——否则 1 nC 的电荷配上 1 kg 质量，
 * 加速度只有 1e-9 m/s²，三秒内位移不到 1e-8 米，"看不到动"。
 * 与洛伦兹场景的示教粒子口径一致（见 assumptions）。
 */
const MASS = 1e-9;
/** 导出给测试与 HUD 使用 */
export const PROBE_MASS = MASS;

/* ============================================================
   电荷与场
   ============================================================ */

export type Charge = { p: Vec3; q: number; id: string };

export type ChargeSetup = {
  charges: Charge[];
  q1: number; // nC
  q2: number;
  d: number;
};

/** 从参数构造电荷布局：q₁ 在 -d/2，q₂ 在 +d/2（x 轴，y=0 平面） */
export function chargesFromParams(params: ParamValues): ChargeSetup {
  const q1 = num(params, 'q1', 3);
  const q2 = num(params, 'q2', -3);
  const d = Math.max(0.6, num(params, 'd', 6));
  return {
    q1,
    q2,
    d,
    charges: [
      { p: [-d / 2, 0, 0], q: q1 * NC, id: 'c1' },
      { p: [d / 2, 0, 0], q: q2 * NC, id: 'c2' },
    ],
  };
}

/** 电势 V(P) = k Σ qᵢ/rᵢ （伏特） */
export function potentialAt(p: Vec3, charges: Charge[]): number {
  let v = 0;
  for (const c of charges) {
    const dx = p[0] - c.p[0];
    const dy = p[1] - c.p[1];
    const dz = p[2] - c.p[2];
    const r2 = dx * dx + dy * dy + dz * dz + SOFT * SOFT;
    v += (K_E * c.q) / Math.sqrt(r2);
  }
  return v;
}

/** 场强 E(P) = k Σ qᵢ r̂ᵢ/rᵢ² （V/m） */
export function fieldAt(p: Vec3, charges: Charge[]): Vec3 {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (const c of charges) {
    const dx = p[0] - c.p[0];
    const dy = p[1] - c.p[1];
    const dz = p[2] - c.p[2];
    const r2 = dx * dx + dy * dy + dz * dz + SOFT * SOFT;
    // kq/r³ 乘上位移向量 = kq r̂/r²
    const inv = (K_E * c.q) / (r2 * Math.sqrt(r2));
    ex += inv * dx;
    ey += inv * dy;
    ez += inv * dz;
  }
  return [ex, ey, ez];
}

/** 单位场方向；场强过小（中性点附近）时返回 null，让积分停下而不是原地打转 */
function unitField(p: Vec3, charges: Charge[], sign: number): Vec3 | null {
  const e = fieldAt(p, charges);
  const l = len(e);
  if (!Number.isFinite(l) || l < 1e-7) return null;
  return [(sign * e[0]) / l, (sign * e[1]) / l, (sign * e[2]) / l];
}

/* ============================================================
   场线：dr/ds = ±Ê，RK4 弧长积分
   ============================================================ */

/** 沿单位场方向走一步（RK4），返回新位置 */
function rk4Step(p: Vec3, charges: Charge[], sign: number, h: number): Vec3 | null {
  const k1 = unitField(p, charges, sign);
  if (!k1) return null;
  const p2: Vec3 = [p[0] + (k1[0] * h) / 2, p[1] + (k1[1] * h) / 2, p[2] + (k1[2] * h) / 2];
  const k2 = unitField(p2, charges, sign);
  if (!k2) return null;
  const p3: Vec3 = [p[0] + (k2[0] * h) / 2, p[1] + (k2[1] * h) / 2, p[2] + (k2[2] * h) / 2];
  const k3 = unitField(p3, charges, sign);
  if (!k3) return null;
  const p4: Vec3 = [p[0] + k3[0] * h, p[1] + k3[1] * h, p[2] + k3[2] * h];
  const k4 = unitField(p4, charges, sign);
  if (!k4) return null;

  const dx = (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
  const dy = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
  const dz = (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) / 6;
  const n = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(n) || n < 1e-9) return null;
  // 归一化后按固定弧长推进，保证采样点间距均匀（视觉与数值都更稳）
  return [p[0] + (dx / n) * h, p[1] + (dy / n) * h, p[2] + (dz / n) * h];
}

/**
 * 从 start 沿 ±Ê 追踪一条场线。
 * sign = +1 顺场方向（正电荷出发），-1 逆场方向（负电荷反向追）。
 */
export function traceFieldLine(start: Vec3, sign: number, charges: Charge[]): Vec3[] {
  const pts: Vec3[] = [[start[0], start[1], start[2]]];
  let p: Vec3 = [start[0], start[1], start[2]];
  let prev: Vec3 | null = null;

  for (let i = 0; i < TRACE_MAX_STEPS; i++) {
    const next = rk4Step(p, charges, sign, TRACE_STEP);
    if (!next) break;

    // 折返检测：中性点附近方向场会突然反向，继续走只会在原地打转
    const dir = normalize(sub(next, p));
    if (prev && dot(dir, prev) < -0.5) break;
    prev = dir;

    p = next;
    pts.push(p);

    if (len(p) > TRACE_MAX_R) break;
    let hit = false;
    for (const c of charges) {
      if (len(sub(p, c.p)) < HIT_R) {
        hit = true;
        break;
      }
    }
    if (hit) break;
  }
  return pts;
}

/** 平面种子：电荷周围水平圆上均匀取 n 个点 */
export function planeSeeds(c: Charge, n = PLANE_SEEDS): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([c.p[0] + SEED_R * Math.cos(a), 0, c.p[2] + SEED_R * Math.sin(a)]);
  }
  return out;
}

/** 立体种子：Fibonacci 球面均匀取 n 个方向（避免极点堆积） */
export function sphereSeeds(c: Charge, n = SPHERE_SEEDS): Vec3[] {
  const out: Vec3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * ga;
    out.push([c.p[0] + SEED_R * r * Math.cos(phi), c.p[1] + SEED_R * y, c.p[2] + SEED_R * r * Math.sin(phi)]);
  }
  return out;
}

/**
 * 生成全部场线。
 *
 * 种子策略（避免同一条线画两遍，也避免出现"断成两截"的线）：
 * - 正电荷：顺场方向出发，永远保留；
 * - 负电荷：仅在**净电荷为负**时逆向追踪（此时确实存在"来自无穷远"的入线），
 *   且追到的终点若落在正电荷上则丢弃（与正向线重复）；
 * - 净电荷 ≥ 0 时，负电荷的所有入线都来自正电荷，无需重复追踪。
 */
export function buildFieldLines(charges: Charge[], mode: string): Vec3[][] {
  const lines: Vec3[][] = [];
  const netQ = charges.reduce((s, c) => s + c.q, 0);

  for (const c of charges) {
    if (Math.abs(c.q) < 1e-15) continue;
    const seeds = mode === 'plane' ? planeSeeds(c, PLANE_SEEDS) : sphereSeeds(c, SPHERE_SEEDS);

    if (c.q > 0) {
      for (const s of seeds) lines.push(traceFieldLine(s, 1, charges));
    } else {
      if (netQ >= 0) continue;
      for (const s of seeds) {
        const ln = traceFieldLine(s, -1, charges);
        const end = ln[ln.length - 1]!;
        let dup = false;
        for (const o of charges) {
          if (o.q > 0 && len(sub(end, o.p)) < HIT_R * 1.2) {
            dup = true;
            break;
          }
        }
        if (dup) continue;
        ln.reverse();
        lines.push(ln);
      }
    }
  }
  return lines;
}

/* ============================================================
   等势线：marching squares
   ============================================================ */

type Seg = [Vec3, Vec3];

/** 把碎线段拼成折线（开放链 + 闭环），减少 draw call */
export function joinSegments(segs: Seg[]): Vec3[][] {
  if (!segs.length) return [];
  const keyOf = (p: Vec3) => `${Math.round(p[0] * 1e5)}_${Math.round(p[2] * 1e5)}`;

  const adj = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s[0], s[1]]) {
      const k = keyOf(p);
      const arr = adj.get(k);
      if (arr) arr.push(i);
      else adj.set(k, [i]);
    }
  });

  const used = new Uint8Array(segs.length);
  const far = (i: number, k: string): Vec3 => {
    const [a, b] = segs[i]!;
    return keyOf(a) === k ? b : a;
  };

  const walk = (startKey: string, first: number): Vec3[] => {
    const pts: Vec3[] = [];
    const [a, b] = segs[first]!;
    pts.push(keyOf(a) === startKey ? a : b);

    let seg = first;
    let k = startKey;
    for (;;) {
      used[seg] = 1;
      const nb = far(seg, k);
      pts.push(nb);
      const nk = keyOf(nb);
      const cands = adj.get(nk) ?? [];
      let next = -1;
      for (const c of cands) {
        if (!used[c] && c !== seg) {
          next = c;
          break;
        }
      }
      if (next < 0) break;
      seg = next;
      k = nk;
    }
    return pts;
  };

  const out: Vec3[][] = [];
  // 先走开放曲线：从端点（度为 1）出发
  for (const [k, list] of adj) {
    if (list.length !== 1) continue;
    const s = list[0]!;
    if (!used[s]) out.push(walk(k, s));
  }
  // 剩下的是闭环
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    out.push(walk(keyOf(segs[i]![0]), i));
  }
  return out.filter((l) => l.length >= 3);
}

/** 单电平等势线 */
export function contoursAtLevel(charges: Charge[], level: number, grid?: Float64Array): Vec3[][] {
  const n = GRID_N;
  const L = GRID_L;
  const h = (2 * L) / n;
  const px = (i: number) => -L + i * h;
  const pz = (j: number) => -L + j * h;

  let V = grid;
  if (!V) {
    V = new Float64Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        V[j * (n + 1) + i] = potentialAt([px(i), 0, pz(j)], charges);
      }
    }
  }

  const at = (i: number, j: number) => V![j * (n + 1) + i]!;
  const interp = (x0: number, z0: number, v0: number, x1: number, z1: number, v1: number): Vec3 => {
    const dv = v1 - v0;
    const t = Math.abs(dv) < 1e-15 ? 0.5 : (level - v0) / dv;
    const tc = Math.min(1, Math.max(0, t));
    return [x0 + (x1 - x0) * tc, 0.012, z0 + (z1 - z0) * tc];
  };

  const segs: Seg[] = [];

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v00 = at(i, j);
      const v10 = at(i + 1, j);
      const v01 = at(i, j + 1);
      const v11 = at(i + 1, j + 1);

      let idx = 0;
      if (v00 > level) idx |= 1;
      if (v10 > level) idx |= 2;
      if (v11 > level) idx |= 4;
      if (v01 > level) idx |= 8;
      if (idx === 0 || idx === 15) continue;

      const eB = () => interp(px(i), pz(j), v00, px(i + 1), pz(j), v10);
      const eR = () => interp(px(i + 1), pz(j), v10, px(i + 1), pz(j + 1), v11);
      const eT = () => interp(px(i + 1), pz(j + 1), v11, px(i), pz(j + 1), v01);
      const eL = () => interp(px(i), pz(j + 1), v01, px(i), pz(j), v00);

      switch (idx) {
        case 1:
        case 14:
          segs.push([eL(), eB()]);
          break;
        case 2:
        case 13:
          segs.push([eB(), eR()]);
          break;
        case 3:
        case 12:
          segs.push([eL(), eR()]);
          break;
        case 4:
        case 11:
          segs.push([eR(), eT()]);
          break;
        case 6:
        case 9:
          segs.push([eB(), eT()]);
          break;
        case 7:
        case 8:
          segs.push([eT(), eL()]);
          break;
        case 5: {
          const center = (v00 + v10 + v01 + v11) / 4;
          if (center > level) {
            segs.push([eB(), eR()]);
            segs.push([eT(), eL()]);
          } else {
            segs.push([eL(), eB()]);
            segs.push([eR(), eT()]);
          }
          break;
        }
        case 10: {
          const center = (v00 + v10 + v01 + v11) / 4;
          if (center > level) {
            segs.push([eL(), eB()]);
            segs.push([eR(), eT()]);
          } else {
            segs.push([eB(), eR()]);
            segs.push([eT(), eL()]);
          }
          break;
        }
      }
    }
  }

  return joinSegments(segs);
}

export type EquipotentialSet = { level: number; lines: Vec3[][] };

/**
 * 全部等势线。
 *
 * 电平按 V₀ = k·max|q|/d 归一化，于是换电荷量、换间距时视觉密度保持稳定。
 * 异号电荷时额外画 V=0（中垂线）——它是最有教学价值的一条：电势为零，场强不为零。
 */
export function buildEquipotentials(charges: Charge[], d: number): EquipotentialSet[] {
  const maxQ = Math.max(Math.abs(charges[0]!.q), Math.abs(charges[1]!.q));
  const v0 = (K_E * maxQ) / Math.max(d, 0.6);
  const frames = [0.25, 0.5, 0.9, 1.6, 2.6, 4.2, 6.8];

  // 网格只算一次，所有电平复用
  const n = GRID_N;
  const L = GRID_L;
  const h = (2 * L) / n;
  const grid = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      grid[j * (n + 1) + i] = potentialAt([-L + i * h, 0, -L + j * h], charges);
    }
  }

  const levels: number[] = [];
  for (const f of frames) {
    levels.push(v0 * f);
    levels.push(-v0 * f);
  }
  if (charges[0]!.q * charges[1]!.q < 0) levels.push(0);

  return levels
    .map((level) => ({ level, lines: contoursAtLevel(charges, level, grid) }))
    .filter((s) => s.lines.length > 0);
}

/* ============================================================
   试探电荷动力学
   ============================================================ */

export type Trajectory = {
  pts: Vec3[];
  speeds: number[];
  /** 终止状态：captured 落到电荷上 / escaped 飞出计算域 / moving 仍在运动中 */
  end: 'captured' | 'escaped' | 'moving';
};

/**
 * 从静止释放的试探电荷轨迹：m r̈ = qₜ E(r)，RK4 内步长 1 ms。
 *
 * 预计算整条轨迹，`sample(t)` 只做查表 → 保证可回退、可任意跳帧（SPEC-011 REQ-SV-001）。
 */
export function buildTrajectory(start: Vec3, qt: number, charges: Charge[]): Trajectory {
  const pts: Vec3[] = [[start[0], start[1], start[2]]];
  const speeds: number[] = [0];

  let r: Vec3 = [start[0], start[1], start[2]];
  let v: Vec3 = [0, 0, 0];
  let end: Trajectory['end'] = 'moving';

  const acc = (p: Vec3): Vec3 => {
    const e = fieldAt(p, charges);
    const k = qt / MASS;
    return [k * e[0], k * e[1], k * e[2]];
  };

  for (let step = 0; step < TRAJ_STEPS; step++) {
    for (let micro = 0; micro < OUT_EVERY; micro++) {
      const a1 = acc(r);
      const r2: Vec3 = [r[0] + (v[0] * INNER_DT) / 2, r[1] + (v[1] * INNER_DT) / 2, r[2] + (v[2] * INNER_DT) / 2];
      const v2: Vec3 = [
        v[0] + (a1[0] * INNER_DT) / 2,
        v[1] + (a1[1] * INNER_DT) / 2,
        v[2] + (a1[2] * INNER_DT) / 2,
      ];
      const a2 = acc(r2);
      const r3: Vec3 = [r[0] + (v2[0] * INNER_DT) / 2, r[1] + (v2[1] * INNER_DT) / 2, r[2] + (v2[2] * INNER_DT) / 2];
      const v3: Vec3 = [
        v[0] + (a2[0] * INNER_DT) / 2,
        v[1] + (a2[1] * INNER_DT) / 2,
        v[2] + (a2[2] * INNER_DT) / 2,
      ];
      const a3 = acc(r3);
      const r4: Vec3 = [r[0] + v3[0] * INNER_DT, r[1] + v3[1] * INNER_DT, r[2] + v3[2] * INNER_DT];
      const v4: Vec3 = [v[0] + a3[0] * INNER_DT, v[1] + a3[1] * INNER_DT, v[2] + a3[2] * INNER_DT];
      const a4 = acc(r4);

      const c = INNER_DT / 6;
      r = [
        r[0] + c * (v[0] + 2 * v2[0] + 2 * v3[0] + v4[0]),
        r[1] + c * (v[1] + 2 * v2[1] + 2 * v3[1] + v4[1]),
        r[2] + c * (v[2] + 2 * v2[2] + 2 * v3[2] + v4[2]),
      ];
      v = [
        v[0] + c * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
        v[1] + c * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]),
        v[2] + c * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]),
      ];

      for (const ch of charges) {
        if (len(sub(r, ch.p)) < 0.28) {
          end = 'captured';
          break;
        }
      }
      if (end !== 'moving') break;
      if (len(r) > 26) {
        end = 'escaped';
        break;
      }
    }

    pts.push([r[0], r[1], r[2]]);
    speeds.push(len(v));
    if (end !== 'moving') break;
  }

  return { pts, speeds, end };
}

/* ============================================================
   缓存
   ============================================================ */

type Entry = {
  charges: Charge[];
  setup: ChargeSetup;
  fieldLines: Vec3[][];
  eqPos: Vec3[][];
  eqNeg: Vec3[][];
  eqZero: Vec3[][];
  traj: Trajectory;
  release: Vec3;
  qt: number;
  mode: string;
};

const CACHE = new Map<string, Entry>();
const CACHE_MAX = 8;

/** 缓存 key：参数字典序拼接（不依赖对象键顺序） */
export function paramKey(p: ParamValues): string {
  return Object.keys(p)
    .sort()
    .map((k) => `${k}=${String(p[k])}`)
    .join('|');
}

function buildEntry(params: ParamValues): Entry {
  const setup = chargesFromParams(params);
  const mode = str(params, 'mode', '3d');
  const qt = num(params, 'qt', 1) * NC;
  const ang = (num(params, 'pa', 90) * Math.PI) / 180;
  const pr = Math.max(0.8, num(params, 'pr', 5));
  const release: Vec3 = [pr * Math.cos(ang), 0, pr * Math.sin(ang)];

  const eq = buildEquipotentials(setup.charges, setup.d);
  const pos: Vec3[][] = [];
  const neg: Vec3[][] = [];
  const zero: Vec3[][] = [];
  for (const s of eq) {
    if (s.level > 1e-12) pos.push(...s.lines);
    else if (s.level < -1e-12) neg.push(...s.lines);
    else zero.push(...s.lines); // V=0：等量异号时的中垂面
  }

  return {
    charges: setup.charges,
    setup,
    fieldLines: buildFieldLines(setup.charges, mode),
    eqPos: pos,
    eqNeg: neg,
    eqZero: zero,
    traj: buildTrajectory(release, qt, setup.charges),
    release,
    qt,
    mode,
  };
}

function getEntry(params: ParamValues): Entry {
  const key = paramKey(params);
  const hit = CACHE.get(key);
  if (hit) return hit;

  const entry = buildEntry(params);
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, entry);
  return entry;
}

/** 测试用：清空缓存（避免用例之间互相污染） */
export function _clearCache() {
  CACHE.clear();
}

/** 轨迹末段抽稀到 maxN 点，避免超过渲染层单线点数上限 */
function thin(arr: Vec3[], count: number, maxN: number): Vec3[] {
  const n = Math.min(count, arr.length);
  if (n <= maxN) return arr.slice(0, n);
  const out: Vec3[] = [];
  const stride = (n - 1) / (maxN - 1);
  for (let i = 0; i < maxN; i++) out.push(arr[Math.round(i * stride)]!);
  return out;
}

/* ============================================================
   求解器
   ============================================================ */

export const electricFieldSolver: SolverModule = {
  kind: 'electricField',

  duration() {
    return TRAJ_STEPS * OUT_DT;
  },

  sample(t: number, ctx: SolverCtx): SceneState {
    const e = getEntry(ctx.params);
    const last = e.traj.pts.length - 1;
    const idx = Math.min(last, Math.max(0, Math.round(t / OUT_DT)));
    const probe = e.traj.pts[idx]!;
    const speed = e.traj.speeds[idx] ?? 0;

    const E = fieldAt(probe, e.charges);
    const V = potentialAt(probe, e.charges);
    const F: Vec3 = [e.qt * E[0], e.qt * E[1], e.qt * E[2]];

    const KE = 0.5 * MASS * speed * speed;
    const PE = e.qt * V;
    const [c1, c2] = e.charges as [Charge, Charge];

    return {
      t,
      points: {
        charge1: c1.p,
        charge2: c2.p,
        pos: probe,
        probe,
        release: e.release,
        label1: [c1.p[0], 1.6, c1.p[2]],
        label2: [c2.p[0], 1.6, c2.p[2]],
      },
      vectors: { E, F },
      lines: {
        trail: thin(e.traj.pts, idx + 1, 200),
      },
      // 引用稳定：命中缓存时是同一批数组，渲染层不会重建几何
      linesets: {
        fieldLines: e.fieldLines,
        equipPos: e.eqPos,
        equipNeg: e.eqNeg,
        equipZero: e.eqZero,
      },
      scalars: {
        E: len(E),
        V,
        F: len(F) * 1e9, // nN：1 nC 在 1 V/m 下受力 1e-9 N，否则读数永远显示 0.00
        speed,
        KE: KE * 1e9, // nJ
        PE: PE * 1e9,
        ME: (KE + PE) * 1e9,
        // 供图元显隐使用（同一位置放两种外观，按符号切换）
        q1pos: e.setup.q1 >= 0 ? 1 : 0,
        q1neg: e.setup.q1 < 0 ? 1 : 0,
        q2pos: e.setup.q2 >= 0 ? 1 : 0,
        q2neg: e.setup.q2 < 0 ? 1 : 0,
        r1: len(sub(probe, c1.p)),
      },
      meta: {
        state: idx >= last ? e.traj.end : 'moving',
        mode: e.mode,
        qt: e.qt / NC,
        q1: e.setup.q1,
        q2: e.setup.q2,
      },
    };
  },

  /** 守恒量自检：机械能漂移（相对值） */
  invariants(t: number, ctx: SolverCtx) {
    const e = getEntry(ctx.params);
    const last = e.traj.pts.length - 1;
    const i0 = 0;
    const i1 = Math.min(last, Math.max(0, Math.round(t / OUT_DT)));

    const energy = (i: number) => {
      const p = e.traj.pts[i]!;
      const v = e.traj.speeds[i] ?? 0;
      return 0.5 * MASS * v * v + e.qt * potentialAt(p, e.charges);
    };

    const e0 = energy(i0);
    const e1 = energy(i1);
    const scale = Math.max(1e-12, Math.abs(e0) + Math.abs(e1));
    return { energyDrift: (e1 - e0) / scale, energy0: e0, energy1: e1 };
  },
};
