'use client';

import { useEffect, useState } from 'react';

/**
 * Hero 动效：磁场里偏转的电子（M3 · 首页优化）
 *
 * 为什么是内联 SVG 而不是 Lottie：
 * Lottie 要一个外部 JSON 素材，会让"离线单文件导出"直接失效
 * （宪法第八条：零外部资源）。这里用手写 SVG + CSS 动画拿到同样的
 * "活起来了"的效果，体积 ~2KB，且天然尊重 prefers-reduced-motion。
 *
 * 画面取自主打场景「洛伦兹力」：电子沿虚线圆轨道运动，进入磁场区后被掰弯，
 * 同时拖出一条逐渐绘制的尾迹 —— 一眼说明这个站是干什么的。
 */
export function HeroOrbit() {
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    try {
      setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      setMotion(true);
    }
  }, []);

  const R = 62; // 轨道半径
  const CX = 110;
  const CY = 110;

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <style>{`
        @keyframes ho-spin { to { transform: rotate(360deg); } }
        @keyframes ho-draw { from { stroke-dashoffset: 300; } to { stroke-dashoffset: 0; } }
        @keyframes ho-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.06); }
        }
        @keyframes ho-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .ho-spin { transform-origin: ${CX}px ${CY}px; animation: ho-spin 7s linear infinite; }
        .ho-draw { stroke-dasharray: 300; animation: ho-draw 7s linear infinite; }
        .ho-pulse { transform-origin: ${CX}px ${CY}px; animation: ho-pulse 3.2s ease-in-out infinite; }
        .ho-float { animation: ho-float 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ho-spin, .ho-draw, .ho-pulse, .ho-float { animation: none; }
          .ho-draw { stroke-dashoffset: 0; }
        }
      `}</style>

      <svg viewBox="0 0 220 220" className="ho-float h-auto w-full" role="img" aria-label="电子在磁场中沿圆轨道运动并被偏转的示意动画">
        <defs>
          <radialGradient id="ho-field" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0e7490" stopOpacity="0.1" />
            <stop offset="70%" stopColor="#0e7490" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ho-electron" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="45%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0e7490" />
          </radialGradient>
          <marker id="ho-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#b45309" />
          </marker>
        </defs>

        {/* 磁场区域：一团柔和的青雾 */}
        <circle cx={CX} cy={CY} r={R + 26} fill="url(#ho-field)" className={motion ? 'ho-pulse' : undefined} />

        {/* 网格：暗示"这是一个可以转的空间" */}
        <g stroke="#1c1917" strokeOpacity="0.07" strokeWidth="1">
          <line x1="18" y1={CY} x2="202" y2={CY} />
          <line x1={CX} y1="18" x2={CX} y2="202" />
        </g>

        {/* 磁场方向：竖直向下的 B */}
        <line x1={CX} y1={CY + R + 16} x2={CX} y2={CY + R + 44} stroke="#b45309" strokeWidth="2" markerEnd="url(#ho-arrow)" />
        <text x={CX + 9} y={CY + R + 40} fontSize="13" fontStyle="italic" fill="#b45309" fontWeight="600">B</text>

        {/* 轨道：虚线圆 */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#0e7490" strokeOpacity="0.32" strokeWidth="1.5" strokeDasharray="5 6" />

        {/* 尾迹：逐渐绘制的一段弧 */}
        {motion && (
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#67e8f9"
            strokeWidth="3"
            strokeLinecap="round"
            className="ho-draw"
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        )}

        {/* 电子 + 它的速度方向 */}
        <g className={motion ? 'ho-spin' : undefined}>
          <circle cx={CX + R} cy={CY} r="7.5" fill="url(#ho-electron)" />
          <circle cx={CX + R} cy={CY} r="12" fill="none" stroke="#67e8f9" strokeOpacity="0.4" strokeWidth="1" />
          <line
            x1={CX + R + 9}
            y1={CY}
            x2={CX + R + 26}
            y2={CY}
            stroke="#0369a1"
            strokeWidth="2"
            strokeLinecap="round"
            markerEnd="url(#ho-arrow)"
          />
        </g>

        {/* 圆心：场源 */}
        <circle cx={CX} cy={CY} r="3.5" fill="#1c1917" fillOpacity="0.28" />
      </svg>

      {/* 说明性角标：说明"这是可以转的" */}
      <div className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-stone-900/12 bg-white/85 px-2.5 py-[3px] text-[9.5px] text-stone-600 backdrop-blur">
        拖动可旋转 · 滚轮缩放
      </div>
    </div>
  );
}
