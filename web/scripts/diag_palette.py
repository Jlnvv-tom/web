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

# 目标区间。
#
# 2026-10-22 全站切浅色后整体上调：浅色底上"暗部"应当接近 0，
# 而"高光占比"的上限放宽到 10% —— 白底本身就是大面积高光，
# 再用深色模式的 6% 上限会把所有场景判成不合格。
# 刻意写成区间：太低是"灰"，太高是"糊"。
TARGET = {
    # 2026-10-24：画布底板由中间调 #8E8574 改为近白 #FAF8F4（理由见 engine/palette.ts 顶部
    # 与 m3-plan §0.1：中间调底板无法同时满足 4.5:1 与色相编码）。
    # 这是该区间第三次调整，所以把每条的理由写死，避免以后再拍脑袋：
    "mean_l": (0.72, 0.92),        # 近白底板本身 L≈0.94；木台面 L=0.30 是唯一中间调锚点
    "dark_ratio": (0.0, 0.02),     # 近白底板上"暗部"应当几乎为零
    "std_l": (0.08, 0.26),         # 层次来自 台面vs背景、投影、墨色；示意图天生比实景平
    "mean_s": (0.08, 0.30),        # 700/800 档语义色比原 400 档更灰
    # bright_ratio 在白底上已失去判别力（底板本身就 >0.75），降级为仅供参考。
    # 真正的可见性判据是 engine/palette.ts 的单测对比度断言，不再由截图承担。
    "bright_ratio": (0.30, 0.85),
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
            print("→ 画面整体偏暗：浅色模式下应补环境光，不要先加 bloom")
        if avg_l > TARGET["mean_l"][1]:
            print("→ 画面整体过亮：先压曝光，别靠加暗角找层次")
        if avg_s > TARGET["mean_s"][1]:
            print("→ 饱和过高：白底上高饱和色显脏，强调色统一降到 600/700 档")

    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
