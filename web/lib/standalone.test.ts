import { describe, expect, it } from 'vitest';
import {
  buildStandaloneHtml,
  escapeForScript,
  standaloneBadge,
  standaloneFilename,
} from './standalone';
import { SCENES } from '@/content/scenes';
import type { SceneSpec } from '@/engine/spec';

const base = SCENES[0]!;

/** 从产物里把 #scene-data 的内容抠出来 */
function extractSpecJson(html: string): string {
  const open = '<script id="scene-data" type="application/json">';
  const i = html.indexOf(open);
  expect(i).toBeGreaterThan(-1);
  const start = i + open.length;
  const end = html.indexOf('</script>', start);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('离线导出 · 脚本转义', () => {
  it('打断 </script 序列（大小写不敏感）', () => {
    expect(escapeForScript('a</script>b')).toBe('a<\\/script>b');
    // 替换时统一成小写，因此只断言「序列被切断」这个不变量，不断言大小写被保留：
    // 这个函数只处理 JS 字符串与 JSON 字符串，`\/` 在两种语法里都还原成 `/`。
    expect(escapeForScript('</SCRIPT>')).not.toMatch(/<\/script/i);
    expect(escapeForScript('<//script>')).toContain('<//script>'); // 不是结束标签，不该动
  });

  it('打断 <!-- 序列（HTML 注释会让脚本提前结束解析）', () => {
    expect(escapeForScript('<!-- x')).toBe('<\\!-- x');
  });

  it('转义行分隔符，避免旧引擎把它当换行导致 JSON 断裂', () => {
    expect(escapeForScript('a\u2028b\u2029c')).toBe('a\\u2028b\\u2029c');
  });

  it('普通中文与数学符号不被破坏', () => {
    const s = '磁通量 Φ = μ₀·a²·m/(2(a²+x²)^{3/2}) < 0.5';
    expect(escapeForScript(s)).toBe(s.replace('<!--', '<\\!--'));
  });
});

describe('离线导出 · HTML 拼装', () => {
  const html = buildStandaloneHtml({ spec: base, runtimeJs: 'console.log(1)', css: '.a{color:red}' });

  it('是完整 HTML 文档', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('lang="zh-CN"');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('内联样式与运行时，不引用任何外部资源', () => {
    expect(html).toContain('.a{color:red}');
    expect(html).toContain('console.log(1)');
    // 离线包必须零网络请求：不能有 src/href 指向 http(s) 的地方
    expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/i);
    expect(html).not.toContain('<link');
  });

  it('场景 JSON 能被原样解析回来', () => {
    const raw = extractSpecJson(html);
    const spec = JSON.parse(raw) as SceneSpec;
    expect(spec.meta.id).toBe(base.meta.id);
    expect(spec.script.length).toBe(base.script.length);
    expect(spec.meta.title).toBe(base.meta.title);
  });

  it('标题做了 HTML 转义，不会因为场景名里的尖括号破坏 head', () => {
    const weird = { ...base, meta: { ...base.meta, title: 'A<B>&"C"' } } as SceneSpec;
    const h = buildStandaloneHtml({ spec: weird, runtimeJs: '', css: '' });
    expect(h).toContain('A&lt;B&gt;&amp;&quot;C&quot;');
    expect(h).not.toContain('<title>A<B>');
  });

  it('场景文本里含 </script> 也不会提前截断数据块', () => {
    const evil = {
      ...base,
      script: [{ at: 0, text: '注意 </script> 这个序列' }, ...base.script.slice(1)],
    } as SceneSpec;
    const h = buildStandaloneHtml({ spec: evil, runtimeJs: '', css: '' });
    // 数据块内不能出现裸的结束标签
    expect(extractSpecJson(h)).not.toContain('</script>');
    // 转义后仍能解析回原文
    expect((JSON.parse(extractSpecJson(h)) as SceneSpec).script[0]!.text).toContain('</script>');
  });

  it('注入关闭埋点的开关（离线版不在别人电脑上留痕）', () => {
    expect(html).toContain('window.__NO_TELEMETRY__ = true');
  });

  it('带上 WebGL 起不来时的兜底提示', () => {
    expect(html).toContain('三维场景未能启动');
    expect(html).toContain('WebGL');
  });

  it('12 个场景全都能拼装且 JSON 可解析', () => {
    for (const spec of SCENES) {
      const h = buildStandaloneHtml({ spec, runtimeJs: 'void 0', css: '' });
      const back = JSON.parse(extractSpecJson(h)) as SceneSpec;
      expect(back.meta.id, spec.meta.id).toBe(spec.meta.id);
      expect(back.objects.length, spec.meta.id).toBe(spec.objects.length);
    }
  });
});

describe('离线导出 · 文件名与徽标', () => {
  it('文件名只用 id，且带前缀与扩展名', () => {
    expect(standaloneFilename(base)).toBe(`physics3d-${base.meta.id}.html`);
  });

  it('id 里出现非法字符时被替换，不会生成带路径的文件名', () => {
    const weird = { ...base, meta: { ...base.meta, id: 'a/b c?' } } as SceneSpec;
    expect(standaloneFilename(weird)).toBe('physics3d-a-b-c-.html');
  });

  it('徽标串包含学段、难度与时长', () => {
    const b = standaloneBadge(base);
    expect(b).toContain('分钟');
    expect(b).toContain('·');
  });
});
