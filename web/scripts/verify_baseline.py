#!/usr/bin/env python3
"""视觉回归基线：14 场景默认帧 → 像素比对

为什么用「虚拟时钟」而不是「点暂停 + 拖时间轴」：
播放器 `playing: true` 自动播放，且讲解脚本的 params / camera 是**粘性**的——
SceneRuntime 只在跨越步骤瞬间 applyScriptParams，seek 回 0 不会撤销已应用的步骤
（stepRef 重置为 -1，但 store.params 留着）。于是「播一会儿→暂停→拖回 0」
得到的参数取决于暂停前真实过了多久，跨机器、跨负载都不确定。

虚拟时钟方案：init script 劫持 performance.now 与 requestAnimationFrame，
由本脚本逐帧泵帧（每帧 16.7ms）。脚本步骤、相机缓动（0.85s）、求解、图表
全部按确定节奏推进，与真实机器速度无关 → 同一 commit 两次运行逐像素一致。
代价：UI 的 CSS transition 由合成器真实时钟驱动，虚拟时钟管不到，
所以**只截 3D 画布元素**（M3 打磨面正是画布）。

用法：
  python scripts/verify_baseline.py            # 比对全部场景（默认 out/topics 下全部）
  python scripts/verify_baseline.py --update   # 重建/更新基线（改样式后先跑这个）
  python scripts/verify_baseline.py shm orbit  # 只比对指定场景
  python scripts/verify_baseline.py --at 1.0   # 采样时刻（秒，默认 1.0）
  python scripts/verify_baseline.py --max-r8 0.01 --max-r24 0.002  # 调整阈值

产物：baseline/<sceneId>.png（--update 时写入，应入库）
判定：r8（maxΔ>8 像素占比）与 r24（maxΔ>24 像素占比）双阈值，任一超限即 FAIL。
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3212
BASE = f"http://127.0.0.1:{PORT}"
BASELINE = ROOT / "baseline"

# 虚拟时钟：冻结真实时钟 + 手动泵帧。必须在页面脚本之前注入。
#
# ⚠️ 步长约束：SceneRuntime 与 intro 都有 `Math.min(delta, 0.05)` 的 dt 钳制
# （防切标签页后的大跳变）。所以**每帧虚拟步长必须 ≤50ms**——用一次
# __advance(167) 泵 10 帧会被钳成 50ms，整个时钟按比例放慢，
# 而捕获仍然确定（不报错，只是时间标错了）。__advanceFrames 在页面内部
# 逐帧泵，步长恒为 frameMs，绕开钳制。
INIT_JS = """
(() => {
  const vt = { t: 1000 };
  const queue = [];
  performance.now = () => vt.t;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__advance = (ms) => {
    vt.t += ms;
    const q = queue.splice(0, queue.length);
    const ts = vt.t;
    for (const cb of q) { try { cb(ts); } catch (e) { window.__lastErr = String(e); } }
    return q.length;
  };
  // 在页面内部逐帧泵 n 帧（每帧 frameMs ≤ 50ms，不被 dt 钳制放慢）
  window.__advanceFrames = (n, frameMs) => {
    for (let i = 0; i < n; i++) window.__advance(frameMs);
  };
})();
"""


def discover_scenes() -> list[str]:
    topics = ROOT / "out" / "topics"
    if not topics.is_dir():
        sys.exit(f"找不到 {topics}，先跑 npm run build")
    return sorted(p.name for p in topics.iterdir() if p.is_dir())


def capture(page, sid: str, at_s: float, frame_ms: float, errors: list[str]) -> Image.Image:
    page.goto(f"{BASE}/topics/{sid}/", wait_until="domcontentloaded")
    # 注意 polling=100：wait_for_function 默认用 rAF 轮询，而 rAF 已被我们劫持
    page.wait_for_function(
        "() => { const c = document.querySelector('canvas');"
        " return !!c && c.clientWidth > 600; }",
        polling=100,
        timeout=25000,
    )

    # 先泵几帧让 renderer / PMREM / 纹理就绪，再按 16.7ms 步进到采样时刻
    page.evaluate("window.__advance(16.7)")
    time.sleep(0.3)
    page.evaluate("window.__advance(16.7)")
    time.sleep(0.3)

    n = max(1, round(at_s * 1000 / frame_ms))
    # 逐帧泵（页面内部循环）：步长 frameMs ≤ 50ms，不被 dt 钳制放慢
    page.evaluate(f"window.__advanceFrames({n}, {frame_ms})")

    err = page.evaluate("window.__lastErr || null")
    if err:
        errors.append(f"帧回调异常：{err}")
    return _canvas_shot(page)


def _canvas_shot(page) -> Image.Image:
    import io

    png = page.query_selector("canvas").screenshot()
    return Image.open(io.BytesIO(png)).convert("RGB")


def diff(baseline: Image.Image, current: Image.Image) -> dict:
    if baseline.size != current.size:
        return {"size_mismatch": True, "a": baseline.size, "b": current.size}
    a = np.asarray(baseline, dtype=np.int16)
    b = np.asarray(current, dtype=np.int16)
    d = np.abs(a - b).max(axis=2)
    return {
        "r8": float((d > 8).mean()),
        "r24": float((d > 24).mean()),
        "max": int(d.max()),
        "size_mismatch": False,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="*", help="场景 id（默认全部）")
    ap.add_argument("--update", action="store_true", help="重建基线而不是比对")
    ap.add_argument("--at", type=float, default=1.0, help="采样时刻（秒）")
    ap.add_argument("--frame-ms", type=float, default=16.7, help="虚拟时钟步长（ms）")
    ap.add_argument("--max-r8", type=float, default=0.01, help="maxΔ>8 像素占比上限")
    ap.add_argument("--max-r24", type=float, default=0.002, help="maxΔ>24 像素占比上限")
    args = ap.parse_args()

    scenes = args.scenes or discover_scenes()
    BASELINE.mkdir(parents=True, exist_ok=True)

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT / "out")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)

    rows, failed = [], 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for sid in scenes:
                errors: list[str] = []
                ctx = browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    color_scheme="light",
                    reduced_motion="no-preference",
                )
                page = ctx.new_page()
                page.add_init_script(INIT_JS)
                page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(str(e)))

                try:
                    img = capture(page, sid, args.at, args.frame_ms, errors)
                except Exception as e:
                    print(f"[{sid}] 采集失败：{e}")
                    failed += 1
                    ctx.close()
                    continue

                path = BASELINE / f"{sid}.png"
                if args.update:
                    img.save(path)
                    rows.append((sid, "—", "—", "—", "已写入"))
                else:
                    if not path.exists():
                        rows.append((sid, "—", "—", "—", "无基线（先 --update）"))
                        failed += 1
                    else:
                        m = diff(Image.open(path).convert("RGB"), img)
                        if m.get("size_mismatch"):
                            rows.append((sid, "尺寸变化", f"{m['a']}→{m['b']}", "—", "FAIL"))
                            failed += 1
                        else:
                            ok = m["r8"] <= args.max_r8 and m["r24"] <= args.max_r24
                            if not ok or errors:
                                failed += 1
                            rows.append(
                                (
                                    sid,
                                    f"{m['r8'] * 100:.2f}%",
                                    f"{m['r24'] * 100:.2f}%",
                                    m["max"],
                                    "PASS" if ok and not errors else "FAIL",
                                )
                            )
                if errors:
                    print(f"[{sid}] console errors：{errors}")
                ctx.close()
            browser.close()
    finally:
        server.terminate()

    w = max(len(r[0]) for r in rows) if rows else 8
    print(f"\n{'场景':<{w}}  r8(>8)   r24(>24)  maxΔ  判定")
    for r in rows:
        print(f"{r[0]:<{w}}  {r[1]:>7}  {r[2]:>8}  {r[3]:>4}  {r[4]}")
    if args.update:
        print(f"\n基线已写入 {BASELINE}（{len(rows)} 个）。记得 git add baseline/ 一起提交。")
        return 0
    print(f"\n结果：{len(rows) - failed}/{len(rows)} 通过（阈值 r8≤{args.max_r8:.1%}，r24≤{args.max_r24:.1%}）")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
