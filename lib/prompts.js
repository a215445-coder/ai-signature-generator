'use strict';

// 五种签名风格的定义与生成提示词（中英文分别优化）
const STYLES = {
  flowing: {
    zh: '潇洒',
    en: 'Flowing',
    descZh: '笔画潇洒奔放，行草笔意，收放自如，气势流畅，带有飞白效果',
    descEn: 'bold flowing cursive strokes with a free, unrestrained energy and subtle dry-brush texture',
  },
  business: {
    zh: '商务',
    en: 'Business',
    descZh: '成熟稳重的商务签名，流畅连笔，笔触干练利落，适合正式场合',
    descEn: 'a mature, confident business signature with smooth connected strokes and crisp, decisive lines',
  },
  cursive: {
    zh: '连笔',
    en: 'Connected',
    descZh: '一笔连写，线条连贯优雅，行云流水，字形圆润流畅',
    descEn: 'an elegant single-stroke script where all letters connect seamlessly in one smooth continuous line',
  },
  artistic: {
    zh: '艺术',
    en: 'Artistic',
    descZh: '艺术化变形签名，装饰性笔画，富有韵律与张力，具有独特设计感',
    descEn: 'an artistic, stylized signature with decorative flourishes, rhythm and expressive tension',
  },
  minimal: {
    zh: '极简',
    en: 'Minimal',
    descZh: '极简风格，纤细简洁的线条，克制而优雅，留白充足',
    descEn: 'a minimalist signature with thin, restrained lines, elegant simplicity and generous white space',
  },
};

const STYLE_KEYS = Object.keys(STYLES);

function isChineseName(name) {
  return /[一-鿿]/.test(name);
}

// 根据姓名与风格构造生图提示词；重点约束姓名拼写准确
function buildPrompt(name, styleKey) {
  const style = STYLES[styleKey];
  if (isChineseName(name)) {
    return {
      prompt:
        `黑墨手写的艺术签名「${name}」，纯白色背景，${style.descZh}。` +
        `严格完整地写出「${name}」这几个字，笔画准确，不能写错字、不能漏字、不能多字，` +
        `画面中除签名本身外不出现任何其他文字、字母、图形或装饰，签名位于画面中央，横向构图，高清。`,
      negative: '错字, 别字, 缺字, 多字, 多余文字, 字母, 水印, 背景图案, 模糊, 变形',
    };
  }
  return {
    prompt:
      `A hand-written artistic signature that reads exactly "${name}", in black ink on a plain solid white background, ${style.descEn}. ` +
      `Spell the name exactly as "${name}" — every letter correct, no extra or missing letters. ` +
      `Nothing else in the image: no other text, no watermark, no decoration. ` +
      `The signature is centered, horizontal composition, high resolution.`,
    negative: 'misspelled text, wrong letters, extra text, watermark, background pattern, blurry, distorted letters',
  };
}

module.exports = { STYLES, STYLE_KEYS, buildPrompt, isChineseName };
