'use client';

import { useEffect, useState } from 'react';

/**
 * Hero 插画：一群"物理小精灵"（M3 · 首页优化第二轮）
 *
 * 参考 lottiefiles.com 的做法：hero 右侧不是产品截图，而是一群**彩色拟人角色**。
 * 我们的版本让每个角色对应一个站内主打场景，既好看又能当隐形导航：
 *   电子小人（洛伦兹力）· 星星（天体轨道）· 圆角方块（浮力/杠杆）· 三角（光的折射）
 *
 * 为什么仍是内联 SVG 而不是 Lottie：
 * Lottie 需要外部 JSON 素材，会让"离线单文件导出"失效（宪法第八条：零外部资源）。
 * 手写 SVG + CSS 动画拿到同等观感，约 4KB，可离线，且天然支持 prefers-reduced-motion。
 *
 * 动画遵循 Vercel Web Interface Guidelines：
 *   - 只动 transform / opacity（合成器友好）
 *   - SVG 变换放在 <g> 上，配 transform-box: fill-box; transform-origin: center
 *   - prefers-reduced-motion 下全部静止
 */
export function HeroMascots() {
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    try {
      setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      setMotion(true);
    }
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[340px] select-none">
      <style>{`
        @keyframes hm-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-9px) rotate(2deg); }
        }
        @keyframes hm-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%, 97% { transform: scaleY(0.12); }
        }
        @keyframes hm-sparkle {
          0%, 100% { opacity: 0.25; transform: scale(0.82); }
          50% { opacity: 0.9; transform: scale(1.12); }
        }
        @keyframes hm-orbit { to { transform: rotate(360deg); } }

        .hm-f { transform-box: fill-box; transform-origin: center; }
        .hm-float { transform-box: fill-box; transform-origin: center; animation: hm-float 4.6s ease-in-out infinite; }
        .hm-d1 { animation-delay: -0.6s; }
        .hm-d2 { animation-delay: -1.5s; }
        .hm-d3 { animation-delay: -2.6s; }
        .hm-d4 { animation-delay: -3.4s; }
        .hm-blink { transform-box: fill-box; transform-origin: center; animation: hm-blink 5.2s ease-in-out infinite; }
        .hm-sparkle { transform-box: fill-box; transform-origin: center; animation: hm-sparkle 2.8s ease-in-out infinite; }
        .hm-orbit { transform-box: fill-box; transform-origin: center; animation: hm-orbit 9s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .hm-float, .hm-blink, .hm-sparkle, .hm-orbit { animation: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 320 280"
        className="h-auto w-full"
        role="img"
        aria-label="一群彩色拟人角色：发光的电子小人绕着轨道跑，旁边是星星、方块和三角，代表洛伦兹力、天体轨道、浮力与光的折射"
      >
        <defs>
          <radialGradient id="hm-electron" cx="34%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="38%" stopColor="#a5f3fc" />
            <stop offset="100%" stopColor="#0891b2" />
          </radialGradient>
          <radialGradient id="hm-star" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fef9c3" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#eab308" />
          </radialGradient>
          <linearGradient id="hm-box" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="hm-tri" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>

        {/* 背景：一圈柔和的青色光晕，把角色们拢在一起 */}
        <circle cx="160" cy="140" r="126" fill="#0e7490" fillOpacity="0.05" />

        {/* 地面参考线：暗示"这是一个空间" */}
        <ellipse cx="160" cy="232" rx="104" ry="13" fill="#1c1917" fillOpacity="0.06" />

        {/* 轨道虚线 */}
        <ellipse
          cx="160"
          cy="140"
          rx="112"
          ry="52"
          fill="none"
          stroke="#0e7490"
          strokeOpacity="0.22"
          strokeWidth="1.5"
          strokeDasharray="6 7"
        />

        {/* ===== 电子小人（中心主角）===== */}
        <g className={motion ? 'hm-orbit' : undefined} style={{ transformOrigin: '160px 140px' }}>
          {/* 尾迹 */}
          <path
            d="M 160 88 A 112 52 0 0 1 240 122"
            fill="none"
            stroke="#67e8f9"
            strokeWidth="4"
            strokeLinecap="round"
            strokeOpacity="0.75"
          />
          <g transform="translate(240,122)">
            <circle r="24" fill="#a5f3fc" fillOpacity="0.28" />
            <circle r="17" fill="url(#hm-electron)" />
            {/* 眼睛 */}
            <g className={motion ? 'hm-blink' : undefined}>
              <circle cx="-5.5" cy="-3" r="2.6" fill="#0c4a6e" />
              <circle cx="5.5" cy="-3" r="2.6" fill="#0c4a6e" />
            </g>
            {/* 笑嘴 */}
            <path d="M -5 4 Q 0 8.5 5 4" fill="none" stroke="#0c4a6e" strokeWidth="1.8" strokeLinecap="round" />
            {/* 高光 */}
            <ellipse cx="-6" cy="-9" rx="4.5" ry="3" fill="#ffffff" fillOpacity="0.85" />
          </g>
        </g>

        {/* ===== 星星（天体轨道）===== */}
        <g className={motion ? 'hm-float hm-d1' : undefined} transform="translate(64,66)">
          <path
            d="M 0 -30 L 8.8 -9.6 L 30.6 -7.4 L 14 7.6 L 18.4 29.4 L 0 17.6 L -18.4 29.4 L -14 7.6 L -30.6 -7.4 L -8.8 -9.6 Z"
            fill="url(#hm-star)"
            stroke="#ca8a04"
            strokeWidth="1.2"
          />
          <g className={motion ? 'hm-blink hm-d2' : undefined}>
            <circle cx="-6" cy="-2" r="3" fill="#78350f" />
            <circle cx="6" cy="-2" r="3" fill="#78350f" />
          </g>
          <path d="M -5 6 Q 0 11 5 6" fill="none" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
          {/* 小短手 */}
          <path d="M -30 -6 L -38 -12" stroke="#ca8a04" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M 30 -6 L 38 -12" stroke="#ca8a04" strokeWidth="2.4" strokeLinecap="round" />
        </g>

        {/* ===== 圆角方块（浮力 / 杠杆）===== */}
        <g className={motion ? 'hm-float hm-d3' : undefined} transform="translate(258,178)">
          <rect x="-27" y="-27" width="54" height="54" rx="15" fill="url(#hm-box)" />
          <g className={motion ? 'hm-blink hm-d4' : undefined}>
            <circle cx="-8" cy="-4" r="3.4" fill="#134e4a" />
            <circle cx="8" cy="-4" r="3.4" fill="#134e4a" />
          </g>
          <path d="M -7 7 Q 0 13 7 7" fill="none" stroke="#134e4a" strokeWidth="2.2" strokeLinecap="round" />
          {/* 腮红 */}
          <ellipse cx="-15" cy="4" rx="4" ry="2.6" fill="#fb7185" fillOpacity="0.5" />
          <ellipse cx="15" cy="4" rx="4" ry="2.6" fill="#fb7185" fillOpacity="0.5" />
        </g>

        {/* ===== 三角（光的折射）===== */}
        <g className={motion ? 'hm-float hm-d2' : undefined} transform="translate(52,196)">
          <path d="M 0 -28 L 26 18 L -26 18 Z" fill="url(#hm-tri)" />
          <g className={motion ? 'hm-blink hm-d1' : undefined}>
            <circle cx="-7" cy="4" r="3.2" fill="#3b0764" />
            <circle cx="7" cy="4" r="3.2" fill="#3b0764" />
          </g>
          <path d="M -6 12 Q 0 17 6 12" fill="none" stroke="#3b0764" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* ===== 闪光点缀 ===== */}
        <g fill="#facc15">
          <path className={motion ? 'hm-sparkle' : undefined} d="M 292 60 l 3.4 8.6 8.6 3.4 -8.6 3.4 -3.4 8.6 -3.4 -8.6 -8.6 -3.4 8.6 -3.4 Z" />
          <path className={motion ? 'hm-sparkle hm-d3' : undefined} d="M 34 128 l 2.6 6.6 6.6 2.6 -6.6 2.6 -2.6 6.6 -2.6 -6.6 -6.6 -2.6 6.6 -2.6 Z" fillOpacity="0.8" />
          <path className={motion ? 'hm-sparkle hm-d2' : undefined} d="M 284 108 l 2.2 5.6 5.6 2.2 -5.6 2.2 -2.2 5.6 -2.2 -5.6 -5.6 -2.2 5.6 -2.2 Z" fillOpacity="0.65" />
        </g>
      </svg>

      {/* 说明性角标：把"可爱"拉回"这是能转的" */}
      <div className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-stone-900/12 bg-white/85 px-2.5 py-[3px] text-[9.5px] text-stone-600 backdrop-blur">
        每个角色背后都是一个能转的场景
      </div>
    </div>
  );
}
