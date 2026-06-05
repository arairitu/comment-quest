/**
 * 勇者のアクションロジック
 * 実際の状態変更はすべて state 経由で行う
 */

const HERO_AUTO_INTERVAL = 2000; // 自動攻撃間隔 (ms)

/** 勇者が敵に通常攻撃 */
function heroAttack(user = null) {
  const { hero, enemy } = state;
  if (!enemy || enemy.hp <= 0) return;

  // 覚醒中は攻撃力5倍
  const atkMultiplier = hero.isAwakened ? 5 : 1;
  const dmg = Math.max(1, Math.round((hero.atk * atkMultiplier) - (enemy.def ?? 0) + _jitter(3)));

  enemy.hp = Math.max(0, enemy.hp - dmg);
  enemy.flashUntil = performance.now() + 120;
  spawnDamageNumber(enemy.x + _jitter(20), enemy.y - 20, `-${dmg}`, "#ff5252");
  addBattleLog(user ? `${user}: ⚔️ ATK ${dmg}` : `Hero: auto ATK ${dmg}`);
  hero.attackFlash = performance.now() + 150;
  // 斬撃エフェクト（敵に三日月斬り）
  state.effects.push({ type: "slash", x: enemy.x, y: enemy.y, angle: -0.7, color: "#ffffff", born: performance.now(), duration: 280 });
  sfx("attack");

  if (user) state.lastHit = { user, time: performance.now() };
  _checkEnemyDead(user);
}

/** 魔法攻撃（1.5倍ダメージ）*/
function heroMagic(user) {
  const { hero, enemy } = state;
  if (!enemy || enemy.hp <= 0) return;

  const dmg = Math.max(1, Math.round(hero.atk * 1.5 + _jitter(5)));
  enemy.hp = Math.max(0, enemy.hp - dmg);
  enemy.flashUntil = performance.now() + 180;
  spawnDamageNumber(enemy.x + _jitter(20), enemy.y - 30, `🔥${dmg}`, "#ff9800");
  addBattleLog(`${user}: 🔥 MAGIC ${dmg}`);
  sfx("magic");

  // 炎弾が勇者から敵へ飛ぶ → 着弾で爆発
  state.effects.push({ type: "projectile", sx: hero.x + 40, sy: hero.y - 20, tx: enemy.x, ty: enemy.y, color: "#ff7043", born: performance.now(), duration: 420 });
  state.effects.push({ type: "magic_burst", x: enemy.x, y: enemy.y, born: performance.now() + 360, duration: 600 });
  state.lastHit = { user, time: performance.now() };
  _checkEnemyDead(user);
}

/** 回復（敵が最終形態のときは回復効果半減）*/
function heroHeal(user) {
  const { hero, enemy } = state;
  let amount = Math.round(hero.maxHp * 0.15 + _jitter(5));
  if (enemy && enemy.finalForm) amount = Math.max(1, Math.floor(amount * 0.5));
  hero.hp = Math.min(hero.maxHp, hero.hp + amount);
  spawnDamageNumber(hero.x + _jitter(15), hero.y - 20, `+${amount}`, "#69f0ae");
  addBattleLog(`${user}: 💚 HEAL +${amount}`);
  sfx("heal");
  state.effects.push({ type: "heal_burst", x: hero.x, y: hero.y, born: performance.now(), duration: 500 });
}

/** 防御バフ（5秒間、被ダメージ50%軽減）*/
function heroDefend(user) {
  const { hero } = state;
  hero.isDefending = true;
  hero.defEndTime = performance.now() + 5000;
  addBattleLog(`${user}: 🛡️ DEFEND (5s)`);
  addNotification(`${user}: 🛡️ GUARD UP!`, "#4fc3f7", 2000);
  sfx("defend");
}

/** 盗む（ゴールド獲得）*/
function heroSteal(user) {
  const { hero, enemy } = state;
  if (!enemy || enemy.hp <= 0) return;

  const gold = Math.round(enemy.gold * (0.5 + Math.random() * 0.5));
  hero.gold += gold;
  addBattleLog(`${user}: 💰 STEAL +${gold}G`);
  spawnDamageNumber(hero.x + _jitter(15), hero.y - 30, `+${gold}G`, "#ffd700");
  sfx("steal");
}

/** large 以上のギフトでフル画面テイクオーバー演出を発火する。
 *  小/中は軽い通知のみ → コイン額に応じて派手さが連続的に上がる「価値のはしご」。 */
function _triggerGiftFx(user, avatar, giftName, tier, total) {
  const DUR = { large: 1600, super: 2800, ultra: 3800 };
  const dur = DUR[tier];
  if (!dur) return;
  state.giftFx = { user, avatar, giftName, tier, total, born: performance.now(), duration: dur };
}

/** ダウン中の勇者をギフトで蘇生する（ダウン中でなければ何もしない）。
 *  return: 蘇生したら true。 */
function _reviveByGift(user) {
  if (!state.heroDown) return false;
  state.heroDown = null;
  const h = state.hero;
  h.hp = Math.round(h.maxHp * 0.6);   // ギフト蘇生は手厚い（60%）
  addNotification(`🎁 ${user} が勇者を蘇生！！`, "#ffd54f", 3500);
  addBattleLog(`${user}: 🎁 REVIVE! 勇者復活`);
  state.effects.push({ type: "heal_burst", x: h.x, y: h.y, born: performance.now(), duration: 700 });
  state.effects.push({ type: "awaken", x: h.x, y: h.y, born: performance.now(), duration: 1200 });
  triggerShake(16, 400);
  sfx("revive");
  const now = performance.now();
  state.nextHeroAttack = now + 800;
  state.nextEnemyAttack = now + 1600;
  return true;
}

/** ギフト効果を処理する */
function handleGift(user, coin, count, giftName, avatar = null) {
  const total = coin * count;
  const { hero, enemy } = state;
  const tier = giftTier(total);

  // ダウン中なら、どのギフトでも最優先で蘇生（最大の課金トリガー）
  _reviveByGift(user);

  // テイクオーバー演出（large 以上）
  _triggerGiftFx(user, avatar, giftName, tier, giftTotalFor(user) || total);

  if (tier === "small") {
    // 小ギフト: 追加コンボ攻撃
    const dmg = Math.max(1, Math.round(hero.atk * 0.5));
    if (enemy && enemy.hp > 0) {
      enemy.hp = Math.max(0, enemy.hp - dmg);
      spawnDamageNumber(enemy.x + _jitter(20), enemy.y - 25, `${giftName}! ${dmg}`, "#ffe082");
      addBattleLog(`${user}: 🎁 COMBO ${dmg}`);
      state.lastHit = { user, time: performance.now() };
      _checkEnemyDead(user);
    }
    addNotification(`🎁 ${user}: ${giftName}!`, "#ffe082", 1800);
    sfx("giftSmall");

  } else if (tier === "medium") {
    // 中ギフト: HP回復 + バフ
    const heal = Math.round(hero.maxHp * 0.25);
    hero.hp = Math.min(hero.maxHp, hero.hp + heal);
    spawnDamageNumber(hero.x, hero.y - 30, `+${heal}`, "#69f0ae");
    addBattleLog(`${user}: 🎁 GIFT HEAL +${heal}`);
    addNotification(`✨ ${user}: ${giftName}! HEAL +${heal}`, "#b39ddb", 2500);
    sfx("giftMedium");

  } else if (tier === "large") {
    // 大ギフト: 必殺技（敵に大ダメージ）
    if (enemy && enemy.hp > 0) {
      const dmg = Math.round(hero.atk * 4 + _jitter(10));
      enemy.hp = Math.max(0, enemy.hp - dmg);
      enemy.flashUntil = performance.now() + 400;
      spawnDamageNumber(enemy.x, enemy.y - 40, `💥${dmg}!!`, "#ff1744");
      addBattleLog(`${user}: 💥 SPECIAL MOVE ${dmg}!!`);
      state.effects.push({ type: "explosion", x: enemy.x, y: enemy.y, born: performance.now(), duration: 800 });
      state.lastHit = { user, time: performance.now() };
      _checkEnemyDead(user);
    }
    addNotification(`💥 ${user}: ${giftName}! SPECIAL MOVE!!`, "#ff5722", 3000);
    sfx("giftLarge");

  } else if (tier === "super") {
    // 超大ギフト: 勇者覚醒（30秒間 攻撃力5倍・被ダメ半減）
    hero.isAwakened = true;
    hero.awakenEndTime = performance.now() + 30000;
    hero.isDefending = true;
    hero.defEndTime = hero.awakenEndTime;
    addBattleLog(`${user}: 🌟 AWAKENING!! (30s)`);
    addNotification(`🌟 ${user}: ${giftName}! HERO AWAKENING!!`, "#ffd700", 4000);
    state.effects.push({ type: "awaken", x: hero.x, y: hero.y, born: performance.now(), duration: 1500 });
    triggerShake(20, 600);
    sfx("giftSuper");

  } else {
    // 超弩級ギフト(ultra): 覚醒40秒 ＋ 敵に必殺の大打撃（最大HPの25%）
    hero.isAwakened = true;
    hero.awakenEndTime = performance.now() + 40000;
    hero.isDefending = true;
    hero.defEndTime = hero.awakenEndTime;
    if (enemy && enemy.hp > 0) {
      const dmg = Math.max(Math.round(enemy.maxHp * 0.25), Math.round(hero.atk * 8 + _jitter(20)));
      enemy.hp = Math.max(0, enemy.hp - dmg);
      enemy.flashUntil = performance.now() + 600;
      spawnDamageNumber(enemy.x, enemy.y - 50, `💥${dmg}!!!`, "#ff1744");
      state.effects.push({ type: "explosion", x: enemy.x, y: enemy.y, born: performance.now(), duration: 1000 });
      state.lastHit = { user, time: performance.now() };
      _checkEnemyDead(user);
    }
    addBattleLog(`${user}: 🌟 LEGENDARY STRIKE!!!`);
    addNotification(`🌟 ${user}: ${giftName}! LEGENDARY!!!`, "#ffd700", 4500);
    triggerShake(30, 800);
    sfx("giftUltra");
  }
}

/** 敵が勇者に攻撃する */
function enemyAttack() {
  const { hero, enemy } = state;
  if (!enemy || enemy.hp <= 0) return;

  // 防御中は50%軽減
  let dmg = Math.max(1, Math.round(enemy.atk - hero.def + _jitter(3)));
  if (hero.isDefending) dmg = Math.max(1, Math.floor(dmg * 0.5));
  if (hero.isAwakened) dmg = Math.max(1, Math.floor(dmg * 0.5));

  hero.hp = Math.max(0, hero.hp - dmg);
  hero.shakeUntil = performance.now() + 200;
  spawnDamageNumber(hero.x + _jitter(15), hero.y - 20, `-${dmg}`, "#ef9a9a");
  addBattleLog(`${enemy.name}: ATK ${dmg}`);
  sfx("hurt");

  if (hero.hp <= 0) _onHeroDead();
}

/** 勇者死亡処理 → ダウン状態へ（ギフト蘇生待ち）。
 *  最大の課金トリガー。一定時間ギフトが来なければ応援で最低限の復活（配信は止めない）。 */
const HERO_DOWN_MS = 12000;
function _onHeroDead() {
  if (state.heroDown) return;            // 既にダウン中
  const now = performance.now();
  state.heroDown = { since: now, until: now + HERO_DOWN_MS };
  addNotification("💀 勇者がダウン！ 🎁ギフトで蘇生せよ！", "#ff1744", 4000);
  addBattleLog("💀 勇者ダウン… 🎁ギフトで蘇生！");
  triggerShake(24, 600);
  sfx("heroDown");
}

/** ダウン時間切れの保険復活（応援ゲージ消費・低HP）。配信が止まらないための最終手段。 */
function _fallbackRevive() {
  if (!state.heroDown) return;
  state.heroDown = null;
  const h = state.hero;
  const enough = state.supportGauge >= 50;
  if (enough) state.supportGauge -= 50;
  h.hp = Math.round(h.maxHp * (enough ? 0.4 : 0.15));   // ギフト蘇生(60%)より明確に弱い
  addNotification("💚 みんなの応援で何とか復活…次は🎁で救おう！", "#69f0ae", 3500);
  addBattleLog("勇者 なんとか復活");
  const now = performance.now();
  state.nextHeroAttack = now + 800;
  state.nextEnemyAttack = now + 1600;
}

/** 敵死亡確認 → 撃破処理 */
function _checkEnemyDead(lastUser) {
  const { enemy } = state;
  if (!enemy || enemy.hp > 0) return;

  sfx("defeat");
  state.killCount++;
  state.hero.xp += enemy.xp;
  state.hero.gold += enemy.gold;

  if (state.hero.xp >= state.hero.xpToNext) {
    _levelUp();
  }

  const name = enemy.isBoss ? `👑 BOSS ${enemy.nameJP ?? enemy.name}` : `${enemy.nameJP ?? enemy.name}`;
  addNotification(`⚔️ ${name} 撃破！`, enemy.isBoss ? "#ffd700" : "#a5d6a7", enemy.isBoss ? 4000 : 2000);
  if (lastUser) {
    state.lastHitFlash = { user: lastUser, time: performance.now() };
    addNotification(`🏆 LAST HIT: ${lastUser}`, "#ffd700", 3000);
    sfx("lastHit");
  }
  addBattleLog(`撃破: ${enemy.name} / Floor ${state.floor}`);

  // 撃破エフェクト（砕け散る＋衝撃波＋画面シェイク）
  spawnDeathEffect(enemy);
  triggerShake(enemy.isBoss ? 26 : 14, enemy.isBoss ? 600 : 360);

  // 少し待ってから次の敵をスポーン（アニメーション間）
  state.enemy = null;
  setTimeout(() => {
    state.floor++;
    state.enemy = spawnEnemy(state.floor);
    addBattleLog(`Floor ${state.floor}: ${state.enemy.nameJP ?? state.enemy.name} が現れた！`);
    if (state.enemy.isBoss) {
      _startBossIntro(state.enemy);
      addNotification(`👑 BOSS APPEARS! ${state.enemy.nameJP ?? state.enemy.name}`, "#ffd700", 3500);
      sfx("bossAppear");
    }
  }, 1200);
}

/** ボス登場の暗転イベントを開始する（オートバトルは update 側で一時停止）*/
function _startBossIntro(enemy) {
  state.bossIntro = {
    start: performance.now(),
    duration: 2600,
    nameJP: enemy.nameJP ?? enemy.name,
    nameEN: enemy.name,
  };
  triggerShake(20, 700);
}

/** 進化ステージを返す（render.js の _getHeroEvoInfo と一致させること）*/
function _getEvoStage(level) {
  if (level < 5)  return 1;
  if (level < 10) return 2;
  if (level < 15) return 3;
  if (level < 20) return 4;
  if (level < 25) return 5;
  return 6;
}

/** レベルアップ処理 */
function _levelUp() {
  const h = state.hero;
  const prevStage = _getEvoStage(h.level);

  h.level++;
  h.xp -= h.xpToNext;
  h.xpToNext = Math.round(h.xpToNext * 1.4);
  h.maxHp = Math.round(h.maxHp * 1.1);
  h.hp = h.maxHp;
  h.atk = Math.round(h.atk * 1.08);
  h.def = Math.round(h.def * 1.05);

  const newStage = _getEvoStage(h.level);

  if (newStage > prevStage) {
    // ---- 進化イベント ----
    const EVO_NAMES = ["", "Novice", "Squire", "Knight", "Crusader", "Paladin", "★ LEGENDARY ★"];
    addNotification(
      `🌟 EVOLUTION! Stage ${newStage}: ${EVO_NAMES[newStage]}`,
      newStage === 6 ? "#ffd700" : "#b39ddb",
      5000
    );
    addBattleLog(`⬆️ EVOLUTION Stage ${newStage}: ${EVO_NAMES[newStage]}!`);
    state.effects.push({ type: "awaken", x: h.x, y: h.y, born: performance.now(), duration: 1800 });
    sfx("giftSuper");
  } else {
    addNotification(`⬆️ Lv.${h.level} LEVEL UP!!`, "#ffd700", 3000);
    sfx("levelup");
  }
  addBattleLog(`Lv.${h.level} レベルアップ！`);
}

/** バフ状態の期限チェック（毎フレーム呼ぶ）*/
function updateHeroBuffs(now) {
  const { hero } = state;
  if (hero.isAwakened && now > hero.awakenEndTime) {
    hero.isAwakened = false;
    addBattleLog("覚醒終了");
  }
  if (hero.isDefending && now > hero.defEndTime && !hero.isAwakened) {
    hero.isDefending = false;
  }
}

/** ボスのHP割合に応じた特殊イベント（毎フレーム呼ぶ）*/
function checkBossEvents() {
  const { enemy } = state;
  if (!enemy || !enemy.isBoss || enemy.hp <= 0) return;
  const ratio = enemy.hp / enemy.maxHp;

  if (!enemy.phase75 && ratio <= 0.75) {
    enemy.phase75 = true;
    enemy.atk = Math.round(enemy.atk * 1.3);
    addNotification(`👹 ${enemy.nameJP ?? enemy.name} が激怒！ ATK UP`, "#ff5722", 3000);
    addBattleLog("BOSS: 怒りモード！攻撃力上昇");
    state.effects.push({ type: "magic_burst", x: enemy.x, y: enemy.y, born: performance.now(), duration: 600 });
    sfx("bossAppear");
  }
  if (!enemy.phase50 && ratio <= 0.50) {
    enemy.phase50 = true;
    addNotification(`🗯️ ${enemy.nameJP ?? enemy.name} が作戦を変えた！`, "#ffb300", 3000);
    addBattleLog("BOSS: 作戦会議");
    sfx("bossAppear");
  }
  if (!enemy.finalForm && ratio <= 0.25) {
    enemy.finalForm = true;
    enemy.atk = Math.round(enemy.atk * 1.2);
    addNotification(`🔥 ${enemy.nameJP ?? enemy.name} 最終形態！ 回復半減`, "#ff1744", 4000);
    addBattleLog("BOSS: 最終形態突入！！");
    state.effects.push({ type: "explosion", x: enemy.x, y: enemy.y, born: performance.now(), duration: 800 });
    sfx("bossAppear");
  }
}

/** 小さなランダムぶれ */
function _jitter(range) {
  return Math.round((Math.random() - 0.5) * range);
}

window.heroAttack = heroAttack;
window.heroMagic = heroMagic;
window.heroHeal = heroHeal;
window.heroDefend = heroDefend;
window.heroSteal = heroSteal;
window.handleGift = handleGift;
window.enemyAttack = enemyAttack;
window._fallbackRevive = _fallbackRevive;
window.updateHeroBuffs = updateHeroBuffs;
window.checkBossEvents = checkBossEvents;
window.HERO_AUTO_INTERVAL = HERO_AUTO_INTERVAL;
