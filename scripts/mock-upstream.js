'use strict';

// 本地模拟生图服务：用于开发联调与自动化测试，无需真实 API Key。
// 用法: node scripts/mock-upstream.js [端口]（默认 9191）
// 配合: AI_BASE_URL=http://127.0.0.1:9191 AI_API_KEY=test npm start

const http = require('node:http');
const zlib = require('node:zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// 生成一张 PNG（运行时构造，避免依赖外部文件）
// darkMark: 在白色背景上画一条深色斜线，模拟墨迹签名
function makeWhitePng(size = 128, darkMark = false) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc(size * (1 + size * 3), 255);
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      if (darkMark && Math.abs(x - y) < 6) {
        raw[off] = 20;
        raw[off + 1] = 20;
        raw[off + 2] = 20;
      }
      off += 3;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createMockUpstream({ mode = 'siliconflow', requests = [], silent = false } = {}) {
  const png = makeWhitePng(128, true); // 带墨迹斜线，便于测试透明抠图
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/img')) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch { /* 忽略 */ }
      requests.push(parsed);
      if (!silent) {
        console.log('[mock] 请求:', JSON.stringify({
          model: parsed.model,
          prompt: (parsed.prompt || '').slice(0, 80),
          batch_size: parsed.batch_size,
          n: parsed.n,
        }));
      }
      if (mode === 'fail') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'boom' } }));
        return;
      }
      if (mode === 'openai') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
        return;
      }
      const count = parsed.batch_size || 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        images: Array.from({ length: count }, (_, i) => ({
          url: `http://127.0.0.1:${server.address().port}/img/${i}`,
        })),
        seed: 42,
        timings: { inference: 1.2 },
      }));
    });
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 9191;
  createMockUpstream({ silent: false }).listen(port, () => {
    console.log(`[mock] 模拟生图服务已启动: http://127.0.0.1:${port}`);
    console.log('[mock] 启动主服务: AI_BASE_URL=http://127.0.0.1:' + port + ' AI_API_KEY=test PORT=3000 npm start');
  });
}

module.exports = { createMockUpstream, makeWhitePng };
