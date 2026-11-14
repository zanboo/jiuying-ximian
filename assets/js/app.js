/* 玖影·喜面 汇报播放引擎
 * - 逐章模式：每章讲完停住，点「下一步」开始下一章
 * - 自动模式：全程不间断
 * - 每段讲稿 = 一条配音 + 一个画面步骤（data-step）
 * - 无配音文件时按字数估时，保证流程可用
 * URL 参数：?print 静态打印版 · ?page=p10 直接查看某页（全部步骤展开）
 */
(function () {
  'use strict';
  gsap.registerPlugin(SplitText);
  const N = window.NARRATION, SETS = window.AUDIO || {};
  // 旁白：f 女声 · m 男声 · off 关闭（画面按原节奏自动播放，由现场人员讲解）
  let voice = 'm';   // 默认男声
  try { voice = new URLSearchParams(location.search).get('voice') || localStorage.getItem('jy-voice2') || 'm'; } catch (e) {}
  if (!['f', 'm', 'off'].includes(voice) || (voice !== 'off' && !SETS[voice])) voice = SETS.m ? 'm' : SETS.f ? 'f' : 'off';
  const setKey = () => voice === 'off' ? (SETS.m ? 'm' : 'f') : voice;
  const setOf = () => SETS[setKey()] || {};
  const Q = new URLSearchParams(location.search);
  // 苹果手机上网页不能改音量（volume 只读），用它来识别
  const VOL_OK = (() => { if (Q.has('wa')) return false; try { const a = new Audio(); a.volume = .5; return a.volume === .5; } catch (e) { return true; } })();
  const PRINT = Q.has('print');
  const PEEK = Q.get('page');
  const stage = document.getElementById('stage');
  const ABORT = { abort: true };

  // ---------- 展平章节 ----------
  const flat = [];
  N.chapters.forEach((ch, ci) => ch.pages.forEach(pg => {
    const el = document.getElementById(pg.id);
    if (el) flat.push({ ch, ci, id: pg.id, segs: pg.segs, el });
  }));
  const total = flat.length;
  const chStart = ci => flat.findIndex(f => f.ci === ci);

  // 动态 logo（静态成品先放好，播放时再做入场动画）
  document.querySelectorAll('[data-logo]').forEach(el => JYLogo.mount(el, { tag: el.dataset.logo === 'tag' }));
  const logoOf = root => root.querySelector('svg.jy-logo');

  // 页眉页码
  flat.forEach((f, i) => {
    const h = document.createElement('div');
    h.className = 'pg-head';
    h.innerHTML = `<span class="brand">玖影·喜面</span><span class="sep"></span><span>${f.ch.no ? f.ch.no + ' · ' : ''}${f.ch.title}</span>`;
    f.el.appendChild(h);
    const n = document.createElement('div');
    n.className = 'pg-num';
    n.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> / ${total}`;
    f.el.appendChild(n);
  });

  // ---------- 缩放 ----------
  let scale = 1;
  function fit() {
    if (PRINT) return;
    // 自适应：屏幕比 A4 宽时（16:9 等），画布加宽到铺满，内容居中，满幅画面延伸到两侧
    const ar = innerWidth / innerHeight;
    const SW = Q.has('a4') ? 1123 : Math.round(Math.min(Math.max(794 * ar, 1123), 1600));
    scale = Math.min(innerWidth / SW, innerHeight / 794);
    stage.style.width = SW + 'px';
    stage.style.setProperty('--pad', (SW - 1123) / 2 + 'px');
    stage.style.transform = `scale(${scale})`;
    window.S3D && S3D.setScale(scale, SW);
    // 画布外的界面（开场页、控制条、下一章提示）跟着屏幕大小放大，大屏上不至于太小
    const z = Math.max(1, scale * .92);
    const zs = { start: Math.min(z, innerHeight / 640, innerWidth / 720), dl: Math.min(z, innerHeight / 560, innerWidth / 520), ui: Math.min(z, Math.max(.55, innerWidth / 1180)), hint: Math.min(z, Math.max(.7, innerWidth / 1180)) };
    Object.keys(zs).forEach(id => { const e = document.getElementById(id); if (e) e.style.zoom = zs[id]; });
  }
  addEventListener('resize', fit);

  // ---------- 步骤动画 ----------
  const steps = el => [...el.querySelectorAll('[data-step]')];
  function splitOf(el) { return el._split || (el._split = new SplitText(el, { type: 'chars' })); }

  function hideSteps(page) {
    steps(page).forEach(e => {
      gsap.killTweensOf(e);
      gsap.set(e, { autoAlpha: 0 });
      if (e.dataset.anim === 'chars') gsap.set(splitOf(e).chars, { autoAlpha: 0 });
    });
  }
  function showAll(page) {
    steps(page).forEach(e => {
      gsap.set(e, { autoAlpha: 1, clearProps: 'transform,clipPath,filter' });
      if (e.dataset.anim === 'chars') gsap.set(splitOf(e).chars, { autoAlpha: 1, clearProps: 'transform' });
      if (e.dataset.anim === 'stagger') gsap.set(e.children, { autoAlpha: 1, clearProps: 'transform' });
      if (e.dataset.anim === 'draw') { e.style.strokeDasharray = ''; e.style.strokeDashoffset = ''; }
    });
  }
  function countUp(root, d) {
    const els = root.matches && root.matches('[data-count]') ? [root] : [...root.querySelectorAll('[data-count]')];
    els.forEach(e => {
      const to = parseFloat(e.dataset.count), dec = +(e.dataset.dec || 0), sep = e.dataset.sep;
      const o = { v: 0 };
      gsap.to(o, { v: to, duration: 1.6, delay: d, ease: 'power2.out', onUpdate() {
        let s = o.v.toFixed(dec);
        if (sep) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        e.textContent = s;
      } });
    });
  }
  function reveal(page, n) {
    curStep = n;
    steps(page).filter(e => +e.dataset.step === n).forEach(e => {
      const d = +(e.dataset.delay || 0), a = e.dataset.anim || 'up';
      const E = 'power3.out';
      switch (a) {
        case 'fade': gsap.fromTo(e, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1, delay: d }); break;
        case 'fadein': gsap.fromTo(e, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.8, delay: d, ease: 'sine.inOut' }); break;
        case 'left': gsap.fromTo(e, { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 1, delay: d, ease: E }); break;
        case 'right': gsap.fromTo(e, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 1, delay: d, ease: E }); break;
        case 'zoom': gsap.fromTo(e, { autoAlpha: 0, scale: .7 }, { autoAlpha: 1, scale: 1, duration: 1, delay: d, ease: 'back.out(1.6)' }); break;
        case 'zoomin': gsap.fromTo(e, { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: 1.6, delay: d, ease: E }); break;
        case 'mapin': gsap.fromTo(e, { autoAlpha: 0, scale: 1.12 }, { autoAlpha: 1, scale: 1, duration: 2, delay: d, ease: 'power2.out' }); break;
        case 'reveal': gsap.fromTo(e, { autoAlpha: 1, clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.4, delay: d, ease: 'power3.inOut' }); break;
        case 'grow': gsap.fromTo(e, { autoAlpha: 1, scaleX: 0, transformOrigin: '0 50%' }, { scaleX: 1, duration: 1.2, delay: d, ease: 'power2.inOut' }); break;
        case 'chars': {
          gsap.set(e, { autoAlpha: 1 });
          gsap.fromTo(splitOf(e).chars, { autoAlpha: 0, yPercent: 60, rotateX: -50 },
            { autoAlpha: 1, yPercent: 0, rotateX: 0, duration: .8, stagger: .045, delay: d, ease: E });
          break;
        }
        case 'stagger':
          gsap.set(e, { autoAlpha: 1 });
          gsap.fromTo(e.children, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .9, stagger: .16, delay: d, ease: E });
          break;
        case 'draw': {
          const L = e.getTotalLength();
          gsap.set(e, { autoAlpha: 1, strokeDasharray: L, strokeDashoffset: L });
          gsap.to(e, { strokeDashoffset: 0, duration: 3, delay: d, ease: 'power1.inOut' });
          break;
        }
        case 'lighton': {
          gsap.set(e, { autoAlpha: 0 });
          gsap.timeline({ delay: d })
            .to(e, { autoAlpha: 1, duration: .08 }).to(e, { autoAlpha: .2, duration: .08 })
            .to(e, { autoAlpha: 1, duration: .1 }).to(e, { autoAlpha: .45, duration: .12 })
            .to(e, { autoAlpha: 1, duration: .6, textShadow: '0 0 28px rgba(255,170,90,.85), 0 0 80px rgba(232,98,44,.6)' });
          break;
        }
        default: gsap.fromTo(e, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1, delay: d, ease: E });
      }
      countUp(e, d + .2);
    });
    const hk = HOOKS[page.id];
    hk && hk.step && hk.step(n, page);
    if (started && !PEEK) Sound.step(page.id, n);
  }

  // ---------- 页面专属钩子 ----------
  const kb = page => page.querySelectorAll('.kb img').forEach(img =>
    gsap.fromTo(img, { scale: 1.02 }, { scale: 1.1, duration: 24, ease: 'none' }));
  const HOOKS = {
    p01: {
      enter(p) { gsap.set(p.querySelectorAll('.curtain'), { xPercent: 0 }); gsap.set(p.querySelector('.bg img'), { scale: 1.15 }); },
      step(n, p) {
        if (n === 2) JYLogo.play(logoOf(p), { delay: .15 });
        if (n === 1) {
          gsap.to(p.querySelector('.curtain.l'), { xPercent: -101, duration: 2.6, ease: 'power2.inOut' });
          gsap.to(p.querySelector('.curtain.r'), { xPercent: 101, duration: 2.6, ease: 'power2.inOut' });
          gsap.to(p.querySelector('.bg img'), { scale: 1.02, duration: 6, ease: 'power2.out' });
        }
      }
    },
    p02: {
      enter(p) { gsap.set(p.querySelector('.door img'), { filter: 'grayscale(1) contrast(1.05) brightness(.9)' }); },
      step(n, p) { if (n === 3) gsap.to(p.querySelector('.door img'), { filter: 'grayscale(0) contrast(1.05) brightness(1.05)', duration: 2.4 }); }
    },
    p04: { enter() { if (!window.S3D) return void load3D(); S3D.attach(cur3d()); S3D.shot('site', true); }, step(n) { if (window.S3D) S3D.shot(['', 'rise', 'anatomy', 'orbit'][n]); } },
    p10: { enter(p) { gsap.set(p.querySelector('.stat-col'), { autoAlpha: 1 }); if (!window.S3D) return void load3D(); S3D.attach(cur3d()); S3D.shot('rise', true); },
      step(n, p) { if (n === 3) gsap.to(p.querySelector('.stat-col'), { autoAlpha: 0, duration: 1 }); if (!window.S3D) return; if (n === 1) S3D.shot('xray'); if (n === 3) S3D.shot('fly'); } },
    p23: { enter(p) { JYLogo.reset(logoOf(p)); }, step(n, p) { if (n === 3) JYLogo.play(logoOf(p), { delay: 1.5 }); } },
    p19: { enter() { if (!window.S3D) return void load3D(); S3D.attach(cur3d()); S3D.shot('xray', true); }, step(n) { if (window.S3D && n === 1) S3D.shot('vr'); } },
    p20: {
      enter(p) { gsap.set(p.querySelector('.after'), { clipPath: 'inset(0 0 0 100%)' }); gsap.set(p.querySelector('.cmp .bar'), { left: '100%' }); gsap.set(p.querySelector('.lb-after'), { opacity: 0 }); },
      step(n, p) {
        if (n === 2) {
          gsap.to(p.querySelector('.after'), { clipPath: 'inset(0 0 0 0%)', duration: 3, ease: 'power2.inOut' });
          gsap.to(p.querySelector('.cmp .bar'), { left: '0%', duration: 3, ease: 'power2.inOut' });
          gsap.to(p.querySelector('.lb-after'), { opacity: 1, duration: .8, delay: 2.4 });
          gsap.to(p.querySelector('.lb:not(.lb-after)'), { opacity: 0, duration: .6, delay: 1.6 });
        }
      }
    },
  };
  const cur3d = () => flat[cur].el.querySelector('.three-host');

  // ---------- 按需加载（网页版：只等封面，其余边播边载；本地打开时都是瞬间完成） ----------
  // 图片：除封面外都写成 data-src，进入某页时加载它和后两页，开始播放后再按顺序把剩下的慢慢载完
  function loadImgs(el) {
    const ps = [];
    el.querySelectorAll('img[data-src]').forEach(im => {
      im.src = im.dataset.src; im.removeAttribute('data-src');
      ps.push(new Promise(r => { if (im.complete) r(); else { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); } }));
    });
    return Promise.all(ps);
  }
  const warmPages = i => { for (let k = Math.max(0, i); k <= Math.min(total - 1, i + 2); k++) loadImgs(flat[k].el); };
  let trickling = false;
  async function trickle() { if (trickling) return; trickling = true; for (const f of flat) await loadImgs(f.el); }
  // 3D：three.js、贴图和场景脚本共 3MB，开始播放后在后台加载；如果加载完时正停在 3D 页，就把这一页走过的步骤补上
  let s3dP = null, curStep = 0;
  const loadScript = src => new Promise((res, rej) => { const e = document.createElement('script'); e.src = src; e.onload = res; e.onerror = rej; document.body.appendChild(e); });
  function load3D() {
    return s3dP || (s3dP = loadScript('assets/lib/three.classic.js').then(() => loadScript('assets/3d/textures.js')).then(() => loadScript('assets/js/scene3d.js')).then(() => {
      S3D.init(); fit();
      const f = flat[cur];
      if (f && f.el.dataset['3d'] && !PRINT && !PEEK) { const h = HOOKS[f.id]; h.enter(f.el); for (let k = 1; k <= curStep; k++) h.step(k, f.el); }
    }).catch(e => { s3dP = null; console.error('3D 加载失败', e); }));
  }

  // ---------- 播放状态 ----------
  let cur = -1, mode = 'manual', paused = false, tok = null, waitingNext = -1, started = false;
  let audio = new Audio();
  const ui = {
    play: document.getElementById('bPlay'), auto: document.getElementById('bAuto'), cap: document.getElementById('bCap'),
    hint: document.getElementById('hint'), chapters: document.getElementById('chapters'), caption: document.getElementById('caption'),
  };


  // ---------- 背景乐与场景音效 ----------
  // 背景乐按章节切换（a 记忆 · b 定位与策略 · c 空间与业态 · d 焕新与愿景），旁白响起时自动压低；
  // 环境声按页面切换（草原的风、餐厅人声）；一次性音效跟着画面步骤触发。音量三档：标准 / 轻 / 关。
  const Sound = (() => {
    const BG = window.BGM || {}, FX = window.SFX || {};
    const CH_BGM = { c0: 'a', c1: 'a', c2: 'b', c3: 'b', c4: 'c', c5: 'c', c6: 'b', c7: 'd', c8: 'd' };
    const AMB = { p02: 'wind', p03: 'wind', p04: 'wind', p21: 'wind', p14: 'hall', p15: 'hall' };
    const STEP = {
      'p01-1': [['curtain', .1]], 'p01-2': [['projector', .3]], 'p04-1': [['rise', 0]], 'p10-1': [['rise', 0, .8]], 'p10-3': [['whoosh', 1.3]],
      'p12-2': [['projector', .5, .5]], 'p15-2': [['applause', 1.0]], 'p19-1': [['vr', .2]], 'p20-2': [['shimmer', 0]], 'p23-3': [['light', 0]],
    };
    const LV = { std: 1, low: .5, off: 0 }, OPEN = .5, DUCK = .24;   // 旁白时的音乐比人声低约 17 分贝（“轻”档再低 6 分贝）
    let level = 'std';
    try { level = new URLSearchParams(location.search).get('music') || localStorage.getItem('jy-music') || 'std'; } catch (e) {}
    if (!(level in LV)) level = 'std';
    let ducked = false, bgm = null, amb = null, bgmKey = '', ambKey = '', curCi = -1, curPage = '';
    const live = new Set(), pending = [], pool = {}, loopers = {};
    const mk = file => { const a = new Audio(); a.preload = 'none'; a.src = 'assets/audio/' + file; all.push(a); return a; };
    // 预热：把某个声音提前下载好（苹果手机不支持预加载，播放时再载）
    const heat = a => { if (a._hot) return; a._hot = true; a.preload = 'auto'; if (VOL_OK && a.readyState === 0 && a.paused) { try { a.load(); } catch (e) {} } };
    function warm(ci) {
      [ci, ci + 1].forEach(c => { const ch = N.chapters[c], k = ch && CH_BGM[ch.id]; if (k && BG[k]) L(BG[k], 'b' + k).els.forEach(heat); });
      ['curtain', 'projector', 'chapter'].forEach(k => pool[k] && heat(pool[k]));
      if (loopers.swind) loopers.swind.els.forEach(heat);
    }
    function warmAll() { Object.values(pool).forEach(heat); Object.keys(loopers).filter(k => k[0] === 's').forEach(k => loopers[k].els.forEach(heat)); }
    const all = [];
    // 音量：一般浏览器直接设 volume；苹果手机不允许，改走 WebAudio 增益（只在 http/https 下可用），不行就把配乐关掉
    const WA = !VOL_OK && /^http/.test(location.protocol) && (window.AudioContext || window.webkitAudioContext);
    let actx = null;
    function setVol(el, v) {
      v = Math.max(0, Math.min(1, v));
      if (VOL_OK) { el.volume = v; return; }
      if (!actx) return;
      try {
        if (!el._g) { const src = actx.createMediaElementSource(el); el._g = actx.createGain(); src.connect(el._g); el._g.connect(actx.destination); }
        el._g.gain.value = v;
      } catch (e) {}
    }
    const getVol = el => VOL_OK ? el.volume : (el._g ? el._g.gain.value : 0);
    // 苹果手机：每个声音都要在用户点击的那一下里播放过一次，之后脚本才能播放它。这里不等加载，点完立即返回。
    function unlockAudio() {
      if (VOL_OK) return;
      if (!WA) { level = 'off'; return; }
      try {
        actx = actx || new WA(); actx.resume();
        all.forEach(a => {
          if (a._unlocked) return; a._unlocked = true; setVol(a, 0);
          // 在点击的这一下里“播放一下立刻暂停”来解锁，不触发下载
          try { const p = a.play(); if (p && p.catch) p.catch(() => {}); if (!a._live) a.pause(); } catch (e) {}
        });
      } catch (e) { level = 'off'; }
    }
    function Looper(def) { this.def = def; this.els = [mk(def.file), mk(def.file)]; this.i = 0; this.g = { v: 0 }; this.on = false; }
    Looper.prototype = {
      apply() { this.els.forEach(e => setVol(e, this.g.v)); },
      to(v, fade) { gsap.killTweensOf(this.g); gsap.to(this.g, { v, duration: fade, ease: 'sine.inOut', onUpdate: () => this.apply() }); },
      start(v, fade) {
        this.on = true; this.els.forEach(e => e.pause()); this.i = 0;
        const e = this.els[0]; try { e.currentTime = 0; } catch (x) {}
        this.g.v = 0; this.apply(); e._live = true; if (!paused) e.play().catch(() => {}); else e._was = true;
        this.to(v, fade);
      },
      stop(fade) {
        this.on = false; gsap.killTweensOf(this.g);
        gsap.to(this.g, { v: 0, duration: fade, ease: 'sine.inOut', onUpdate: () => this.apply(), onComplete: () => this.els.forEach(e => e.pause()) });
      },
      // 到循环点时叠放下一遍，上一遍的余音自然收尾
      tick() {
        if (!this.on || paused) return;
        const e = this.els[this.i];
        if (!e.paused && e.currentTime >= this.def.loop - .02) {
          this.i = 1 - this.i; const n = this.els[this.i];
          try { n.currentTime = 0; } catch (x) {} setVol(n, getVol(e)); n._live = true; n.play().catch(() => {});
        }
      },
      pause() { this.els.forEach(e => { e._was = !e.paused && !e.ended; e.pause(); }); },
      resume() { this.els.forEach(e => { if (e._was) e.play().catch(() => {}); e._was = false; }); },
    };
    const L = (def, key) => loopers[key] || (loopers[key] = new Looper(def));
    const bgmVol = () => (ducked ? DUCK : OPEN) * LV[level];
    const ambVol = k => (FX[k].gain || .25) * LV[level];
    let endCall = null;
    // 全部讲完后音乐再留一会儿，然后慢慢收掉
    function ending() { duck(false); endCall = gsap.delayedCall(20, () => { if (bgm) { bgm.stop(8); bgm = null; bgmKey = ''; } }); }
    function chapter(ci) {
      if (endCall) { endCall.kill(); endCall = null; }
      curCi = ci; const k = CH_BGM[N.chapters[ci].id];
      if (level === 'off' || !BG[k] || k === bgmKey) return;
      if (bgm) bgm.stop(2.8);
      bgmKey = k; bgm = L(BG[k], 'b' + k); bgm.start(bgmVol(), 2.2);
    }
    function page(id) {
      curPage = id; while (pending.length) pending.pop().kill();
      const k = AMB[id] && FX[AMB[id]] ? AMB[id] : '';
      if (level === 'off' || k === ambKey) return;
      if (amb) amb.stop(2); amb = null; ambKey = k;
      if (k) { amb = L(FX[k], 's' + k); amb.start(ambVol(k), 2.4); }
    }
    function fx(name, delay, mul) {
      const d = FX[name]; if (level === 'off' || !d) return;
      const fire = () => {
        const a = pool[name] || (pool[name] = mk(d.file));
        try { a.currentTime = 0; } catch (x) {}
        setVol(a, (d.gain || .4) * (mul || 1) * (level === 'low' ? .55 : 1));
        live.add(a); a._live = true; a.onended = () => live.delete(a);
        if (!paused) a.play().catch(() => {}); else a._was = true;
      };
      if (delay) pending.push(gsap.delayedCall(delay, fire)); else fire();
    }
    function step(id, n) { (STEP[id + '-' + n] || []).forEach(a => fx(a[0], a[1], a[2])); }
    function duck(on) { ducked = on; if (bgm && bgm.on) bgm.to(bgmVol(), on ? 1.0 : 2.0); }
    function setLevel(v) {
      if (!(v in LV)) return;
      level = v; try { localStorage.setItem('jy-music', v); } catch (e) {}
      if (v === 'off') {
        if (bgm) bgm.stop(.8); if (amb) amb.stop(.8); bgm = amb = null; bgmKey = ambKey = '';
        live.forEach(a => a.pause()); live.clear();
      } else if (started) {
        if (curCi >= 0) chapter(curCi);
        if (curPage) page(curPage);
        if (bgm) bgm.to(bgmVol(), .6);
        if (amb) amb.to(ambVol(ambKey), .6);
      }
      const name = { std: '标准', low: '轻', off: '关闭' }[v];
      const b = document.getElementById('bMusic'); if (b) { b.textContent = '配乐：' + name; b.classList.toggle('on', v !== 'off'); }
      document.querySelectorAll('#start .msel button').forEach(x => x.classList.toggle('on', x.dataset.v === v));
    }
    const cycle = () => setLevel({ std: 'low', low: 'off', off: 'std' }[level]);
    function pause() { Object.values(loopers).forEach(l => l.pause()); live.forEach(a => { a._was = !a.paused; a.pause(); }); }
    function resume() { Object.values(loopers).forEach(l => l.resume()); Object.values(pool).forEach(a => { if (a._was) a.play().catch(() => {}); a._was = false; }); }
    function preload() { Object.keys(BG).forEach(k => L(BG[k], 'b' + k)); Object.keys(FX).forEach(k => { if (FX[k].loop) L(FX[k], 's' + k); else pool[k] = mk(FX[k].file); }); }
    setInterval(() => { if (bgm) bgm.tick(); if (amb) amb.tick(); }, 30);
    const first = () => (loopers.ba ? [loopers.ba.els[0]] : []);
    return { chapter, page, step, fx, duck, ending, unlockAudio, first, warm, warmAll, setLevel, cycle, pause, resume, preload, get level() { return level; } };
  })();

  function sleep(ms, t) {
    return new Promise((res, rej) => {
      let left = ms, last = performance.now();
      (function tick(now) {
        if (t.dead) return rej(ABORT);
        if (!paused) left -= (now || performance.now()) - last;
        last = now || performance.now();
        if (left <= 0) return res();
        requestAnimationFrame(tick);
      })(last);
    });
  }
  // 预加载全部配音（每段一个 Audio 元素，避免切换时的加载延迟）
  const clips = {};
  // 旁白按章节预热：只提前下载当前章和下一章。苹果手机不支持预加载，改用 fetch 把文件放进缓存，
  // 并且全程只用同一个播放器换地址（它在点“开始”时解锁过一次，之后脚本就能一直用）
  const warmed = {};
  const narr = VOL_OK ? null : new Audio();
  function warmAudio(ci, firstPageOnly) {
    const k = setKey(), set = SETS[k] || {};
    (firstPageOnly ? [flat[0]] : flat.filter(f => f.ci >= ci && f.ci <= ci + 1)).forEach(f => f.segs.forEach((_, n) => {
      const id = `${f.id}-${n + 1}`; if (!set[id] || warmed[k + id]) return; warmed[k + id] = 1;
      const url = 'assets/audio/' + set[id].file;
      if (narr) { if (/^http/.test(location.protocol)) fetch(url).catch(() => {}); return; }
      const a = new Audio(); a.preload = 'auto'; a.src = url; clips[k + id] = a;
    }));
    if (!firstPageOnly) Sound.warm(ci);   // 背景乐等可以点开始之后再下载，不和封面抢带宽
  }
  function unlockNarr() {
    if (!narr || narr._unlocked) return; narr._unlocked = true;
    // 一段极短的静音，在点击的这一下里真正播放一次
    narr.src = 'data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    try { const p = narr.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  const estDur = text => Math.max(2200, text.replace(/\s/g, '').length / 4.2 * 1000);
  function playSeg(id, text, t) {
    const a = setOf()[id], ck = setKey() + id;
    if (!a) return sleep(estDur(text), t);
    return new Promise((res, rej) => {
      const url = 'assets/audio/' + a.file;
      const el = narr || clips[ck] || (clips[ck] = new Audio(url));
      if (narr) narr.src = url;
      audio = el; el._live = true; el.muted = voice === 'off';
      if (!narr) { try { el.currentTime = 0; } catch (e) {} }
      let over = false, rolling = false;
      const finish = ok => { if (over) return; over = true; clearInterval(chk); el.removeEventListener('ended', done); el.removeEventListener('error', fail); el.removeEventListener('playing', roll); ok ? res() : rej(ABORT); };
      const done = () => finish(true);
      const fail = () => { if (!over && !rolling) { rolling = true; sleep((a.dur || 3) * 1000, t).then(done, () => finish(false)); } };
      const chk = setInterval(() => { if (t.dead) { el.pause(); finish(false); } }, 80);
      // 保护：声音真正响起后，按时长 + 1.5 秒兜底继续（万一浏览器没有发出播放结束事件）；
      // 网络太慢、20 秒还没响起来，就按这段的时长静音走完，不让演示卡住
      const roll = () => { if (rolling) return; rolling = true; sleep((a.dur || 3) * 1000 + 1500, t).then(() => { if (!over) { el.pause(); done(); } }, () => {}); };
      el.addEventListener('ended', done); el.addEventListener('error', fail); el.addEventListener('playing', roll);
      sleep(20000, t).then(() => { if (!rolling && !over) { el.pause(); fail(); } }, () => {});
      if (!paused) el.play().catch(fail);
    });
  }
  function setCaption(text) {
    ui.caption.textContent = text || '';
    ui.caption.classList.toggle('has', !!text);
  }

  async function chapterCard(ch, t) {
    const cc = document.getElementById('chapterCard');
    cc.querySelector('.no').textContent = ch.no;
    cc.querySelector('.tt').textContent = ch.title;
    const tl = gsap.timeline();
    tl.set(cc, { autoAlpha: 0 }).to(cc, { autoAlpha: 1, duration: .6 })
      .fromTo(cc.querySelector('.no'), { scale: .8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1, ease: 'power3.out' }, '<')
      .fromTo(cc.querySelector('.tt'), { y: 20, autoAlpha: 0, letterSpacing: '.6em' }, { y: 0, autoAlpha: 1, letterSpacing: '.25em', duration: 1.1, ease: 'power3.out' }, '-=.6')
      .fromTo(cc.querySelector('.ln'), { width: 0 }, { width: 260, duration: 1, ease: 'power2.inOut' }, '-=.8');
    await sleep(2300, t);
  }
  function hideChapterCard() {
    const cc = document.getElementById('chapterCard');
    if (cc.style.visibility !== 'hidden') gsap.to(cc, { autoAlpha: 0, duration: .9 });
  }

  function enterPage(i, instant) {
    const prev = cur >= 0 ? flat[cur].el : null;
    const f = flat[i];
    if (prev && prev !== f.el) {
      const hp = HOOKS[prev.id]; hp && hp.leave && hp.leave(prev);
      gsap.to(prev, { autoAlpha: 0, duration: .8, ease: 'power2.inOut', onComplete: () => prev.classList.remove('on') });
    }
    cur = i; curStep = 0;
    warmPages(i);
    if (started && !PEEK && (i >= 1 || f.el.dataset['3d'])) { load3D(); Sound.warmAll(); }   // 3D 库和其余音效：过了封面再开始下载，不和开场抢带宽
    if (!f.el.dataset['3d'] && window.S3D) S3D.detach();
    hideSteps(f.el);
    f.el.classList.add('on');
    gsap.killTweensOf(f.el);
    if (instant) gsap.set(f.el, { autoAlpha: 1, scale: 1 });
    else gsap.fromTo(f.el, { autoAlpha: 0, scale: 1.025 }, { autoAlpha: 1, scale: 1, duration: 1.1, ease: 'power2.out' });
    const h = HOOKS[f.id]; h && h.enter && h.enter(f.el);
    kb(f.el);
    updateBar();
  }

  async function playFrom(idx) {
    if (tok) tok.dead = true;
    const t = tok = { dead: false };
    audio.pause(); paused = false; setPausedUI();
    hideHint();
    try {
      for (let i = idx; i < total; i++) {
        const f = flat[i];
        const newCh = i === idx || flat[i - 1].ci !== f.ci;
        if (i > idx && newCh && mode === 'manual') { pr.run = false; pr.el = pr.tot; Sound.duck(false); showHint(i); return; }
        if (newCh) pr = { ci: f.ci, el: 0, tot: chTotal(f.ci), run: true };
        if (newCh) { Sound.duck(false); Sound.chapter(f.ci); warmAudio(f.ci); }
        if (newCh && f.ch.no) { Sound.fx('chapter', .2); await chapterCard(f.ch, t); }
        enterPage(i);
        Sound.page(f.id);
        hideChapterCard();
        await sleep(700, t);
        Sound.duck(true);
        for (let s = 0; s < f.segs.length; s++) {
          reveal(f.el, s + 1);
          setCaption(f.segs[s]);
          await playSeg(`${f.id}-${s + 1}`, f.segs[s], t);
          await sleep(380, t);
        }
        setCaption('');
        await sleep(900, t);
      }
      pr.run = false; pr.el = pr.tot;
      Sound.ending();
      showHint(-2);
    } catch (e) { if (e !== ABORT) console.error(e); }
  }

  // ---------- 章节进度指示（右上角） ----------
  const segMs = (id, text) => { const a = setOf()[id]; return a ? a.dur * 1000 : estDur(text); };
  const chTotal = ci => flat.filter(f => f.ci === ci).reduce((s, f) =>
    s + 1600 + f.segs.reduce((x, tx, k) => x + segMs(`${f.id}-${k + 1}`, tx) + 380, 0), N.chapters[ci].no ? 2300 : 0);
  let pr = { ci: -1, el: 0, tot: 1, run: false };
  const pg = document.getElementById('prog');
  if (pg && !PRINT) {
    const pn = pg.querySelector('.pn'), pb = pg.querySelector('b'), pt = pg.querySelector('.pt');
    let last = performance.now(), shown = '';
    (function tick(now) {
      requestAnimationFrame(tick);
      const d = now - last; last = now;
      if (pr.ci < 0) return;
      if (pr.run && !paused) pr.el = Math.min(pr.tot, pr.el + d);
      const ch = N.chapters[pr.ci], left = Math.max(0, Math.ceil((pr.tot - pr.el) / 1000));
      const key = pr.ci + '|' + left + '|' + pr.run;
      pb.style.width = (100 * pr.el / pr.tot).toFixed(2) + '%';
      if (key === shown) return; shown = key;
      pg.classList.add('on');
      pn.textContent = `${pr.ci + 1}/${N.chapters.length} · ${ch.no ? ch.no + ' ' : ''}${ch.title}`;
      pt.textContent = pr.run ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '本章完';
    })(last);
  }
  function setVoice(v) {
    if (v !== 'off' && !SETS[v]) return;
    voice = v; try { localStorage.setItem('jy-voice2', v); } catch (e) {}
    if (!PRINT && !PEEK) warmAudio(cur >= 0 ? flat[cur].ci : 0);
    audio.muted = v === 'off';
    const name = { f: '女声', m: '男声', off: '关闭' }[v];
    const b = document.getElementById('bVoice'); if (b) { b.textContent = '旁白：' + name; b.classList.toggle('on', v !== 'off'); }
    document.querySelectorAll('#start .vsel button').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  }

  function showHint(nextIdx) {
    waitingNext = nextIdx;
    if (nextIdx === -2) { ui.hint.textContent = '汇报结束 · 重新开始 ↺'; }
    else ui.hint.textContent = `下一章：${flat[nextIdx].ch.title} ▶`;
    ui.hint.style.display = 'block';
  }
  function hideHint() { waitingNext = -1; ui.hint.style.display = 'none'; }

  function next() {
    if (!started) return start('manual');
    if (waitingNext === -2) return playFrom(0);
    if (waitingNext >= 0) return playFrom(waitingNext);
    // 播放中：跳到下一章开头
    const ci = flat[Math.max(cur, 0)].ci;
    const n = chStart(ci + 1);
    if (n >= 0) playFrom(n);
  }
  function prev() {
    if (!started) return;
    const ci = flat[Math.max(cur, 0)].ci;
    const first = chStart(ci);
    playFrom(cur === first && ci > 0 ? chStart(ci - 1) : first);
  }
  function togglePause() {
    if (!started) return;
    paused = !paused;
    if (paused) { audio.pause(); Sound.pause(); gsap.globalTimeline.pause(); } else { if (audio.src && !audio.ended) audio.play().catch(() => {}); Sound.resume(); gsap.globalTimeline.resume(); }
    setPausedUI();
  }
  function setPausedUI() { ui.play.textContent = paused ? '▶ 继续' : '⏸ 暂停'; }
  function setMode(m) {
    mode = m; ui.auto.classList.toggle('on', m === 'auto');
    if (m === 'auto' && waitingNext >= 0) playFrom(waitingNext);
  }
  let gateOpen = false, starting = false;
  function start(m) {
    if (!gateOpen || started || starting) return;
    starting = true;
    const run = () => {
      Sound.setLevel(Sound.level);
      started = true;
      document.getElementById('start').style.display = 'none';
      JYLogo.stop(logoOf(document.getElementById('start')));
      setMode(m);
      playFrom(0);
      trickle();   // 其余图片在后台按页码顺序继续加载
    };
    // 苹果手机：先在这次点击里把声音都解锁，再开始
    if (!VOL_OK) { Sound.unlockAudio(); unlockNarr(); }
    run();
  }

  // 章节条
  N.chapters.forEach((ch, ci) => {
    const d = document.createElement('div');
    d.className = 'ch'; d.dataset.ci = ci;
    d.innerHTML = `<div class="bar"><i></i></div>${ch.no ? ch.no + ' ' : ''}${ch.title}`;
    d.onclick = () => { if (!gateOpen) return; if (!started) { if (!VOL_OK) { Sound.unlockAudio(); unlockNarr(); } trickle(); } started = true; document.getElementById('start').style.display = 'none'; playFrom(chStart(ci)); };
    ui.chapters.appendChild(d);
  });
  function updateBar() {
    const ci = flat[cur].ci;
    [...ui.chapters.children].forEach((d, k) => {
      d.classList.toggle('cur', k === ci);
      const pages = flat.filter(f => f.ci === k), done = flat.slice(0, cur + 1).filter(f => f.ci === k).length;
      d.querySelector('i').style.width = (k < ci ? 100 : k > ci ? 0 : 100 * done / pages.length) + '%';
    });
  }

  // ---------- 输入 ----------
  document.getElementById('bNext').onclick = next;
  document.getElementById('bPrev').onclick = prev;
  ui.play.onclick = togglePause;
  ui.auto.onclick = () => setMode(mode === 'auto' ? 'manual' : 'auto');
  ui.cap.onclick = () => { document.body.classList.toggle('cap'); ui.cap.classList.toggle('on'); };
  document.getElementById('bFull').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  ui.hint.onclick = next;
  const cycleVoice = () => { const order = ['m', 'f', 'off'].filter(v => v === 'off' || SETS[v]); setVoice(order[(order.indexOf(voice) + 1) % order.length]); };
  document.getElementById('bVoice').onclick = cycleVoice;
  document.querySelectorAll('#start .vsel button').forEach(x => x.onclick = () => setVoice(x.dataset.v));
  setVoice(voice);
  document.getElementById('bMusic').onclick = Sound.cycle;
  document.querySelectorAll('#start .msel button').forEach(x => x.onclick = () => Sound.setLevel(x.dataset.v));
  Sound.setLevel(Sound.level);
  document.getElementById('sManual').onclick = () => start('manual');
  document.getElementById('sAuto').onclick = () => start('auto');
  // 下载资料
  const dl = document.getElementById('dl');
  const dlShow = on => { dl.classList.toggle('on', on); };
  document.getElementById('bDl').onclick = () => dlShow(true);
  document.getElementById('dlClose').onclick = () => dlShow(false);
  dl.onclick = e => { if (e.target === dl) dlShow(false); };
  addEventListener('keydown', e => {
    if (dl.classList.contains('on')) { if (e.code === 'Escape') dlShow(false); return; }
    if (['Space', 'ArrowRight', 'PageDown', 'Enter'].includes(e.code)) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.code)) { e.preventDefault(); prev(); }
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyA') setMode(mode === 'auto' ? 'manual' : 'auto');
    else if (e.code === 'KeyC') ui.cap.click();
    else if (e.code === 'KeyV') cycleVoice();
    else if (e.code === 'KeyM') Sound.cycle();
    else if (e.code === 'KeyF') document.getElementById('bFull').click();
  });
  let idleT;
  const wake = () => {
    document.body.classList.remove('idle'); clearTimeout(idleT);
    idleT = setTimeout(() => document.body.classList.add('idle'), 2600);
  };
  addEventListener('mousemove', wake);
  addEventListener('touchstart', wake, { passive: true });

  // ---------- 加载进度 ----------
  // 网页部署时：等图片和前两章的声音就绪再允许开始，其余的在后台继续加载。本地打开几乎是瞬间完成。
  function loadGate() {
    const ld = document.getElementById('ld'), btns = document.querySelector('#start .btns');
    const imgs = [...flat[0].el.querySelectorAll('img')];
    const ess = VOL_OK ? [clips[setKey() + flat[0].id + '-1']].filter(Boolean) : [];   // 只等封面图和第一句旁白
    const total = imgs.length + ess.length; let done = 0, opened = false;
    const open = () => { if (opened) return; opened = true; gateOpen = true; btns.classList.remove('wait'); if (ld) ld.textContent = ''; warmAudio(0); warmPages(0); };
    const inc = () => { done++; if (ld && !opened) ld.textContent = `正在加载 ${Math.round(100 * done / total)}%`; if (done >= total) open(); };
    btns.classList.add('wait');
    if (ld) ld.textContent = '正在加载 0%';
    imgs.forEach(im => { if (im.complete) inc(); else { im.addEventListener('load', inc, { once: true }); im.addEventListener('error', inc, { once: true }); } });
    ess.forEach(a => { if (a.readyState >= 3) inc(); else { let hit = false; const h = () => { if (!hit) { hit = true; inc(); } }; a.addEventListener('canplay', h); a.addEventListener('loadeddata', h); a.addEventListener('error', h); } });
    if (!total) open();
    setTimeout(open, 10000);   // 网络很慢时也不把人挡在外面：最多等 10 秒，之后边播边载
  }

  // ---------- 启动 ----------
  const STILL = { p04: 'orbit', p10: 'flow', p19: 'vr' };
  async function boot() {
    // 字体：网页版最多等 2.5 秒（之后先用系统字体显示，到了再换）；打印和单页预览必须等到位
    const fl = document.getElementById('fontsCss');
    const fontsIn = (async () => {
      if (fl && !fl.dataset.ok) await new Promise(r => { fl.addEventListener('load', r, { once: true }); fl.addEventListener('error', r, { once: true }); });
      try { await Promise.all([document.fonts.load('700 20px "JY Serif"', '玖影'), document.fonts.load('400 14px "JY Sans"', '玖影')]); await document.fonts.ready; } catch (e) {}
    })();
    await (PRINT || PEEK ? fontsIn : Promise.race([fontsIn, new Promise(r => setTimeout(r, 2500))]));
    fit();
    if (PRINT) { await Promise.all(flat.map(f => loadImgs(f.el))); await load3D(); }
    if (!PRINT && !PEEK) { Sound.preload(); warmAudio(0, true); }   // 开场只下载封面要用的，其余等可以点开始之后再载
    if (!PRINT && !PEEK) loadGate(); else gateOpen = true;
    if (!PRINT && !PEEK) JYLogo.play(logoOf(document.getElementById('start')), { delay: .3 });
    if (PRINT) {
      document.body.classList.add('print');
      document.getElementById('start').style.display = 'none';
      for (const f of flat) {
        f.el.classList.add('on'); gsap.set(f.el, { autoAlpha: 1 }); showAll(f.el);
        if (f.id === 'p01') gsap.set(f.el.querySelectorAll('.curtain'), { display: 'none' });
        if (f.id === 'p20') { gsap.set(f.el.querySelector('.after'), { clipPath: 'inset(0 0 0 50%)' }); gsap.set(f.el.querySelector('.cmp .bar'), { left: '50%' }); gsap.set(f.el.querySelector('.lb-after'), { opacity: 1 }); }
        if (f.id === 'p02') gsap.set(f.el.querySelector('.door img'), { filter: 'none' });
        if (f.id === 'p23') gsap.set(f.el.querySelector('[data-anim="lighton"]'), { textShadow: '0 0 28px rgba(255,170,90,.85), 0 0 80px rgba(232,98,44,.6)' });
        if (STILL[f.id] && window.S3D) {
          const url = await S3D.still(STILL[f.id]);
          const img = new Image(); img.className = 'still'; img.src = url;
          f.el.querySelector('.three-host').appendChild(img);
          S3D.labelsInto(f.el.querySelector('.three-host'), STILL[f.id]);
        }
      }
      window.__READY__ = true;
      return;
    }
    if (PEEK) {
      const i = flat.findIndex(f => f.id === PEEK);
      if (i >= 0) {
        await loadImgs(flat[i].el);
        if (flat[i].el.dataset['3d']) await load3D();
        document.getElementById('start').style.display = 'none'; started = true;
        document.body.classList.add('idle');
        enterPage(i, true); showAll(flat[i].el);
        const h = HOOKS[flat[i].id];
        if (h && h.step) flat[i].segs.forEach((_, s) => h.step(s + 1, flat[i].el));
      }
    }
    window.__READY__ = true;
  }
  boot();
  window.APP = { playFrom, flat, next, prev, setVoice, start, Sound };
})();
