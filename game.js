/*
  game.js
  チンチロリン ゲームフロー制御 + 役判定ロジック
*/

(function(){

  // ============ 役判定 ============
  // 戻り値: { rank, label, eyesSum, isNoHand }
  // rank が大きいほど強い。
  // 強さの序列（伝統ルール）：
  //   アラシ（ゾロ目）＞ シゴロ（4-5-6）＞ 通常の目（2つ同じ＋1つ、数字の大小） ＞ 目なし ＞ ヒフミ（1-2-3、反則目で最弱・即負け）
  const HAND_RANK = {
    HIFUMI: 0,       // 1-2-3（反則目／ションベン。最弱で即負け扱い）
    NO_HAND: 1,      // 目なし（役なし、3つとも異なる目で順番系でもない）
    NORMAL: 2,       // 通常の目（2つ同じ＋1つ、合計値で勝負）
    SHIGORO: 3,      // シゴロ（4-5-6）
    ARASHI: 4,       // アラシ（同じ目3つ）
  };

  function judgeHand(diceValues){
    const sorted = [...diceValues].sort((a,b)=>a-b);
    const [a,b,c] = sorted;

    // アラシ（同じ目3つ）－ 最強。ゾロ目同士は数字が大きい方が勝ち
    if(a === b && b === c){
      return {
        rank: HAND_RANK.ARASHI,
        subValue: a,
        label: `アラシ（${a}・${b}・${c}）`,
        eyes: sorted,
        isNoHand: false,
      };
    }

    // シゴロ（4-5-6）
    if(a===4 && b===5 && c===6){
      return {
        rank: HAND_RANK.SHIGORO,
        subValue: 0,
        label: 'シゴロ',
        eyes: sorted,
        isNoHand: false,
      };
    }

    // ヒフミ（1-2-3）－ 反則目（ションベン）。最弱・即負け扱い
    if(a===1 && b===2 && c===3){
      return {
        rank: HAND_RANK.HIFUMI,
        subValue: 0,
        label: 'ヒフミ（反則目）',
        eyes: sorted,
        isNoHand: false,
      };
    }

    // 通常の目（2つ同じ＋1つ違う）→ 違う目の数字で勝負
    if(a===b || b===c || a===c){
      let pairVal, singleVal;
      if(a===b){ pairVal = a; singleVal = c; }
      else { pairVal = b; singleVal = a; }
      return {
        rank: HAND_RANK.NORMAL,
        subValue: singleVal,
        label: `目（${singleVal}）`,
        eyes: sorted,
        isNoHand: false,
      };
    }

    // 目なし（3つとも異なり、上記いずれにも該当しない）
    return {
      rank: HAND_RANK.NO_HAND,
      subValue: 0,
      label: '目なし',
      eyes: sorted,
      isNoHand: true,
    };
  }

  // 比較関数: 1が勝ち（強い）、-1が負け（弱い）、0が同等（再戦対象）
  function compareHands(h1, h2){
    if(h1.rank !== h2.rank) return h1.rank > h2.rank ? 1 : -1;
    if(h1.rank === HAND_RANK.NORMAL || h1.rank === HAND_RANK.ARASHI){
      if(h1.subValue !== h2.subValue) return h1.subValue > h2.subValue ? 1 : -1;
    }
    return 0;
  }

  // ============ ゲーム状態 ============
  const state = {
    playerCount: 3,
    loserCount: 1,
    players: [],       // { name }
    round: 1,
    isSuddenDeath: false,
    suddenDeathPool: [], // index list of players still contending
    activeIndices: [],   // indices participating in current round (for sudden death subset)
    currentTurn: 0,       // pointer within activeIndices
    attempts: 0,
    currentDice: [1,1,1],
    results: {},          // playerIndex -> { hand, eyes }
    decidedWinners: [],    // indices already confirmed safe (winners, not yet used but reserved)
    decidedLosers: [],     // indices already confirmed losers
    finalRecord: {},        // idx -> { hand, eyes } 確定済みプレイヤーの結果スナップショット
  };

  // ============ DOM参照 ============
  const screens = {};
  document.querySelectorAll('.screen').forEach(el=>{
    screens[el.dataset.screen] = el;
  });

  function showScreen(name){
    Object.values(screens).forEach(s=> s.hidden = true);
    screens[name].hidden = false;
  }

  // ============ Screen: Title ============
  document.getElementById('btn-start').addEventListener('click', ()=>{
    showScreen('playercount');
  });

  // ============ Screen: Player Count ============
  const pcValueEl = document.getElementById('pc-value');
  const pcMinus = document.getElementById('pc-minus');
  const pcPlus = document.getElementById('pc-plus');
  const PC_MIN = 2, PC_MAX = 6;

  function renderPC(){
    pcValueEl.textContent = state.playerCount;
    pcMinus.disabled = state.playerCount <= PC_MIN;
    pcPlus.disabled = state.playerCount >= PC_MAX;
  }
  pcMinus.addEventListener('click', ()=>{
    if(state.playerCount > PC_MIN){ state.playerCount--; renderPC(); }
  });
  pcPlus.addEventListener('click', ()=>{
    if(state.playerCount < PC_MAX){ state.playerCount++; renderPC(); }
  });
  document.getElementById('pc-back').addEventListener('click', ()=> showScreen('title'));
  document.getElementById('pc-next').addEventListener('click', ()=>{
    // 負け人数の上限を更新してから画面遷移
    const lcMax = state.playerCount - 1;
    if(state.loserCount > lcMax) state.loserCount = lcMax;
    renderLC();
    showScreen('losercount');
  });

  // ============ Screen: Loser Count ============
  const lcValueEl = document.getElementById('lc-value');
  const lcMinus = document.getElementById('lc-minus');
  const lcPlus = document.getElementById('lc-plus');
  const lcDesc = document.getElementById('lc-desc');

  function renderLC(){
    const max = state.playerCount - 1;
    lcValueEl.textContent = state.loserCount;
    lcMinus.disabled = state.loserCount <= 1;
    lcPlus.disabled = state.loserCount >= max;
    lcDesc.textContent = `${state.playerCount}人中、出目が弱い方から${state.loserCount}人の負けが決まります。`;
  }
  lcMinus.addEventListener('click', ()=>{
    if(state.loserCount > 1){ state.loserCount--; renderLC(); }
  });
  lcPlus.addEventListener('click', ()=>{
    const max = state.playerCount - 1;
    if(state.loserCount < max){ state.loserCount++; renderLC(); }
  });
  document.getElementById('lc-back').addEventListener('click', ()=> showScreen('playercount'));
  document.getElementById('lc-next').addEventListener('click', ()=>{
    beginNameEntry();
  });

  // ============ Screen: Name Entry ============
  let nameEntryIndex = 0;
  const nameInput = document.getElementById('name-input');
  const nameHint = document.getElementById('name-hint');
  const namesStepLabel = document.getElementById('names-step-label');

  function beginNameEntry(){
    state.players = [];
    nameEntryIndex = 0;
    showNameEntryScreen();
  }

  function showNameEntryScreen(){
    namesStepLabel.textContent = `プレイヤー登録 ・ ${nameEntryIndex+1}人目 / ${state.playerCount}人`;
    nameInput.value = '';
    nameHint.textContent = '\u00a0';
    showScreen('names');
    setTimeout(()=> nameInput.focus(), 50);
  }

  function commitName(){
    const raw = nameInput.value.trim();
    if(!raw){
      nameHint.textContent = '名前を入力してください';
      return;
    }
    state.players.push({ name: raw });
    nameEntryIndex++;
    if(nameEntryIndex < state.playerCount){
      showNameEntryScreen();
    } else {
      startGame();
    }
  }
  document.getElementById('name-next').addEventListener('click', commitName);
  nameInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter') commitName();
  });

  // ============ ゲーム開始（ラウンド管理） ============
  function startGame(){
    state.round = 1;
    state.isSuddenDeath = false;
    state.results = {};
    state.decidedWinners = [];
    state.decidedLosers = [];
    state.finalRecord = {}; // idx -> { hand, eyes } 確定時点のスナップショット
    state.activeIndices = state.players.map((_, i)=> i);
    beginRound();
  }

  function beginRound(){
    state.results = {};
    state.currentTurn = 0;
    goToHandoff();
  }

  // ============ Screen: Hand-off ============
  const handoffRoundLabel = document.getElementById('handoff-round-label');
  const handoffNameEl = document.getElementById('handoff-name');

  function goToHandoff(){
    if(state.currentTurn >= state.activeIndices.length){
      finishRound();
      return;
    }
    const playerIdx = state.activeIndices[state.currentTurn];
    const player = state.players[playerIdx];
    handoffRoundLabel.textContent = state.isSuddenDeath
      ? `サドンデス ・ ${state.currentTurn+1}人目 / ${state.activeIndices.length}人`
      : `第${state.round}ラウンド ・ ${state.currentTurn+1}人目 / ${state.activeIndices.length}人`;
    handoffNameEl.textContent = player.name;
    showScreen('handoff');
  }
  document.getElementById('handoff-ready').addEventListener('click', ()=>{
    beginRollForCurrentPlayer();
  });

  // ============ Screen: Dice Roll ============
  const rollPlayerName = document.getElementById('roll-player-name');
  const rollAttemptEl = document.getElementById('roll-attempt');
  const rollResultEyes = document.getElementById('roll-result-eyes');
  const rollResultName = document.getElementById('roll-result-name');
  const btnThrow = document.getElementById('btn-throw');
  const btnRetry = document.getElementById('btn-retry');
  const btnConfirm = document.getElementById('btn-confirm');

  let diceInitialized = false;
  let currentHand = null;

  function beginRollForCurrentPlayer(){
    const playerIdx = state.activeIndices[state.currentTurn];
    const player = state.players[playerIdx];

    state.attempts = 0;
    currentHand = null;

    rollPlayerName.textContent = player.name;
    rollAttemptEl.textContent = `1投目 / 3投まで`;
    rollResultEyes.textContent = '\u00a0';
    rollResultName.textContent = '\u00a0';
    btnThrow.hidden = false;
    btnRetry.hidden = true;
    btnConfirm.hidden = true;
    btnThrow.disabled = false;

    showScreen('roll');

    requestAnimationFrame(()=>{
      if(!diceInitialized){
        Dice3D.init(document.getElementById('dice-canvas'));
        diceInitialized = true;
      } else {
        Dice3D.resetBodies();
        Dice3D.renderStatic();
      }
    });
  }

  Dice3D.onSettled = function(eyes){
    state.currentDice = eyes;
    currentHand = judgeHand(eyes);

    rollResultEyes.textContent = eyes.join(' － ');
    rollResultName.textContent = currentHand.label;

    btnThrow.hidden = true;

    const usedAttempts = state.attempts; // already incremented before throw
    const hasAttemptsLeft = usedAttempts < 3;

    if(currentHand.isNoHand && hasAttemptsLeft){
      // 目が出るまで振り直し可能（最大3投）
      btnRetry.hidden = false;
      btnConfirm.hidden = true;
    } else {
      // 役が出た、または3投使い切った（目なし確定）
      btnRetry.hidden = true;
      btnConfirm.hidden = false;
    }
  };

  btnThrow.addEventListener('click', ()=>{
    if(Dice3D.isAnimating()) return;
    state.attempts++;
    rollAttemptEl.textContent = `${state.attempts}投目 / 3投まで`;
    btnThrow.disabled = true;
    rollResultEyes.textContent = '\u00a0';
    rollResultName.textContent = '\u00a0';
    Dice3D.throwDice();
    setTimeout(()=>{ btnThrow.disabled = false; }, 50);
  });

  btnRetry.addEventListener('click', ()=>{
    state.attempts++;
    rollAttemptEl.textContent = `${state.attempts}投目 / 3投まで`;
    btnRetry.hidden = true;
    rollResultEyes.textContent = '\u00a0';
    rollResultName.textContent = '\u00a0';
    Dice3D.throwDice();
  });

  btnConfirm.addEventListener('click', ()=>{
    const playerIdx = state.activeIndices[state.currentTurn];
    state.results[playerIdx] = {
      hand: currentHand,
      eyes: state.currentDice.slice(),
    };
    state.currentTurn++;
    goToHandoff();
  });

  // ============ Screen: Round Summary ============
  const summaryLabel = document.getElementById('summary-label');
  const summaryTitle = document.getElementById('summary-title');
  const resultList = document.getElementById('result-list');

  function finishRound(){
    summaryLabel.textContent = state.isSuddenDeath
      ? `サドンデス結果`
      : `第${state.round}ラウンド結果`;

    renderResultList(resultList, state.activeIndices, false);

    showScreen('summary');
  }

  function renderResultList(container, indices, isFinal){
    container.innerHTML = '';
    const ranked = indices.map(idx=>{
      const r = state.results[idx];
      return { idx, player: state.players[idx], hand: r.hand, eyes: r.eyes };
    }).sort((a,b)=> compareHands(b.hand, a.hand));

    let bestRank = ranked.length ? ranked[0].hand : null;
    let worstRank = ranked.length ? ranked[ranked.length-1].hand : null;

    ranked.forEach((entry, i)=>{
      const row = document.createElement('div');
      row.className = 'result-row';
      const isBest = bestRank && compareHands(entry.hand, bestRank) === 0;
      const isWorst = worstRank && compareHands(entry.hand, worstRank) === 0 && !isBest;
      if(isBest) row.classList.add('is-best');
      if(isWorst) row.classList.add('is-worst');

      row.innerHTML = `
        <div class="result-row-left">
          <span class="result-rank">${i+1}</span>
          <div>
            <div class="result-name">${escapeHtml(entry.player.name)}</div>
          </div>
        </div>
        <div class="result-row-right">
          <div class="result-eyes">${entry.eyes.join(' ')}</div>
          <div class="result-hand">${entry.hand.label}</div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById('summary-next').addEventListener('click', ()=>{
    resolveOutcome();
  });

  // ============ 勝敗判定ロジック ============
  function resolveOutcome(){
    const indices = state.activeIndices;
    const ranked = indices.map(idx=>({ idx, hand: state.results[idx].hand }))
      .sort((a,b)=> compareHands(b.hand, a.hand));

    // ランクごとにグルーピング（同ランク＝同着）
    const groups = [];
    ranked.forEach(entry=>{
      const lastGroup = groups[groups.length-1];
      if(lastGroup && compareHands(lastGroup[0].hand, entry.hand) === 0){
        lastGroup.push(entry);
      } else {
        groups.push([entry]);
      }
    });

    // 確定済み負け人数を数える
    const neededLosers = state.loserCount;
    const alreadyDecidedLosers = state.decidedLosers.length;
    const remainingLoserSlots = neededLosers - alreadyDecidedLosers;

    // 下位グループから負け確定を試みる
    // groups は強い順なので、後ろ(弱い)から見る
    const reversedGroups = [...groups].reverse();
    let slotsLeft = remainingLoserSlots;
    const newlyDecidedLosers = [];
    const contendingForSuddenDeath = [];
    let suddenDeathTriggered = false;

    for(const group of reversedGroups){
      if(suddenDeathTriggered){
        // 競合が発生した時点より強いグループは全て安全（勝ち抜け確定）
        group.forEach(e=>{
          state.decidedWinners.push(e.idx);
          state.finalRecord[e.idx] = state.results[e.idx];
        });
        continue;
      }
      if(slotsLeft <= 0){
        // 負け確定人数に達した残りは「勝ち抜け」確定
        group.forEach(e=>{
          state.decidedWinners.push(e.idx);
          state.finalRecord[e.idx] = state.results[e.idx];
        });
        continue;
      }
      if(group.length <= slotsLeft){
        // このグループ全員が負け確定枠に収まる→確定
        group.forEach(e=>{
          newlyDecidedLosers.push(e.idx);
          state.finalRecord[e.idx] = state.results[e.idx];
        });
        slotsLeft -= group.length;
      } else {
        // グループ内で枠を奪い合う＝サドンデス対象。これより強いグループは全員勝ち抜け確定
        group.forEach(e=> contendingForSuddenDeath.push(e.idx));
        suddenDeathTriggered = true;
      }
    }

    state.decidedLosers = state.decidedLosers.concat(newlyDecidedLosers);

    // 負け枠を確定しきれず、競合者がいる場合 → サドンデス
    if(contendingForSuddenDeath.length > 0 && slotsLeft > 0){
      state.isSuddenDeath = true;
      state.round += 1;
      state.activeIndices = contendingForSuddenDeath;
      state.suddenDeathSlotsNeeded = slotsLeft;
      beginRound();
      return;
    }

    // それでも全員確定していない場合（同着で勝ち抜けも確定できない）→ 残りは勝ち抜け
    if(contendingForSuddenDeath.length > 0 && slotsLeft === 0){
      contendingForSuddenDeath.forEach(idx=>{
        state.decidedWinners.push(idx);
        state.finalRecord[idx] = state.results[idx];
      });
    }

    showFinalResult();
  }

  // ============ Screen: Final Result ============
  const finalResultList = document.getElementById('final-result-list');
  const finalTitle = document.getElementById('final-title');
  const finalEyebrow = document.getElementById('final-eyebrow');

  function showFinalResult(){
    finalEyebrow.textContent = '勝敗確定';
    finalTitle.textContent = '結果が出ました';

    finalResultList.innerHTML = '';

    const winners = [...state.decidedWinners].sort((a,b)=>
      compareHands(state.finalRecord[b].hand, state.finalRecord[a].hand)
    );
    const losers = [...state.decidedLosers].sort((a,b)=>
      compareHands(state.finalRecord[b].hand, state.finalRecord[a].hand)
    );

    const winnerSection = document.createElement('div');
    winnerSection.innerHTML = `<p class="tag-chip">勝ち抜け（${winners.length}人）</p>`;
    winners.forEach(idx=>{
      const player = state.players[idx];
      const lastResult = state.finalRecord[idx];
      const row = document.createElement('div');
      row.className = 'result-row is-best';
      row.innerHTML = `
        <div class="result-row-left">
          <div class="result-name">${escapeHtml(player.name)}</div>
        </div>
        <div class="result-row-right">
          <div class="result-eyes">${lastResult.eyes.join(' ')}</div>
          <div class="result-hand">${lastResult.hand.label}</div>
        </div>
      `;
      winnerSection.appendChild(row);
    });
    finalResultList.appendChild(winnerSection);

    const loserSection = document.createElement('div');
    loserSection.style.marginTop = '24px';
    loserSection.innerHTML = `<p class="tag-chip">負け（${losers.length}人）</p>`;
    losers.forEach(idx=>{
      const player = state.players[idx];
      const lastResult = state.finalRecord[idx];
      const row = document.createElement('div');
      row.className = 'result-row is-worst';
      row.innerHTML = `
        <div class="result-row-left">
          <div class="result-name">${escapeHtml(player.name)}</div>
        </div>
        <div class="result-row-right">
          <div class="result-eyes">${lastResult.eyes.join(' ')}</div>
          <div class="result-hand">${lastResult.hand.label}</div>
        </div>
      `;
      loserSection.appendChild(row);
    });
    finalResultList.appendChild(loserSection);

    showScreen('final');
  }

  document.getElementById('btn-restart').addEventListener('click', ()=>{
    state.round = 1;
    state.isSuddenDeath = false;
    state.players = [];
    state.results = {};
    state.decidedWinners = [];
    state.decidedLosers = [];
    state.finalRecord = {};
    showScreen('title');
  });

  // ============ 初期化 ============
  renderPC();
  renderLC();

})();
