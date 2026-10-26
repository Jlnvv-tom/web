import { describe, it, expect } from 'vitest';
import {
  RENDER_POLICY,
  createGovernor,
  downgrade,
  median,
  pushFrame,
  setQuality,
  type GovernorState,
} from './perf';

/** 以固定帧耗时喂 n 帧，返回是否触发过降档 */
function feed(g: GovernorState, dtMs: number, frames: number): boolean {
  let changed = false;
  for (let i = 0; i < frames; i++) changed = pushFrame(g, dtMs) || changed;
  return changed;
}

const SIXTY = 1000 / 60; // 16.67ms

describe('median', () => {
  it('取中位数而不是平均：单帧尖峰不该代表整体', () => {
    const buf = new Float64Array([16, 16, 17, 500, 16]);
    // 中位 16，均值 113 —— 用均值会让一帧 500ms 的尖峰把整窗判成"极慢"
    expect(median(buf, 5)).toBe(16);
  });

  it('空样本返回 0，不抛异常', () => {
    expect(median(new Float64Array(4), 0)).toBe(0);
  });
});

describe('降档优先级', () => {
  it('high → mid → low，low 是最低档不会继续降', () => {
    expect(downgrade('high')).toBe('mid');
    expect(downgrade('mid')).toBe('low');
    expect(downgrade('low')).toBe('low');
  });

  it('档位越低保真度单调下降（DPR 与泛光是主要旋钮）', () => {
    expect(RENDER_POLICY.high.dpr).toBeGreaterThan(RENDER_POLICY.mid.dpr);
    expect(RENDER_POLICY.mid.dpr).toBeGreaterThan(RENDER_POLICY.low.dpr);
    expect(RENDER_POLICY.low.bloom).toBe('off');
    expect(RENDER_POLICY.low.dust).toBe(0);
    expect(RENDER_POLICY.high.shadowMap).toBeGreaterThan(RENDER_POLICY.mid.shadowMap);
    expect(RENDER_POLICY.mid.shadowMap).toBeGreaterThan(RENDER_POLICY.low.shadowMap);
  });
});

describe('FrameGovernor', () => {
  it('60fps 稳定运行永不降档', () => {
    const g = createGovernor('high');
    expect(feed(g, SIXTY, 60 * 10)).toBe(false);
    expect(g.quality).toBe('high');
  });

  it('热身期内不判定：首屏编译着色器时的巨帧不该把用户降档', () => {
    const g = createGovernor('high');
    // 实测 buoyancy 有 ~3 秒是"每帧 33ms"的编译期（玻璃透射 + 1024 阴影），
    // 热身 180 帧就是为了不让这 3 秒把一台快机器判成中端机
    feed(g, 60, 40); // 40 帧 × 60ms = 2.4s，仍在 3s 热身期内
    expect(g.quality).toBe('high');
    expect(g.downgrades).toBe(0);
    // 过了 3s 才开始判定
    feed(g, 60, 200);
    expect(g.quality).not.toBe('high');
  });

  it('持续 40fps 两个窗口后降一档，且只停在 mid', () => {
    const g = createGovernor('high');
    feed(g, SIXTY, 60 * 8); // 先跳过热身（正常帧）
    const changed = feed(g, 25, 60 * 6);
    expect(changed).toBe(true);
    expect(g.quality).toBe('mid');
    expect(g.downgrades).toBe(1);
    // 继续 40fps：mid 已足够，不该继续剥到 low
    feed(g, 25, 60 * 10);
    expect(g.quality).toBe('mid');
  });

  it('持续 20fps（>34ms）连降两档，一次到底', () => {
    const g = createGovernor('high');
    feed(g, SIXTY, 60 * 2);
    feed(g, 50, 60 * 8);
    expect(g.quality).toBe('low');
  });

  it('单个窗口慢一次不降档（滞回）', () => {
    // 窗口开成 10 帧（确定性：不依赖浮点累加什么时候越过 800ms）
    const g = createGovernor('high', { windowMs: 100, minFrames: 10, warmupMs: 100 });
    feed(g, SIXTY, 30); // 3 个窗口（热身 30 帧已过）
    expect(g.count).toBe(0);
    // 一个吃力窗口（10 帧 30fps）
    feed(g, 33, 10);
    expect(g.badStreak).toBe(1);
    expect(g.quality).toBe('high');
    // 立刻回正常 → 计数清零
    feed(g, SIXTY, 30);
    expect(g.badStreak).toBe(0);
    expect(g.quality).toBe('high');
  });

  it('切标签页回来的一帧被丢弃（gap=true），窗口作废', () => {
    const g = createGovernor('high');
    feed(g, SIXTY, 60 * 2);
    const changed = pushFrame(g, 12_000, true); // 切走了 12 秒
    expect(changed).toBe(false);
    expect(g.count).toBe(0);
    expect(g.badStreak).toBe(0);
  });

  it('页面一直在前台的大帧按"极慢"记，不许当成切标签页', () => {
    // 这是实测出来的 bug：1fps 的软件渲染每帧都 >250ms，
    // 旧实现全部当作断点丢弃 → 6 秒只数到 6 帧、一档都没降。
    const g = createGovernor('high', { windowMs: 800, minFrames: 20, warmupMs: 100 });
    let changed = false;
    for (let i = 0; i < 12; i++) changed = pushFrame(g, 1000) || changed;
    expect(changed).toBe(true);
    expect(g.quality).toBe('low');
    expect(g.frames).toBe(12);
  });

  it('只降不升：慢过之后不会自己爬回 high', () => {
    const g = createGovernor('high');
    feed(g, SIXTY, 60 * 2);
    feed(g, 40, 60 * 8);
    expect(g.quality).toBe('low');
    feed(g, SIXTY, 60 * 20);
    expect(g.quality).toBe('low');
  });

  it('用户锁定后不再自动降档', () => {
    const g = createGovernor('high');
    setQuality(g, 'high', true);
    feed(g, 60, 60 * 10);
    expect(g.quality).toBe('high');
    expect(g.locked).toBe(true);
  });

  it('手动解锁后可以再次自动降档', () => {
    const g = createGovernor('high');
    feed(g, SIXTY, 60 * 2);
    setQuality(g, 'high', false);
    feed(g, 50, 60 * 8);
    expect(g.quality).toBe('low');
  });

  it('samples 缓冲复用：不随帧数增长', () => {
    const g = createGovernor('high');
    const bufRef = g.samples;
    feed(g, SIXTY, 60 * 5);
    expect(g.samples).toBe(bufRef);
    expect(g.samples.length).toBe(90);
  });
});
