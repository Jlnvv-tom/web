#!/usr/bin/env python3
"""10 秒测试拼图：全场景默认帧 → 带标签网格图

两个用途，对应 m3-plan 里的两条判据：
- §7.2 人工判据：把默认帧拼成一张图，给没看过产品的人看 10 秒，
  问"这是什么"。答案应该是「一个能动手的物理教具」。
- W4 判据：「截取第 1.2 秒的单帧，能不能当封面图」。
  所以采样时刻取 1.2s，与基线工具（1.0s）刻意不同。

确定性来自虚拟时钟（与 verify_baseline.py 同一套 init script）：
同一 commit 任意机器重跑，结果逐像素一致。

产物：
  harness/shots/contact-sheet.png       带标题版（内部/同事评审）
  harness/shots/contact-sheet-bare.png  无标题版（纯 10 秒测试，标题会引导答案）
  harness/shots/review-<sceneId>.png    单场景原尺寸大图

用法：
  python scripts/shot_contact.py                 # 全部场景，t=1.2s
  python scripts/shot_contact.py --at 3.5        # 换个采样时刻
  python scripts/shot_contact.py buoyancy        # 只截某个场景
"""
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_baseline import BASE, INIT_JS, PORT  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "harness" / "shots"
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"

COLS = 4
CELL_W = 560  # 拼图里每格的渲染宽度（原图 1057 宽，约 0.53 缩放）
LABEL_H = 34
PAD = 14
BG = (246, 243, 238)  # 与站点暖白一致


def scene_order() -> list[tuple[str, str]]:
    """按 content/scenes/index.ts 的注册顺序取 (id, title)。

    注意 index.ts 里 `xxxScene` 出现两次（import + 注册表数组），去重保序。
    """
    idx = (ROOT / "content" / "scenes" / "index.ts").read_text(encoding="utf-8")
    seen: set[str] = set()
    order = []
    for var in re.findall(r"(\w+)Scene\b", idx):
        if var in seen:
            continue
        seen.add(var)
        order.append(var)
    out = []
    for var in order:
        sid = re.sub(r"(?<!^)(?=[A-Z])", "-", var).lower()
        path = ROOT / "content" / "scenes" / f"{sid}.scene.ts"
        if not path.exists():
            continue
        src = path.read_text(encoding="utf-8")
        m = re.search(r"meta:\s*\{\s*\n\s*id:\s*'([^']+)',\s*\n\s*title:\s*'([^']+)'", src)
        if m:
            out.append((m.group(1), m.group(2)))
    return out


def capture(page, sid: str, at_s: float, frame_ms: float) -> Image.Image:
    import io

    page.goto(f"{BASE}/topics/{sid}/", wait_until="domcontentloaded")
    page.wait_for_function(
        "() => { const c = document.querySelector('canvas');"
        " return !!c && c.clientWidth > 600; }",
        polling=100,
        timeout=25000,
    )
    page.evaluate("window.__advance(16.7)")
    time.sleep(0.3)
    page.evaluate("window.__advance(16.7)")
    time.sleep(0.3)
    n = max(1, round(at_s * 1000 / frame_ms))
    for i in range(0, n, 10):
        page.evaluate(f"window.__advance({frame_ms * min(10, n - i)})")
        time.sleep(0.02)
    png = page.query_selector("canvas").screenshot()
    return Image.open(io.BytesIO(png)).convert("RGB")


def compose(images: list[tuple[str, str, Image.Image]], bare: bool) -> Image.Image:
    rows = (len(images) + COLS - 1) // COLS
    cell_h = round(CELL_W * 555 / 1057) + (0 if bare else LABEL_H)
    w = COLS * CELL_W + (COLS + 1) * PAD
    h = rows * cell_h + (rows + 1) * PAD
    sheet = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 15)

    for i, (sid, title, img) in enumerate(images):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL_W + PAD)
        y = PAD + r * (cell_h + PAD)
        thumb = img.resize((CELL_W, round(CELL_W * img.height / img.width)), Image.LANCZOS)
        sheet.paste(thumb, (x, y))
        if not bare:
            draw.text((x + 2, y + thumb.height + 7), title, fill=(60, 55, 48), font=font)
    return sheet


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="*", help="场景 id（默认全部）")
    ap.add_argument("--at", type=float, default=1.2, help="采样时刻（秒）")
    ap.add_argument("--frame-ms", type=float, default=16.7)
    args = ap.parse_args()

    registry = scene_order()
    picked = [(sid, t) for sid, t in registry if not args.scenes or sid in args.scenes]
    if not picked:
        sys.exit(f"没有匹配的场景。可选：{[s for s, _ in registry]}")
    SHOTS.mkdir(parents=True, exist_ok=True)

    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT / "out")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)

    images: list[tuple[str, str, Image.Image]] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for sid, title in picked:
                ctx = browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    color_scheme="light",
                    reduced_motion="no-preference",
                )
                page = ctx.new_page()
                page.add_init_script(INIT_JS)
                img = capture(page, sid, args.at, args.frame_ms)
                img.save(SHOTS / f"review-{sid}.png")
                images.append((sid, title, img))
                print(f"[{sid}] {img.size} 已截")
                ctx.close()
            browser.close()
    finally:
        server.terminate()

    if len(images) > 1:
        compose(images, bare=False).save(SHOTS / "contact-sheet.png")
        compose(images, bare=True).save(SHOTS / "contact-sheet-bare.png")
        print(f"\n拼图（{len(images)} 格）→ harness/shots/contact-sheet.png（带标题）/ -bare.png（无标题）")
    print(f"单图 → harness/shots/review-<sceneId>.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
