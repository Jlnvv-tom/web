#!/usr/bin/env python3
"""初中物理实验页 · 功能与物理正确性验证

对每个页面：
1. 拖滑块到指定值，读回全部读数
2. 与 Python 侧独立计算的期望值比对（不信任前端表达式）
3. 检查「定值指示」在两次不同参数下确实不变

用法：python scripts/verify_junior.py
"""
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2] / "lessons" / "初中物理实验"
def free_port() -> int:
    """自动挑一个空闲端口。

    固定端口在"上次崩溃留下 http.server"时会直接让 goto 超时——
    这种失败看起来像页面问题，实际是端口占用，排查成本很高。
    """
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_ready(port: int, timeout: float = 10.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=2)
            return True
        except Exception:
            time.sleep(0.25)
    return False

SET_SLIDER = """(v) => {
  const el = document.getElementById('param-slider');
  if (!el) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
}"""

READ = """() => [...document.querySelectorAll('.readout-row')].map(r => ({
  label: (r.querySelector('.readout-label')||{}).textContent || '',
  value: (r.querySelector('.readout-value')||{}).textContent || ''
}))"""

# 期望值全部由手算/独立推得，不是从前端表达式反推
#
# 2026-10-24：02-sound-propagation / 05-electromagnetic-induction 两个 CASE
# 已随页面迁入主产品（engine/solvers/acoustics.test.ts 与 rodInduction.test.ts，
# 期望值原样保留）。本脚本只剩未迁移的 4 页；全部迁完后本脚本退役。
CASES = [
    {
        "file": "01-light-refraction.html",
        "param": "i", "v1": 45, "v2": 10,
        "expect": {  # 折射角 r = asin(sin i / 1.33)
            "入射角": (45.0, 10.0),
            "折射角": (32.1, 7.5),
            "折射率": (1.33, 1.33),
            "水中光速": (2.26, 2.26),
            "正弦比": (1.33, 1.33),
        },
        "const_idx": 4,  # 正弦比
    },
    {
        "file": "03-magnetic-field-lines.html",
        "param": "r", "v1": 2, "v2": 4,
        "expect": {
            "距离": (2.0, 4.0),
            "磁感应强度": (0.165, 0.0207),   # θ=60° 时 B = 0.1653/r³
            "与磁轴的夹角": (60.0, 60.0),
            "Br3": (1.323, 1.323),           # 核心：B·r³ 恒定（标签被 KaTeX 渲染成 Br3Br^3Br3）
        },
        "const_idx": 3,
    },
    {
        "file": "04-solenoid-right-hand.html",
        "param": "alpha", "v1": 180, "v2": 540,
        "expect": {
            "已绕圈数": (0.50, 1.50),
            "当前高度": (0.275, 0.825),        # h = pitch·α/360
            "管内磁感应强度": (2.51, 2.51),     # μ0·n·I = 1.2566e-6·1000·2 = 2.513 mT
        },
        "const_idx": 2,
    },
    {
        "file": "06-molecular-motion.html",
        "param": "t", "v1": 1.0, "v2": 5.0,
        "expect": {
            "时间": (1.00, 5.00),
            "氮分子方均根速率": (517.0, 517.0),  # sqrt(3RT/M)，300K 的 N₂
            "平均动能": (6.21, 6.21),            # (3/2)kT ×10⁻²¹
        },
        "const_idx": 2,
    },
]


def close(a, b, tol=0.06):
    if abs(b) < 1e-9:
        return abs(a) < 1e-6
    return abs(a - b) / max(abs(b), 1e-9) <= tol


def main():
    failed = 0
    port = free_port()
    srv = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", str(ROOT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not wait_ready(port):
        print(f"静态服务没起来（root={ROOT}）")
        srv.terminate()
        return 2
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for case in CASES:
                page = browser.new_page(viewport={"width": 1400, "height": 900})
                errs = []
                page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                page.on("pageerror", lambda e: errs.append(str(e)))
                page.goto(f"http://127.0.0.1:{port}/{case['file']}", wait_until="domcontentloaded")
                page.wait_for_selector("#param-slider", timeout=15000)
                time.sleep(5)  # 等 Three.js 与 KaTeX

                rows = {}
                for v in (case["v1"], case["v2"]):
                    page.evaluate(SET_SLIDER, v)
                    time.sleep(0.35)
                    got = page.evaluate(READ)
                    rows[v] = [
                        (re.sub(r"\s+", "", r["label"]), r["value"].strip()) for r in got
                    ]

                print(f"\n=== {case['file']} ===")
                # 1) 数值比对
                for key, (e1, e2) in case["expect"].items():
                    def find(v):
                        for lab, val in rows[v]:
                            # contains 而不是 startswith：KaTeX 自动渲染会把标签
                            # 变成 "Br3Br^3Br3" 这种重复文本，前缀匹配会漏掉
                            if key[:4] in lab:
                                return val
                        return None
                    a1, a2 = find(case["v1"]), find(case["v2"])
                    ok1 = a1 is not None and close(float(re.sub(r"[^\d.\-]", "", a1) or 0), e1)
                    ok2 = a2 is not None and close(float(re.sub(r"[^\d.\-]", "", a2) or 0), e2)
                    flag = "OK " if (ok1 and ok2) else "✗ "
                    print(f"  {flag}{key:14s} v={case['v1']}: {a1} (期望 {e1})   "
                          f"v={case['v2']}: {a2} (期望 {e2})")
                    if not (ok1 and ok2):
                        failed += 1

                # 2) 定值指示：换参数后必须不变
                idx = case["const_idx"]
                if len(rows[case["v1"]]) > idx and len(rows[case["v2"]]) > idx:
                    c1 = rows[case["v1"]][idx][1]
                    c2 = rows[case["v2"]][idx][1]
                    same = c1 == c2
                    print(f"  {'OK ' if same else '✗ '}定值项 {rows[case['v1']][idx][0]}: "
                          f"{c1} vs {c2}")
                    if not same:
                        failed += 1

                # 3) 恒等横幅
                banner = page.evaluate(
                    "() => { const b = document.getElementById('constant-block');"
                    " return b && b.style.display !== 'none' ?"
                    " (document.getElementById('const-value')||{}).textContent : ''; }"
                )
                print(f"  守恒横幅: {banner or '（未显示）'}")

                if errs:
                    print("  console errors:", errs[:3])
                    failed += 1
                page.close()
            browser.close()
    finally:
        srv.terminate()

    print(f"\n结果：{'全部通过' if failed == 0 else f'{failed} 项失败'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
