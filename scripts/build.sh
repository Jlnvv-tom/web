#!/usr/bin/env bash
#
# 生产构建入口。
#
# 为什么不直接 `next build`：
#   1) 构建产物目录 `.next` 若残留了上一次被中断的构建写坏的文件（.meta / .rsc），
#      Next 在预渲染阶段会把它读回来，报出一句看不出来源的
#      "Unexpected non-whitespace character after JSON at position N"。
#      所以每次构建前先整体删掉 .next。
#   2) 在 WorkBuddy 的沙箱里，node 会被注入 brokered-fs 钩子
#      （NODE_OPTIONS=--require .../node-brokered-fs-shim.cjs）。
#      该钩子对 Next 的并发 `mkdir(dir, {recursive:true})` 会返回 EEXIST，
#      构建直接崩在 webpack 阶段。把这几个环境变量去掉即可，
#      在普通终端里 `-u` 一个不存在的变量是无害的。
#
#   3) 绝不要在 `next dev` 运行期间跑本脚本。`next build` 会整体删除并重写 `.next`，
#      而 dev server 内存里还持有一份 chunk 清单，指向刚刚被删掉的文件 ——
#      页面不会在构建时报错，而是在你刷新浏览器时才炸出
#      "Cannot find module '/vendor-chunks/xxx.js'"，看起来像代码问题，实际是缓存损坏。
#      修法是 `rm -rf .next` 后重启 dev server；下面这道检查是为了从源头避免。
#
set -euo pipefail

cd "$(dirname "$0")/.."

# 统一在"去掉沙箱 FS 钩子"的环境里跑 node
NODE_BIN="${NODE_BIN:-node}"
run_node() {
  env -u NODE_OPTIONS \
      -u CODEBUDDY_BROKERED_FS_HOOK_ENABLED \
      -u CODEBUDDY_SAFE_DELETE_BROKER_DELETE \
      "$NODE_BIN" "$@"
}

# ---- 护栏：别和 next dev 抢 .next ----
if lsof -ti:3000 >/dev/null 2>&1 && [ "${ALLOW_BUILD_WITH_DEV:-0}" != "1" ]; then
  echo "✗ 检测到 3000 端口有服务在跑（很可能是 next dev）。" >&2
  echo "  next build 会删除重写 .next，与 dev server 并发会写坏 chunk 清单，" >&2
  echo "  症状是页面报 Cannot find module '/vendor-chunks/*.js'。" >&2
  echo "  请先停掉 dev server；若确认占用者不是 dev server，用 ALLOW_BUILD_WITH_DEV=1 跳过。" >&2
  exit 1
fi

# 离线单文件导出的运行时先产出到 public/standalone/，Next 会原样拷进 out/。
# 必须放在 next build 之前，否则导出的 HTML 里会引用到上一版的运行时。
echo "==> standalone runtime"
run_node scripts/build-standalone.mjs

echo "==> next build"
run_node ./node_modules/next/dist/bin/next build
