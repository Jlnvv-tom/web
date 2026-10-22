#!/usr/bin/env python3
"""场景端到端冒烟：起静态服务 → 逐页打开 → 等画布就绪 → 读 HUD → 截图 → 收 console error

用法：python scripts/verify_scenes.py [sceneId ...]
依赖：~/.workbuddy/binaries/python/envs/default/bin/python + playwright chromium
产物：harness/shots/<sceneId>-01-default.png / -02-playing.png
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3210
BASE = f"http://127.0.0.1:{PORT}"
SHOTS = ROOT / "harness" / "shots"
DEFAULT_SCENES = ["shm", "orbit", "reflection", "wave"]


def main() -> int:
    scenes = sys.argv[1:] or DEFAULT_SCENES
    SHOTS.mkdir(parents=True, exist_ok=True)

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT / "out")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)

    failed = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for sid in scenes:
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                errors: list[str] = []
                page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(str(e)))

                page.goto(f"{BASE}/topics/{sid}/", wait_until="domcontentloaded")

                # 水合前 canvas 是 300×150，等它按布局尺寸建好再截，否则截到空白
                try:
                    page.wait_for_function(
                        "() => { const c = document.querySelector('canvas');"
                        " return !!c && c.width > 600; }",
                        timeout=20000,
                    )
                except Exception:
                    errors.append("画布未就绪（20s 超时）")
                time.sleep(2.5)

                pairs = page.eval_on_selector_all(
                    "dl dt",
                    "els => els.map(dt => [dt.textContent.trim(),"
                    " dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : ''])",
                )
                page.screenshot(path=str(SHOTS / f"{sid}-01-default.png"))

                btn = page.query_selector('button[title^="播放"]')
                if btn:
                    btn.click()
                    time.sleep(2.6)
                    page.screenshot(path=str(SHOTS / f"{sid}-02-playing.png"))
                else:
                    errors.append("找不到播放按钮")

                print(f"\n=== {sid} ===")
                print("读数：", " | ".join(f"{k}={v}" for k, v in pairs) or "(无)")
                print("console errors：", errors if errors else "0")
                if errors:
                    failed += 1
                page.close()
            browser.close()
    finally:
        server.terminate()

    print(f"\n结果：{len(scenes) - failed}/{len(scenes)} 通过")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
