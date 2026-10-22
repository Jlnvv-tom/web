#!/usr/bin/env python3
"""离线单文件导出的端到端验证（M2 · 任务 #17）

做三件事：
  1. 起静态服务 → 打开知识点页 → 点「导出离线版」→ 接住下载的 HTML
  2. 用 file:// 打开这个 HTML，等画布就绪，读 HUD
  3. 断言**零网络请求**：除了 file:// 与 data:，不允许任何 http(s) 请求

用法：python scripts/verify_offline.py [sceneId ...]
产物：harness/exports/<sceneId>.html 与 harness/shots/offline-<sceneId>.png
"""
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3217
BASE = f"http://127.0.0.1:{PORT}"
EXPORTS = ROOT / "harness" / "exports"
SHOTS = ROOT / "harness" / "shots"
DEFAULT_SCENES = ["lever", "buoyancy", "induction"]

# 单文件里出现这些就算失败：说明还有外部依赖
MIN_BYTES = 500_000


def main() -> int:
    scenes = sys.argv[1:] or DEFAULT_SCENES
    EXPORTS.mkdir(parents=True, exist_ok=True)
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
                errs: list[str] = []
                ctx = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 900})
                page = ctx.new_page()
                page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errs.append(str(e)))

                page.goto(f"{BASE}/topics/{sid}/", wait_until="domcontentloaded")
                page.wait_for_function(
                    "() => { const c = document.querySelector('canvas'); return !!c && c.width > 600; }",
                    timeout=20000,
                )
                time.sleep(1.5)

                # ---- 1. 触发导出并接住下载 ----
                btn = page.query_selector("text=导出离线版")
                if not btn:
                    print(f"[{sid}] ✗ 找不到「导出离线版」按钮")
                    failed += 1
                    ctx.close()
                    continue

                with page.expect_download(timeout=60000) as dl_info:
                    btn.click()
                dl = dl_info.value
                out = EXPORTS / f"{sid}.html"
                dl.save_as(str(out))
                ctx.close()

                size = out.stat().st_size
                print(f"\n=== {sid} ===")
                print(f"下载文件名：{dl.suggested_filename}")
                print(f"文件大小：{size / 1024:.0f} KB")

                if size < MIN_BYTES:
                    print(f"✗ 文件过小（< {MIN_BYTES // 1024} KB），运行时可能没内联进去")
                    failed += 1
                    continue

                # ---- 2. 用 file:// 打开，记录所有请求 ----
                reqs: list[str] = []
                errs2: list[str] = []
                ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
                page2 = ctx2.new_page()
                page2.on("request", lambda r: reqs.append(r.url))
                page2.on("console", lambda m: errs2.append(m.text) if m.type == "error" else None)
                page2.on("pageerror", lambda e: errs2.append(str(e)))

                page2.goto(out.as_uri(), wait_until="load")
                page2.wait_for_function(
                    "() => { const c = document.querySelector('canvas'); return !!c && c.width > 600; }",
                    timeout=25000,
                )
                time.sleep(2.5)

                pairs = page2.eval_on_selector_all(
                    "dl dt",
                    "els => els.map(dt => [dt.textContent.trim(),"
                    " dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : ''])",
                )
                page2.screenshot(path=str(SHOTS / f"offline-{sid}.png"))

                # ---- 3. 断言 ----
                remote = [u for u in reqs if urlparse(u).scheme in ("http", "https")]
                has_formula = page2.eval_on_selector_all(
                    ".formula math, .formula .katex", "els => els.length"
                )
                # 离线版不应在别人电脑上留痕：不能出现埋点键
                tel_key = page2.evaluate(
                    "() => Object.keys(localStorage).filter(k => k.indexOf('phys3d.telemetry') === 0)"
                )
                # 结构体检：样式真加载了、画布真够大、没有指向站内其它页的死链
                box = page2.evaluate(
                    "() => { const r = document.querySelector('canvas').getBoundingClientRect();"
                    " return { w: Math.round(r.width), h: Math.round(r.height) }; }"
                )
                panel_radius = page2.evaluate(
                    "() => { const e = document.querySelector('.panel');"
                    " return e ? getComputedStyle(e).borderRadius : '0px'; }"
                )
                links = page2.evaluate(
                    "() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))"
                )

                print(f"画布 {box['w']}×{box['h']}，HUD 读数 {len(pairs)} 条")
                print(f"公式渲染：{has_formula} 处")
                print(f".panel 圆角：{panel_radius}（样式已加载的信号）")
                print(f"站内链接：{len(links)} 个（离线版应为 0，否则是死链）")
                print(f"请求总数 {len(reqs)}，其中走网络 {len(remote)} 个")
                if remote:
                    print("  ✗ 存在外部请求：", remote[:5])
                print(f"埋点键：{tel_key if tel_key else '无（预期）'}")
                print("console errors：", errs2 if errs2 else "0")

                if remote:
                    failed += 1
                if errs2:
                    failed += 1
                if tel_key:
                    print("  ✗ 离线版不该写 localStorage，__NO_TELEMETRY__ 没生效")
                    failed += 1
                if box["w"] < 900 or box["h"] < 400:
                    print(f"  ✗ 画布只有 {box['w']}×{box['h']}，布局没铺开")
                    failed += 1
                if panel_radius in ("0px", ""):
                    print("  ✗ .panel 没有圆角，standalone.css 可能没生效")
                    failed += 1
                if links:
                    print(f"  ✗ 离线版残留 {len(links)} 个链接，点开是死链")
                    failed += 1
                if len(pairs) < 8:
                    print(f"  ✗ HUD 读数只有 {len(pairs)} 条，场景可能没真正跑起来")
                    failed += 1
                if has_formula == 0:
                    print("  ✗ 公式没渲染出来（MathML 转换失败？）")
                    failed += 1
                ctx2.close()

            browser.close()
    finally:
        server.terminate()

    print(f"\n结果：{len(scenes) - failed}/{len(scenes)} 通过")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
