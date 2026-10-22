/**
 * 浏览器端下载纯文本文件。
 *
 * 用 Blob + 临时 <a download>，不依赖网络、不依赖任何库；
 * `file://` 打开的页面同样可用（离线单文件导出要靠它）。
 */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分浏览器会让下载丢失，给一拍再说
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 用于文件名的时间戳：20261022-1330 */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
