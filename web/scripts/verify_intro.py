#!/usr/bin/env python3
"""intro 机制验证（W4 任务 2 的验收）· git stash 对照实验

判据设计（初版用"开启态与旧基线差 >5%"，实测是错的门——
lorentz 粒子缩放 6.6% 只动几个像素、wipe-in 在 62% 时已淡入 94.5%，
像素差天然小。像素差小不等于没演出，那由单测与 kind 覆盖断言负责）。

三条硬门（全部同布局比对；本站入场缩放动画会被 reduced-motion 冻结在
97% 缩放，所以跨配置比对必须各自配对，不能混）：
  A 零回归：intro 禁用（reduced）t=1.0，新代码 vs 旧代码 → ≤1%
  B 稳态不变：intro 已结束（normal t=3.0），新代码 vs 旧代码 → ≤1%
    （演出结束后画面必须回到"没有 intro"的样子；B 不过 = 演出留了残渣）
信息项：
  C 演出量：normal t=1.0 新代码 vs 旧代码（intro 进行中）→ 差异越大演出越强

用法（对照实验，旧代码也要采同三帧）：
  # ① 新代码：存三帧（reduced-t1 / reduced-t3 / normal-t3）
  python scripts/verify_intro.py --save-off /tmp/intro_new
  # ② git stash（把 engine/intro.ts 等未跟踪文件也移走）&& npm run build
  # ③ 旧代码：存三帧
  python scripts/verify_intro.py --save-off /tmp/intro_old
  # ④ 恢复文件 && git stash pop && npm run build
  # ⑤ 新代码：三条判据
  python scripts/verify_intro.py --old-dir /tmp/intro_old
"""
import argparse
import io
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_baseline import BASE, INIT_JS, PORT, diff  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# 声明了 intro 的场景（与 engine/contract/decor.test.ts 的 kind 覆盖断言对应）
INTRO_SCENES = {
    "lorentz-force": "trail-bloom",
    "thin-lens": "wipe-in",
    "wave": "light-up",
    "shm": "assemble",
    "buoyancy": "splash",
}
AT_MID = 1.0  # intro 进行中（默认时长 1.6s → 进度 62%）
AT_END = 3.0  # intro 已结束
THRESH = 0.01  # A/B 门的像素差异上限（1%）


def capture(page, sid: str, at_s: float, frame_ms: float = 16.7) -> Image.Image:
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
    # 逐帧泵（页面内部循环）：步长 frameMs ≤ 50ms，不被 dt 钳制放慢
    page.evaluate(f"window.__advanceFrames({n}, {frame_ms})")
    return Image.open(io.BytesIO(page.query_selector("canvas").screenshot())).convert("RGB")


def grab(reduced: str, sid: str, at_s: float, errors: list[str]) -> Image.Image:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            color_scheme="light",
            reduced_motion=reduced,
        )
        page = ctx.new_page()
        page.add_init_script(INIT_JS)
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        img = capture(page, sid, at_s)
        ctx.close()
        browser.close()
        return img


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenes", nargs="*", help="场景 id（默认全部 intro 场景）")
    ap.add_argument("--save-off", metavar="DIR", help="只采样三帧存入 DIR（对照实验取样）")
    ap.add_argument("--old-dir", metavar="DIR", help="旧代码的采样目录（三条判据）")
    args = ap.parse_args()

    scenes = [s for s in args.scenes if s in INTRO_SCENES] or list(INTRO_SCENES)
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(ROOT / "out")],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)

    failed = 0
    try:
        for sid in scenes:
            kind = INTRO_SCENES[sid]
            errors: list[str] = []
            # 三帧：禁用-t1（A 门）、禁用-t3（陪跑，确认禁用态不随时间漂移）、普通-t3（B 门）
            off_mid = grab("reduce", sid, AT_MID, errors)
            off_end = grab("reduce", sid, AT_END, errors)
            on_end = grab("no-preference", sid, AT_END, errors)

            if args.save_off:
                out = Path(args.save_off)
                out.mkdir(parents=True, exist_ok=True)
                off_mid.save(out / f"{sid}-off-t{AT_MID}.png")
                off_end.save(out / f"{sid}-off-t{AT_END}.png")
                on_end.save(out / f"{sid}-on-t{AT_END}.png")
                on_mid = grab("no-preference", sid, AT_MID, errors)
                on_mid.save(out / f"{sid}-on-t{AT_MID}.png")
                print(f"[{sid}] kind={kind:12s} 四帧已存 {out}  errors={len(errors)}")
                if errors:
                    failed += 1
                continue

            if not args.old_dir:
                print("需要 --old-dir 才能比对（或先用 --save-off 取样）")
                return 2
            old = Path(args.old_dir)

            def cmp(old_name: str, new_img: Image.Image):
                p = old / old_name
                if not p.exists():
                    return None
                return diff(Image.open(p).convert("RGB"), new_img)

            verdicts = []

            # A 零回归：禁用态 t=1.0
            m_a = cmp(f"{sid}-off-t{AT_MID}.png", off_mid)
            if m_a is None or m_a.get("size_mismatch"):
                verdicts.append(("A零回归", False, "缺帧/尺寸变"))
            else:
                verdicts.append(("A零回归", m_a["r8"] <= THRESH, f"Δ={m_a['r8'] * 100:.2f}%"))

            # B 稳态不变：演出结束后 t=3.0（普通上下文，同布局）
            m_b = cmp(f"{sid}-on-t{AT_END}.png", on_end)
            if m_b is None or m_b.get("size_mismatch"):
                verdicts.append(("B稳态", False, "缺帧/尺寸变"))
            else:
                verdicts.append(("B稳态", m_b["r8"] <= THRESH, f"Δ={m_b['r8'] * 100:.2f}%"))

            # C 演出量（信息项）：t=1.0 普通 vs 旧代码普通
            on_mid = grab("no-preference", sid, AT_MID, errors)
            m_c = cmp(f"{sid}-on-t{AT_MID}.png", on_mid) if (old / f"{sid}-on-t{AT_MID}.png").exists() else None
            c_txt = f"Δ={m_c['r8'] * 100:.2f}%" if m_c and not m_c.get("size_mismatch") else "（无旧普通-t1 帧，跳过）"

            ok = all(v[1] for v in verdicts) and not errors
            if not ok:
                failed += 1
            print(
                f"[{sid}] kind={kind:12s} "
                + "  ".join(f"{n}{'✓' if ok_ else '✗'}({d})" for n, ok_, d in verdicts)
                + f"  C演出量 {c_txt}  errors={len(errors)} → {'PASS' if ok else 'FAIL'}"
            )
            for e in errors:
                print(f"    console error: {e}")
    finally:
        server.terminate()

    print(f"\n结果：{len(scenes) - failed}/{len(scenes)} 通过（A/B 阈值 {THRESH:.0%}）")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
