import React, { Suspense } from 'react';

/**
 * 本地预览壳专用的 next/dynamic 替身。
 * 生产构建走真 Next，这里只为在无 Next 编译器时也能渲染真实组件。
 */
export default function dynamic<T extends React.ComponentType<Record<string, unknown>>>(
  loader: () => Promise<{ default: T } | Record<string, unknown>>,
  opts?: { ssr?: boolean; loading?: React.ComponentType }
) {
  const Lazy = React.lazy(async () => {
    const mod = (await loader()) as Record<string, unknown>;
    const Comp = (mod.default ?? mod) as T;
    return { default: Comp as React.ComponentType<Record<string, unknown>> };
  });

  return function Dynamic(props: Record<string, unknown>) {
    const Fallback = opts?.loading;
    return React.createElement(
      Suspense,
      { fallback: Fallback ? React.createElement(Fallback) : null },
      React.createElement(Lazy, props)
    );
  };
}
