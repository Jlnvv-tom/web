#!/usr/bin/env python3
"""
画质自适应验证（M3.5 · G2）

这条脚本回答一个问题：**弱机上它真的会自己降档吗？**
单元测试只能证明状态机的逻辑；这里验证接线——帧率探针 → 长官僚 → dpr/泛光/阴影 → 提示条。

为什么要用软件渲染模拟弱机：
  CDP 的 CPU 降频只拖主线程，而 3D 场景是 GPU 填充率瓶颈（实测 4× CPU 降频
  一帧都不掉）。把 GL 换成 SwiftShader 才是"没有 GPU 加速"的真实形态，
  帧率会掉到个位数——正好用来验证降档链路。

用法：
    python scripts/verify_quality.py            # 两个用例都跑
    python scripts/verify_quality.py --headed   # 看得到窗口（调试用）

判据：
  ① 正常 GPU：data-quality 保持 high，且不出现提示条（不许误判）；
  ② 软件渲染：8 秒内 data-quality 降到 mid/low，并出现提示条；
  ③ 点「保持」后提示条消失，且档位不再变化（锁定生效）。
"""
from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"


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
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def quality_of(page) -> str:
    return page.evaluate("() => document.documentElement.dataset.quality || '?'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="projectile-motion")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--wait", type=float, default=8.0)
    args = ap.parse_args()

    if not OUT.exists():
        print("缺少 out/，先跑 npm run build", file=sys.stderr)
        return 2

    from playwright.sync_api import sync_playwright

    port = free_port()
    serve(OUT, port)
    url = f"http://127.0.0.1:{port}/topics/{args.scene}/"
    failures: list[str] = []

    with sync_playwright() as pw:
        # ---------- ① 正常 GPU：不许误判 ----------
        browser = pw.chromium.launch(
            headless=not args.headed,
            args=["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"],
        )
        page = browser.new_context(
            viewport={"width": 1440, "height": 900}, device_scale_factor=2
        ).new_page()
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector("canvas", timeout=20000)
        page.wait_for_timeout(int(args.wait * 1000))
        fast_q = quality_of(page)
        notice = page.query_selector("[data-quality-notice]")
        print(f"① 正常 GPU  → quality={fast_q}  提示条={'有' if notice else '无'}")
        if fast_q != "high":
            failures.append(f"正常 GPU 被误降档：{fast_q}")
        if notice:
            failures.append("正常 GPU 弹出了降档提示（误判）")
        browser.close()

        # ---------- ② 软件渲染：必须降档并提示 ----------
        slow = pw.chromium.launch(
            headless=not args.headed,
            args=["--disable-gpu", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page2 = slow.new_context(
            viewport={"width": 1440, "height": 900}, device_scale_factor=1
        ).new_page()
        page2.goto(url, wait_until="domcontentloaded")
        page2.wait_for_selector("canvas", timeout=30000)
        # 慢机要等：3s 热身 + 2 个判定窗
        page2.wait_for_timeout(int(args.wait * 1000))
        slow_q = quality_of(page2)
        btn = page2.query_selector("[data-quality-notice]")
        print(f"② 软件渲染  → quality={slow_q}  提示条={'有' if btn else '无'}")
        if slow_q == "high":
            failures.append("软件渲染下没有降档（长官僚没接上）")
        if not btn:
            failures.append("降档后没有出现提示条（用户无法改回）")

        # ---------- ③ 点「保持」：锁定 ----------
        if btn:
            page2.get_by_role("button", name="保持").click()
            page2.wait_for_timeout(300)
            locked_q = quality_of(page2)
            gone = page2.query_selector("[data-quality-notice]")
            page2.wait_for_timeout(3000)
            still = quality_of(page2)
            print(f"③ 点「保持」→ quality={locked_q}  提示条={'有' if gone else '无'}  3s 后={still}")
            if gone:
                failures.append("点「保持」后提示条没消失")
            if still != locked_q:
                failures.append(f"锁定失效：{locked_q} → {still}")

        slow.close()

    print()
    if failures:
        for f in failures:
            print("FAIL:", f)
        return 1
    print("PASS：正常机不误判 / 弱机自动降档 / 提示与锁定可用")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
