#!/usr/bin/env python3
"""画面色彩体检（M3 · 视觉打磨的仪表盘）

把 docs/m3-plan.md §7 的验收指标做成一条命令：读指定场景的截图，
统计亮度 / 饱和度 / 暗部占比 / 高光占比 / 色相集中度，并与目标区间对比。

用法：
    python scripts/diag_palette.py                # 用 harness/shots/*-01-default.png
    python scripts/diag_palette.py shm orbit      # 只看某些场景
    python scripts/diag_palette.py --file a.png   # 直接看某张图

退出码：全部在目标区间内为 0，否则 1（方便挂进 CI）。
"""
import colorsys
import os
import statistics
import sys
import warnings
from pathlib import Path

from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "harness" / "shots"

# 与 content/scenes/index.ts 的 SCENES 保持一致。
# 不 glob 整目录：harness/shots 里还有历次调试留下的 cap-/ef-/crop- 等临时图，
# 混进来会让"12 个场景有几个达标"这个数字失去意义。
SCENE_IDS = [
    "projectile-motion", "lorentz-force", "thin-lens", "electric-field",
    "capacitor", "shm", "orbit", "reflection", "wave", "induction",
    "buoyancy", "lever",
]

# 目标区间（见 m3-plan.md §7）。刻意写成区间：太低是"黑"，太高是"糊"。
TARGET = {
    "mean_l": (0.30, 0.42),
    "dark_ratio": (0.0, 0.25),
    "std_l": (0.16, 0.24),
    "mean_s": (0.20, 0.32),
    "bright_ratio": (0.015, 0.06),
}

# 参考站（jelly.scottsun.io）实测值，作为对照列
REFERENCE = {"mean_l": 0.577, "std_l": 0.111, "mean_s": 0.264, "dark_ratio": 0.0, "bright_ratio": 0.014}


def measure(path: Path) -> dict:
    im = Image.open(path).convert("RGB").resize((360, 225))
    px = list(im.getdata())
    n = len(px)
    L, S = [], []
    dark = bright = 0
    hues: dict[int, int] = {}
    for r, g, b in px:
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        L.append(l)
        S.append(s)
        if l < 0.08:
            dark += 1
        if l > 0.75:
            bright += 1
        if s > 0.10 and l > 0.15:
            hues[int(h * 12)] = hues.get(int(h * 12), 0) + 1
    tot_hue = sum(hues.values()) or 1
    top_share = max(hues.values()) / tot_hue if hues else 0.0
    return {
        "mean_l": statistics.mean(L),
        "std_l": statistics.pstdev(L),
        "mean_s": statistics.mean(S),
        "dark_ratio": dark / n,
        "bright_ratio": bright / n,
        "hue_buckets": len([v for v in hues.values() if v / tot_hue > 0.02]),
        "hue_top_share": top_share,
    }


def pick(scene_id: str) -> Path:
    """优先用纯画布截图。

    整页截图（`*-01-default.png`）里有深色的页头与右侧参数面板，
    算出来的「暗部占比」会被 UI 拉高十几个百分点——那不是 3D 的问题。
    纯画布截图由 `shot_canvas.py` 产出。
    """
    canvas = SHOTS / f"canvas-{scene_id}.png"
    return canvas if canvas.exists() else SHOTS / f"{scene_id}-01-default.png"


def verdict(key: str, value: float) -> str:
    lo, hi = TARGET[key]
    if value < lo:
        return f"低 {lo:.2f}"
    if value > hi:
        return f"高 {hi:.2f}"
    return "OK"


def main() -> int:
    args = sys.argv[1:]
    files: list[Path] = []
    if args and args[0] == "--file":
        files = [Path(a) for a in args[1:]]
    elif args:
        files = [pick(a) for a in args]
    else:
        files = [pick(sid) for sid in SCENE_IDS]

    files = [f for f in files if f.exists()]
    if not files:
        print("没有找到截图。先跑 python scripts/verify_scenes.py <sceneId>")
        return 2

    head = (
        f"{'场景':20s} {'均亮':>6s} {'暗部%':>7s} {'亮度std':>8s} {'均饱和':>7s} {'高光%':>7s} {'色相桶':>6s}"
    )
    print(head)
    print("-" * len(head))
    print(
        f"{'【参考站】':18s} {REFERENCE['mean_l']:6.3f} {100 * REFERENCE['dark_ratio']:6.1f}%"
        f" {REFERENCE['std_l']:8.3f} {REFERENCE['mean_s']:7.3f} {100 * REFERENCE['bright_ratio']:6.1f}%"
    )
    lo = {k: v[0] for k, v in TARGET.items()}
    hi = {k: v[1] for k, v in TARGET.items()}
    print(
        f"{'【目标区间】':16s} {lo['mean_l']:.2f}~{hi['mean_l']:.2f}"
        f" {'<=' + format(100 * hi['dark_ratio'], '.0f') + '%':>7s}"
        f" {lo['std_l']:.2f}~{hi['std_l']:.2f}"
        f" {lo['mean_s']:.2f}~{hi['mean_s']:.2f}"
        f" {100 * lo['bright_ratio']:.1f}~{100 * hi['bright_ratio']:.0f}%"
    )
    print("-" * len(head))

    fails = 0
    details = []
    for f in files:
        m = measure(f)
        name = os.path.basename(str(f)).replace("-01-default.png", "")
        row = (
            f"{name:20s} {m['mean_l']:6.3f} {100 * m['dark_ratio']:6.1f}%"
            f" {m['std_l']:8.3f} {m['mean_s']:7.3f} {100 * m['bright_ratio']:6.1f}% {m['hue_buckets']:6d}"
        )
        bad = [verdict(k, m[k]) for k in TARGET]
        if any(v != "OK" for v in bad):
            fails += 1
            row += "   ✗ " + ", ".join(
                f"{k}={v}" for k, v in zip(TARGET, bad) if v != "OK"
            )
        print(row)
        details.append((name, m))

    print("-" * len(head))
    print(f"{len(files) - fails}/{len(files)} 达标")

    # 一句话诊断：最常见的两个问题
    if details:
        avg_l = statistics.mean(m["mean_l"] for _, m in details)
        avg_s = statistics.mean(m["mean_s"] for _, m in details)
        print(
            f"均值：亮度 {avg_l:.3f}（参考 {REFERENCE['mean_l']:.3f}），"
            f"饱和 {avg_s:.3f}（参考 {REFERENCE['mean_s']:.3f}）"
        )
        if avg_l < TARGET["mean_l"][0]:
            print("→ 画面整体偏黑：优先补环境光与台面，不要先加 bloom")
        if avg_s > TARGET["mean_s"][1]:
            print("→ 饱和过高：把强调色降饱和、靠明度对比拉开层次，不要靠更鲜艳")

    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
