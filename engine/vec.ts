/**
 * 轻量三维向量工具
 *
 * 刻意不依赖 three —— 求解器必须能在 Node 里直接单测，
 * 不能被 WebGL / DOM 环境绑架。
 */

export type Vec3 = [number, number, number];

export const v3 = (x: number, y: number, z = 0): Vec3 => [x, y, z];
export const ZERO: Vec3 = [0, 0, 0];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const addScaled = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const len = (a: Vec3): number => Math.sqrt(dot(a, a));

export const lenSq = (a: Vec3): number => dot(a, a);

export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

/** 绕任意单位轴旋转（Rodrigues 公式） */
export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

/** 与 axis 垂直的分量 */
export function rejectFrom(v: Vec3, axis: Vec3): Vec3 {
  const k = normalize(axis);
  return sub(v, scale(k, dot(v, k)));
}

/** 与 axis 平行的分量 */
export function projectOn(v: Vec3, axis: Vec3): Vec3 {
  const k = normalize(axis);
  return scale(k, dot(v, k));
}

/** 数值积分：经典四阶 Runge–Kutta（用于无解析解的场景，如带阻力） */
export function rk4Step(
  y: number[],
  dt: number,
  f: (y: number[]) => number[]
): number[] {
  const n = y.length;
  const k1 = f(y);
  const y2 = new Array<number>(n);
  for (let i = 0; i < n; i++) y2[i] = y[i] + (dt / 2) * k1[i]!;
  const k2 = f(y2);
  const y3 = new Array<number>(n);
  for (let i = 0; i < n; i++) y3[i] = y[i] + (dt / 2) * k2[i]!;
  const k3 = f(y3);
  const y4 = new Array<number>(n);
  for (let i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i]!;
  const k4 = f(y4);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = y[i]! + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }
  return out;
}

/** 角度/弧度 */
export const DEG = Math.PI / 180;
export const toDeg = (rad: number): number => rad / DEG;

/** 保留 n 位小数的字符串（HUD 用） */
export const fmt = (x: number, digits = 2): string => {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return x.toExponential(1);
  return x.toFixed(digits);
};
