// 白色背景 → 透明 PNG 处理（在浏览器本地完成，保证下载得到透明底图）
// 原理：白色越纯越透明；墨迹转为纯黑并保留抗锯齿边缘过渡
(function (global) {
  'use strict';

  async function makeTransparentPng(imageUrl, { maxSize = 2560, threshold = 16, boost = 1.2 } = {}) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error('图片获取失败');
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      const darkness = 255 - lum; // 0 = 纯白，255 = 纯黑
      const alpha = Math.max(0, Math.min(255, Math.round((darkness - threshold) * boost)));
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = alpha;
    }
    ctx.putImageData(data, 0, 0);
    bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), 'image/png');
    });
  }

  global.MakeTransparentPng = makeTransparentPng;
})(window);
