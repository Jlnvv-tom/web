import React from 'react';

/** 本地预览壳专用的 next/link 替身 */
export default function Link({
  href,
  children,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  [k: string]: unknown;
}) {
  return React.createElement('a', { href, ...rest }, children);
}
