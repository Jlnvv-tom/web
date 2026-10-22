#!/usr/bin/env python3
"""只截 3D 画布元素（排除 UI 干扰），便于用像素分析定位过曝/取景问题。

用法：python scripts/shot_canvas.py <sceneId> [sceneId ...]
产物：harness/shots/canvas-<sceneId>.png
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3211
BASE = f"http://127.0.0.1:{PORT}"
SHOTS = ROOT / "harness" / "shots"


def main() -> int:
    scenes = sys.argv[1:]
    if not scenes:
        print("usage: shot_canvas.py <sceneId> [sceneId ...]")
        return 2
    SHOTS.mkdir(parents=True, exist_ok=True)

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT / "out")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for sid in scenes:
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.goto(f"{BASE}/topics/{sid}/", wait_until="domcontentloaded")
                page.wait_for_function(
                    "() => { const c = document.querySelector('canvas');"
                    " return !!c && c.width > 600; }",
                    timeout=20000,
                )
                time.sleep(2.5)
                canvas = page.query_selector("canvas")
                box = canvas.bounding_box()
                print(f"[{sid}] canvas box = {box}")
                canvas.screenshot(path=str(SHOTS / f"canvas-{sid}.png"))
                page.close()
            browser.close()
    finally:
        server.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
