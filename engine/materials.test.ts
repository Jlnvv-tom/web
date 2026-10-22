import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  MATERIAL_KINDS,
  isMaterialKind,
  needsTransmission,
  resolveMaterial,
} from './materials';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('材质库 · 预设本身', () => {
  it('六种材质齐全（新增材质必须是显式行为）', () => {
    expect(MATERIAL_KINDS.sort()).toEqual(
      ['chalk', 'clay', 'glass', 'jelly', 'linen', 'metal', 'wood'].sort()
    );
  });

  it('所有预设的颜色是合法 6 位十六进制', () => {
    for (const k of MATERIAL_KINDS) expect(MATERIALS[k].color, k).toMatch(HEX);
  });

  it('所有预设的 roughness / metalness 都在 [0,1] 内', () => {
    for (const k of MATERIAL_KINDS) {
      const m = MATERIALS[k];
      expect(m.roughness, k).toBeGreaterThanOrEqual(0);
      expect(m.roughness, k).toBeLessThanOrEqual(1);
      expect(m.metalness, k).toBeGreaterThanOrEqual(0);
      expect(m.metalness, k).toBeLessThanOrEqual(1);
    }
  });

  it('金属必须"够金属"：metalness ≥ 0.85 且 roughness ≤ 0.4', () => {
    // 低于这条线在暖光下会变成灰塑料——这是实测出来的门槛
    expect(MATERIALS.metal.metalness).toBeGreaterThanOrEqual(0.85);
    expect(MATERIALS.metal.roughness).toBeLessThanOrEqual(0.4);
  });

  it('玻璃用真实折射率 1.5，且透射足够高', () => {
    expect(MATERIALS.glass.ior).toBe(1.5);
    expect(MATERIALS.glass.transmission).toBeGreaterThanOrEqual(0.85);
  });

  it('凡是开了透射的材质，都必须给低画质档位留 fallbackOpacity', () => {
    for (const k of MATERIAL_KINDS) {
      const m = MATERIALS[k];
      if ((m.transmission ?? 0) > 0.01) {
        expect(m.fallbackOpacity, `${k} 缺 fallbackOpacity`).toBeDefined();
        expect(m.fallbackOpacity!).toBeGreaterThan(0);
        expect(m.fallbackOpacity!).toBeLessThan(1);
      }
    }
  });

  it('只有木头和亚麻带程序化贴图', () => {
    const textured = MATERIAL_KINDS.filter((k) => MATERIALS[k].texture);
    expect(textured.sort()).toEqual(['linen', 'wood']);
  });
});

describe('材质库 · 解析与覆盖', () => {
  it('不指定材质时保持 M2 的默认值（否则未迁移的场景会悄悄变样）', () => {
    const m = resolveMaterial(undefined);
    expect(m.metalness).toBe(0.85);
    expect(m.roughness).toBe(0.3);
    expect(m.clearcoat).toBe(0.4);
    expect(m.envMapIntensity).toBe(1.1);
    expect(m.transmission).toBe(0);
    expect(m.texture).toBeNull();
  });

  it('指定材质时用预设值', () => {
    const m = resolveMaterial('wood');
    expect(m.color).toBe(MATERIALS.wood.color);
    expect(m.roughness).toBe(MATERIALS.wood.roughness);
    expect(m.texture).toBe('wood');
  });

  it('显式 color 覆盖预设，其余字段保持预设（黄铜就是这么做的）', () => {
    const brass = resolveMaterial('metal', { color: '#D4AF37' });
    expect(brass.color).toBe('#D4AF37');
    expect(brass.metalness).toBe(MATERIALS.metal.metalness);
    expect(brass.roughness).toBe(MATERIALS.metal.roughness);
  });

  it('显式 roughness 只覆盖 roughness', () => {
    const m = resolveMaterial('clay', { roughness: 0.4 });
    expect(m.roughness).toBe(0.4);
    expect(m.color).toBe(MATERIALS.clay.color);
  });

  it('显式 opacity 生效，且不会被预设清零', () => {
    expect(resolveMaterial('clay', { opacity: 0.5 }).opacity).toBe(0.5);
    expect(resolveMaterial('clay').opacity).toBe(1);
  });

  it('undefined 覆盖值视为"没写"，回落到预设（不会被当成 0）', () => {
    const m = resolveMaterial('metal', { roughness: undefined, color: undefined });
    expect(m.roughness).toBe(MATERIALS.metal.roughness);
    expect(m.color).toBe(MATERIALS.metal.color);
  });

  it('needsTransmission 只对玻璃与胶体为真', () => {
    const withT = MATERIAL_KINDS.filter((k) => needsTransmission(resolveMaterial(k)));
    expect(withT.sort()).toEqual(['glass', 'jelly']);
    expect(needsTransmission(resolveMaterial(undefined))).toBe(false);
  });

  it('isMaterialKind 能挡住拼错的材质名', () => {
    expect(isMaterialKind('wood')).toBe(true);
    expect(isMaterialKind('wod')).toBe(false);
    expect(isMaterialKind(undefined)).toBe(false);
    expect(isMaterialKind(42)).toBe(false);
  });

  it('解析结果是纯数据，改它不会污染预设表', () => {
    const a = resolveMaterial('metal');
    a.color = '#000000';
    expect(resolveMaterial('metal').color).toBe(MATERIALS.metal.color);
  });
});
