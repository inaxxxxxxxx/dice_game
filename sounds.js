/*
  sounds.js
  Web Audio API による効果音合成。外部ファイル不要。
*/

window.Sound = (function(){
  let actx = null;
  let active = [];
  let bubbleTimer = null;

  function getCtx(){
    if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    return actx;
  }

  // AudioContext を unlock してからコールバック実行
  function withCtx(fn){
    const c = getCtx();
    if(c.state === 'suspended'){
      c.resume().then(fn);
    } else {
      fn();
    }
  }

  // ホワイトノイズバッファ（2秒、ループ用）
  function noise(c){
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function stop(){
    clearTimeout(bubbleTimer);
    active.forEach(n => { try { n.stop(0); } catch(e){} });
    active = [];
  }

  // ============================================================
  // 雨  ザーザー＋遠雷ゴロゴロ
  // ============================================================
  function startRain(){
    stop();
    withCtx(function(){
      const c = getCtx();

      const rain = noise(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
      const g1 = c.createGain(); g1.gain.value = 0.28;
      rain.connect(bp); bp.connect(g1); g1.connect(c.destination);
      rain.start();
      active.push(rain);

      const rumble = noise(c);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 300;
      const g2 = c.createGain(); g2.gain.value = 0.12;
      rumble.connect(lp); lp.connect(g2); g2.connect(c.destination);
      rumble.start();
      active.push(rumble);
    });
  }

  // ============================================================
  // 炎  ボーボー＋パチパチ
  // ============================================================
  function startFlame(){
    stop();
    withCtx(function(){
      const c = getCtx();

      const fire = noise(c);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 280;
      const lfo = c.createOscillator();
      const lfoG = c.createGain();
      lfo.frequency.value = 4; lfoG.gain.value = 0.08;
      const masterG = c.createGain(); masterG.gain.value = 0.28;
      lfo.connect(lfoG); lfoG.connect(masterG.gain);
      fire.connect(lp); lp.connect(masterG); masterG.connect(c.destination);
      fire.start(); lfo.start();
      active.push(fire, lfo);

      const crackle = noise(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
      const gc = c.createGain(); gc.gain.value = 0.08;
      crackle.connect(bp); bp.connect(gc); gc.connect(c.destination);
      crackle.start();
      active.push(crackle);
    });
  }

  // ============================================================
  // 泡  ゴボゴボ（周波数が上→下に落ちるポコポコを連続）
  // ============================================================
  function startBubble(){
    stop();
    withCtx(function(){
      const c = getCtx();

      // 水中ベース
      const base = noise(c);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 450;
      const gb = c.createGain(); gb.gain.value = 0.06;
      base.connect(lp); lp.connect(gb); gb.connect(c.destination);
      base.start();
      active.push(base);

      // ゴボゴボ: 高→低へ落ちるサイン波ポップ
      function pop(){
        if(active.length === 0) return;
        const osc = c.createOscillator();
        const g   = c.createGain();
        const now = c.currentTime;
        const f0  = 300 + Math.random() * 250;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0, now);
        osc.frequency.exponentialRampToValueAtTime(55 + Math.random() * 30, now + 0.22);
        g.gain.setValueAtTime(0.30, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g); g.connect(c.destination);
        osc.start(now); osc.stop(now + 0.25);
        bubbleTimer = setTimeout(pop, 80 + Math.random() * 280);
      }
      pop();
    });
  }

  // ============================================================
  // 魚群  水中ゴーッ＋ヒュルヒュル
  // ============================================================
  function startFish(){
    stop();
    withCtx(function(){
      const c = getCtx();

      const water = noise(c);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700;
      const gw = c.createGain(); gw.gain.value = 0.14;
      water.connect(lp); lp.connect(gw); gw.connect(c.destination);
      water.start();
      active.push(water);

      const swish = noise(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 2;
      const gs = c.createGain(); gs.gain.value = 0.06;
      swish.connect(bp); bp.connect(gs); gs.connect(c.destination);
      swish.start();
      active.push(swish);
    });
  }

  return { flame: startFlame, rain: startRain, bubble: startBubble, fish: startFish, stop };
})();
