/**
 * 构建期诊断：捕获 JSON.parse 抛出的原始输入。
 *
 * 用法：NODE_OPTIONS="--require ./scripts/json-trace.cjs" next build
 *
 * 为什么需要它：Next 在预渲染阶段会读写 .next/server 下的若干 .meta / .rsc 文件，
 * 一旦某个文件被写坏（截断或两段内容拼在一起），报错只会是一句
 * "Unexpected non-whitespace character after JSON at position N"，
 * 看不到是哪份文件、也看不到里面到底是什么。这个探针把出错位置附近的原文打出来。
 */
const orig = JSON.parse;

JSON.parse = function (text, ...rest) {
  try {
    return orig.call(JSON, text, ...rest);
  } catch (err) {
    if (typeof text === 'string') {
      const m = /position (\d+)/.exec(err.message);
      const pos = m ? Number(m[1]) : 0;
      console.error('\n===== JSON.parse 失败诊断 =====');
      console.error('message:', err.message);
      console.error('length :', text.length);
      console.error('出错位置前后各 260 字符：');
      console.error('--- 8< ---');
      console.error(text.slice(Math.max(0, pos - 260), pos));
      console.error('>>> 出错分界线（位置 ' + pos + '） <<<');
      console.error(text.slice(pos, pos + 260));
      console.error('--- >8 ---');
      console.error('stack:\n' + (err.stack || ''));
      console.error('================================\n');
    }
    throw err;
  }
};
