import { StrictMode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '物理 3D · 初高中物理概念讲解库',
    template: '%s · 物理 3D',
  },
  description:
    '可旋转、可调参、有讲解的初高中物理 3D 概念库。按知识点组织，每个知识点一个真 3D 场景 + 分步讲解 + 易错点 + 配套练习。',
  keywords: ['物理', '3D', '可视化', '初中物理', '高中物理', '交互仿真', '洛伦兹力', '抛体运动'],
  authors: [{ name: '物理 3D' }],
  openGraph: {
    title: '物理 3D · 初高中物理概念讲解库',
    description: '把抽象的物理规律变成可以转动、可以调参、可以讲透的三维画面。',
    type: 'website',
    locale: 'zh_CN',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#04070d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen text-stone-800 antialiased">{children}</body>
    </html>
  );
}
