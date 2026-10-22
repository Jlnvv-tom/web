'use client';

import { useEffect, useRef } from 'react';

/**
 * 会"滚动"的读数（M3 · W3）
 *
 * 为什么要它：滑块一动，读数从 12.94 直接跳到 18.20，人眼捕捉不到中间过程，
 * 感觉像"刷新了一下"而不是"我推动了什么"。120 ms 的缓动能把这两件事连起来。
 *
 * 为什么直写 `textContent` 而不用 state：
 * HUD 有 12–15 个读数，若每个都用 state 做 60 fps 补间，
 * 每秒 900 次 React 重渲染——为一个装饰效果付这个代价不合理。
 * 直写 DOM 不触发任何重渲染，帧率零影响。
 */

export type EasedNumberProps = {
  value: number;
  digits: number;
  className?: string;
  /** 补间时长（毫秒），默认 120 */
  duration?: number;
};

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function EasedNumber({ value, digits, className, duration = 120 }: EasedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  /** 上一帧显示到的值；补间从它出发 */
  const shown = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const from = shown.current;
    const to = value;

    // 非有限值（NaN/Infinity）直接落位，别做无意义的补间
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to || reducedMotion()) {
      el.textContent = to.toFixed(digits);
      shown.current = to;
      return;
    }

    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const v = from + (to - from) * easeOutCubic(k);
      el.textContent = v.toFixed(digits);
      if (k < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        el.textContent = to.toFixed(digits);
        shown.current = to;
      }
    };

    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, digits, duration]);

  // 首次渲染就要有正确文本，避免 SSR 与首帧闪空
  return (
    <span ref={ref} className={className}>
      {value.toFixed(digits)}
    </span>
  );
}
