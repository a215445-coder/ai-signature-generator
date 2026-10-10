(() => {
  'use strict';

  const STYLE_META = {
    flowing: { zh: '潇洒', en: 'Flowing' },
    business: { zh: '商务', en: 'Business' },
    cursive: { zh: '连笔', en: 'Connected' },
    artistic: { zh: '艺术', en: 'Artistic' },
    minimal: { zh: '极简', en: 'Minimal' },
  };

  const LOADING_PHRASES = ['正在构思笔意…', '正在挥毫落墨…', '正在精修细节…'];

  const ICONS = {
    regen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 19h14"/></svg>',
  };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    form: $('#gen-form'),
    nameInput: $('#name-input'),
    styleList: $('#style-list'),
    btnGenerate: $('#btn-generate'),
    btnLabel: $('#btn-generate .btn-label'),
    banner: $('#config-banner'),
    apiStatus: $('#api-status'),
    apiStatusText: $('#api-status-text'),
    results: $('#results'),
    resultsTitle: $('#results-title'),
    grid: $('#grid'),
    regenAll: $('#btn-regen-all'),
    lightbox: $('#lightbox'),
    lbImg: $('#lb-img'),
    lbTitle: $('#lb-title'),
    lbDownload: $('#lb-download'),
    lbRegen: $('#lb-regen'),
    lbPrev: $('#lb-prev'),
    lbNext: $('#lb-next'),
    lbClose: $('#lb-close'),
    toast: $('#toast'),
  };

  const state = {
    name: '',
    style: 'flowing',
    images: [], // { id, url }
    index: 0,
    busy: false,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ── 提示气泡 ─────────────────────────── */

  let toastTimer = null;
  function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 4200);
  }

  /* ── 请求封装 ─────────────────────────── */

  async function api(path, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150000);
    try {
      const res = await fetch(path, {
        method: payload ? 'POST' : 'GET',
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: ctrl.signal,
      });
      let data = {};
      try { data = await res.json(); } catch { /* 非 JSON 响应 */ }
      if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('请求超时，AI 服务可能较慢，请稍后重试');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── 服务状态检测 ─────────────────────── */

  async function initHealth() {
    try {
      const data = await api('/api/health');
      if (data.keyConfigured) {
        els.apiStatusText.textContent = 'API 就绪';
        els.apiStatus.classList.add('ready');
        els.banner.classList.add('hidden');
      } else {
        els.apiStatusText.textContent = 'API 未配置';
        els.apiStatus.classList.add('nokey');
        els.banner.classList.remove('hidden');
      }
    } catch {
      els.apiStatusText.textContent = '服务未连接';
      els.apiStatus.classList.add('offline');
    }
  }

  /* ── 风格选择 ─────────────────────────── */

  function selectStyle(key) {
    state.style = key;
    els.styleList.querySelectorAll('.style-pill').forEach((pill) => {
      const on = pill.dataset.key === key;
      pill.classList.toggle('selected', on);
      pill.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /* ── 生成 ─────────────────────────────── */

  let phraseTimer = null;
  function startLoadingUI() {
    els.btnGenerate.disabled = true;
    els.btnGenerate.classList.add('loading');
    els.btnLabel.textContent = LOADING_PHRASES[0];
    let i = 0;
    phraseTimer = setInterval(() => {
      i = (i + 1) % LOADING_PHRASES.length;
      els.btnLabel.textContent = LOADING_PHRASES[i];
    }, 2600);
  }

  function stopLoadingUI() {
    clearInterval(phraseTimer);
    els.btnGenerate.disabled = false;
    els.btnGenerate.classList.remove('loading');
    els.btnLabel.textContent = '开始生成';
  }

  async function generate(name, count, { scroll = true } = {}) {
    state.busy = true;
    state.name = name;
    startLoadingUI();
    try {
      const data = await api('/api/generate', { name, style: state.style, count });
      state.images = data.images;
      renderResults();
      els.results.classList.remove('hidden');
      if (scroll) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
      }
    } catch (err) {
      toast(err.message || '生成失败，请重试', true);
    } finally {
      stopLoadingUI();
      state.busy = false;
    }
  }

  /* ── 结果渲染 ─────────────────────────── */

  function renderResults() {
    els.resultsTitle.textContent = `为「${state.name}」创作的 ${state.images.length} 款签名`;
    els.grid.innerHTML = '';
    state.images.forEach((img, i) => els.grid.appendChild(buildCard(img, i)));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      els.grid.querySelectorAll('.card').forEach((card, i) => {
        card.style.setProperty('--i', i);
        card.classList.add('revealed');
      });
    }));
  }

  function buildCard(img, i) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.index = String(i);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img loading';
    const im = document.createElement('img');
    im.alt = `签名方案 ${i + 1} —— ${state.name}（${STYLE_META[state.style].zh}风格）`;
    im.loading = 'lazy';
    im.src = img.url;
    im.addEventListener('load', () => { imgWrap.classList.remove('loading'); im.classList.add('loaded'); });
    im.addEventListener('error', () => imgWrap.classList.add('failed'));
    imgWrap.appendChild(im);

    const foot = document.createElement('div');
    foot.className = 'card-foot';
    const tag = document.createElement('span');
    tag.className = 'card-tag';
    tag.textContent = `方案 ${String(i + 1).padStart(2, '0')}`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'icon-btn';
    regenBtn.title = '重新生成这一款';
    regenBtn.setAttribute('aria-label', `重新生成方案 ${i + 1}`);
    regenBtn.innerHTML = ICONS.regen;
    regenBtn.addEventListener('click', () => regenerateOne(i, regenBtn));

    const dlBtn = document.createElement('button');
    dlBtn.className = 'icon-btn';
    dlBtn.title = '下载高清透明 PNG';
    dlBtn.setAttribute('aria-label', `下载方案 ${i + 1} 的透明 PNG`);
    dlBtn.innerHTML = ICONS.download;
    dlBtn.addEventListener('click', () => downloadCard(i, dlBtn));

    actions.append(regenBtn, dlBtn);
    foot.append(tag, actions);
    card.append(imgWrap, foot);
    card.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      openLightbox(i);
    });
    return card;
  }

  /* ── 重新生成 ─────────────────────────── */

  async function regenerateOne(index, btn) {
    if (state.busy) { toast('请稍候，当前有生成任务进行中'); return; }
    state.busy = true;
    if (btn) btn.classList.add('spin');
    try {
      const data = await api('/api/generate', { name: state.name, style: state.style, count: 1 });
      const item = data.images[0];
      state.images[index] = item;
      const card = els.grid.querySelector(`.card[data-index="${index}"]`);
      const wrap = card.querySelector('.card-img');
      const im = card.querySelector('img');
      wrap.classList.remove('failed');
      wrap.classList.add('loading');
      im.classList.remove('loaded');
      im.src = item.url;
      if (state.index === index) updateLightboxImage();
      toast('已生成新的方案');
    } catch (err) {
      toast(err.message || '重新生成失败，请重试', true);
    } finally {
      if (btn) btn.classList.remove('spin');
      state.busy = false;
    }
  }

  /* ── 透明 PNG 下载 ────────────────────── */

  function safeName(n) {
    return n.replace(/[\\/:*?"<>|\s]+/g, '');
  }

  function filenameFor(i) {
    const zh = STYLE_META[state.style].zh;
    return `签名_${safeName(state.name)}_${zh}_${String(i + 1).padStart(2, '0')}.png`;
  }

  async function downloadCard(index, btn) {
    const img = state.images[index];
    if (!img) return;
    if (btn) { btn.disabled = true; btn.classList.add('spin'); }
    try {
      const blob = await MakeTransparentPng(img.url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filenameFor(index);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('透明 PNG 已开始下载');
    } catch (err) {
      toast('下载失败，请重试', true);
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('spin'); }
    }
  }

  /* ── 灯箱预览 ─────────────────────────── */

  function openLightbox(i) {
    state.index = i;
    updateLightboxImage();
    els.lightbox.hidden = false;
    requestAnimationFrame(() => els.lightbox.classList.add('open'));
    document.body.classList.add('no-scroll');
  }

  function closeLightbox() {
    els.lightbox.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => { els.lightbox.hidden = true; }, 320);
  }

  function navigateLightbox(dir) {
    const len = state.images.length;
    if (len < 2) return;
    state.index = (state.index + dir + len) % len;
    updateLightboxImage();
  }

  function updateLightboxImage() {
    const img = state.images[state.index];
    els.lbImg.src = img.url;
    els.lbImg.alt = `签名方案 ${state.index + 1}`;
    els.lbTitle.textContent =
      `方案 ${String(state.index + 1).padStart(2, '0')} / ${String(state.images.length).padStart(2, '0')} —— ${state.name} · ${STYLE_META[state.style].zh}`;
  }

  /* ── 事件绑定 ─────────────────────────── */

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.busy) return;
    const name = els.nameInput.value.trim();
    if (!name) { toast('请先输入姓名'); els.nameInput.focus(); return; }
    generate(name, 4);
  });

  els.styleList.addEventListener('click', (e) => {
    const pill = e.target.closest('.style-pill');
    if (pill) selectStyle(pill.dataset.key);
  });

  document.querySelectorAll('.suggest').forEach((chip) => {
    chip.addEventListener('click', () => {
      els.nameInput.value = chip.dataset.name;
      els.nameInput.focus();
    });
  });

  els.regenAll.addEventListener('click', async () => {
    if (state.busy || !state.name) return;
    els.regenAll.disabled = true;
    try {
      await generate(state.name, 4, { scroll: false });
    } finally {
      els.regenAll.disabled = false;
    }
  });

  els.lbClose.addEventListener('click', closeLightbox);
  els.lbPrev.addEventListener('click', () => navigateLightbox(-1));
  els.lbNext.addEventListener('click', () => navigateLightbox(1));
  els.lbDownload.addEventListener('click', () => downloadCard(state.index, els.lbDownload));
  els.lbRegen.addEventListener('click', () => {
    if (state.busy) { toast('请稍候，当前有生成任务进行中'); return; }
    els.lbRegen.disabled = true;
    regenerateOne(state.index).finally(() => { els.lbRegen.disabled = false; });
  });
  els.lightbox.addEventListener('click', (e) => {
    if (e.target === els.lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (els.lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });

  initHealth();
})();
