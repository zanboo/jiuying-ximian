/* 玖影·喜面 动态 logo
 * 创意：「面」字下半部分的格子 = 一段竖向走片的电影胶片 —— 中间三格是画格，两侧是齿孔。
 * 字形取自思源宋体 800 字重的轮廓（assets/js/logo-glyphs.js），不依赖字体文件。
 * 用法：
 *   const svg = JYLogo.mount(容器, { tag: true });   // 插入静态成品
 *   JYLogo.play(svg, { loop: true });                 // 播放入场动画，之后胶片每隔几秒走一格
 *   JYLogo.stop(svg);
 */
(function () {
  'use strict';
  const G = window.JY_GLYPHS;
  let uid = 0;
  const INK = '#f1e7d6', ACC = '#e8622c', GOLD = '#c9a46a';
  // 版式（字体单位，1000 = 一个字宽；y 轴向上，基线 = 0）
  const X = { '玖': 0, '影': 1000, '·': 2000, '喜': 2338, '面': 3338 };
  const PITCH = 185, FRAME_H = 133, HOLE_PITCH = 92.5;

  function svgText(o) {
    o = o || {};
    const id = 'jyl' + (++uid), ink = o.ink || INK, acc = o.accent || ACC;
    const frames = [], holesL = [], holesR = [];
    for (let i = -1; i < 10; i++) frames.push(`<rect x="456" y="${36 + i * PITCH}" width="78" height="${FRAME_H}" rx="10"/>`);
    for (let j = -2; j < 20; j++) {
      const y = 40 + j * HOLE_PITCH;
      holesL.push(`<rect x="256" y="${y}" width="43" height="30" rx="9"/>`);
      holesR.push(`<rect x="692" y="${y}" width="43" height="30" rx="9"/>`);
    }
    const tag = o.tag ? `<text class="jy-tag" x="2169" y="1150" text-anchor="middle" font-family="'JY Sans','Noto Sans SC','Microsoft YaHei',sans-serif" font-size="92" letter-spacing="62" fill="${GOLD}">JIUYING · XIMIAN</text>
      <rect class="jy-rule" x="1469" y="1012" width="1400" height="5" fill="${GOLD}" opacity=".7"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="jy-logo" viewBox="-70 -30 4478 ${o.tag ? 1270 : 1060}" role="img" aria-label="玖影·喜面">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e2"/><stop offset=".55" stop-color="#ffd08a"/><stop offset="1" stop-color="#f08a4b"/></linearGradient>
    <clipPath id="${id}c"><rect x="444" y="24" width="102" height="523"/></clipPath>
    <clipPath id="${id}l"><rect x="232" y="24" width="91" height="523"/></clipPath>
    <clipPath id="${id}r"><rect x="668" y="24" width="93" height="523"/></clipPath>
    <filter id="${id}f" x="-80%" y="-30%" width="260%" height="160%"><feGaussianBlur stdDeviation="46"/></filter>
  </defs>
  <g transform="matrix(1 0 0 -1 0 900)">
    <g class="jy-ch" transform="translate(${X['玖']} 0)"><path fill="${ink}" d="${G['玖'].d}"/></g>
    <g class="jy-ch" transform="translate(${X['影']} 0)"><path fill="${ink}" d="${G['影'].d}"/></g>
    <g class="jy-dot" transform="translate(${X['·']} 0)"><path fill="${acc}" d="${G['·'].d}"/></g>
    <g class="jy-ch" transform="translate(${X['喜']} 0)"><path fill="${ink}" d="${G['喜'].d}"/></g>
    <g class="jy-mian" transform="translate(${X['面']} 0)">
      <rect class="jy-glow" x="430" y="10" width="130" height="550" fill="#ff9d4d" opacity=".55" filter="url(#${id}f)"/>
      <g clip-path="url(#${id}c)"><g class="jy-frames" fill="url(#${id}g)">${frames.join('')}</g></g>
      <g clip-path="url(#${id}l)"><g class="jy-holes" fill="${GOLD}">${holesL.join('')}</g></g>
      <g clip-path="url(#${id}r)"><g class="jy-holes" fill="${GOLD}">${holesR.join('')}</g></g>
      <path class="jy-mian-g" fill="${acc}" d="${G['面'].d}"/>
    </g>
  </g>
  ${tag}
</svg>`;
  }

  function mount(el, o) {
    el.innerHTML = svgText(o);
    return el.querySelector('svg');
  }

  function stop(svg) {
    if (!svg) return;
    if (svg._tl) { svg._tl.kill(); svg._tl = null; }
    if (svg._idle) { svg._idle.kill(); svg._idle = null; }
    const q = s => svg.querySelectorAll(s);
    gsap.killTweensOf([...q('.jy-ch'), ...q('.jy-dot'), ...q('.jy-mian'), ...q('.jy-frames'), ...q('.jy-holes'), ...q('.jy-glow'), ...q('.jy-tag'), ...q('.jy-rule'), ...q('.jy-mian-g')]);
  }
  function reset(svg) {
    stop(svg);
    const q = s => svg.querySelectorAll(s);
    // 注意：不能用 clearProps，否则会把各字的定位（transform 属性）一并清掉
    gsap.set([...q('.jy-ch'), ...q('.jy-mian')], { opacity: 1, y: 0 });
    gsap.set(q('.jy-dot'), { opacity: 1, scale: 1 });
    if (q('.jy-tag').length) { gsap.set(q('.jy-tag'), { opacity: 1 }); gsap.set(q('.jy-rule'), { scaleX: 1 }); }
    gsap.set([...q('.jy-frames'), ...q('.jy-holes')], { y: 0, opacity: 1 });
    gsap.set(q('.jy-glow'), { opacity: .55 });
  }

  // 入场：字逐个升起 → 「面」落位 → 胶片由快到慢走片、定格 → 画格亮起；之后每隔几秒走一格
  function play(svg, o) {
    if (!svg || !window.gsap) return;
    o = o || {};
    reset(svg);
    const q = s => svg.querySelectorAll(s);
    const ch = q('.jy-ch'), dot = q('.jy-dot'), mian = q('.jy-mian'), frames = q('.jy-frames'), holes = q('.jy-holes'), glow = q('.jy-glow');
    const tl = svg._tl = gsap.timeline({ delay: o.delay || 0 });
    tl.set([ch, dot, mian], { opacity: 0 })
      .set(glow, { opacity: 0 })
      .set([frames, holes], { y: -PITCH * 6, opacity: .55 })
      .fromTo(ch, { opacity: 0, y: -140 }, { opacity: 1, y: 0, duration: .9, stagger: .14, ease: 'power3.out' }, 0)
      .fromTo(dot, { opacity: 0, scale: 0, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: .5, ease: 'back.out(3)' }, .42)
      .fromTo(mian, { opacity: 0, y: -140 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out' }, .5)
      // 走片：由快到慢，停在三格上
      .to([frames, holes], { y: 0, duration: 2.1, ease: 'power3.out' }, .75)
      .to([frames, holes], { opacity: .8, duration: .08, repeat: 9, yoyo: true, ease: 'none' }, .8)
      // 定格亮灯
      .to([frames, holes], { opacity: 1, duration: .25 }, 2.7)
      .fromTo(glow, { opacity: 0 }, { opacity: 1, duration: .18, ease: 'power2.in' }, 2.7)
      .to(glow, { opacity: .55, duration: 1.2, ease: 'power2.out' }, 2.88);
    const tag = q('.jy-tag'), rule = q('.jy-rule');
    if (tag.length) {
      tl.fromTo(rule, { scaleX: 0, transformOrigin: '50% 50%' }, { scaleX: 1, duration: 1, ease: 'power2.inOut' }, 1.5)
        .fromTo(tag, { opacity: 0 }, { opacity: 1, duration: 1.2 }, 1.9);
    }
    if (o.loop !== false) tl.call(() => {
      svg._idle = gsap.timeline({ repeat: -1, repeatDelay: 2.4, delay: 2.2 })
        .fromTo([frames, holes], { y: -PITCH }, { y: 0, duration: .55, ease: 'power2.inOut' })
        .fromTo(glow, { opacity: .55 }, { opacity: .95, duration: .18, yoyo: true, repeat: 1, ease: 'sine.inOut' }, .3);
    });
    return tl;
  }

  window.JYLogo = { svgText, mount, play, stop, reset };
})();
