/**
 * ゲーム状態の定義・初期化・スポーン関数
 * 描画とロジックは state を読み書きして分離する
 */

// ---- 敵定義テーブル（ゾーン別）----
// 5フロアで1ゾーン。各ゾーン: 雑魚3体 + 専属ボス1体。
// sprite が未ロード（素材未着）の場合は enemy.js の手描きフォールバックで描画される。
const ZONES = [
  { // Zone 0 : 森 (Floor 1-5)
    name: "Forest",
    normals: [
      { name: "Slime",    nameJP: "スライム",   maxHp: 60, atk: 8,  color: "#4caf50", shape: "circle",  size: 56, xp: 10, gold: 5, sprite: "en_slime"    },
      { name: "Goblin",   nameJP: "ゴブリン",   maxHp: 80, atk: 12, color: "#ff9800", shape: "rect",    size: 60, xp: 15, gold: 8, sprite: "en_goblin"   },
      { name: "Mushroom", nameJP: "マッシュ",   maxHp: 65, atk: 9,  color: "#e0c0a0", shape: "circle",  size: 60, xp: 11, gold: 6, sprite: "en_mushroom" },
    ],
    boss: { name: "Forest Guardian", nameJP: "森の番人", maxHp: 350, atk: 22, color: "#5d4037", shape: "rect", size: 90, xp: 120, gold: 60, isBoss: true, sprite: "en_boss_guardian" },
  },
  { // Zone 1 : 氷窟 (Floor 6-10)
    name: "Ice Cave",
    normals: [
      { name: "Frost Wolf", nameJP: "フロストウルフ", maxHp: 75, atk: 16, color: "#90caf9", shape: "diamond", size: 56, xp: 14, gold: 8,  sprite: "en_wolf"       },
      { name: "Ice Bat",    nameJP: "アイスバット",   maxHp: 58, atk: 12, color: "#80d8ff", shape: "circle",  size: 46, xp: 10, gold: 6,  sprite: "en_bat"        },
      { name: "Ice Spirit", nameJP: "氷の精霊",       maxHp: 70, atk: 13, color: "#4fc3f7", shape: "diamond", size: 58, xp: 13, gold: 8,  sprite: "en_ice_spirit" },
    ],
    boss: { name: "Stone Golem", nameJP: "石のゴーレム", maxHp: 500, atk: 18, color: "#546e7a", shape: "rect", size: 100, xp: 180, gold: 80, isBoss: true, sprite: "en_boss_golem" },
  },
  { // Zone 2 : 魔導 (Floor 11-15)
    name: "Rune",
    normals: [
      { name: "Skeleton", nameJP: "スケルトン", maxHp: 85,  atk: 17, color: "#cfd8dc", shape: "rect",    size: 60, xp: 16, gold: 10, sprite: "en_skeleton" },
      { name: "Wisp",     nameJP: "鬼火",       maxHp: 65,  atk: 15, color: "#b388ff", shape: "circle",  size: 46, xp: 14, gold: 9,  sprite: "en_wisp"     },
      { name: "Dark Mage",nameJP: "闇魔道士",   maxHp: 90,  atk: 20, color: "#7c4dff", shape: "rect",    size: 62, xp: 18, gold: 12, sprite: "en_darkmage" },
    ],
    boss: { name: "Lich", nameJP: "リッチ", maxHp: 650, atk: 24, color: "#9575cd", shape: "rect", size: 100, xp: 240, gold: 110, isBoss: true, sprite: "en_boss_lich" },
  },
  { // Zone 3 : 深海 (Floor 16-20)
    name: "Deep Sea",
    normals: [
      { name: "Merman",    nameJP: "半魚人", maxHp: 100, atk: 21, color: "#26c6da", shape: "rect",    size: 62, xp: 19, gold: 12, sprite: "en_merman" },
      { name: "Jellyfish", nameJP: "大クラゲ", maxHp: 80, atk: 17, color: "#4dd0e1", shape: "circle",  size: 56, xp: 16, gold: 10, sprite: "en_jelly"  },
      { name: "Crab",      nameJP: "大ガニ",  maxHp: 110, atk: 19, color: "#ff7043", shape: "diamond", size: 60, xp: 18, gold: 12, sprite: "en_crab"   },
    ],
    boss: { name: "Sea Serpent", nameJP: "海竜", maxHp: 800, atk: 27, color: "#0091ea", shape: "rect", size: 105, xp: 300, gold: 140, isBoss: true, sprite: "en_boss_serpent" },
  },
  { // Zone 4 : 魔城 (Floor 21+) ── 最深部・ループ
    name: "Demon Castle",
    normals: [
      { name: "Imp",        nameJP: "小鬼",   maxHp: 95,  atk: 22, color: "#ef5350", shape: "circle",  size: 50, xp: 20, gold: 13, sprite: "en_imp"        },
      { name: "Dark Knight",nameJP: "鎧騎士", maxHp: 130, atk: 26, color: "#b0bec5", shape: "rect",    size: 64, xp: 24, gold: 16, sprite: "en_dark_knight"},
      { name: "Hellhound",  nameJP: "地獄犬", maxHp: 105, atk: 28, color: "#ff6d00", shape: "diamond", size: 58, xp: 22, gold: 15, sprite: "en_hellhound"   },
    ],
    boss: { name: "Demon Lord", nameJP: "魔王", maxHp: 1000, atk: 30, color: "#d32f2f", shape: "rect", size: 110, xp: 400, gold: 200, isBoss: true, sprite: "en_boss_demon" },
  },
];

/** フロア → ゾーンインデックス（5フロアで1ゾーン、最深部で頭打ち）。
 *  render.js の背景 _getZone と必ず一致させること。 */
function zoneIndexForFloor(floor) {
  return Math.min(ZONES.length - 1, Math.floor((floor - 1) / 5));
}

/** 現在のフロアに合わせて敵をスポーンする */
function spawnEnemy(floor) {
  const zone = ZONES[zoneIndexForFloor(floor)];
  const isBoss = floor % 5 === 0;
  const template = isBoss
    ? zone.boss
    : zone.normals[Math.floor(Math.random() * zone.normals.length)];

  // フロアが上がるほど強くなる
  const scale = 1 + (floor - 1) * 0.08;
  return {
    ...template,
    hp: Math.round(template.maxHp * scale),
    maxHp: Math.round(template.maxHp * scale),
    atk: Math.round(template.atk * scale),
    // アニメーション用
    x: 680, y: 520,
    shakeUntil: 0,
    flashUntil: 0,
  };
}

/** 勇者の初期状態 */
function initHero() {
  return {
    hp: 100, maxHp: 100,
    atk: 15, def: 5,
    level: 1, xp: 0, xpToNext: 100,
    gold: 0,
    name: "Hero",
    // バフ状態
    isDefending: false,   // 守るコマンドのバフ
    defEndTime: 0,
    isAwakened: false,    // 超大ギフトの覚醒
    awakenEndTime: 0,
    // アニメーション用
    x: 200, y: 520,
    shakeUntil: 0,
    flashUntil: 0,
    attackFlash: 0,       // 攻撃時の白フラッシュ終了時刻
  };
}

// ---- メインのゲーム状態オブジェクト ----
const state = {
  hero: initHero(),
  enemy: null,

  floor: 1,
  killCount: 0,

  // 応援ゲージ (0〜100)
  supportGauge: 0,
  supportGaugeMax: 100,

  // 貢献度ランキング: Map<username, {score, attack, heal, defend, magic, steal, cheer}>
  ranking: new Map(),

  // ラストヒット
  lastHit: null,   // { user, time }

  // ギフト応援団（画面に出る小さなアバター列）
  // 各要素: { user, avatar, giftName, born, lastGiftAt, popAt, count }
  gifters: [],

  // 浮き上がるダメージ数字
  damageNumbers: [],  // { x, y, vy, text, color, alpha, born }

  // 短時間通知（ギフト・特殊演出など）
  notifications: [], // { text, color, born, duration }

  // バトルログ（右下に流れるテキスト）
  battleLog: [],     // { text, born }

  // エフェクト（爆発・回復光など）
  effects: [],       // { type, x, y, born, duration, ... }

  // オートバトルタイマー
  nextHeroAttack: 0,
  nextEnemyAttack: 0,

  // WebSocket接続状態
  wsConnected: false,

  // ラストヒット瞬間（倒した瞬間のみセット → 大演出用）
  lastHitFlash: null,   // { user, time }
  // 応援バースト発動時刻（画面フラッシュ用）
  supportBurstAt: 0,
  // スクリーンシェイク { until, mag }（撃破・大ダメージ時）
  screenShake: null,
  // ボス登場の暗転イベント { start, nameJP, nameEN, duration } / 非表示時 null
  bossIntro: null,

  // ゲーム進行フェーズ: "battle" | "result"
  phase: "battle",
  sessionStart: 0,   // セッション開始時刻 (performance.now)
  startLevel: 1,     // 開始時の勇者レベル（リザルト差分用）

  // ---- 💰 収益エンジン ----
  // ギフトテイクオーバー演出（large 以上で発火）
  // { user, avatar, giftName, tier, total, born, duration }
  giftFx: null,
  // 累計ギフトコイン: Map<user, coins>（承認経済・トップサポーター判定）
  giftTotals: new Map(),
  topSupporter: null,   // { user, coins }
  // 勇者ダウン中（ギフト蘇生待ち）: { since, until } / 通常時 null
  heroDown: null,
  // 集団目標メーター（セッション累計ギフトコイン）
  goalCoins: 0,
  goalTarget: 3000,
  goalReached: false,
  goalReachedAt: 0,
  // 新規視聴者向けCTAローテーション
  nextCtaAt: 0,
  ctaIndex: 0,
};

window.state = state;
window.spawnEnemy = spawnEnemy;
window.initHero = initHero;
window.ZONES = ZONES;
window.zoneIndexForFloor = zoneIndexForFloor;

/** ランキングに貢献を記録する */
function recordContribution(user, action, pts = null) {
  if (!user || user === "【手動】") {
    // 手動テスト時はランキングに記録しない
    user = "【手動】";
  }
  const scores = { attack: 10, magic: 12, heal: 8, defend: 5, steal: 7, cheer: 1 };
  const s = pts != null ? pts : (scores[action] ?? 1);
  const r = state.ranking;
  if (!r.has(user)) {
    r.set(user, { score: 0, attack: 0, heal: 0, defend: 0, magic: 0, steal: 0, cheer: 0 });
  }
  const entry = r.get(user);
  entry.score += s;
  if (action && entry[action] !== undefined) entry[action]++;
}

/** ランキング上位 N 件を配列で返す */
function getRanking(n = 5) {
  return [...state.ranking.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, n)
    .map(([user, data]) => ({ user, ...data }));
}

/** フローティングダメージ数字を追加する */
function spawnDamageNumber(x, y, text, color = "#fff") {
  state.damageNumbers.push({ x, y, vy: -3, text, color, alpha: 1, born: performance.now() });
}

/** 通知を追加する */
function addNotification(text, color = "#ffd700", duration = 2500) {
  state.notifications.push({ text, color, born: performance.now(), duration });
}

/** スクリーンシェイクを発動する（強いものを優先して上書き） */
function triggerShake(mag = 14, dur = 360) {
  const now = performance.now();
  const cur = state.screenShake;
  if (cur && cur.until > now && cur.mag >= mag) return;
  state.screenShake = { until: now + dur, mag, dur };
}

/** ボス登場の暗転イベント表示中か（オートバトル一時停止の判定に使う） */
function bossIntroActive(now) {
  return !!(state.bossIntro && now < state.bossIntro.start + state.bossIntro.duration);
}

/** ギフトをくれた人を応援団に追加/更新する
 *  既存ユーザーなら再ポップ＋カウント加算、新規なら追加（上限超過で古いものを削除）*/
function addGifter(user, avatar, giftName) {
  if (!user) return;
  const now = performance.now();
  const MAX = 8;
  const g = state.gifters.find((x) => x.user === user);
  if (g) {
    if (avatar) g.avatar = avatar;
    if (giftName) g.giftName = giftName;
    g.lastGiftAt = now;
    g.popAt = now;          // 再度ポップインさせる
    g.count = (g.count || 1) + 1;
  } else {
    state.gifters.push({ user, avatar, giftName, born: now, lastGiftAt: now, popAt: now, count: 1 });
    if (state.gifters.length > MAX) state.gifters.shift(); // 一番古いものを外す
  }
}

/** バトルログを追加する（古いものは自動削除） */
function addBattleLog(text) {
  state.battleLog.unshift({ text, born: performance.now() });
  if (state.battleLog.length > 8) state.battleLog.pop();
}

/** ギフトのコインを累計記録し、トップサポーターと集団目標を更新する。
 *  返り値: そのユーザーの累計コイン。 */
function recordGift(user, coins) {
  if (!user || coins <= 0) return 0;
  const m = state.giftTotals;
  const total = (m.get(user) || 0) + coins;
  m.set(user, total);
  // トップサポーター更新（同点は新しい人を優先）
  if (!state.topSupporter || total >= state.topSupporter.coins) {
    state.topSupporter = { user, coins: total };
  }
  // 集団目標メーター
  state.goalCoins += coins;
  if (!state.goalReached && state.goalCoins >= state.goalTarget) {
    state.goalReached = true;
    state.goalReachedAt = performance.now();
  }
  return total;
}

/** ユーザーの累計ギフトコインを返す */
function giftTotalFor(user) {
  return state.giftTotals.get(user) || 0;
}

window.recordGift = recordGift;
window.giftTotalFor = giftTotalFor;

window.recordContribution = recordContribution;
window.getRanking = getRanking;
window.spawnDamageNumber = spawnDamageNumber;
window.addNotification = addNotification;
window.addBattleLog = addBattleLog;
window.addGifter = addGifter;
window.triggerShake = triggerShake;
window.bossIntroActive = bossIntroActive;
