'use strict';

// 生图服务商适配层：统一封装请求构造与响应解析
const PROVIDERS = {
  siliconflow: {
    label: '硅基流动 SiliconFlow',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen-Image',
    defaultImageSize: '1584x1056',
    // 一次请求最多可批量生成 4 张（batch_size）
    maxBatch: 4,
    buildBody({ model, prompt, negativePrompt, imageSize, count }) {
      return {
        model,
        prompt,
        negative_prompt: negativePrompt,
        image_size: imageSize,
        batch_size: count,
        num_inference_steps: 20,
        guidance_scale: 7.5,
      };
    },
    parseResult(json) {
      return {
        images: (json.images || []).map((img) => ({ url: img.url })),
        seed: json.seed ?? null,
      };
    },
  },
  openai: {
    label: 'OpenAI 兼容接口（OpenAI / 智谱等）',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-1',
    defaultImageSize: '1536x1024',
    // 兼容接口每次只生成一张，由上层并发调用补齐数量
    maxBatch: 1,
    buildBody({ model, prompt, imageSize }) {
      return {
        model,
        prompt,
        n: 1,
        size: imageSize,
        response_format: 'b64_json',
      };
    },
    parseResult(json) {
      const data = json.data || [];
      return {
        images: data.map((d) => ({ url: d.url || null, b64: d.b64_json || null })),
        seed: null,
      };
    },
  },
};

function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`未知服务商: ${name}（可选: ${Object.keys(PROVIDERS).join(', ')}）`);
  }
  return provider;
}

module.exports = { PROVIDERS, getProvider };
