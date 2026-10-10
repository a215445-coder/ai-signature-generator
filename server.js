'use strict';

require('dotenv').config();
const { createApp } = require('./lib/app');

const port = Number(process.env.PORT) || 3000;
const app = createApp();
const { providerName, model, apiKey } = app.locals.config;

app.listen(port, () => {
  console.log('────────────────────────────────────────────');
  console.log('  ✒️  墨签 · AI 艺术签名生成器');
  console.log(`  地址: http://localhost:${port}`);
  console.log(`  服务商: ${providerName} · 模型: ${model}`);
  console.log(`  API Key: ${apiKey ? '已配置 ✓' : '未配置 ✗（在 .env 中填写 AI_API_KEY 后重启）'}`);
  console.log('────────────────────────────────────────────');
});
