'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../lib/app');
const { createMockUpstream } = require('../scripts/mock-upstream');

let upstream;
let upstreamBase;
let tmpDir;
const requests = [];

before(async () => {
  upstream = createMockUpstream({ requests, silent: true });
  await new Promise((r) => upstream.listen(0, r));
  upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sig-test-'));
});

after(() => new Promise((r) => upstream.close(r)));

function startApp(overrides = {}) {
  const app = createApp({
    apiKey: 'test-key',
    provider: 'siliconflow',
    model: 'Qwen/Qwen-Image',
    baseUrl: upstreamBase,
    generatedDir: tmpDir,
    rateLimit: false,
    ...overrides,
  });
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function post(base, pathname, body) {
  const res = await fetch(base + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function fileExistsFor(url) {
  return fs.existsSync(path.join(tmpDir, url.split('/').pop()));
}

test('健康检查：返回服务状态与模型信息', async () => {
  const { server, base } = await startApp();
  try {
    const res = await fetch(base + '/api/health');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.keyConfigured, true);
    assert.strictEqual(json.model, 'Qwen/Qwen-Image');
    assert.deepStrictEqual(json.styles, ['flowing', 'business', 'cursive', 'artistic', 'minimal']);
  } finally {
    server.close();
  }
});

test('生成 4 款签名（中文姓名）：批量请求、提示词精确包含姓名、图片落盘', async () => {
  requests.length = 0;
  const { server, base } = await startApp();
  try {
    const { status, json } = await post(base, '/api/generate', { name: '张伟', style: 'flowing' });
    assert.strictEqual(status, 200, JSON.stringify(json));
    assert.strictEqual(json.images.length, 4);
    json.images.forEach((img) => {
      assert.match(img.url, /^\/generated\/sig-.+\.png$/);
      assert.ok(fileExistsFor(img.url), '生成文件应已落盘');
    });

    assert.strictEqual(requests.length, 1, '应使用 batch_size 一次批量生成');
    const req = requests[0];
    assert.strictEqual(req.model, 'Qwen/Qwen-Image');
    assert.strictEqual(req.batch_size, 4);
    assert.strictEqual(req.image_size, '1584x1056');
    assert.ok(req.prompt.includes('张伟'), '提示词必须包含准确姓名');
    assert.ok(req.prompt.includes('潇洒'), '提示词必须包含风格描述');
    assert.ok(req.negative_prompt.length > 0);
    assert.match(req.negative_prompt, /错字/);
  } finally {
    server.close();
  }
});

test('英文姓名：提示词精确包含英文姓名与风格', async () => {
  requests.length = 0;
  const { server, base } = await startApp();
  try {
    const { status } = await post(base, '/api/generate', { name: 'John Smith', style: 'business' });
    assert.strictEqual(status, 200);
    assert.strictEqual(requests.length, 1);
    const req = requests[0];
    assert.ok(req.prompt.includes('"John Smith"'), '提示词必须包含准确英文姓名');
    assert.ok(req.prompt.includes('business'));
  } finally {
    server.close();
  }
});

test('重新生成单张：count=1 时只请求一张', async () => {
  requests.length = 0;
  const { server, base } = await startApp();
  try {
    const { status, json } = await post(base, '/api/generate', { name: '张伟', style: 'artistic', count: 1 });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.images.length, 1);
    assert.ok(fileExistsFor(json.images[0].url));
    assert.strictEqual(requests[0].batch_size, 1);
  } finally {
    server.close();
  }
});

test('参数校验：缺少姓名 / 非法风格 / 非法字符 → 400', async () => {
  const { server, base } = await startApp();
  try {
    assert.strictEqual((await post(base, '/api/generate', { style: 'flowing' })).status, 400);
    assert.strictEqual((await post(base, '/api/generate', { name: '   ' })).status, 400);
    assert.strictEqual((await post(base, '/api/generate', { name: '张伟', style: 'nope' })).status, 400);
    assert.strictEqual((await post(base, '/api/generate', { name: 'x'.repeat(41), style: 'flowing' })).status, 400);
    assert.strictEqual((await post(base, '/api/generate', { name: 'a\nb', style: 'flowing' })).status, 400);
  } finally {
    server.close();
  }
});

test('未配置 API Key → 503 并给出配置指引', async () => {
  const { server, base } = await startApp({ apiKey: '' });
  try {
    const { status, json } = await post(base, '/api/generate', { name: '张伟', style: 'flowing' });
    assert.strictEqual(status, 503);
    assert.match(json.error, /AI_API_KEY/);
  } finally {
    server.close();
  }
});

test('OpenAI 兼容模式：并发请求、解析 b64_json、图片落盘', async () => {
  const oaiRequests = [];
  const oaiUpstream = createMockUpstream({ mode: 'openai', requests: oaiRequests, silent: true });
  await new Promise((r) => oaiUpstream.listen(0, r));
  const oaiBase = `http://127.0.0.1:${oaiUpstream.address().port}`;
  const { server, base } = await startApp({
    provider: 'openai',
    model: 'gpt-image-1',
    imageSize: '1536x1024',
    baseUrl: oaiBase,
  });
  try {
    const { status, json } = await post(base, '/api/generate', { name: 'Alice', style: 'minimal' });
    assert.strictEqual(status, 200, JSON.stringify(json));
    assert.strictEqual(json.images.length, 4);
    json.images.forEach((img) => assert.ok(fileExistsFor(img.url)));
    assert.strictEqual(oaiRequests.length, 4, '兼容接口应发起 4 次单张请求');
    oaiRequests.forEach((req) => {
      assert.strictEqual(req.n, 1);
      assert.strictEqual(req.response_format, 'b64_json');
      assert.strictEqual(req.size, '1536x1024');
    });
  } finally {
    server.close();
    await new Promise((r) => oaiUpstream.close(r));
  }
});

test('上游错误：映射为 502 并返回可读信息', async () => {
  const failUpstream = createMockUpstream({ mode: 'fail', requests, silent: true });
  await new Promise((r) => failUpstream.listen(0, r));
  const failBase = `http://127.0.0.1:${failUpstream.address().port}`;
  const { server, base } = await startApp({ baseUrl: failBase });
  try {
    const { status, json } = await post(base, '/api/generate', { name: '张伟', style: 'flowing' });
    assert.strictEqual(status, 502);
    assert.match(json.error, /AI 服务调用失败/);
  } finally {
    server.close();
    await new Promise((r) => failUpstream.close(r));
  }
});

test('限流：超过阈值返回 429', async () => {
  const { server, base } = await startApp({ rateLimit: { windowMs: 60000, max: 2 } });
  try {
    assert.strictEqual((await post(base, '/api/generate', { name: '张伟', style: 'flowing', count: 1 })).status, 200);
    assert.strictEqual((await post(base, '/api/generate', { name: '张伟', style: 'flowing', count: 1 })).status, 200);
    const third = await post(base, '/api/generate', { name: '张伟', style: 'flowing', count: 1 });
    assert.strictEqual(third.status, 429);
  } finally {
    server.close();
  }
});

test('静态页面：首页可访问且包含品牌标识', async () => {
  const { server, base } = await startApp();
  try {
    const res = await fetch(base + '/');
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('墨签'), '首页应包含品牌名');
    assert.ok(html.includes('/css/style.css') && html.includes('/js/app.js'), '应引用样式与脚本');
  } finally {
    server.close();
  }
});
