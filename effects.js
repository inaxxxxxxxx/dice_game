/*
  effects.js  v2
  サイコロを振るを押下 → エフェクト開始 → 約0.6秒後にサイコロが飛ぶ
  炎（枠全体）・雨雷・泡・魚群 をランダム選択
*/

(function(){
  const canvas = document.getElementById('effect-canvas');
  const ctx    = canvas.getContext('2d');
  let animId = null;
  let effectState = {};
  let currentEffect = null;
  let lastTime = 0;

  function W(){ return canvas.width; }
  function H(){ return canvas.height; }

  function resize(){
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ============================================================
  // FLAME  ──  枠全体を囲む炎
  // ============================================================
  function makeEdgeTongues(n){
    return Array.from({length: n}, () => ({
      phase:      Math.random() * Math.PI * 2,
      spd:        0.7 + Math.random() * 0.7,
      hMult:      0.7 + Math.random() * 0.6,
      lean:       (Math.random() - 0.5) * 2,
    }));
  }

  function initFlame(){
    return {
      time: 0,
      bottom: makeEdgeTongues(16),
      top:    makeEdgeTongues(16),
      left:   makeEdgeTongues(22),
      right:  makeEdgeTongues(22),
    };
  }
  function updateFlame(s, dt){ s.time += dt; }

  // edgeLen に沿って横向きに炎を描く（y=0 が根元、y 負方向が内側）
  function drawHorzFlames(tongues, edgeLen, t){
    tongues.forEach((tg, i) => {
      const bx    = edgeLen * (i + 0.5) / tongues.length;
      const ph    = t * 4 * tg.spd + tg.phase;
      const h     = (62 + 38 * Math.sin(ph)) * tg.hMult;
      const w     = 46 + 14 * Math.cos(ph * 0.7);
      const lean  = tg.lean * 20 * Math.sin(ph * 0.55);

      // outer flame
      ctx.beginPath();
      ctx.moveTo(bx - w/2, 0);
      ctx.bezierCurveTo(bx - w/2, -h*0.3, bx+lean-w*0.22, -h*0.62, bx+lean, -h);
      ctx.bezierCurveTo(bx+lean+w*0.22, -h*0.62, bx+w/2, -h*0.3, bx+w/2, 0);
      ctx.closePath();
      const g1 = ctx.createLinearGradient(bx, 0, bx, -h);
      g1.addColorStop(0,   'rgba(255,170,0,1)');
      g1.addColorStop(0.45,'rgba(255,80,0,0.9)');
      g1.addColorStop(1,   'rgba(200,15,0,0.5)');
      ctx.fillStyle = g1;
      ctx.fill();

      // inner flame
      const ih = h * 0.65, iw = w * 0.48, il = lean * 0.65;
      ctx.beginPath();
      ctx.moveTo(bx - iw/2, 0);
      ctx.bezierCurveTo(bx-iw/2, -ih*0.3, bx+il-iw*0.2, -ih*0.62, bx+il, -ih);
      ctx.bezierCurveTo(bx+il+iw*0.2, -ih*0.62, bx+iw/2, -ih*0.3, bx+iw/2, 0);
      ctx.closePath();
      const g2 = ctx.createLinearGradient(bx, 0, bx, -ih);
      g2.addColorStop(0,   'rgba(255,230,0,1)');
      g2.addColorStop(0.5, 'rgba(255,140,0,0.95)');
      g2.addColorStop(1,   'rgba(255,50,0,0.7)');
      ctx.fillStyle = g2;
      ctx.fill();
    });
  }

  function drawFlame(s){
    ctx.clearRect(0, 0, W(), H());
    const t = s.time;

    // Bottom（上向き）
    ctx.save(); ctx.translate(0, H());
    drawHorzFlames(s.bottom, W(), t); ctx.restore();

    // Top（下向き）
    ctx.save(); ctx.translate(W(), 0); ctx.rotate(Math.PI);
    drawHorzFlames(s.top, W(), t); ctx.restore();

    // Left（右向き）
    ctx.save(); ctx.translate(0, H()); ctx.rotate(-Math.PI/2);
    drawHorzFlames(s.left, H(), t); ctx.restore();

    // Right（左向き）
    ctx.save(); ctx.translate(W(), 0); ctx.rotate(Math.PI/2);
    drawHorzFlames(s.right, H(), t); ctx.restore();
  }

  // ============================================================
  // RAIN + LIGHTNING
  // ============================================================
  function initRain(){
    const drops = Array.from({length: 140}, () => newDrop(true));
    return { drops, bolts: [], boltTimer: 0, nextBolt: 0.8 + Math.random()*1.5 };
  }

  function newDrop(init){
    return {
      x:   Math.random() * (W() + 200) - 100,
      y:   init ? Math.random() * H() : -20,
      vy:  480 + Math.random() * 240,
      len: 16 + Math.random() * 24,
    };
  }

  function newBolt(){
    // ⚡ 型の折れ線
    const pts = [];
    let x = W() * (0.15 + Math.random() * 0.7), y = 0;
    pts.push({x, y});
    while(y < H() * 0.75){
      x += (Math.random() - 0.5) * 130;
      y += 40 + Math.random() * 65;
      pts.push({x, y});
    }
    return { pts, alpha: 1.0 };
  }

  function updateRain(s, dt){
    s.drops.forEach(d => {
      d.y += d.vy * dt;
      d.x -= d.vy * 0.22 * dt;
      if(d.y > H() + 20) Object.assign(d, newDrop(false));
    });
    s.boltTimer += dt;
    if(s.boltTimer > s.nextBolt){
      s.boltTimer = 0; s.nextBolt = 1.0 + Math.random() * 2;
      s.bolts.push(newBolt());
    }
    s.bolts.forEach(b => { b.alpha -= dt * 3.5; });
    s.bolts = s.bolts.filter(b => b.alpha > 0);
  }

  function drawRain(s){
    ctx.clearRect(0, 0, W(), H());
    // rain
    ctx.save();
    ctx.strokeStyle = 'rgba(160,210,255,0.55)';
    ctx.lineWidth = 1.2;
    s.drops.forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len*0.22, d.y - d.len);
      ctx.stroke();
    });
    ctx.restore();
    // lightning bolts（黄色の ⚡ 形）
    s.bolts.forEach(b => {
      ctx.save();
      ctx.globalAlpha = b.alpha;
      ctx.strokeStyle = 'rgba(255,210,0,1)';
      ctx.lineWidth   = 3.5;
      ctx.shadowColor = 'rgba(255,200,0,0.9)';
      ctx.shadowBlur  = 14;
      ctx.beginPath();
      b.pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      // thin bright core
      ctx.strokeStyle = 'rgba(255,255,180,0.9)';
      ctx.lineWidth   = 1.4;
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      b.pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    });
  }

  // ============================================================
  // BUBBLE
  // ============================================================
  function initBubble(){
    return { bubbles: Array.from({length: 28}, () => newBubble(true)), timer: 0 };
  }

  function newBubble(init){
    return {
      x:  Math.random() * W(),
      y:  init ? H() * 0.4 + Math.random() * H() * 0.6 : H() + 30,
      vy: -(55 + Math.random() * 95),
      r:  9 + Math.random() * 24,
    };
  }

  function updateBubble(s, dt){
    s.timer += dt;
    if(s.timer > 0.18){ s.timer = 0; s.bubbles.push(newBubble(false)); }
    s.bubbles.forEach(b => { b.y += b.vy * dt; });
    s.bubbles = s.bubbles.filter(b => b.y + b.r > -60);
  }

  function drawBubble(s){
    ctx.clearRect(0, 0, W(), H());
    s.bubbles.forEach(b => {
      ctx.save();
      // outer ring
      ctx.globalAlpha = 0.48;
      ctx.strokeStyle = 'rgba(120,200,255,0.85)';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.stroke();
      // semi-transparent fill
      const g = ctx.createRadialGradient(b.x - b.r*0.25, b.y - b.r*0.25, b.r*0.05, b.x, b.y, b.r);
      g.addColorStop(0,   'rgba(210,240,255,0.25)');
      g.addColorStop(0.7, 'rgba(140,210,255,0.12)');
      g.addColorStop(1,   'rgba(80,170,240,0.05)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
      // highlight
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(240,250,255,0.8)';
      ctx.beginPath(); ctx.arc(b.x - b.r*0.3, b.y - b.r*0.3, b.r*0.32, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }

  // ============================================================
  // FISH  ──  右→左、早い、3色バリエーション
  // ============================================================
  const FISH_COLORS = [
    { body: 'rgba(160,90,200,0.75)', fin: 'rgba(110,50,180,0.6)', eye: 'rgba(255,220,50,0.9)'  }, // 紫
    { body: 'rgba(230,80,160,0.75)', fin: 'rgba(190,40,130,0.6)', eye: 'rgba(255,240,80,0.9)'  }, // ピンク
    { body: 'rgba(240,170,20,0.80)', fin: 'rgba(200,120,10,0.65)',eye: 'rgba(80,30,120,0.9)'   }, // 黄
  ];

  function newFish(init){
    const color = FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)];
    return {
      x:     init ? Math.random() * W() : W() + 60,
      y:     Math.random() * H(),
      vx:    -(480 + Math.random() * 300),
      phase: Math.random() * Math.PI * 2,
      size:  14 + Math.random() * 18,
      color,
    };
  }

  function initFish(){
    return { fish: Array.from({length: 80}, () => newFish(true)) };
  }

  function updateFish(s, dt){
    s.fish.forEach(f => {
      f.x     += f.vx * dt;
      f.phase += dt * 5;
      f.y     += Math.sin(f.phase) * 18 * dt;
      if(f.x < -80) Object.assign(f, newFish(false));
    });
  }

  function drawFishShape(f, color){
    const sz = f.size;
    ctx.save();
    ctx.translate(f.x, f.y);

    // tail
    ctx.fillStyle = color.fin;
    ctx.beginPath();
    ctx.moveTo(sz * 0.85, 0);
    ctx.lineTo(sz * 1.65, -sz * 0.52);
    ctx.lineTo(sz * 1.65,  sz * 0.52);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = color.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, sz, sz * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    // dorsal fin
    ctx.fillStyle = color.fin;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.1, -sz * 0.44);
    ctx.quadraticCurveTo(-sz * 0.35, -sz * 0.82, sz * 0.3, -sz * 0.44);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = color.eye;
    ctx.beginPath();
    ctx.arc(-sz * 0.35, -sz * 0.1, sz * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,10,40,0.85)';
    ctx.beginPath();
    ctx.arc(-sz * 0.37, -sz * 0.1, sz * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFish(s){
    ctx.clearRect(0, 0, W(), H());
    s.fish.forEach(f => drawFishShape(f, f.color));
  }

  // ============================================================
  // dispatch
  // ============================================================
  const EFFECTS = ['flame', 'rain', 'bubble', 'fish'];

  function loop(){
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    if(currentEffect === 'flame')  { updateFlame(effectState, dt);  drawFlame(effectState); }
    if(currentEffect === 'rain')   { updateRain(effectState, dt);   drawRain(effectState); }
    if(currentEffect === 'bubble') { updateBubble(effectState, dt); drawBubble(effectState); }
    if(currentEffect === 'fish')   { updateFish(effectState, dt);   drawFish(effectState); }

    animId = requestAnimationFrame(loop);
  }

  function start(effectName){
    stop();
    currentEffect = effectName || EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
    if(currentEffect === 'flame')  effectState = initFlame();
    if(currentEffect === 'rain')   effectState = initRain();
    if(currentEffect === 'bubble') effectState = initBubble();
    if(currentEffect === 'fish')   effectState = initFish();
    lastTime = performance.now();
    loop();
    if(window.Sound) Sound[currentEffect]();
  }

  function stop(){
    if(animId){ cancelAnimationFrame(animId); animId = null; }
    ctx.clearRect(0, 0, W(), H());
    if(window.Sound) Sound.stop();
    currentEffect = null;
    effectState   = {};
  }

  // ============================================================
  // CONFETTI  ──  結果画面の勝者向け紙吹雪
  // ============================================================
  let confettiId = null;
  let confettiPieces = [];
  const CONFETTI_COLORS = ['#C4432E', '#B8862E', '#1C2B3A', '#3a7bd5', '#4fa8c5', '#E8D7D2'];

  function confetti(){
    stopConfetti();
    confettiPieces = Array.from({length: 140}, () => ({
      x:    Math.random() * W(),
      y:    -20 - Math.random() * H() * 0.5,
      w:    6 + Math.random() * 7,
      h:    8 + Math.random() * 8,
      vx:   (Math.random() - 0.5) * 80,
      vy:   120 + Math.random() * 180,
      rot:  Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 8,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 0,
    }));
    let last = performance.now();
    const dur = 2.8;
    function step(){
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, W(), H());
      let alive = false;
      confettiPieces.forEach(p => {
        p.life += dt;
        p.vy   += 60 * dt;
        p.x    += p.vx * dt;
        p.y    += p.vy * dt;
        p.rot  += p.vrot * dt;
        const fade = Math.max(0, 1 - Math.max(0, p.life - (dur - 0.8)) / 0.8);
        if(p.y < H() + 30 && fade > 0) alive = true;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      if(alive){ confettiId = requestAnimationFrame(step); }
      else { stopConfetti(); }
    }
    confettiId = requestAnimationFrame(step);
  }

  function stopConfetti(){
    if(confettiId){ cancelAnimationFrame(confettiId); confettiId = null; }
    confettiPieces = [];
    ctx.clearRect(0, 0, W(), H());
  }

  window.Effects = { start, stop, confetti, stopConfetti };
})();
