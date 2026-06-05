/**
 * ゲームループ・全体統括
 * 読み込み順: events.js → state.js → hero.js → enemy.js → render.js → ws.js → main.js
 */

let canvas, ctx;

function init() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");
  canvas.width = CW;
  canvas.height = CH;

  // 最初の敵をスポーン
  state.enemy = spawnEnemy(state.floor);
  addBattleLog(`Floor ${state.floor}: ${state.enemy.nameJP} が現れた！`);
  addBattleLog("コメントで勇者を助けよう！");

  // 自動攻撃タイマー初期化
  const now = performance.now();
  state.nextHeroAttack = now + HERO_AUTO_INTERVAL;
  state.nextEnemyAttack = now + ENEMY_AUTO_INTERVAL;

  // セッション情報（リザルト集計用）
  state.sessionStart = now;
  state.startLevel = state.hero.level;

  // 入力（音アンロック・キーボード操作）
  _setupInput();

  // 開始ジングル
  sfx("gameStart");

  // WebSocket 接続
  wsInit(onWsEvent);

  // ゲームループ開始
  requestAnimationFrame(loop);
}

// ---- メインループ ----
function loop(now) {
  update(now);
  render(ctx, now);
  requestAnimationFrame(loop);
}

// ---- 更新ロジック ----
function update(now) {
  // シーンに応じた BGM 切替（リザルト中も鳴らすので早期returnより前）
  _updateBgmForScene();

  // リザルト表示中は戦闘を止める
  if (state.phase === "result") return;

  updateHeroBuffs(now);
  checkBossEvents();
  _rotateCta(now);

  // 勇者ダウン中: 戦闘停止しギフト蘇生を待つ。時間切れで保険復活。
  if (state.heroDown) {
    state.nextHeroAttack = now + HERO_AUTO_INTERVAL;
    state.nextEnemyAttack = now + ENEMY_AUTO_INTERVAL;
    if (now >= state.heroDown.until) _fallbackRevive();
    return;
  }

  // ボス登場の暗転演出中はオートバトルを一時停止（タイマーは止めず先送り）
  if (bossIntroActive(now)) {
    state.nextHeroAttack = now + HERO_AUTO_INTERVAL;
    state.nextEnemyAttack = now + ENEMY_AUTO_INTERVAL;
    return;
  }

  // 勇者の自動攻撃
  if (state.enemy && state.enemy.hp > 0 && now >= state.nextHeroAttack) {
    heroAttack(null);
    state.nextHeroAttack = now + HERO_AUTO_INTERVAL;
  }

  // 敵の自動攻撃
  if (state.enemy && state.enemy.hp > 0 && now >= state.nextEnemyAttack) {
    enemyAttack();
    state.nextEnemyAttack = now + ENEMY_AUTO_INTERVAL;
  }

  // 応援ゲージ上限チェック
  if (state.supportGauge >= state.supportGaugeMax) {
    _triggerSupportBurst();
  }
}

// ---- シーン別BGM切替 ----
// result → 勝利曲 / ボス戦 → 緊迫曲 / それ以外 → フィールド曲
function _updateBgmForScene() {
  if (!window.AudioEngine) return;
  let scene;
  if (state.phase === "result") {
    scene = "result";
  } else if (state.enemy && state.enemy.isBoss && state.enemy.hp > 0) {
    scene = "boss";
  } else {
    scene = "field";
  }
  if (scene !== state._bgmScene) {
    state._bgmScene = scene;
    AudioEngine.playBgm(scene);
  }
}

// ---- WebSocket イベントハンドラ ----
function onWsEvent(event) {
  if (event.type === "comment") {
    _handleComment(event.user, event.text);
  } else if (event.type === "gift") {
    _handleGiftEvent(event);
  }
}

function _handleComment(user, text) {
  const action = normalizeComment(text);

  // 応援ゲージを増やす（全コメント共通）
  const gaugeGain = action === "cheer" ? 1 : 3;
  state.supportGauge = Math.min(state.supportGaugeMax, state.supportGauge + gaugeGain);

  // ランキングに記録
  recordContribution(user, action);

  // アクション別処理
  switch (action) {
    case "attack":  heroAttack(user);  break;
    case "heal":    heroHeal(user);    break;
    case "defend":  heroDefend(user);  break;
    case "magic":   heroMagic(user);   break;
    case "steal":   heroSteal(user);   break;
    case "cheer":   /* 応援はゲージのみ */ break;
  }
}

function _handleGiftEvent(event) {
  const { user, giftName, coin, count, avatar } = event;
  const total = coin * (count ?? 1);
  handleGift(user, coin, count ?? 1, giftName, avatar);
  recordGift(user, total);                                   // 累計コイン・トップサポーター・集団目標
  recordContribution(user, "attack", Math.max(10, Math.round(total / 5))); // ランキングはコイン額で重み付け
  addGifter(user, avatar, giftName);                         // 応援団にアバター追加（ポップイン）
}

// ---- 新規視聴者向けCTAローテーション ----
// ライブは秒で人が入れ替わる。定期的に「参加方法」「ギフトの価値」を訴求して新規を巻き込む。
const _CTA_MESSAGES = [
  { text: "🎁 ギフト= 必殺技！ あなたが主役に！", color: "#ffd54f", dur: 4000 },
  { text: "⚔️/1 で攻撃！ コメントで参戦しよう", color: "#90caf9", dur: 4000 },
  { text: "💚/2 で回復！ みんなで勇者を守れ", color: "#66bb6a", dur: 4000 },
  { text: "👑 ギフトでランキング1位＝救世主に！", color: "#ffab40", dur: 4000 },
];
const CTA_INTERVAL = 18000;   // 約18秒ごと
function _rotateCta(now) {
  if (state.heroDown || bossIntroActive(now) || state.giftFx) return;  // 重要演出中は出さない
  if (now < state.nextCtaAt) return;
  if (state.nextCtaAt === 0) { state.nextCtaAt = now + CTA_INTERVAL; return; } // 起動直後は出さない
  const m = _CTA_MESSAGES[state.ctaIndex % _CTA_MESSAGES.length];
  addNotification(m.text, m.color, m.dur);
  state.ctaIndex++;
  state.nextCtaAt = now + CTA_INTERVAL;
}

// ---- 応援ゲージMAX → バーストエフェクト ----
function _triggerSupportBurst() {
  state.supportGauge = 0;
  state.supportBurstAt = performance.now();  // フラッシュ演出用

  addNotification("🎉 SUPPORT BURST!!", "#e91e63", 3500);
  addBattleLog("🎉 応援ゲージMAX！全員の力で3連撃！");
  sfx("supportBurst");

  // 勇者のHPを回復
  const healAmt = Math.round(state.hero.maxHp * 0.12);
  state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + healAmt);
  spawnDamageNumber(state.hero.x, state.hero.y - 40, `+${healAmt}`, "#e91e63");

  if (state.enemy && state.enemy.hp > 0) {
    // 3連撃（200ms 間隔）
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (state.enemy && state.enemy.hp > 0) {
          heroAttack("【全員】");
        }
      }, i * 220);
    }
  }

  // 画面エフェクト
  state.effects.push({ type: "explosion", x: CW / 2, y: CH / 2, born: performance.now(), duration: 900 });
}

// ---- 入力（キーボード操作・音アンロック）----
function _setupInput() {
  const unlock = () => { if (window.AudioEngine) AudioEngine.unlock(); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", (e) => {
    unlock();
    const k = (e.key || "").toLowerCase();
    if (k === "r") {
      toggleResult();
    } else if (k === "m") {
      const muted = AudioEngine.toggleMute();
      addNotification(muted ? "🔇 MUTE" : "🔊 SOUND ON", "#90caf9", 1500);
    }
  });
}

// ---- リザルト画面トグル（'R'キー / 配信終了時）----
function toggleResult() {
  state.phase = state.phase === "result" ? "battle" : "result";
  if (state.phase === "result") {
    sfx("result");
    addBattleLog("=== RESULT ===");
  } else {
    // バトル再開: 自動攻撃タイマーをリセット
    const now = performance.now();
    state.nextHeroAttack = now + HERO_AUTO_INTERVAL;
    state.nextEnemyAttack = now + ENEMY_AUTO_INTERVAL;
  }
}
window.toggleResult = toggleResult;

// ---- WS 接続状態コールバック ----
window.onWsStatus = (status) => {
  state.wsConnected = status === "connected";
};

window.addEventListener("load", init);
