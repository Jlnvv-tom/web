/**
 * 规格治理契约测试（2026-10-25）
 *
 * 让"文档也钉进 npm test"：代码有契约测试看守，规格文档的自身一致性
 * 同样由本文件机器看守。背景：2026-10-25 审计发现 SPEC-010 的版本号在
 * 索引（0.2）/ 头部（0.3）/ 变更记录（0.4）三处互相矛盾——
 * "规格是唯一的真相来源"，但真相来源自身没人看守。
 *
 * 看守四件事（对应 docs/README.md §4 的一致性约定）：
 * 1. 每份 spec 头部 状态/版本/最后更新 齐全（模板必填字段）；
 * 2. 版本三处一致：spec 头部 == 规格索引（specs/README.md）== 文档地图（docs/README.md）
 *    ==（若有）变更记录最后一行；
 * 3. 根 README 的场景表与求解器清单 == 注册表实况（口径防漂移）；
 * 4. 宪法第六条：components/ 与 app/ 不得出现场景 id 字面量（从人工评审升级为断言）。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES } from '@/content/scenes';
import { SOLVER_KINDS } from '@/engine/solvers';

const ROOT = path.resolve(process.cwd(), '..'); // 项目根（web/ 的上一级）
const SPECS_DIR = path.join(ROOT, 'docs/specs');
const FEATURES_DIR = path.join(SPECS_DIR, 'features');
const INDEX = fs.readFileSync(path.join(SPECS_DIR, 'README.md'), 'utf8');
const DOC_MAP = fs.readFileSync(path.join(ROOT, 'docs/README.md'), 'utf8');
const ROOT_README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const PLATFORM_SPECS = fs
  .readdirSync(SPECS_DIR)
  .filter((f) => /^\d{3}-.*\.spec\.md$/.test(f))
  .sort();
const FEATURE_SPECS = fs
  .readdirSync(FEATURES_DIR)
  .filter((f) => f.endsWith('.spec.md') && !f.startsWith('_'))
  .sort();

const ALL_SPECS = [
  ...PLATFORM_SPECS.map((f) => path.join(SPECS_DIR, f)),
  ...FEATURE_SPECS.map((f) => path.join(FEATURES_DIR, f)),
];

function readSpec(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function headerField(text: string, field: string): string | undefined {
  return text.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'))?.[1];
}

/** 变更记录表格最后一行的版本号（无变更记录的 spec 返回 undefined） */
function lastChangelogVersion(text: string): string | undefined {
  const section = text.match(/##[^#\n]*变更记录[\s\S]*?(?=\n## |\n---|$)/);
  if (!section) return undefined;
  const rows = section[0]
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .filter((l) => !/^\|\s*版本/.test(l) && !l.includes('---'));
  const last = rows.at(-1);
  return last?.split('|')[1]?.trim();
}

/** 从 markdown 表格里取包含 link 的那一行，返回其单元格 */
function tableRowCells(source: string, link: string): string[] {
  const line = source.split('\n').find((l) => l.includes(link));
  return (line ?? '').split('|').map((c) => c.trim());
}

describe('规格治理 · 头部必填字段', () => {
  it('每份 spec（平台 + 特性）都有 状态 / 版本 / 最后更新', () => {
    const missing: string[] = [];
    for (const file of ALL_SPECS) {
      const text = readSpec(file);
      for (const field of ['状态', '版本', '最后更新']) {
        if (!headerField(text, field)) missing.push(`${path.basename(file)}: 缺 ${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('spec 目录非空（扫描机制本身失效时报警）', () => {
    expect(PLATFORM_SPECS.length).toBeGreaterThanOrEqual(5);
    expect(FEATURE_SPECS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('规格治理 · 版本三处一致', () => {
  it('平台规格：头部 == 索引登记 == 文档地图登记 == 变更记录末行', () => {
    const problems: string[] = [];
    for (const file of PLATFORM_SPECS) {
      const text = readSpec(path.join(SPECS_DIR, file));
      const header = headerField(text, '版本');
      expect(header, `${file} 头部缺版本`).toBeTruthy();

      const indexCells = tableRowCells(INDEX, `./${file}`);
      const indexVersion = indexCells[4]?.replace(/^v/, '');
      if (indexVersion !== header) {
        problems.push(`${file}: 索引写 ${indexVersion ?? '(未登记)'}，头部写 ${header}`);
      }

      const mapCells = tableRowCells(DOC_MAP, `./specs/${file}`);
      const mapVersion = mapCells.at(-2)?.replace(/^v/, ''); // 行尾 | 使末元素为空串
      if (mapVersion !== header) {
        problems.push(`${file}: 文档地图写 ${mapVersion ?? '(未登记)'}，头部写 ${header}`);
      }

      const changelog = lastChangelogVersion(text);
      if (changelog !== undefined && changelog !== header) {
        problems.push(`${file}: 变更记录末行 ${changelog}，头部 ${header}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('规格治理 · 根 README 口径与注册表一致', () => {
  it('已上线场景表覆盖且仅覆盖注册表里的全部场景', () => {
    const listed = new Set(
      [...ROOT_README.matchAll(/\]\(web\/content\/scenes\/([a-z0-9-]+)\.scene\.ts\)/g)].map(
        (m) => m[1],
      ),
    );
    const registry = new Set(SCENES.map((s) => s.meta.id));
    expect([...registry].filter((id) => !listed.has(id)), 'README 场景表漏了：').toEqual([]);
    expect([...listed].filter((id) => !registry.has(id)), 'README 场景表多了：').toEqual([]);
  });

  it('求解器清单与 SOLVER 注册表一致', () => {
    const marker = ROOT_README.indexOf('求解器清单');
    expect(marker).toBeGreaterThan(0);
    const block = ROOT_README.slice(marker).split('\n\n')[0] ?? '';
    const listed = new Set([...block.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]));
    const registry = new Set<string>(SOLVER_KINDS);
    expect([...registry].filter((k) => !listed.has(k)), 'README 求解器清单漏了：').toEqual([]);
    expect([...listed].filter((k) => !registry.has(k)), 'README 求解器清单多了：').toEqual([]);
  });
});

describe('规格治理 · 宪法第六条（渲染层零场景 id）', () => {
  it('components/ 与 app/ 不出现任何场景 id 字面量', () => {
    const sceneIds = SCENES.map((s) => s.meta.id);
    const dirs = ['components', 'app'].map((d) => path.join(process.cwd(), d));
    const violations: string[] = [];

    function walk(dir: string): void {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const lines = fs.readFileSync(p, 'utf8').split('\n');
          lines.forEach((line, i) => {
            for (const id of sceneIds) {
              if (new RegExp(`['"\`]${id}['"\`]`).test(line)) {
                violations.push(`${path.relative(process.cwd(), p)}:${i + 1} 出现 '${id}'`);
              }
            }
          });
        }
      }
    }
    for (const dir of dirs) walk(dir);

    expect(violations, '渲染层不得按场景特判（宪法第六条）').toEqual([]);
  });
});
