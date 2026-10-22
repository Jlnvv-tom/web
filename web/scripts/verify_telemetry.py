#!/usr/bin/env python3
"""埋点的端到端验证（M2 · 任务 #18）

在真实页面上做一遍「打开 → 拖滑块 → 作答」，再从 localStorage 读回事件，
断言三类事件都真的落库、拖动被合并、首次作答被记录。

用法：python scripts/verify_telemetry.py [sceneId]
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3218
BASE = f"http://127.0.0.1:{PORT}"
KEY = "phys3d.telemetry.v1"

# 用原生 setter 改值，React 的受控 input 才认
SET_RANGE = """([idx, v]) => {
  const els = [...document.querySelectorAll('input[type=range]')];
  const el = els[idx];
  if (!el) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.id;
}"""


def main() -> int:
    sid = sys.argv[1] if len(sys.argv) > 1 else "lever"
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
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            errs: list[str] = []
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append(str(e)))

            page.goto(f"{BASE}/topics/{sid}/", wait_until="domcontentloaded")
            page.wait_for_function(
                "() => { const c = document.querySelector('canvas'); return !!c && c.width > 600; }",
                timeout=20000,
            )
            time.sleep(1.5)

            # ---- 参数面板的第一个滑块：连续拖 4 下（应合并成 1 条，n=4） ----
            # 第 0 个 range 是时间轴，参数滑块从 index 1 开始
            # 注意：localStorage 里存的是**裸数组**；带 version/session 的对象只在导出时才有
            before = page.evaluate("() => localStorage.getItem('" + KEY + "')")
            n_before = len(json.loads(before)) if before else 0

            # 先读出这个滑块的 min/max/step，再挑 4 个**互不相同且落在区间内**的值。
            # 之前图省事写死 55/60/65/70，结果全被夹到 max，4 次设置变成 1 次真实变化。
            meta = page.evaluate(
                """() => {
                  const el = [...document.querySelectorAll('input[type=range]')][1];
                  if (!el) return null;
                  const min = +el.min, max = +el.max, step = +el.step || 1;
                  const vals = [];
                  for (let i = 1; i <= 4; i++) {
                    const v = Math.round((min + (max - min) * i / 5) / step) * step;
                    if (!vals.includes(v)) vals.push(v);
                  }
                  return { min, max, step, vals };
                }"""
            )
            if not meta or len(meta["vals"]) < 2:
                print("  ✗ 找不到可用的参数滑块")
                failed += 1
                meta = {"vals": []}

            changed = None
            for v in meta["vals"]:
                changed = page.evaluate(SET_RANGE, [1, v])
                time.sleep(0.08)
            time.sleep(1.0)  # 等过 600ms 合并窗口

            # ---- 练习：点第一个选项 ----
            quiz = page.locator("section", has=page.locator("h2", has_text="预测与验证"))
            opt = quiz.locator("article").first.locator("button").first
            answered = opt.count() > 0
            if answered:
                opt.click()
                time.sleep(0.3)

            # ---- 读回事件 ----
            raw = page.evaluate("() => localStorage.getItem('" + KEY + "')")
            all_evs = json.loads(raw) if raw else []
            evs = all_evs[n_before:]
            names = [e["name"] for e in evs]
            params = [e for e in evs if e["name"] == "param_change"]
            quiz_evs = [e for e in evs if e["name"] == "quiz_answer"]

            print(f"\n=== {sid} ===")
            print(f"拖动控件：{changed}  区间 {meta['min']}~{meta['max']} step {meta['step']}")
            print(f"依次设值：{meta['vals']}")
            print(f"新增事件 {len(evs)} 条：{names}")
            print(f"param_change：{[ (e['data']['key'], e['data']['from'], e['data']['to'], e['data']['n']) for e in params ]}")
            print(f"quiz_answer：{[ (e['data']['picked'], e['data']['answer'], e['data']['correct']) for e in quiz_evs ]}")
            print("console errors：", errs if errs else "0")

            # ---- 断言 ----
            # scene_view 在页面加载时就写了，落在 n_before 之前，所以要查全量
            if not any(e["name"] == "scene_view" and e["sceneId"] == sid for e in all_evs):
                print("  ✗ 没有 scene_view（全量里也没有）")
                failed += 1
            if not params:
                print("  ✗ 拖动没有产生 param_change")
                failed += 1
            else:
                d = params[0]["data"]
                want = len(meta["vals"])
                if d["n"] < want:
                    print(f"  ✗ 合并后 n={d['n']}，期望 {want}（说明合并窗口没生效，或 onChange 没被触发）")
                    failed += 1
                if len(params) != 1:
                    print(f"  ✗ 一次连续拖动产生了 {len(params)} 条 param_change，应为 1 条")
                    failed += 1
                if d["from"] == d["to"]:
                    print(f"  ✗ from 与 to 相同（{d['from']}），没有真的改到值")
                    failed += 1
            if answered and not quiz_evs:
                print("  ✗ 作答没有产生 quiz_answer")
                failed += 1
            if errs:
                failed += 1

            # ---- 面板读数 ----
            page.locator("button", has_text="使用数据").first.click()
            time.sleep(0.4)
            tiles = page.evaluate(
                """() => [...document.querySelectorAll('section')]
                    .filter(s => s.textContent.includes('调参次数'))
                    .map(s => s.innerText)[0] || ''"""
            )
            hits = [ln for ln in tiles.split("\n") if ln.strip()]
            print("面板读数：", " | ".join(hits[:12]))
            page.screenshot(path=str(ROOT / "harness" / "shots" / f"telemetry-{sid}.png"))

            browser.close()
    finally:
        server.terminate()

    print(f"\n结果：{'通过' if failed == 0 else f'{failed} 项失败'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
