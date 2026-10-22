/**
 * 本地预览壳构建脚本
 *
 * 目的：在"没有 Next 编译器"的环境里，仍然能真实渲染并验证播放器。
 *  - esbuild 打包 React + R3F + 我们的组件（速度快、无原生二进制依赖）
 *  - postcss + @tailwindcss/postcss 生成与生产一致的样式
 *  - next/dynamic、next/link 用本地 stub 替换
 *
 * 用法：node harness/build.mjs
 * 产物：harness/dist/{index.html, bundle.js, app.css}
 */
import * as esbuild from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'harness', 'dist');

fs.mkdirSync(outDir, { recursive: true });

/* ---------- 1. JS / TSX ---------- */
const result = await esbuild.build({
  entryPoints: [path.join(root, 'harness', 'entry.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  sourcemap: false,
  minify: false,
  outfile: path.join(outDir, 'bundle.js'),
  tsconfig: path.join(root, 'tsconfig.json'),
  alias: {
    'next/dynamic': path.join(root, 'harness/stubs/next-dynamic.tsx'),
    'next/link': path.join(root, 'harness/stubs/next-link.tsx'),
  },
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.js': 'jsx' },
  logLevel: 'info',
  metafile: true,
});

/* ---------- 2. CSS ---------- */
const cssIn = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const cssOut = await postcss([tailwind()]).process(cssIn, {
  from: path.join(root, 'app', 'globals.css'),
  to: path.join(outDir, 'app.css'),
});
fs.writeFileSync(path.join(outDir, 'app.css'), cssOut.css);

/* ---------- 3. HTML ---------- */
fs.copyFileSync(path.join(root, 'harness', 'index.html'), path.join(outDir, 'index.html'));

/* ---------- 4. 报告 ---------- */
const sizes = Object.entries(result.metafile.outputs)
  .filter(([f]) => f.endsWith('.js'))
  .map(([, v]) => v.bytes);
console.log(
  `\n✅ harness built → ${path.relative(root, outDir)}  JS ${(Math.max(...sizes) / 1024).toFixed(0)} KB,` +
    ` CSS ${(fs.statSync(path.join(outDir, 'app.css')).size / 1024).toFixed(0)} KB`
);
