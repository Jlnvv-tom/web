import { describe, expect, it } from 'vitest';
import { add, addScaled, cross, dot, len, lenSq, lerp, normalize, scale, sub, v3, ZERO } from '@/engine/vec';
import type { Vec3 } from '@/engine/vec';

const A: Vec3 = [1, 2, 3];
const B: Vec3 = [-4, 5, 0.5];

describe('vec · 基础运算', () => {
  it('加减与缩放', () => {
    expect(add(A, B)).toEqual([-3, 7, 3.5]);
    expect(sub(A, B)).toEqual([5, -3, 2.5]);
    expect(scale(A, 2)).toEqual([2, 4, 6]);
    expect(addScaled(A, B, 2)).toEqual([-7, 12, 4]);
  });

  it('点乘与长度', () => {
    expect(dot(A, B)).toBe(-4 + 10 + 1.5);
    expect(lenSq(A)).toBe(14);
    expect(len([3, 4, 0])).toBe(5);
  });

  it('叉乘垂直于两个因子', () => {
    const c = cross(A, B);
    expect(Math.abs(dot(c, A))).toBeLessThan(1e-12);
    expect(Math.abs(dot(c, B))).toBeLessThan(1e-12);
  });

  it('叉乘满足右手定则：x̂ × ŷ = ẑ', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });

  it('归一化：零向量不产生 NaN', () => {
    expect(normalize(ZERO)).toEqual([0, 0, 0]);
    expect(len(normalize(A))).toBeCloseTo(1, 12);
  });

  it('插值端点精确', () => {
    expect(lerp(A, B, 0)).toEqual(A);
    expect(lerp(A, B, 1)).toEqual(B);
    expect(lerp(A, B, 0.5)).toEqual([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]);
  });

  it('v3 默认 z=0', () => {
    expect(v3(1, 2)).toEqual([1, 2, 0]);
  });
});
