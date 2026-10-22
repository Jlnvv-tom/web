/**
 * 离线单文件导出的运行时构建
 *
 * 产物只有两份，都放 public/standalone/：
 *   - runtime.js       播放器运行时（React + R3F + three + 全部渲染组件）
 *   - standalone.css   Tailwind 生成的全站样式
 *
 * 为什么不在这里就生成 12 个 HTML：
 *   那样每个 HTML 都要内联一份运行时 ≈ 1 MB，站点体积 ×12；
 *   改成「浏览器点导出时才 fetch 这两份、拼成一个 HTML」，
 *   磁盘上只存一份，用户拿到的仍然是单文件、零网络请求。
 *
 * 用法：node scripts/build-standalone.mjs
 */
import * as esbuild from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'standalone');

fs.mkdirSync(outDir, { recursive: true });

/* ---------- 1. 运行时 JS ---------- */
const result = await esbuild.build({
  entryPoints: [path.join(root, 'export', 'standalone.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  // 不要 sourcemap：内联进 HTML 会白占几百 KB，外链又破坏"单文件"
  sourcemap: false,
  outfile: path.join(outDir, 'runtime.js'),
  tsconfig: path.join(root, 'tsconfig.json'),
  alias: {
    // 离线版没有 Next，替换掉 loader 与 Link
    'next/dynamic': path.join(root, 'harness/stubs/next-dynamic.tsx'),
    'next/link': path.join(root, 'harness/stubs/next-link.tsx'),
  },
  // 所有 CSS import 直接丢掉：样式统一由下面的 Tailwind 产物提供，
  // 关键是 katex.min.css —— 它引用几十个 woff2，内联进来要多 600 KB+，
  // 而离线版已改用 MathML 输出，根本不需要它。
  loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
  metafile: true,
});

/* ---------- 2. 样式 ---------- */
const cssEntry = path.join(root, 'app', 'globals.css');
const cssIn = fs.readFileSync(cssEntry, 'utf8');
const cssRes = await postcss([tailwind()]).process(cssIn, { from: cssEntry, to: path.join(outDir, 'standalone.css') });
fs.writeFileSync(path.join(outDir, 'standalone.css'), cssRes.css);

/* ---------- 3. 报告 ---------- */
const jsBytes = fs.statSync(path.join(outDir, 'runtime.js')).size;
const cssBytes = fs.statSync(path.join(outDir, 'standalone.css')).size;
const kb = (n) => (n / 1024).toFixed(0);

console.log(
  `\n✅ 离线运行时 → public/standalone/  JS ${kb(jsBytes)} KB，CSS ${kb(cssBytes)} KB\n` +
    `   单场景导出的 HTML ≈ ${kb(jsBytes + cssBytes)} KB + 场景 JSON`
);

/* ---------- 4. 自检：样式里必须真的有播放器用到的类 ---------- */
const css = cssRes.css;
// 只检查真正定义在 globals.css 里的 @utility。
// 注意不含 .range-input —— 那个类在源里是悬空的（滑杆靠浏览器默认样式），
// 别把它写进断言，否则会得到一个永远失败的假警报。
const mustHave = ['.panel', '.chip', '.btn', '.formula'];
const missing = mustHave.filter((c) => !css.includes(c));
if (missing.length) {
  console.error(`\n❌ standalone.css 缺少关键类：${missing.join(', ')}`);
  console.error('   多半是 Tailwind 没扫描到 export/ 目录，检查 globals.css 的 @source');
  process.exitCode = 1;
}
if (!/\.(grid|flex)\b/.test(css)) {
  console.error('\n❌ standalone.css 里没有任何布局工具类，Tailwind 很可能没生效');
  process.exitCode = 1;
}

if (result.metafile) {
  const iife = Object.entries(result.metafile.outputs).find(([f]) => f.endsWith('runtime.js'));
  if (iife && iife[1].bytes > 2_500_000) {
    console.error(`\n⚠️  runtime.js 超过 2.5 MB（${kb(iife[1].bytes)} KB），单文件会很难下载`);
  }
}
