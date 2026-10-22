/**
 * 规格覆盖测试（REQ-SC-012）
 *
 * 让"先写 spec"从口号变成机制：漏写规格 = 测试失败。
 * 扫描 docs/specs/features/*.spec.md 头部的 `场景: <id>` 行，与场景注册表做双向差集。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from '@/content/scenes';

const FEATURE_DIR = path.resolve(process.cwd(), '../docs/specs/features');

/** 读取所有特性规格的「场景」声明 */
function readSpecScenes(): Map<string, string> {
  const out = new Map<string, string>();
  const files = fs.readdirSync(FEATURE_DIR).filter((f) => f.endsWith('.spec.md') && !f.startsWith('_'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(FEATURE_DIR, f), 'utf8');
    const m = text.match(/^场景:\s*([a-z0-9-]+)\s*$/m);
    if (m) out.set(m[1]!, f);
  }
  return out;
}

describe('规格覆盖', () => {
  it('每个场景都有对应的特性规格', () => {
    const specs = readSpecScenes();
    const missing = SCENES.filter((s) => !specs.has(s.meta.id)).map((s) => s.meta.id);
    expect(missing, `缺少规格文档：${missing.join(', ')}`).toEqual([]);
  });

  it('规格里的场景 id 都真实存在（避免改名后留下孤儿文档）', () => {
    const ids = new Set(SCENES.map((s) => s.meta.id));
    const orphans = [...readSpecScenes().keys()].filter((id) => !ids.has(id));
    expect(orphans, `孤儿规格：${orphans.join(', ')}`).toEqual([]);
  });

  it('规格头部包含状态与需求编号（便于追溯）', () => {
    const specs = readSpecScenes();
    for (const [id, file] of specs) {
      const text = fs.readFileSync(path.join(FEATURE_DIR, file), 'utf8');
      expect(/^状态:\s*\S+/m.test(text), `${file} 缺少「状态」`).toBe(true);
      expect(/REQ-[A-Z]+-\d+/.test(text), `${file} 缺少需求编号`).toBe(true);
      expect(id.length).toBeGreaterThan(2);
    }
  });
});
