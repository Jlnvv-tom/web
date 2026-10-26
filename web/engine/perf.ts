/**
 * 运行时长官（M3.5 · W2）
 *
 * 为什么需要它：`quality.ts` 的档位是**静态**的——只看窗口宽度和 DPR。
 * 结果是一台 900px 以上的老平板会被判定成 high，然后一直 high 到卡死。
 * 静态判据能猜"这大概是什么设备"，猜不出"这台设备此刻跑不跑得动"。
 *
 * 本模块只做一件事：拿真实的帧间隔，决定要不要降档。
 * 它**不认识 three.js、不认识 React**，所以能在 Node 里用假帧序列单测。
 *
 * 设计取舍：
 * - **只自动降档，不自动升档。** 升档会带来"降→升→降"的抖动，
 *   而降档的代价只是少一点泛光。想回到高质量由用户点一下（locked）。
 * - **窗口而不是单帧。** 单帧 60ms 可能只是 GC 或一次着色器编译，
 *   连续两个 800ms 窗口都慢才是真慢。
 * - **忽略断点。** >250ms 的间隔是切标签页/断点，不是"性能差"，
 *   直接丢弃当前窗口，避免切回来就把用户降档。
 *
 * 每帧调用，所以**有意原地更新**（不返回新对象、不新建数组）——
 * 唯一复用的缓冲是 `samples`。
 */

export type Quality = 'high' | 'mid' | 'low';

/** 从低到高，降档 = 往左挪一格 */
export const QUALITY_LADDER: readonly Quality[] = ['low', 'mid', 'high'];

export type GovernorOptions = {
  /** 窗口时长（ms） */
  windowMs: number;
  /** 窗口最少帧数（20fps 时 800ms 只有 16 帧，兜住） */
  minFrames: number;
  /** 窗口最多帧数（防止高刷屏窗口内样本过多） */
  maxFrames: number;
  /**
   * 热身帧数：这段时间内一律不判定。
   *
   * 用帧数而不是窗口数，是因为"编译着色器"是按帧发作的：一帧编一个程序，
   * 每帧 30–60ms，看起来就像"稳定 30fps"。实测 buoyancy（玻璃透射 + 1024 阴影）
   * 从挂载到稳定要 ~3 秒，而 2 个窗口只有 1.6 秒 —— 一台 M4 会被判成中端机。
   */
  /**
   * 热身时长（ms）。**只按时长，不按帧数。**
   *
   * 曾经加过"至少 N 帧"的下限，结果在 1fps 的设备上要 60 秒才解冻——
   * 越是需要降档的机器，越被这条规则挡在门外。窗口本身的
   * `minFrames / starved` 两条已经兜住了样本不足的问题。
   */
  warmupMs: number;
  /** 中位帧耗时超过它 → 这一窗口判为吃力 */
  badFrameMs: number;
  /** 中位帧耗时超过它 → 连降两档 */
  severeFrameMs: number;
  /** 连续几个吃力窗口才降档（滞回） */
  badStreak: number;
  /** 超过它视为时间断点，丢弃窗口 */
  discontinuityMs: number;
};

export const GOVERNOR_DEFAULTS: GovernorOptions = {
  windowMs: 800,
  minFrames: 20,
  maxFrames: 90,
  warmupMs: 3000,
  // 22ms ≈ 45fps，34ms ≈ 30fps。留一点余量给 vsync 抖动
  badFrameMs: 22,
  severeFrameMs: 34,
  badStreak: 2,
  discontinuityMs: 250,
};

export type GovernorState = {
  /** 创建时固化的参数（每帧读它，避免每帧展开默认值） */
  opts: GovernorOptions;
  quality: Quality;
  /** 用户手动锁定后不再自动降档（提示条"保持"按钮） */
  locked: boolean;
  /** 已采集的帧数（诊断用） */
  frames: number;
  /** 已采集的时长（ms） */
  elapsedMs: number;
  /** 当前窗口内的样本 */
  samples: Float64Array;
  count: number;
  windowMs: number;
  windowsSeen: number;
  badStreak: number;
  /** 累计降档次数，提示条只弹一次的依据 */
  downgrades: number;
  /** 最近一个窗口的中位帧耗时（ms），诊断用 */
  lastMedianMs: number;
};

export function createGovernor(
  initial: Quality = 'high',
  opts: Partial<GovernorOptions> = {},
  locked = false
): GovernorState {
  const o = { ...GOVERNOR_DEFAULTS, ...opts };
  return {
    opts: o,
    quality: initial,
    locked,
    frames: 0,
    elapsedMs: 0,
    samples: new Float64Array(o.maxFrames),
    count: 0,
    windowMs: 0,
    windowsSeen: 0,
    badStreak: 0,
    downgrades: 0,
    lastMedianMs: 0,
  };
}

/** 中位数：只读前 n 个样本，走副本排序（窗口关闭时才调一次） */
export function median(samples: Float64Array, n: number): number {
  if (n <= 0) return 0;
  const copy = Array.prototype.slice.call(samples.subarray(0, n)) as number[];
  copy.sort((a, b) => a - b);
  return copy[copy.length >> 1]!;
}

/** 降一格 */
export function downgrade(q: Quality): Quality {
  return q === 'high' ? 'mid' : 'low';
}

/**
 * 推入一帧。返回 true 表示**这一刻档位变了**（调用方据此提示用户）。
 *
 * `gap` = 这一帧之前页面被隐藏过（切标签页 / 锁屏）。只有这种情况才把大帧
 * 当作"时间断点"丢掉；否则一个 1fps 的真慢机每一帧都超过断点阈值，
 * 会被误当成"用户切走了"，于是**永远不降档**——实测软件渲染（SwiftShader）
 * 1fps 时正是如此：6 秒只数到 6 帧，一档没降。
 *
 * 原地更新 `g`，理由见文件头。
 */
export function pushFrame(g: GovernorState, dtMs: number, gap = false): boolean {
  const o = g.opts;

  if (!Number.isFinite(dtMs) || dtMs <= 0) return false;

  if (dtMs > o.discontinuityMs) {
    if (gap) {
      // 真的断开了：窗口作废，别把"用户切走了 3 分钟"算成性能
      g.count = 0;
      g.windowMs = 0;
      return false;
    }
    // 页面一直在前台，只是每帧都要几百毫秒——这是最坏的情况，按极慢帧记
    dtMs = o.discontinuityMs;
  }

  g.frames++;
  g.elapsedMs += dtMs;
  if (g.count < g.samples.length) g.samples[g.count++] = dtMs;
  g.windowMs += dtMs;

  const full = g.count >= o.maxFrames;
  const elapsed = g.windowMs >= o.windowMs && g.count >= o.minFrames;
  // 慢机兜底：20 帧凑不满一个窗口时（<25fps），1.6 秒就强制结算，
  // 否则"每秒 1 帧"要等 20 秒才凑够样本
  const starved = g.windowMs >= o.windowMs * 2;
  if (!full && !elapsed && !starved) return false;

  const med = median(g.samples, g.count);
  g.lastMedianMs = med;
  g.windowsSeen++;
  g.count = 0;
  g.windowMs = 0;

  // 热身期不判定：首屏要编译着色器、要上传纹理、要建阴影贴图。
  // 帧数与时长两条同时满足才结束冻结 —— 只按帧数，30fps 的机器要 6 秒才解冻；
  // 只按时长，120Hz 屏上样本太少。
  if (g.elapsedMs < o.warmupMs) return false;

  if (med > o.badFrameMs) g.badStreak++;
  else g.badStreak = 0;

  if (g.locked || g.quality === 'low') return false;

  const before = g.quality;
  const severe = med > o.severeFrameMs;
  // 极慢（<30fps）不用等第二个窗口：255ms/帧没有"偶发"的可能
  if (!severe && g.badStreak < o.badStreak) return false;
  g.quality = downgrade(g.quality);
  if (severe) {
    // <30fps：一步到底，别让低端机在 20fps 上多熬两个窗口
    g.quality = downgrade(g.quality);
  } else if (g.quality === 'low') {
    // 温和吃力（45fps 上下）只降到 mid 就打住：low 是"关泛光 + 关阴影"，
    // 那是给"真的低于 30fps"的设备准备的，不该因为 40fps 就把画面全剥掉。
    g.quality = 'mid';
  }
  g.badStreak = 0;
  if (g.quality !== before) {
    g.downgrades++;
    return true;
  }
  return false;
}

/** 用户手动选档：锁定，之后不再自动降 */
export function setQuality(g: GovernorState, q: Quality, locked = true): void {
  g.quality = q;
  g.locked = locked;
  g.badStreak = 0;
}

/* ============================================================
   档位 → 渲染策略（纯查表，渲染层只消费）
   ============================================================ */

export type RenderPolicy = {
  /** 设备像素比上限（像素数以平方计，这是最有效的旋钮） */
  dpr: number;
  /** 泛光：全分辨率 / 半分辨率 / 关 */
  bloom: 'full' | 'half' | 'off';
  /** 阴影贴图尺寸，0 = 关 */
  shadowMap: 1024 | 512 | 0;
  /** 尘埃粒子数，0 = 关 */
  dust: number;
  /** WebGL 抗锯齿（低端机上 4×MSAA 很贵） */
  antialias: boolean;
};

/**
 * 降档顺序的依据（见 m35-plan §0.1）：
 * 4× CPU 降频都掉不下帧率 ⇒ 瓶颈是填充率/带宽，不是 JS。
 * 所以先砍像素数（DPR，二次方收益），再砍多 pass（泛光），最后砍固定开销（阴影、尘埃）。
 */
export const RENDER_POLICY: Record<Quality, RenderPolicy> = {
  high: { dpr: 2, bloom: 'full', shadowMap: 1024, dust: 700, antialias: true },
  mid: { dpr: 1.5, bloom: 'half', shadowMap: 512, dust: 280, antialias: true },
  low: { dpr: 1, bloom: 'off', shadowMap: 0, dust: 0, antialias: false },
};
