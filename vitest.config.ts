import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['engine/**/*.test.ts', 'lib/**/*.test.ts'],
    // 规格覆盖测试要读 docs/ 下的 markdown，本机文件访问经过沙箱代理较慢，
    // 默认 5s 在并行运行时不够
    testTimeout: 20000,
  },
});
