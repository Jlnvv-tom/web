import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // MVP 阶段为纯静态站点：所有页面均可预渲染，部署到对象存储 + CDN 即可，
  // 无需 Node 运行时。V1 引入账号 / 班级作业后再切换为 Node 运行时。
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,

  // 导出成 /topics/electric-field/index.html 而不是 electric-field.html：
  // 这样对象存储 / nginx / python -m http.server 都能直接按目录索引命中，
  // 不需要额外配置 try_files 重写规则。
  trailingSlash: true,

  // 仓库外的锁文件会让 Next 误判 workspace 根目录（会去扫 ~ 下的 pnpm-lock.yaml），
  // 显式钉死在 web/ 这一层
  outputFileTracingRoot: __dirname,

  // three / @react-three 生态里仍有少量包带 legacy 字段，避免构建告警
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  // 场景 JSON 与求解器按需分包，避免首屏加载全部物理代码
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
};

export default nextConfig;
