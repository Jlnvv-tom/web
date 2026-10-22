#!/usr/bin/env python3
"""深色 → 浅色 类名映射（一次性迁移脚本）

原则：**保持相对层级，反转明暗极性**。
深色模式下 text-slate-100 是"最亮的字"（标题），浅色下对应的应该是"最深的字"。
所以不是简单地把 100↔900 对调，而是按"视觉权重"重新分配：

  深色 100/200/300/400/500/600  →  浅色 900/800/700/600/600/500

强调色统一从 400 档降到 700 档 —— 400 档（#22d3ee）在白底上对比度只有 1.9:1，
700 档（#0e7490）是 4.9:1，这才是"能用在正文里的青"。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 顺序敏感：长的先替换，避免 text-cyan-400 吃掉 text-cyan-400/80
MAP = {
    # ---- 文字 ----
    'text-slate-100': 'text-stone-900',
    'text-slate-200': 'text-stone-800',
    'text-slate-300': 'text-stone-700',
    'text-slate-400': 'text-stone-600',
    'text-slate-500': 'text-stone-600',
    'text-slate-600': 'text-stone-500',
    'text-slate-700': 'text-stone-500',
    'text-white/10': 'text-stone-900/15',
    'text-white': 'text-stone-900',
    'text-cyan-300/90': 'text-cyan-800/90',
    'text-cyan-300': 'text-cyan-800',
    'text-cyan-400/90': 'text-cyan-700/90',
    'text-cyan-400/80': 'text-cyan-700/80',
    'text-cyan-400/70': 'text-cyan-700/70',
    'text-cyan-400': 'text-cyan-700',
    'text-cyan-200': 'text-cyan-800',
    'text-emerald-200/85': 'text-emerald-800/85',
    'text-emerald-200': 'text-emerald-800',
    'text-emerald-300': 'text-emerald-700',
    'text-emerald-400': 'text-emerald-700',
    'text-amber-300/90': 'text-amber-700/90',
    'text-amber-300': 'text-amber-700',
    'text-amber-200/90': 'text-amber-800/90',
    'text-amber-200/85': 'text-amber-800/85',
    'text-amber-200': 'text-amber-800',
    'text-amber-400': 'text-amber-700',
    'text-red-300/80': 'text-red-800/80',
    'text-red-200/80': 'text-red-800/80',
    'text-red-200': 'text-red-800',
    'text-red-400': 'text-red-700',
    # ---- 背景 ----
    'bg-white/12': 'bg-stone-900/8',
    'bg-white/6': 'bg-stone-900/6',
    'bg-white/5': 'bg-stone-900/5',
    'bg-slate-700': 'bg-stone-200',
    'bg-black/45': 'bg-stone-900/30',
    'bg-cyan-400/20': 'bg-cyan-600/14',
    'bg-cyan-400/16': 'bg-cyan-600/12',
    'bg-cyan-400/15': 'bg-cyan-600/12',
    'bg-cyan-400/12': 'bg-cyan-600/10',
    'bg-cyan-400/10': 'bg-cyan-600/10',
    'bg-cyan-400/8': 'bg-cyan-600/8',
    'bg-cyan-400/80': 'bg-cyan-600/80',
    'bg-cyan-400': 'bg-cyan-600',
    'bg-amber-400/12': 'bg-amber-500/14',
    'bg-amber-400/8': 'bg-amber-500/10',
    'bg-amber-400': 'bg-amber-500',
    'bg-emerald-500/8': 'bg-emerald-600/10',
    'bg-emerald-400/12': 'bg-emerald-600/12',
    'bg-emerald-400/8': 'bg-emerald-600/10',
    'bg-red-500/8': 'bg-red-600/10',
    'bg-red-400/10': 'bg-red-600/12',
    # ---- 边框 ----
    'border-white/25': 'border-stone-900/20',
    'border-white/10': 'border-stone-900/14',
    'border-white/8': 'border-stone-900/12',
    'border-white/6': 'border-stone-900/10',
    'border-cyan-400/60': 'border-cyan-700/55',
    'border-cyan-400/50': 'border-cyan-700/50',
    'border-cyan-400/40': 'border-cyan-700/40',
    'border-cyan-400/35': 'border-cyan-700/35',
    'border-cyan-400/30': 'border-cyan-700/30',
    'border-cyan-400/25': 'border-cyan-700/25',
    'border-cyan-400/20': 'border-cyan-700/25',
    'border-emerald-400/50': 'border-emerald-700/45',
    'border-red-400/40': 'border-red-700/40',
    'border-amber-400/25': 'border-amber-700/30',
    # ---- 渐变 ----
    'from-emerald-400/20': 'from-emerald-600/15',
    'from-cyan-400/30': 'from-cyan-600/20',
    'from-cyan-400/20': 'from-cyan-600/15',
    'from-cyan-400': 'from-cyan-700',
    'from-cyan-300': 'from-cyan-700',
    'to-sky-500': 'to-sky-800',
    'to-sky-400': 'to-sky-700',
    # ---- 分割线 ----
    'divide-white/5': 'divide-stone-900/10',
    'divide-white': 'divide-stone-300',
}

# 方括号写死的任意值颜色。第一版漏了这类，导致头部导航栏与 logo
# 留着深色底 + 深色文字（完全看不见）—— 映射表必须覆盖任意值写法。
ARBITRARY = {
    'bg-[#04070d]': 'bg-[#f6f3ee]',
    'bg-[#04070d]/80': 'bg-[#f6f3ee]/85',
    'bg-[#061019]/88': 'bg-white/92',
    'text-[#03121a]': 'text-white',
}

# 发光阴影在白底上会变成一团彩色雾，直接去掉
SHADOW_GLOW = re.compile(r'shadow-\[0_0_\d+px_#[0-9a-fA-F]{3,8}\]')


def main() -> int:
    keys = sorted(MAP, key=len, reverse=True)
    files = sorted(
        p for d in ('app', 'components')
        for p in (ROOT / d).rglob('*.tsx')
        if 'node_modules' not in str(p)
    )
    total = 0
    changed_files = 0
    for f in files:
        src = f.read_text(encoding='utf-8')
        out = src
        for k in keys:
            # 用词边界保护，避免 text-slate-50 被 text-slate-5 误伤
            out = re.sub(rf'(?<![-\w]){re.escape(k)}(?![-\w])', MAP[k], out)
        for k, v in ARBITRARY.items():
            out = out.replace(k, v)
        n_shadow = len(SHADOW_GLOW.findall(out))
        if n_shadow:
            out = SHADOW_GLOW.sub('shadow-none', out)
        if out != src:
            changed_files += 1
            total += sum(
                len(re.findall(rf'(?<![-\w]){re.escape(k)}(?![-\w])', src)) for k in keys
            ) + n_shadow
            f.write_text(out, encoding='utf-8')
            print(f"  {f.relative_to(ROOT)}")
    print(f"\n改动了 {changed_files} 个文件，约 {total} 处（另去掉 {0} 处发光阴影）")
    return 0


if __name__ == '__main__':
    sys.exit(main())
