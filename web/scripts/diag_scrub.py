#!/usr/bin/env python3
"""确定性 scrub 诊断：把时间轴拖到指定时刻，追踪亮斑 bbox 与 HUD 读数。

用法：python scripts/diag_scrub.py <sceneId> [t ...]
"""
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3214
SHOTS = ROOT / "harness" / "shots"


def bbox_blown(path: Path, thr: int = 248):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    n = 0
    minx, maxx, miny, maxy = W, 0, H, 0
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if r > thr and g > thr and b > thr:
                n += 1
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    return n, ((minx, maxx, miny, maxy) if n else None)


SET_T = """(v) => {
  const el = document.querySelector('input[type=range]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}"""


def main() -> int:
    sid = sys.argv[1]
    ts = [float(x) for x in sys.argv[2:]] or [0, 10, 20, 30, 40, 50, 60, 70]
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT / "out")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            pg.goto(f"http://127.0.0.1:{PORT}/topics/{sid}/", wait_until="domcontentloaded")
            pg.wait_for_function(
                "()=>{const c=document.querySelector('canvas');return !!c&&c.width>600}", timeout=20000
            )
            time.sleep(2.0)
            canvas = pg.query_selector("canvas")
            for t in ts:
                pg.evaluate(SET_T, t)
                time.sleep(0.9)
                f = SHOTS / f"scrub-{sid}-{int(t):02d}.png"
                canvas.screenshot(path=str(f))
                n, bb = bbox_blown(f)
                pairs = pg.eval_on_selector_all(
                    "dl dt",
                    "els=>els.map(dt=>[dt.textContent.trim(), dt.nextElementSibling?dt.nextElementSibling.textContent.trim():''])",
                )
                mag = [f"{k}={v}" for k, v in pairs if "位置" in k or "磁铁" in k or k.startswith("x")]
                print(f"t={t:5.1f}  blown={n:6d} bbox={bb}  {mag}")
            b.close()
    finally:
        srv.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
