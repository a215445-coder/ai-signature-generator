'use strict';

const path = require('node:path');
const { getProvider } = require('./providers');

// 从环境变量读取配置；overrides 供测试注入
function loadConfig(overrides = {}) {
  const providerName = overrides.provider || process.env.PROVIDER || 'siliconflow';
  const provider = getProvider(providerName);
  return {
    providerName,
    provider,
    apiKey: overrides.apiKey !== undefined ? overrides.apiKey : process.env.AI_API_KEY || '',
    baseUrl: (overrides.baseUrl || process.env.AI_BASE_URL || provider.defaultBaseUrl).replace(/\/+$/, ''),
    model: overrides.model || process.env.AI_MODEL || provider.defaultModel,
    imageSize: overrides.imageSize || process.env.AI_IMAGE_SIZE || provider.defaultImageSize,
    generatedDir: overrides.generatedDir || path.join(__dirname, '..', 'public', 'generated'),
    publicPath: overrides.publicPath || '/generated',
    rateLimit: overrides.rateLimit !== undefined ? overrides.rateLimit : true,
    upstreamTimeoutMs: overrides.upstreamTimeoutMs || 90000,
  };
}

module.exports = { loadConfig };
