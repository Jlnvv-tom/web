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
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> next build"
env -u NODE_OPTIONS \
    -u CODEBUDDY_BROKERED_FS_HOOK_ENABLED \
    -u CODEBUDDY_SAFE_DELETE_BROKER_DELETE \
    node ./node_modules/next/dist/bin/next build
