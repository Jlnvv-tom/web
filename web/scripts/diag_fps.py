#!/usr/bin/env python3
"""
帧率诊断（M3.5 · 流畅性）

为什么要有它：`next build` 通过、截图好看，都不代表"拖滑块不卡"。
帧率只能实测：打开一个场景，在真实渲染循环里采 rAF 间隔，报分位数。

用法：
    python scripts/diag_fps.py                    # 全部场景，headless
    python scripts/diag_fps.py projectile-motion  # 单个场景
    python scripts/diag_fps.py --headed           # 真实 GPU（macOS 用这个才准）
    python scripts/diag_fps.py --seconds 6 --json out.json

产物：终端表格 + 可选 JSON。判据（M3.5 G2）：
    P50 ≥ 55fps（桌面）/ ≥ 30fps（模拟中端）/ 长帧(>50ms) ≤ 1%
"""
from __future__ import annotations

import argparse
import http.server
import json
import socketserver
import statistics
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"

SCENES = [
    "lorentz-force",
    "projectile-motion",
    "thin-lens",
    "electric-field",
    "capacitor",
    "shm",
    "orbit",
    "reflection",
    "wave",
    "induction",
    "buoyancy",
    "lever",
    "sound-propagation",
    "em-induction",
]

# 在页面里跑：采 rAF 间隔，同时记录长帧
PROBE = """
async (seconds) => {
  // 注意：页面上有**两个** canvas（3D 场景 + HUD 曲线图）。
  // 不能用 getContext 探测（那会给 2D 曲线图创建 WebGL 上下文，把它弄坏），
  // 按"面积最大"选 —— 3D 画布恒占主列。
  const area = (c) => c.clientWidth * c.clientHeight;
  let canvas = null;
  const tWait = performance.now();
  while (performance.now() - tWait < 20000) {
    const all = Array.from(document.querySelectorAll('canvas'));
    const big = all.sort((a, b) => area(b) - area(a))[0];
    if (big && area(big) > 40000) {
      canvas = big;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!canvas) return { error: 'no webgl canvas' };
  // 等过热身期：着色器编译 + 阴影贴图 + 长官僚的 3s 冻结窗。
  // 太早开始测，量到的是"编译期"而不是"稳态"（实测 buoyancy 编译期 33ms/帧）。
  await new Promise((r) => setTimeout(r, 4200));

  const deltas = [];
  let stopped = false;
  let last = performance.now();
  const t0 = last;
  const tick = (now) => {
    deltas.push(now - last);
    last = now;
    if (stopped || now - t0 > seconds * 1000) {
      stopped = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await new Promise((r) => setTimeout(r, seconds * 1000 + 200));

  const clean = deltas.filter((d) => d > 0 && d < 2000).sort((a, b) => a - b);
  if (!clean.length) return { error: 'no frames' };
  const q = (p) => clean[Math.min(clean.length - 1, Math.floor(clean.length * p))];
  const fps = (ms) => (ms > 0 ? 1000 / ms : 0);
  const long = clean.filter((d) => d > 50).length;

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';

  return {
    frames: clean.length,
    span: (deltas.reduce((a, b) => a + b, 0) / 1000).toFixed(2),
    p50fps: +fps(q(0.5)).toFixed(1),
    p95frameMs: +q(0.95).toFixed(2),
    p99frameMs: +q(0.99).toFixed(2),
    maxFrameMs: +clean[clean.length - 1].toFixed(1),
    longFrames: long,
    longPct: +((long / clean.length) * 100).toFixed(2),
    worst10: clean.slice(-10).map((d) => +d.toFixed(1)),
    renderer,
    drawingBuffer: [canvas.width, canvas.height],
    quality: document.documentElement.dataset.quality || '?',
    cssSize: [Math.round(canvas.clientWidth), Math.round(canvas.clientHeight)],
  };
}
"""


def serve(directory: Path, port: int) -> socketserver.TCPServer:
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(directory), **kw)

        def log_message(self, *a):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def free_port() -> int:
    import socket

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="*", default=None)
    ap.add_argument("--seconds", type=float, default=4.0)
    ap.add_argument("--headed", action="store_true", help="真实 GPU 窗口（macOS 推荐）")
    ap.add_argument("--scale", type=float, default=2.0, help="deviceScaleFactor")
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument(
        "--cpu-throttle",
        type=float,
        default=1.0,
        help="CDP CPU 降频倍数（4≈中端安卓，6≈老旧平板）。GPU 不降频，所以这是偏乐观的模拟",
    )
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    if not OUT.exists():
        print("缺少 out/，先跑 npm run build", file=sys.stderr)
        return 2

    from playwright.sync_api import sync_playwright

    port = free_port()
    serve(OUT, port)
    base = f"http://127.0.0.1:{port}"
    scenes = args.scenes or SCENES

    rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not args.headed,
            args=[
                "--enable-gpu",
                "--ignore-gpu-blocklist",
                "--use-angle=metal" if sys.platform == "darwin" else "--use-angle=default",
                "--force-color-profile=srgb",
            ],
        )
        ctx = browser.new_context(
            viewport={"width": args.width, "height": args.height},
            device_scale_factor=args.scale,
        )
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        if args.cpu_throttle > 1:
            cdp = ctx.new_cdp_session(page)
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": args.cpu_throttle})

        for sid in scenes:
            errors.clear()
            page.goto(f"{base}/topics/{sid}/", wait_until="domcontentloaded")
            try:
                page.wait_for_selector("canvas", timeout=20000)
            except Exception:
                print(f"{sid:22s} canvas 未出现", file=sys.stderr)
                continue
            res = page.evaluate(PROBE, args.seconds)
            if "error" in res:
                print(f"{sid:22s} {res['error']}", file=sys.stderr)
                continue
            res["scene"] = sid
            res["consoleErrors"] = len(errors)
            rows.append(res)
            print(
                f"{sid:22s} P50 {res['p50fps']:5.1f}fps  P95帧 {res['p95frameMs']:6.2f}ms  "
                f"最长 {res['maxFrameMs']:6.1f}ms  长帧 {res['longPct']:5.2f}%  "
                f"{res['quality']:4s} {res['drawingBuffer'][0]}x{res['drawingBuffer'][1]}",
                flush=True,
            )

        browser.close()

    if rows:
        print()
        p50 = [r["p50fps"] for r in rows]
        longs = [r["longPct"] for r in rows]
        print(f"汇总：场景 {len(rows)}  P50 中位 {statistics.median(p50):.1f}fps  "
              f"最差 {min(p50):.1f}fps  长帧占比中位 {statistics.median(longs):.2f}%")
        print(f"渲染器：{rows[0]['renderer']}")

    if args.json:
        Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=2))
        print(f"JSON → {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
