/**
 * 画质档位（M3 · §8）
 *
 * 为什么要它：`transmission`（玻璃折射）每个材质都要一次额外的 render target，
 * 阴影贴图也要显存。校园机房和老平板扛不住，但**不能因此把质感砍掉**——
 * 所以按档位降级，而不是一刀切。
 *
 * 目前只用来决定"玻璃/胶体走真透射还是退回半透明"。
 * 之所以写成模块级缓存而不是 hook：它只随窗口尺寸变化，
 * 而 `objects.tsx` 里每个图元都要读一次，逐个订阅 resize 太浪费。
 */

export type Quality = 'high' | 'mid' | 'low';

let cached: Quality | null = null;
let installed = false;

function compute(): Quality {
  if (typeof window === 'undefined') return 'high';

  // 无障碍优先：用户明确要求减少动态效果时不折腾 GPU
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'low';
  } catch {
    /* matchMedia 不可用时忽略 */
  }

  const w = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;

  // 宽屏 + 正常 DPR 视为桌面；窄屏或高 DPR（多半是手机）降一档
  if (w >= 900 && dpr <= 2) return 'high';
  if (w >= 600) return 'mid';
  return 'low';
}

export function getQuality(): Quality {
  if (typeof window === 'undefined') return 'high';
  if (!installed) {
    installed = true;
    window.addEventListener('resize', () => {
      cached = compute();
    });
  }
  if (cached === null) cached = compute();
  return cached;
}

/** 测试用：清掉缓存 */
export function resetQualityCache(): void {
  cached = null;
}
