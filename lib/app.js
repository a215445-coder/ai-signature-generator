'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const { loadConfig } = require('./config');
const { STYLES, buildPrompt } = require('./prompts');

const MAX_NAME_LENGTH = 40;
const GENERATED_TTL_MS = 2 * 60 * 60 * 1000; // 生成的图片在服务器保留 2 小时
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err.name === 'AbortError') throw new Error('上游接口响应超时，请稍后重试');
      throw new Error(`网络请求失败：${err.message}`);
    })
    .finally(() => clearTimeout(timer));
}

// 调用上游 images/generations 接口，统一错误映射
async function callUpstream(config, body) {
  const res = await fetchWithTimeout(
    `${config.baseUrl}/images/generations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    config.upstreamTimeoutMs
  );
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || j?.message || JSON.stringify(j).slice(0, 160);
    } catch { /* 忽略响应体解析失败 */ }
    const byStatus = {
      401: 'API Key 无效或未授权',
      402: '账户余额不足，请充值',
      404: '模型不存在，请检查 AI_MODEL 配置',
      429: '请求过于频繁或额度不足',
      503: 'AI 服务繁忙，请稍后重试',
      504: 'AI 服务超时，请稍后重试',
    };
    const reason = byStatus[res.status] || `上游接口返回 ${res.status}`;
    throw new Error(detail ? `${reason}（${detail}）` : reason);
  }
  return res.json();
}

// 生成 count 张图片：支持批量的服务商单次请求，其余并发补齐
async function generateImages(config, { prompt, negativePrompt, count }) {
  const provider = config.provider;
  const perCall = provider.maxBatch >= count ? count : 1;
  const callCount = provider.maxBatch >= count ? 1 : count;
  const calls = [];
  for (let i = 0; i < callCount; i++) {
    calls.push(
      callUpstream(config, provider.buildBody({
        model: config.model,
        prompt,
        negativePrompt,
        imageSize: config.imageSize,
        count: perCall,
      })).then(provider.parseResult)
    );
  }
  const results = await Promise.all(calls);
  return results
    .flatMap((r) => r.images)
    .filter((img) => img.url || img.b64)
    .slice(0, count);
}

// 将上游图片（URL 或 base64）落盘保存
async function downloadToFile(source, destPath, timeoutMs) {
  if (source.b64) {
    await fs.writeFile(destPath, Buffer.from(source.b64, 'base64'));
    return;
  }
  const res = await fetchWithTimeout(source.url, { headers: { Accept: 'image/*' } }, timeoutMs);
  if (!res.ok) throw new Error(`下载生成图片失败（HTTP ${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('下载到的图片数据异常（文件过小）');
  await fs.writeFile(destPath, buf);
}

// 清理过期图片，避免磁盘堆积
async function cleanupGeneratedDir(dir, maxAgeMs = GENERATED_TTL_MS) {
  let files;
  try { files = await fs.readdir(dir); } catch { return; }
  const now = Date.now();
  await Promise.all(files.map(async (file) => {
    const p = path.join(dir, file);
    try {
      const st = await fs.stat(p);
      if (now - st.mtimeMs > maxAgeMs) await fs.unlink(p);
    } catch { /* 忽略单文件错误 */ }
  }));
}

// 简单的内存限流（按 IP 滑动窗口），控制成本
function createRateLimiter({ windowMs = 60000, max = 12 } = {}) {
  const hits = new Map();
  return function check(ip) {
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return entry.count <= max;
  };
}

function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const app = express();
  app.locals.config = config;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const limiter = config.rateLimit
    ? createRateLimiter(typeof config.rateLimit === 'object' ? config.rateLimit : {})
    : null;

  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      ok: true,
      keyConfigured: Boolean(config.apiKey),
      provider: config.providerName,
      model: config.model,
      styles: Object.keys(STYLES),
    });
  });

  app.post('/api/generate', async (req, res) => {
    try {
      const body = req.body || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const style = body.style;
      const count = body.count === 1 ? 1 : 4;

      if (!name) return res.status(400).json({ error: '请填写姓名' });
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: `姓名过长（最多 ${MAX_NAME_LENGTH} 个字符）` });
      }
      if (CONTROL_CHARS.test(name)) return res.status(400).json({ error: '姓名包含非法字符' });
      if (!STYLES[style]) return res.status(400).json({ error: '无效的签名风格' });
      if (!config.apiKey) {
        return res.status(503).json({ error: '服务端尚未配置 AI_API_KEY：请在项目根目录的 .env 文件中填写后重启服务' });
      }
      if (limiter && !limiter(req.ip)) {
        return res.status(429).json({ error: '生成太频繁啦，请稍等一分钟再试' });
      }

      const { prompt, negative } = buildPrompt(name, style);
      console.log(`[generate] name="${name}" style=${style} count=${count} model=${config.model}`);

      let items;
      try {
        items = await generateImages(config, { prompt, negativePrompt: negative, count });
      } catch (err) {
        console.error('[generate] AI 服务调用失败:', err.message);
        return res.status(502).json({ error: `AI 服务调用失败：${err.message}` });
      }
      if (items.length === 0) {
        return res.status(502).json({ error: 'AI 服务未返回图片，请稍后重试' });
      }

      await fs.mkdir(config.generatedDir, { recursive: true });
      cleanupGeneratedDir(config.generatedDir).catch(() => {});

      const images = [];
      for (const item of items) {
        const file = `sig-${makeId()}.png`;
        try {
          await downloadToFile(item, path.join(config.generatedDir, file), config.upstreamTimeoutMs);
        } catch (err) {
          console.error('[generate] 图片下载失败:', err.message);
          continue; // 单张失败不阻断其余
        }
        images.push({ id: file.replace(/\.png$/, ''), url: `${config.publicPath}/${file}` });
      }
      if (images.length === 0) {
        return res.status(502).json({ error: '生成图片下载失败，请稍后重试' });
      }

      res.json({ ok: true, images, model: config.model, provider: config.providerName });
    } catch (err) {
      console.error('[generate] 内部错误:', err);
      res.status(500).json({ error: '服务器内部错误，请稍后重试' });
    }
  });

  return app;
}

module.exports = { createApp };
