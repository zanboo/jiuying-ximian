/* 玖影·喜面 3D 场景（three.js r170，classic 版）
 * 策略：低模体块 + 贴图（卫星图地面、彩色平面图楼板），重点精细：舞台台口/帷幕/巨幕、观光电梯、外立面招牌。
 * 坐标：CAD 米制 X(南→北 0–31.1) / Y(西舞台后墙→东入口 0–58.2) / h(高)
 *       世界：x = Y-29.1（东为+），z = 15.55-X（南为+），y = h
 */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;
  let W = 1123; const H = 794;
  const wx = Y => Y - 29.1, wz = X => 15.55 - X;
  const V = (X, Y, h) => new T.Vector3(wx(Y), h, wz(X));
  const FONT = '"JY Serif","Noto Serif SC","Source Han Serif SC","Microsoft YaHei",serif';

  let renderer, scene, camera, host = null, active = false, scale = 1;
  const camPos = new T.Vector3(90, 95, 110), camTgt = new T.Vector3(), view = { shift: 0, fov: 32 };
  const edgeMats = [], roofEdgeMats = [];
  const st = { rise: 1, xray: 0, roof: 0, explode: 0, flow: 0, vr: 0, l2dim: 0 };
  const G = {};
  let labelBox, curLabels = [], orbitTw = null, curShot = '';
  const xrayMats = [];

  // ---------- 工具 ----------
  function mesh(geo, mat, cast = true) { const m = new T.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
  function box(X0, X1, Y0, Y1, h0, h1, mat) {
    const m = mesh(new T.BoxGeometry(Y1 - Y0, h1 - h0, X1 - X0), mat);
    m.position.set(wx((Y0 + Y1) / 2), (h0 + h1) / 2, wz((X0 + X1) / 2));
    return m;
  }
  function gable(X0, X1, Y0, Y1, h, rise, mat) {
    const w = X1 - X0, s = new T.Shape();
    s.moveTo(-w / 2 - .4, 0); s.lineTo(w / 2 + .4, 0); s.lineTo(0, rise); s.closePath();
    const m = mesh(new T.ExtrudeGeometry(s, { depth: Y1 - Y0 + .6, bevelEnabled: false }), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(wx(Y0 - .3), h, wz((X0 + X1) / 2));
    return m;
  }
  function std(color, o = {}) {
    const m = new T.MeshStandardMaterial(Object.assign({ color, roughness: .9, metalness: 0 }, o));
    return m;
  }
  function xr(m) { xrayMats.push(m); return m; }
  // 体块描边：外观时是深色轮廓，X 光时变成浅色“幽灵线框”
  function edged(m, group, roof) {
    const mat = new T.LineBasicMaterial({ color: '#2b2622', transparent: true, opacity: .5 });
    (roof ? roofEdgeMats : edgeMats).push(mat);
    const e = new T.LineSegments(new T.EdgesGeometry(m.geometry, 25), mat);
    e.position.copy(m.position); e.rotation.copy(m.rotation);
    group.add(m, e);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  function imgTex(url) {
    const t = new T.TextureLoader().load(url, () => { needs = true; });
    t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  // 带平面图贴图的楼板顶面（UV 按 CAD 坐标）
  function planTop(X0, X1, Y0, Y1, h, tex, ylen, mat) {
    const g = new T.PlaneGeometry(Y1 - Y0, X1 - X0);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const Y = Y0 + pos.getX(i) + (Y1 - Y0) / 2, X = X0 + pos.getY(i) + (X1 - X0) / 2;
      uv.setXY(i, Y / ylen, X / 31.1);
    }
    const m = mesh(g, mat || new T.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }), false);
    m.rotation.x = -Math.PI / 2;
    m.position.set(wx((Y0 + Y1) / 2), h, wz((X0 + X1) / 2));
    return m;
  }
  function slab(X0, X1, Y0, Y1, h, tex, ylen, group, edge = '#2a2420') {
    const top = planTop(X0, X1, Y0, Y1, h + .001, tex, ylen);
    const side = box(X0, X1, Y0, Y1, h - .35, h, std(edge, { transparent: true }));
    group.add(side, top);
    return { top, side };
  }

  // ---------- 场景 ----------
  function build() {
    scene = new T.Scene();
    scene.background = new T.Color('#121418');
    scene.fog = new T.Fog('#121418', 140, 360);
    camera = new T.PerspectiveCamera(32, W / H, .5, 900);

    // 黄昏光：低角度暖色主光 + 偏蓝天光
    scene.add(new T.HemisphereLight('#9db2dc', '#4a3528', 1.25));
    const sun = new T.DirectionalLight('#ffbf82', 2.6);
    sun.position.set(95, 48, 70); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 300 });
    sun.shadow.bias = -.0005;
    scene.add(sun);
    const fill = new T.DirectionalLight('#7f9cc8', .6); fill.position.set(-60, 40, -50); scene.add(fill);

    // 地面：卫星图（贴图）+ 外围深色
    const far = mesh(new T.PlaneGeometry(900, 900), std('#1b1d20'), false);
    far.rotation.x = -Math.PI / 2; far.position.y = -1.32; scene.add(far);
    const sat = mesh(new T.PlaneGeometry(205, 106.6), new T.MeshStandardMaterial({ map: imgTex(TEX.sat), color: '#9a938b', roughness: 1 }), false);
    sat.rotation.x = -Math.PI / 2; sat.position.set(3.2, -1.28, 3.4); scene.add(sat);
    G.sat = sat;

    // ---- 外壳（可 X 光淡出）----
    const shell = G.shell = new T.Group(); scene.add(shell);
    const roofG = G.roof = new T.Group(); shell.add(roofG);
    const wall = xr(std('#d3c9ba')), wall2 = xr(std('#c9bfb0')), conc = xr(std('#8e8983', { roughness: .85 }));
    const roofM = xr(std('#3d3a37', { roughness: .65, metalness: .15 }));
    const winTex = canvasTex(1024, 256, (c, w, h) => {
      c.fillStyle = '#d3c9ba'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 400; i++) c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      for (let i = 0; i < 11; i++) { const x = 30 + i * 90; c.fillStyle = '#3a3f46'; c.fillRect(x, 120, 56, 80); c.fillStyle = 'rgba(255,190,120,.55)'; c.fillRect(x + 4, 124, 48, 72); }
      c.fillStyle = '#b8ad9c'; c.fillRect(0, h - 10, w, 10);
    });
    const winGlow = canvasTex(1024, 256, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 11; i++) { c.fillStyle = '#ffb46a'; c.fillRect(34 + i * 90, 124, 48, 72); }
    });
    const winMat = xr(new T.MeshStandardMaterial({ map: winTex, roughness: .9, emissive: '#ffffff', emissiveMap: winGlow, emissiveIntensity: 1.3 }));
    // 舞台台塔（西）
    edged(box(4.46, 27.05, 0, 17.25, 0, 15.5, wall2), shell);
    edged(gable(4.46, 27.05, 0, 17.25, 15.5, 3.2, roofM), roofG, true);
    // 观众厅（中）—— 南北墙带窗贴图
    edged(box(4.46, 27.05, 17.25, 44.43, 0, 12, [wall, wall, wall, wall, winMat, winMat]), shell);
    edged(gable(4.46, 27.05, 17.25, 44.43, 12, 3.6, roofM), roofG, true);
    // 南侧附属
    edged(box(.32, 4.46, 20.5, 44.43, 0, 4.6, wall2), shell);
    edged(box(.32, 4.46, 27.8, 38.4, 4.6, 8.2, wall2), shell);
    // 门厅（东）两层 + 女儿墙
    edged(box(0, 31.1, 44.43, 58.2, 0, 10.2, conc), shell);
    // 立面：亮橙门框 + 二层玻璃（发光）+ 一层橱窗 + 招牌
    const orange = xr(std('#e8622c', { roughness: .55, emissive: '#4a1404', emissiveIntensity: .6 }));
    const glow = xr(new T.MeshStandardMaterial({ color: '#2a1a10', emissive: '#ffb066', emissiveIntensity: 1.4, roughness: .3 }));
    const glow1 = xr(new T.MeshStandardMaterial({ color: '#2a1a10', emissive: '#ffc58a', emissiveIntensity: 1.1, roughness: .3 }));
    const F = 58.2;
    shell.add(box(5.77, 25.33, F, F + .7, 9.5, 10.6, orange));     // 上框
    shell.add(box(5.77, 25.33, F, F + .7, 4.1, 4.7, orange));      // 下框
    shell.add(box(5.77, 6.6, F, F + .7, 4.1, 10.6, orange));       // 左框
    shell.add(box(24.5, 25.33, F, F + .7, 4.1, 10.6, orange));     // 右框
    shell.add(box(6.6, 24.5, F, F + .15, 4.7, 9.5, glow));         // 二层玻璃
    for (let i = 0; i < 5; i++) shell.add(box(6.6 + i * 3.6 + 3.3, 6.6 + i * 3.6 + 3.6, F, F + .35, 4.7, 9.5, conc)); // 竖梃
    shell.add(box(6.0, 25.1, F, F + .1, .2, 3.9, glow1));          // 一层橱窗
    for (let i = 0; i < 6; i++) { const x = 5.77 + i * 3.91; shell.add(box(x, x + .73, F, F + .4, 0, 4.1, conc)); }
    // 屋顶招牌“郊区影剧院”
    const sign = canvasTex(2048, 300, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.font = `900 230px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = '#ffcf8a'; c.shadowBlur = 40; c.fillStyle = '#fff4e0';
      const s = '郊 区 影 剧 院'; c.fillText(s, w / 2, h / 2 + 8);
    });
    const signM = mesh(new T.PlaneGeometry(15, 2.2), new T.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }), false);
    signM.rotation.y = Math.PI / 2; signM.position.copy(V(15.55, F + .8, 11.9)); shell.add(signM);
    shell.add(box(8.2, 22.9, F - .2, F + .2, 10.6, 10.8, conc));
    // 二层霓虹“玖影·喜面”
    const neon = canvasTex(1600, 300, (c, w, h) => {
      c.font = `900 200px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = '#ff7a3a'; c.shadowBlur = 50; c.fillStyle = '#fff1dc'; c.fillText('玖影·喜面', w / 2, h / 2 + 6);
    });
    const neonM = mesh(new T.PlaneGeometry(9.5, 1.8), new T.MeshBasicMaterial({ map: neon, transparent: true, toneMapped: false }), false);
    neonM.rotation.y = Math.PI / 2; neonM.position.copy(V(15.55, F + .25, 6.9)); shell.add(neonM);
    G.signs = [signM, neonM];
    // 入口大台阶
    const stepM = std('#9b958d', { roughness: .95 });
    [[F, 61, -.4, 0], [61, 63.4, -.8, -.4], [63.4, 65.03, -1.25, -.8]].forEach(([a, b, h0, h1]) => scene.add(box(0, 31.1, a, b, h0 - .05, h1, stepM)));
    scene.add(box(0, 31.1, -.3, F + .05, -1.3, -.02, std('#2a2522')));   // 基座

    // ---- 室内（X 光可见）----
    const inner = G.inner = new T.Group(); scene.add(inner);
    const tL1 = imgTex(TEX.planL1), tL2 = imgTex(TEX.planL2);
    // 一层楼板（平面图）
    inner.add(planTop(0, 31.1, 0, 58.2, .03, tL1, 65.03));
    // 重点：舞台 —— 台面、巨幕、帷幕、台口
    inner.add(box(11.6, 24.9, .55, 5.5, 0, .9, std('#3a2a20', { roughness: .6 })));
    const led = canvasTex(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a0f5e'); g.addColorStop(.5, '#d7266e'); g.addColorStop(1, '#1b4fd6');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 6;
      for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(w / 2, h / 2 - k * 60); c.lineTo(w / 2 + k * 110, h / 2); c.lineTo(w / 2, h / 2 + k * 60); c.lineTo(w / 2 - k * 110, h / 2); c.closePath(); c.stroke(); }
    });
    const ledM = mesh(new T.PlaneGeometry(12, 6), new T.MeshBasicMaterial({ map: led, toneMapped: false }), false);
    ledM.rotation.y = Math.PI / 2; ledM.position.copy(V(18.25, .8, 4.6)); inner.add(ledM);
    const pleat = (rx) => { const t = canvasTex(256, 64, (c, w, h) => { for (let i = 0; i < 4; i++) { const g = c.createLinearGradient(i * 64, 0, i * 64 + 64, 0); g.addColorStop(0, '#1f0403'); g.addColorStop(.45, '#7a1811'); g.addColorStop(.6, '#5a100c'); g.addColorStop(1, '#1f0403'); c.fillStyle = g; c.fillRect(i * 64, 0, 64, h); } }); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, 1); return new T.MeshStandardMaterial({ map: t, roughness: .9, emissive: '#2a0503', emissiveIntensity: .25 }); };
    const velvet = pleat(2), velvetTop = pleat(12);
    inner.add(box(9.6, 12.2, .7, 1.4, 0, 8, velvet), box(24.3, 26.9, .7, 1.4, 0, 8, velvet), box(9.6, 26.9, .7, 1.4, 8, 9.2, velvetTop));
    // 原台口（镜框式，保留）
    const orn = (rx, ry) => { const t = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#6e2812'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c99746'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
      c.lineWidth = 5; c.beginPath(); c.moveTo(w / 2, 44); c.lineTo(w - 44, h / 2); c.lineTo(w / 2, h - 44); c.lineTo(44, h / 2); c.closePath(); c.stroke();
      c.fillStyle = '#2f8f86'; c.beginPath(); c.arc(w / 2, h / 2, 26, 0, 7); c.fill();
      c.fillStyle = '#c99746'; [[44, 44], [w - 44, 44], [44, h - 44], [w - 44, h - 44]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); });
    }); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); return new T.MeshStandardMaterial({ map: t, roughness: .6, metalness: .2, emissive: '#1c0c04', emissiveIntensity: .3 }); };
    const gold = orn(1, 11), goldBeam = orn(16, 1);
    const pwall = new T.MeshStandardMaterial({ color: '#d9d0c2', transparent: true, opacity: .2, depthWrite: false, roughness: .9 });
    [box(4.7, 8.6, 16.3, 17.2, 0, 11.5, pwall), box(22.9, 26.8, 16.3, 17.2, 0, 11.5, pwall), box(8.6, 22.9, 16.3, 17.2, 9.9, 11.5, pwall)].forEach(m => { m.castShadow = false; inner.add(m); });
    inner.add(box(8.6, 9.5, 16.2, 17.3, 0, 9.9, gold), box(22.0, 22.9, 16.2, 17.3, 0, 9.9, gold), box(8.6, 22.9, 16.2, 17.3, 9.0, 9.9, goldBeam));
    // 观光电梯（玻璃）
    const glass = new T.MeshPhysicalMaterial({ color: '#cfe8ee', transparent: true, opacity: .28, roughness: .05, metalness: .1, emissive: '#3f8f9a', emissiveIntensity: .25 });
    const lift = box(14.9, 16.6, 33.1, 34.8, 0, 11, glass); inner.add(lift);
    const liftEdges = new T.LineSegments(new T.EdgesGeometry(lift.geometry), new T.LineBasicMaterial({ color: '#9fe3ea' }));
    liftEdges.position.copy(lift.position); inner.add(liftEdges);
    // 二层（爆炸分离）
    const L2 = G.L2 = new T.Group(); inner.add(L2);
    const s1 = slab(0, 31.1, 44.43, 58.2, 3.52, tL2, 58.2, L2);
    const pieces = [s1,
      slab(4.46, 27.05, 41.7, 44.43, 4.6, tL2, 58.2, L2), slab(4.46, 27.05, 39.0, 41.7, 4.1, tL2, 58.2, L2), slab(4.46, 27.05, 36.2, 39.0, 3.6, tL2, 58.2, L2),
      slab(5.0, 11.2, .5, 13.4, 3.52, tL2, 58.2, L2), slab(6.5, 10.0, 13.4, 35.0, 3.52, tL2, 58.2, L2), slab(23.7, 26.5, 22.6, 32.7, 3.52, tL2, 58.2, L2),
      slab(.34, 4.5, 27.8, 38.4, 3.52, tL2, 58.2, L2)];
    G.l2pieces = pieces; G.vrSlab = s1;
    // VR 发光体
    const vrMat = new T.MeshBasicMaterial({ color: '#4ec3cf', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    G.vrBox = box(.9, 30.2, 44.4, 57.3, 3.6, 8.4, vrMat); G.vrBox.castShadow = false; L2.add(G.vrBox);
    const vrEdge = new T.LineSegments(new T.EdgesGeometry(G.vrBox.geometry), new T.LineBasicMaterial({ color: '#7fe6ee', transparent: true, opacity: 0 }));
    vrEdge.position.copy(G.vrBox.position); L2.add(vrEdge); G.vrEdge = vrEdge;
    // 动线
    const curve = new T.CatmullRomCurve3([[19.5, 64, -.2], [19.5, 55.5, .5], [16, 50, .5], [16.5, 44.2, .5], [11, 40, .5], [11, 24, .5], [11, 10, .5], [18, 6.5, 1.2]].map(p => V(...p)), false, 'catmullrom', .3);
    const tube = new T.TubeGeometry(curve, 240, .32, 10, false);
    G.flow = mesh(tube, new T.MeshBasicMaterial({ color: '#ff7a3a', toneMapped: false }), false);
    G.flowCount = tube.index.count; tube.setDrawRange(0, 0); inner.add(G.flow);
    G.flowHead = mesh(new T.SphereGeometry(.5, 20, 14), new T.MeshBasicMaterial({ color: '#ffd2a8', toneMapped: false }), false);
    G.flowCurve = curve; inner.add(G.flowHead);
    G.innerAll = inner;

    // ================= 重点区域精模（其余保持低模 + 贴图） =================
    const dim = G.dimMats = [];
    const tm = (color, o) => { const m = std(color, Object.assign({ transparent: true }, o)); dim.push(m); return m; };
    const wood = tm('#b98a5a', { roughness: .7 }), cushion = tm('#efe6d6'), steel = tm('#1d1d20', { roughness: .5, metalness: .6 });
    const M4 = new T.Matrix4();
    // 二层看台：18 组阶梯卡座（3 排 × 6 组）
    const rows = [[39.0, 3.6], [41.7, 4.1], [44.43, 4.6]], cols = [6.4, 9.6, 12.8, 18.7, 21.9, 25.1];
    const backs = new T.InstancedMesh(new T.BoxGeometry(.22, 1.0, 2.2), wood, 18);
    const seats = new T.InstancedMesh(new T.BoxGeometry(.7, .42, 2.0), cushion, 18);
    const tabs = new T.InstancedMesh(new T.BoxGeometry(.8, .07, 1.3), wood, 18);
    let k = 0;
    rows.forEach(([ye, h]) => cols.forEach(X => {
      backs.setMatrixAt(k, M4.makeTranslation(wx(ye - .3), h + .5, wz(X)));
      seats.setMatrixAt(k, M4.makeTranslation(wx(ye - .78), h + .21, wz(X)));
      tabs.setMatrixAt(k, M4.makeTranslation(wx(ye - 1.8), h + .72, wz(X))); k++;
    }));
    [backs, seats, tabs].forEach(m => { m.castShadow = true; m.receiveShadow = true; L2.add(m); });
    // 回廊与看台栏杆
    const rail = (X0, X1, Y0, Y1, h) => L2.add(box(X0, X1, Y0, Y1, h + .95, h + 1.05, steel), box(X0, X1, Y0, Y1, h, h + .95, tm('#1d1d20', { opacity: .28 })));
    rail(4.46, 13.9, 36.15, 36.25, 3.6); rail(17.6, 27.05, 36.15, 36.25, 3.6);
    rail(9.95, 10.05, 13.4, 35.0, 3.52); rail(23.65, 23.75, 22.6, 32.7, 3.52); rail(11.15, 11.25, .5, 13.4, 3.52);
    // 一层：6 个明档档口（半透明体块 + 吧台 + 朝向大厅的灯箱招牌）
    const stallM = new T.MeshStandardMaterial({ color: '#e8622c', transparent: true, opacity: .2, emissive: '#e8622c', emissiveIntensity: .35, depthWrite: false });
    const counterM = std('#4a2e1c', { roughness: .6 });
    [['面食', 1.94, 6.33], ['酒水 · 咖啡', 6.92, 12.6], ['中餐 · 融合', 15.9, 22.6], ['酒水 · 咖啡', 22.6, 28.4], ['中餐 · 融合', 30.6, 35.4], ['西点 · 面点', 36.0, 40.8]].forEach(([name, y0, y1]) => {
      const vol = box(4.96, 9.3, y0 + .15, y1 - .15, 0.05, 3.2, stallM); vol.castShadow = false; inner.add(vol);
      const ve = new T.LineSegments(new T.EdgesGeometry(vol.geometry), new T.LineBasicMaterial({ color: '#ff9a5c', transparent: true, opacity: .7 }));
      ve.position.copy(vol.position); inner.add(ve);
      inner.add(box(9.3, 9.95, y0 + .3, y1 - .3, 0, 1.05, counterM));
      const st2 = canvasTex(512, 128, (c, w, h) => {
        c.fillStyle = '#1a120d'; c.fillRect(0, 0, w, h);
        c.font = `800 74px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = '#ffb46a'; c.shadowBlur = 22; c.fillStyle = '#fff1dc'; c.fillText(name, w / 2, h / 2 + 4);
      });
      const sg = mesh(new T.PlaneGeometry(Math.min(4.2, y1 - y0 - .9), 1.0), new T.MeshBasicMaterial({ map: st2, toneMapped: false }), false);
      sg.rotation.y = Math.PI; sg.position.copy(V(9.98, (y0 + y1) / 2, 2.7)); inner.add(sg);
    });
    // 舞台：三角钢琴 + 追光
    const black = std('#0c0c0e', { roughness: .25, metalness: .4 });
    inner.add(box(17.3, 19.2, 2.3, 3.9, 1.55, 1.9, black));
    const lid = box(17.3, 19.2, 2.3, 3.9, 1.9, 1.96, black); lid.rotation.z = .5; lid.position.y += .45; lid.position.x -= .25; inner.add(lid);
    [17.5, 19.0].forEach(X => inner.add(box(X, X + .12, 2.5, 2.62, .9, 1.55, black), box(X, X + .12, 3.6, 3.72, .9, 1.55, black)));
    G.cones = [14.2, 18.25, 22.3].map((X, i) => {
      const c = mesh(new T.ConeGeometry(2.3, 9.6, 28, 1, true), new T.MeshBasicMaterial({ color: ['#ff9de0', '#ffe2b0', '#9dc4ff'][i], transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), false);
      c.position.copy(V(X, 3.2, 5.7)); inner.add(c); return c;
    });
    // 观光电梯轿厢（上下运行）
    G.car = box(15.1, 16.4, 33.3, 34.6, 0, 2.3, new T.MeshStandardMaterial({ color: '#2a2018', emissive: '#ffb066', emissiveIntensity: .5 }));
    G.car.castShadow = false; inner.add(G.car);
    // 前厅：老放映机展台
    const exh = new T.Group(); exh.position.copy(V(15.4, 47.5, 0)); inner.add(exh);
    const pm = std('#3b3f45', { roughness: .4, metalness: .7 });
    const plat = mesh(new T.BoxGeometry(1.8, .3, 3.4), std('#6b4a30', { roughness: .6 })); plat.position.y = .15; exh.add(plat);
    [-.85, .85].forEach(z => {
      const body = mesh(new T.BoxGeometry(.75, .55, .4), pm); body.position.set(0, 1.55, z); exh.add(body);
      const leg = mesh(new T.CylinderGeometry(.05, .16, 1.0, 10), pm); leg.position.set(0, .8, z); exh.add(leg);
      [[-.2, 2.05], [.25, 2.0]].forEach(([x, y]) => { const r = mesh(new T.CylinderGeometry(.27, .27, .06, 22), pm); r.rotation.x = Math.PI / 2; r.position.set(x, y, z); exh.add(r); });
      const lens = mesh(new T.CylinderGeometry(.09, .11, .3, 14), pm); lens.rotation.z = Math.PI / 2; lens.position.set(-.5, 1.55, z); exh.add(lens);
    });
    const caseM = new T.MeshPhysicalMaterial({ color: '#e8f4f6', transparent: true, opacity: .14, roughness: .05 });
    const gc = mesh(new T.BoxGeometry(1.7, 2.3, 3.3), caseM, false); gc.position.y = 1.45; exh.add(gc);
    const gce = new T.LineSegments(new T.EdgesGeometry(gc.geometry), new T.LineBasicMaterial({ color: '#f1e7d6', transparent: true, opacity: .55 })); gce.position.copy(gc.position); exh.add(gce);
    // VR 区：发光体验圈
    G.rings = [[8.5, 51, 4.2], [20, 48.3, 1.7], [24.6, 52.6, 1.7], [18.6, 54.4, 1.7]].map(([X, Y, r]) => {
      const m = mesh(new T.RingGeometry(r * .86, r, 56), new T.MeshBasicMaterial({ color: '#7fe6ee', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), false);
      m.rotation.x = -Math.PI / 2; m.position.copy(V(X, Y, 3.6)); L2.add(m);
      const col = mesh(new T.CylinderGeometry(r * .93, r * .93, 3.2, 48, 1, true), new T.MeshBasicMaterial({ color: '#4ec3cf', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), false);
      col.position.copy(V(X, Y, 5.2)); L2.add(col);
      return { m, col };
    });
    // 室内暖光 + 光晕
    G.lamps = [[15.5, 28, 9], [15.5, 49, 6], [18, 6, 8]].map(p => { const l = new T.PointLight('#ffc48a', 0, 60, 1.6); l.position.copy(V(...p)); scene.add(l); return l; });
    const halo = canvasTex(256, 256, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const glowSp = (color, p, sx, sy) => { const s = new T.Sprite(new T.SpriteMaterial({ map: halo, color, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })); s.position.copy(V(...p)); s.scale.set(sx, sy, 1); scene.add(s); return s; };
    G.glowFacade = glowSp('#ff8a45', [15.55, 60.5, 7], 34, 20);
    G.glowStage = glowSp('#d04cff', [18.25, 3.5, 5], 26, 15);
    // 基地轮廓（建筑升起前）
    const fp = [[0, 44.43], [0, 58.2], [31.1, 58.2], [31.1, 44.43], [27.05, 44.43], [27.05, 0], [4.46, 0], [4.46, 20.5], [.32, 20.5], [.32, 44.43]];
    G.footM = new T.MeshBasicMaterial({ color: '#ff7a3a', transparent: true, opacity: 0, toneMapped: false });
    fp.forEach((a, i) => { const b = fp[(i + 1) % fp.length]; const m = box(Math.min(a[0], b[0]) - .2, Math.max(a[0], b[0]) + .2, Math.min(a[1], b[1]) - .2, Math.max(a[1], b[1]) + .2, 0, .25, G.footM); m.castShadow = false; scene.add(m); });
  }

  // ---------- 状态应用 ----------
  let needs = true;
  function apply() {
    G.shell.scale.y = Math.max(.001, st.rise);
    G.shell.visible = st.rise > .002;
    const op = 1 - st.xray * .94;
    xrayMats.forEach(m => {
      const tr = op < .999;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = op; m.depthWrite = op > .5;
    });
    const ec = new T.Color('#2b2622').lerp(new T.Color('#e8dcc8'), st.xray);
    edgeMats.forEach(m => { m.color.copy(ec); m.opacity = .5 - st.xray * .08; });
    roofEdgeMats.forEach(m => { m.color.copy(ec); m.opacity = .5 * (1 - st.roof); });
    G.roof.position.y = st.roof * 22;
    G.roof.children.forEach(r => { if (r.material.opacity !== undefined && r.isMesh) r.material.opacity = Math.min(op, 1 - st.roof); });
    G.roof.visible = st.roof < .98;
    G.signs.forEach(s => s.material.opacity = 1 - st.xray * .85);
    G.innerAll.visible = st.xray > .02;
    G.L2.position.y = st.explode * 8;
    const l2op = 1 - st.l2dim * .72;
    G.l2pieces.forEach((p, i) => {
      const dim = i === 0 ? 0 : st.vr * .65;
      p.top.material.opacity = l2op * (1 - dim); p.side.material.opacity = l2op * (1 - dim);
    });
    G.vrBox.material.opacity = st.vr * .22; G.vrEdge.material.opacity = st.vr * .9;
    const n = Math.floor(st.flow * G.flowCount / 3) * 3;
    G.flow.geometry.setDrawRange(0, n);
    G.flowHead.visible = st.flow > .01 && st.flow < .999;
    if (G.flowHead.visible) G.flowHead.position.copy(G.flowCurve.getPointAt(Math.min(1, st.flow)));
    const bg = new T.Color('#121418').lerp(new T.Color('#0d0b0a'), st.xray);
    scene.background.copy(bg); scene.fog.color.copy(bg);
    // 精模部分
    const tt = performance.now() / 1000;
    G.dimMats.forEach(m => { m.opacity = (m.userData.base || (m.userData.base = m.opacity)) * l2op * (1 - st.vr * .5); });
    G.lamps.forEach((l, i) => { l.intensity = st.xray * [520, 320, 200][i]; });
    G.cones.forEach((c, i) => { c.material.opacity = st.xray * (.09 + .03 * Math.sin(tt * 1.3 + i * 2)); c.rotation.z = Math.sin(tt * .5 + i) * .12; });
    G.car.position.y = 1.15 + (Math.sin(tt * .45) * .5 + .5) * (3.55 + st.explode * 5);
    G.rings.forEach((r, i) => {
      const p = Math.sin(tt * 1.6 + i * 1.3) * .5 + .5;
      r.m.material.opacity = st.vr * (.55 + .4 * p); r.col.material.opacity = st.vr * (.05 + .06 * p);
    });
    G.glowFacade.material.opacity = .42 * st.rise * (1 - st.xray * .75);
    G.glowStage.material.opacity = .4 * st.xray;
    G.footM.opacity = Math.max(0, 1 - st.rise * 1.6);
  }

  // ---------- 镜头 ----------
  const P = (X, Y, h) => [X, Y, h];
  const TEAL = '#4e9ba3';
  // shift：画面水平偏移（px，正值 = 建筑往右挪，给左侧文字让位）
  const EXT = { rise: 1, xray: 0, roof: 0, explode: 0, flow: 0, vr: 0, l2dim: 0 };
  const ANAT = [{ t: '门厅', s: '东 · 两层', p: P(15.5, 51, 13) }, { t: '观众厅', s: '中 · 宽 22.6m', p: P(15.5, 30, 18) }, { t: '舞台', s: '西 · 镜框式台口', p: P(15.5, 8.6, 21) }];
  const SHOTS = {
    site: { cam: [150, 170, 190], tgt: [0, 0, 0], shift: -110, st: Object.assign({}, EXT, { rise: .001 }), labels: [] },
    rise: { cam: [92, 46, 92], tgt: [-3, 5, 0], shift: -110, st: EXT, labels: [] },
    anatomy: { cam: [96, 56, 96], tgt: [-4, 5, 0], shift: -120, st: EXT, labels: ANAT },
    orbit: { cam: [96, 56, 96], tgt: [-4, 5, 0], shift: -120, orbit: true, st: EXT, labels: ANAT },
    xray: { cam: [78, 92, 104], tgt: [-2, 4, 0], shift: 120, st: Object.assign({}, EXT, { xray: 1, roof: 1, explode: 1 }),
      labels: [{ t: '二层', s: '看台餐饮 · VR 娱乐', p: P(31, 52, 13), c: TEAL }, { t: '一层', s: '美食大厅 · 档口 · 舞台', p: P(0, 26, 1) }] },
    flow: { cam: [52, 118, 82], tgt: [0, 0, 3], shift: 130, st: Object.assign({}, EXT, { xray: 1, roof: 1, explode: 1, flow: 1, l2dim: 1 }),
      labels: [{ t: '前室', s: '入口', p: P(19.5, 57, 1) }, { t: '前厅', p: P(16, 50, 1) }, { t: '书吧', p: P(28, 51, 1) }, { t: '美食大厅', s: '204座', p: P(20, 26, 1) }, { t: '档口', s: '6个', p: P(7.5, 30, 1) }, { t: '综艺舞台', s: '巨幕', p: P(18, 3, 1.5) }] },
    vr: { cam: [92, 56, 74], tgt: [16, 6, 0], shift: 150, orbit: true, orbitAmp: .35, st: Object.assign({}, EXT, { xray: 1, roof: 1, explode: 1, vr: 1 }),
      labels: [{ t: 'VR 娱乐区', s: '约430㎡', p: P(4, 56, 18), c: TEAL }, { t: '二层看台', s: '18组卡座', p: P(27, 38, 13.5) }] },
  };

  function setLabels(list, instant) {
    if (!labelBox) return;
    labelBox.innerHTML = '';
    curLabels = list.map(l => {
      const e = document.createElement('div'); e.className = 'label3d';
      e.style.setProperty('--c', l.c || '#e8622c');
      e.innerHTML = `<b>${l.t}</b>${l.s || ''}`;
      labelBox.appendChild(e);
      if (!instant) gsap.fromTo(e, { opacity: 0 }, { opacity: 1, duration: .8, delay: .2 });
      return { e, v: V(...l.p), l2: l.p[2] > 3 && l.p[0] !== undefined };
    });
    placeLabels();
  }
  function placeLabels() {
    curLabels.forEach(o => {
      const v = o.v.clone();
      if (o.v.y > 3 && curShot !== 'rise') v.y += 0;
      v.project(camera);
      o.e.style.left = ((v.x + 1) / 2 * W) + 'px';
      o.e.style.top = ((1 - v.y) / 2 * H) + 'px';
      o.e.style.display = v.z < 1 ? 'block' : 'none';
    });
  }

  const flyO = { t: 0 };
  // 动线穿行：镜头跟随光点，从入口飞到舞台
  function fly() {
    curShot = 'fly';
    if (orbitTw) { orbitTw.kill(); orbitTw = null; }
    gsap.killTweensOf([camPos, camTgt, st, view, flyO]);
    setLabels([], true);
    const c = G.flowCurve;
    const at = t => {
      const h = c.getPointAt(t), a = c.getPointAt(Math.min(1, t + .12));
      return { pos: new T.Vector3(h.x + 23 + 2 * t * t, 12.5 - 4.5 * t, (h.z - 6) * (1 - t * t) + wz(13.5) * t * t), tgt: new T.Vector3(a.x - 4, 1 + 3.5 * t, a.z * (1 - t) + wz(17.5) * t) };
    };
    const s0 = at(0);
    flyO.t = 0;
    gsap.to(st, { rise: 1, xray: 1, roof: 1, explode: 1, vr: 0, l2dim: 1, flow: 0, duration: 1.4, ease: 'power2.inOut' });
    gsap.to(view, { shift: 0, fov: 46, duration: 1.6, ease: 'power2.inOut' });
    gsap.to(camPos, { x: s0.pos.x, y: s0.pos.y, z: s0.pos.z, duration: 1.8, ease: 'power2.inOut' });
    gsap.to(camTgt, { x: s0.tgt.x, y: s0.tgt.y, z: s0.tgt.z, duration: 1.8, ease: 'power2.inOut' });
    gsap.to(flyO, { t: 1, duration: 8, delay: 1.7, ease: 'sine.inOut',
      onUpdate: () => { const k = at(flyO.t); camPos.copy(k.pos); camTgt.copy(k.tgt); st.flow = flyO.t; },
      onComplete: () => setLabels([{ t: '综艺舞台', s: '超清巨幕', p: [18.25, 3, 9.6] }, { t: '面食档口', p: [7.5, 4.2, 3.6] }]) });
  }

  function shot(name, instant) {
    if (name === 'fly' && !instant) return fly();
    const s = SHOTS[name]; if (!s) return;
    curShot = name;
    if (orbitTw) { orbitTw.kill(); orbitTw = null; }
    gsap.killTweensOf([camPos, camTgt, st, view, flyO]);
    const d = instant ? 0 : 3.2;
    const [cx, cy, cz] = s.cam, [tx, ty, tz] = s.tgt;
    if (instant) { camPos.set(cx, cy, cz); camTgt.set(tx, ty, tz); view.shift = s.shift || 0; view.fov = 32; Object.assign(st, s.st); apply(); needs = true; setLabels(s.labels, true); return; }
    setLabels([], true);
    gsap.to(view, { shift: s.shift || 0, fov: 32, duration: d, ease: 'power2.inOut' });
    gsap.to(camPos, { x: cx, y: cy, z: cz, duration: d, ease: 'power2.inOut' });
    gsap.to(camTgt, { x: tx, y: ty, z: tz, duration: d, ease: 'power2.inOut' });
    const order = Object.assign({}, s.st);
    gsap.to(st, Object.assign(order, { duration: name === 'rise' ? 3.6 : d, ease: name === 'rise' ? 'expo.out' : 'power2.inOut', onUpdate: () => { needs = true; },
      onComplete: () => {
        setLabels(s.labels);
        if (s.orbit) {
          const r = Math.hypot(cx - tx, cz - tz), a0 = Math.atan2(cz - tz, cx - tx), o = { a: a0 };
          orbitTw = gsap.to(o, { a: a0 + (s.orbitAmp || .9), duration: 26, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: () => { camPos.x = tx + Math.cos(o.a) * r; camPos.z = tz + Math.sin(o.a) * r; } });
        }
      } }));
    if (name === 'flow') { st.flow = 0; gsap.fromTo(st, { flow: 0 }, { flow: 1, duration: 6, delay: 1.2, ease: 'power1.inOut' }); }
  }

  function resize() {
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(2.5, (window.devicePixelRatio || 1) * scale));
    renderer.setSize(W, H, false);
  }
  function loop() {
    requestAnimationFrame(loop);
    if (!active) return;
    apply();
    aim();
    renderer.render(scene, camera);
    placeLabels();
  }
  function aim() {
    camera.position.copy(camPos); camera.lookAt(camTgt);
    camera.fov = view.fov;
    camera.aspect = W / H; camera.setViewOffset(W, H, -view.shift, 0, W, H);
    camera.updateMatrixWorld();
  }

  window.S3D = {
    init() {
      if (renderer) return;
      renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      labelBox = document.createElement('div'); labelBox.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      build(); resize(); apply(); loop();
    },
    attach(h) { if (!renderer) this.init(); host = h; h.appendChild(renderer.domElement); h.appendChild(labelBox); active = true; resize(); },
    detach() { active = false; },
    shot,
    setScale(s, w) { scale = s; if (w) W = w; resize(); },
    async still(name) {
      if (!renderer) this.init();
      const s = SHOTS[name];
      camPos.set(...s.cam); camTgt.set(...s.tgt); view.shift = s.shift || 0; view.fov = 32; Object.assign(st, s.st);
      if (name === 'flow') st.flow = 1;
      await new Promise(r => setTimeout(r, 400));
      apply(); renderer.setPixelRatio(2); renderer.setSize(W, H, false);
      aim();
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/jpeg', .92);
      curShot = name;
      return url;
    },
    labelsInto(h, name) {
      const box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      h.appendChild(box);
      const s = SHOTS[name];
      camPos.set(...s.cam); camTgt.set(...s.tgt); view.shift = s.shift || 0; view.fov = 32; aim();
      s.labels.forEach(l => {
        const v = V(...l.p); v.project(camera);
        const e = document.createElement('div'); e.className = 'label3d'; e.style.setProperty('--c', l.c || '#e8622c');
        e.innerHTML = `<b>${l.t}</b>${l.s || ''}`; e.style.left = ((v.x + 1) / 2 * W) + 'px'; e.style.top = ((1 - v.y) / 2 * H) + 'px';
        box.appendChild(e);
      });
    },
  };
})();
