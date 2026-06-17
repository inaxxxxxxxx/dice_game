/*
  sounds.js
  Web Audio API による効果音合成。外部ファイル不要。
  各エフェクトに対応した音をリアルタイム生成。
*/

const Sound = (function(){
  let actx = null;
  let active = [];
  let bubbleTimer = null;

  function ctx(){
    if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if(actx.state === 'suspended') actx.resume();
    return actx;
  }

  // ホワイトノイズバッファ（2秒、ループ用）
  function noise(){
    const c = ctx();
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
  // 雨  ザーザー＋雷のゴロゴロ
  // ============================================================
  function startRain(){
    stop();
    const c = ctx();

    // 雨音: ホワイトノイズ → バンドパス 3kHz
    const rain = noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
    const gRain = c.createGain(); gRain.gain.value = 0.20;
    rain.connect(bp); bp.connect(gRain); gRain.connect(c.destination);
    rain.start();
    active.push(rain);

    // 低音のゴロゴロ（遠雷）
    const rumble = noise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    const gRumble = c.createGain(); gRumble.gain.value = 0.08;
    rumble.connect(lp); lp.connect(gRumble); gRumble.connect(c.destination);
    rumble.start();
    active.push(rumble);
  }

  // ============================================================
  // 炎  ボーボー（低音ロアー＋パチパチ）
  // ============================================================
  function startFlame(){
    stop();
    const c = ctx();

    // ボーボー: ローパスノイズ
    const fire = noise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    // ゆっくり揺れる LFO で息吹き感
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 4; lfoG.gain.value = 0.07;
    const masterG = c.createGain(); masterG.gain.value = 0.22;
    lfo.connect(lfoG); lfoG.connect(masterG.gain);
    fire.connect(lp); lp.connect(masterG); masterG.connect(c.destination);
    fire.start(); lfo.start();
    active.push(fire, lfo);

    // パチパチ: バンドパスノイズ 1.5kHz
    const crackle = noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
    const gC = c.createGain(); gC.gain.value = 0.05;
    crackle.connect(bp); bp.connect(gC); gC.connect(c.destination);
    crackle.start();
    active.push(crackle);
  }

  // ============================================================
  // 泡  ゴボゴボ（水中ベース＋定期的なポコポコ）
  // ============================================================
  function startBubble(){
    stop();
    const c = ctx();

    // 水中ベース（非常に小さく）
    const base = noise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400;
    const gBase = c.createGain(); gBase.gain.value = 0.03;
    base.connect(lp); lp.connect(gBase); gBase.connect(c.destination);
    base.start();
    active.push(base);

    // ゴボゴボ: 周波数が上から下へ落ちる短い音を繰り返す
    function pop(){
      if(active.length === 0) return;
      const osc = c.createOscillator();
      const g   = c.createGain();
      const now = c.currentTime;
      const f0  = 280 + Math.random() * 220;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(55 + Math.random() * 30, now + 0.20);
      g.gain.setValueAtTime(0.20, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
      osc.connect(g); g.connect(c.destination);
      osc.start(now); osc.stop(now + 0.22);
      bubbleTimer = setTimeout(pop, 90 + Math.random() * 320);
    }
    pop();
  }

  // ============================================================
  // 魚群  水中ゴーッ＋ヒュルヒュル
  // ============================================================
  function startFish(){
    stop();
    const c = ctx();

    // 水中ゴーッ: ローパスノイズ
    const water = noise();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 650;
    const gW = c.createGain(); gW.gain.value = 0.10;
    water.connect(lp); lp.connect(gW); gW.connect(c.destination);
    water.start();
    active.push(water);

    // ヒュルヒュル: バンドパス 1kHz 小さめ
    const swish = noise();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 2;
    const gS = c.createGain(); gS.gain.value = 0.035;
    swish.connect(bp); bp.connect(gS); gS.connect(c.destination);
    swish.start();
    active.push(swish);
  }

  return {
    flame:  startFlame,
    rain:   startRain,
    bubble: startBubble,
    fish:   startFish,
    stop,
  };
})();
