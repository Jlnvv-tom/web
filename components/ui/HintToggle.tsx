'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * 可展开的补充说明（M3 · 细节优化）
 *
 * 用来收纳"一次性说明"——参数滑块下那行灰字、导出按钮的解释等。
 *
 * **为什么是点击展开而不是 hover tooltip**：
 * 1. 移动端/平板没有 hover，老师用 iPad 讲课时这些文字会永远消失
 * 2. hover 内容无法用键盘到达，违反 Web Interface Guidelines 的焦点规则
 * 3. 点击展开可以同时服务"扫一眼快速模式"和"我要看细节"两种人
 *
 * 无障碍：按钮带 aria-expanded + aria-controls，内容区有 id，键盘 Enter/Space 可触发。
 */
export function HintToggle({
  children,
  label = '查看说明',
  className,
}: {
  children: React.ReactNode;
  /** 图标按钮的无障碍名称 */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? `收起${label}` : label}
        title={open ? '收起说明' : label}
        className="inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-stone-900/6 hover:text-cyan-800 focus-visible:outline-2 focus-visible:outline-cyan-700"
      >
        <Info size={12} aria-hidden="true" />
      </button>

      {open ? (
        <p
          id={id}
          className="mt-1.5 rounded-lg border border-stone-900/10 bg-stone-900/[0.03] px-2.5 py-1.5 text-[10.5px] leading-[1.75] text-stone-600"
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}
