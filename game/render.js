/**
 * Canvas 描画モジュール
 * state を読んで毎フレーム描画する。状態変更はしない。
 *
 * レイアウト（1080 × 1920）:
 *   0  〜  90  : タイトルバー
 *  90  〜 230  : 敵HPバー
 * 230  〜 780  : 戦闘フィールド
 * 780  〜 890  : 勇者HPバー
 * 890  〜 990  : 応援ゲージ
 * 990  〜 1320 : ランキング
 * 1320 〜 1550 : バトルログ / 通知
 * 1550 〜 1680 : ラストヒット
 * 1680 〜 1920 : コマンドガイド
 */

const CW = 1080;
const CH = 1920;

// レイアウト定数
const L = {
  titleH: 90,
  enemyHpY: 100,
  fieldTop: 230,
  fieldBot: 780,
  heroHpY: 800,
  gaugeY: 910,
  rankY: 1010,
  logY: 1330,
  lastHitY: 1560,
  guideY: 1700,
};

function render(ctx, now) {
  ctx.clearRect(0, 0, CW, CH);
  ctx.imageSmoothingEnabled = false;

  _drawBackground(ctx, now);
  _drawTitle(ctx);
  _drawBossCountdown(ctx, now);   // ① ボス来訪カウントダウン
  _drawGoalMeter(ctx, now);       // 🎯 みんなで魔王討伐ゲージ（集団目標）
  _drawEnemyHpBar(ctx);

  // ---- スクリーンシェイク層（戦闘部分のみ揺らす：背景/HUDは固定）----
  const sh = _computeShake(now);
  ctx.save();
  if (sh) ctx.translate(sh.dx, sh.dy);
  _drawField(ctx, now);
  _drawHero(ctx, now);
  _drawGifterRow(ctx, now);   // ギフト応援団（床のアバター列＋ポップイン）
  _drawDamageNumbers(ctx, now);
  _drawEffects(ctx, now);
  ctx.restore();

  _drawHeroHpBar(ctx);
  _drawSupportGauge(ctx);
  _drawRanking(ctx);
  _drawBattleLog(ctx, now);
  _drawLastHit(ctx, now);
  _drawNotifications(ctx, now);
  _drawCommandGuide(ctx);
  _drawWsStatus(ctx);
  _drawDangerOverlay(ctx, now);   // ② HP低下赤フラッシュ（最前面）
  _drawSupportBurstFlash(ctx, now); // ③ 応援バーストフラッシュ
  _drawLastHitFlash(ctx, now);    // ④ ラストヒット大演出
  _drawBossIntro(ctx, now);       // ⑤ ボス登場の暗転イベント（最前面）
  _drawHeroDownOverlay(ctx, now); // 💀 勇者ダウン → ギフト蘇生訴求（最前面）
  _drawGiftTakeover(ctx, now);    // 🎁 ギフト全画面スペクタクル（最前面・最優先）

  if (state.phase === "result") _drawResultScreen(ctx, now);
}

// ---- スクリーンシェイクのオフセット計算（残り時間で減衰）----
function _computeShake(now) {
  const s = state.screenShake;
  if (!s) return null;
  if (now >= s.until) { state.screenShake = null; return null; }
  const left = (s.until - now) / s.dur;   // 1 → 0
  const mag = s.mag * left;
  return { dx: (Math.random() - 0.5) * 2 * mag, dy: (Math.random() - 0.5) * 2 * mag };
}

// ---- 撃破エフェクトを生成する（砕け散る破片＋衝撃波）----
// hero.js の _checkEnemyDead から呼ばれる。敵の見た目情報から破片を作る。
function spawnDeathEffect(enemy) {
  if (!enemy) return;
  const img = enemy.sprite && window.IMG ? IMG[enemy.sprite] : null;
  const size = enemy.size || 60;
  const dh = img ? size * 2.6 : size * 1.2;
  const dw = img ? dh * (img.width / img.height) : size;
  const n = enemy.isBoss ? 30 : 16;
  const shards = [];
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (enemy.isBoss ? 6 : 4) + Math.random() * (enemy.isBoss ? 9 : 6);
    shards.push({
      ox: (Math.random() - 0.5) * dw * 0.55,
      oy: (Math.random() - 0.5) * dh * 0.55,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 2.5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      sz: (enemy.isBoss ? 10 : 7) + Math.random() * 8,
    });
  }
  state.effects.push({
    type: "enemy_death",
    x: enemy.x, y: enemy.y,
    color: enemy.color || "#ffffff",
    isBoss: !!enemy.isBoss,
    shards,
    born: performance.now(),
    duration: enemy.isBoss ? 1100 : 750,
  });
}
window.spawnDeathEffect = spawnDeathEffect;

// ---- タイルを矩形いっぱいに敷き詰める（クリップして端をきれいに）----
function _tileRegion(ctx, name, x, y, w, h, size) {
  const img = IMG[name];
  if (!img) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  for (let ty = y; ty < y + h; ty += size) {
    for (let tx = x; tx < x + w; tx += size) {
      ctx.drawImage(img, tx, ty, size, size);
    }
  }
  ctx.restore();
  return true;
}

// ---- パネル素材を1行に並べて帯を埋める ----
// 512px等の「壁/床パネル」画像を、領域の高さに合わせて横方向にだけ繰り返す。
// 高さ＝領域高さに固定するので縦の継ぎ目が出ない（壁・床の1枚帯に向く）。
function _panelRow(ctx, name, x, y, w, h) {
  const img = IMG[name];
  if (!img) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  const tileW = h * (img.width / img.height);
  for (let tx = x; tx < x + w; tx += tileW) {
    ctx.drawImage(img, tx, y, tileW, h);
  }
  ctx.restore();
  return true;
}

// ---- フロア帯ごとのゾーン定義 ----
// floor → { wallTile, floorTile, bgTop/Mid/Bot, crystals, rayColor }
// ゾーン背景設定（state.js の ZONES と同じ並び：森/氷窟/魔導/深海/魔城）
const _ZONE_BG = [
  { // Zone 0 : 森
    wallTile: "tile_grass", floorTile: "tile_wood",
    bgTop: "#071208", bgMid: "#0b1a0d", bgBot: "#040a04",
    rayColor: "rgba(140,220,140,0.10)",
    // 燭台(隅 x≈66/1014)と松明(x≈300/780)の間の空き帯に置き、串刺しを回避
    crystals: [
      [160, 778, 92, "#a5d6a7", 0.0],
      [198, 762, 56, "#66bb6a", 1.2],
      [920, 778, 92, "#69f0ae", 0.6],
      [948, 762, 56, "#c8e6c9", 2.1],
    ],
  },
  { // Zone 1 : 氷窟
    wallTile: "tile_brick", floorTile: "tile_stone",
    bgTop: "#0a2028", bgMid: "#0a242e", bgBot: "#040c11",
    rayColor: "rgba(120,220,235,0.10)",
    crystals: [],
    bigCrystals: [
      ["deco_crystal_blue",   120, 780, 272, "#4fc3f7"],
      ["deco_crystal_purple", 958, 772, 232, "#b388ff"],
    ],
  },
  { // Zone 2 : 魔導
    wallTile: "tile_stone", floorTile: "tile_rune",
    wallPanel: "wall_dungeon", floorPanel: "floor_damp",
    bgTop: "#120818", bgMid: "#160c20", bgBot: "#060210",
    rayColor: "rgba(180,100,255,0.08)",
    crystals: [],
    bigCrystals: [
      ["deco_crystal_purple", 120, 780, 252, "#b388ff"],
      ["deco_crystal_blue",   958, 774, 262, "#7c4dff"],
    ],
  },
  { // Zone 3 : 深海
    wallTile: "tile_water", floorTile: "tile_stone",
    bgTop: "#040e1a", bgMid: "#061220", bgBot: "#020810",
    rayColor: "rgba(40,180,255,0.10)",
    crystals: [],
    bigCrystals: [
      ["deco_crystal_blue",   118, 780, 280, "#40c4ff"],
      ["deco_crystal_blue",   960, 772, 240, "#0091ea"],
    ],
  },
  { // Zone 4 : 魔城（最深部）
    wallTile: "tile_rune", floorTile: "tile_brick",
    wallPanel: "wall_demonic", floorPanel: "floor_damp",
    bgTop: "#180408", bgMid: "#1c0610", bgBot: "#0a0208",
    rayColor: "rgba(255,80,80,0.08)",
    crystals: [],
    bigCrystals: [
      ["deco_crystal_purple", 120, 780, 256, "#e040fb"],
      ["deco_crystal_purple", 958, 770, 236, "#ff5252"],
    ],
  },
];

function _getZone(floor) {
  const zi = window.zoneIndexForFloor ? zoneIndexForFloor(floor) : 0;
  return _ZONE_BG[zi] || _ZONE_BG[0];
}

// ---- バックグラウンド ----
// フロア帯に応じてタイル・グラデ・クリスタル色を切り替える。
// タイル未ロード時はグラデのみ（数フレームで差し変わる）。
function _drawBackground(ctx, now) {
  const zone = _getZone(state.floor);

  // ベース: 暗い石壁テクスチャを全面に敷く（ゲーム画面以外の余白もドット化）。
  // 未ロード時は単色でフォールバック。
  if (!_tileRegion(ctx, "bg_wall_dark", 0, 0, CW, CH, 128)) {
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, CW, CH);
  }

  // ゾーン色のグラデを半透明で重ね、石壁テクスチャを残しつつ雰囲気を付ける
  const grad = ctx.createLinearGradient(0, 0, 0, CH);
  grad.addColorStop(0,    zone.bgTop);
  grad.addColorStop(0.4,  zone.bgMid);
  grad.addColorStop(0.75, zone.bgMid);
  grad.addColorStop(1,    zone.bgBot);
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);
  ctx.restore();

  // フィールドを構成（奥=壁 / 手前=床）。新パネル素材があれば優先し、
  // 無ければ従来タイルへフォールバック（＝既存ゾーンはそのまま動く）。
  const fx = 40, fw = CW - 80;
  const wallTop = L.fieldTop;
  const horizon = L.fieldTop + 300;
  const floorBot = L.fieldBot;
  if (!(zone.wallPanel && _panelRow(ctx, zone.wallPanel, fx, wallTop, fw, horizon - wallTop)))
    _tileRegion(ctx, zone.wallTile, fx, wallTop, fw, horizon - wallTop, 96);
  if (!(zone.floorPanel && _panelRow(ctx, zone.floorPanel, fx, horizon, fw, floorBot - horizon)))
    _tileRegion(ctx, zone.floorTile, fx, horizon, fw, floorBot - horizon, 96);

  // 壁と床の境の陰
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(fx, horizon - 5, fw, 10);

  // フィールドの上下を暗く締めるビネット
  const vg = ctx.createLinearGradient(0, wallTop, 0, floorBot);
  vg.addColorStop(0,   "rgba(4,12,17,0.55)");
  vg.addColorStop(0.4, "rgba(4,12,17,0)");
  vg.addColorStop(1,   "rgba(4,12,17,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(fx, wallTop, fw, floorBot - wallTop);

  // 光芒（天井から差し込む光。ゆっくり揺れる）
  const rays = [
    { x: 180, w: 90,  spread: 70,  phase: 0.0 },
    { x: 540, w: 140, spread: -50, phase: 1.7 },
    { x: 860, w: 100, spread: 60,  phase: 3.2 },
  ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const r of rays) {
    const sway = Math.sin(now / 2600 + r.phase) * 26;
    const tx = r.x + sway;
    const rg = ctx.createLinearGradient(0, 0, 0, L.fieldBot);
    rg.addColorStop(0, zone.rayColor);
    rg.addColorStop(1, zone.rayColor.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx + r.w, 0);
    ctx.lineTo(tx + r.w + r.spread, L.fieldBot);
    ctx.lineTo(tx + r.spread, L.fieldBot);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // クリスタル群（ゾーンの色・手描きジェム）
  for (const [x, by, h, c, ph] of zone.crystals) {
    _drawCrystal(ctx, x, by, h, c, now, ph);
  }

  // 実素材の大型クリスタル（ゾーンに設定があれば前景の左右に立てる）
  if (zone.bigCrystals) {
    for (const [name, cx, by, h, glow] of zone.bigCrystals) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 760 + cx);
      _prop(ctx, name, cx, by, h, 0.96, { color: glow, blur: 16 + pulse * 16 });
    }
  }

  // きらめき（洞窟内に漂う光の粒。明滅する）
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const seed = i * 73.7;
    const x = (seed * 17.3) % CW;
    const y = (seed * 9.13) % (L.fieldBot + 120);
    const tw = 0.5 + 0.5 * Math.sin(now / 420 + i * 1.3);
    ctx.globalAlpha = 0.08 + tw * 0.5;
    ctx.fillStyle = i % 3 === 0 ? "#b3e5fc" : "#ffffff";
    const s = i % 4 === 0 ? 3 : 2;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();

  // 装飾プロップ（実素材）。UI/敵/勇者はこの後に描かれるので前面に出る。
  _drawProps(ctx, now);
}

// ---- 装飾プロップ配置 ----
// 画像を「中心x・下端y・目標高さ」で配置するヘルパ。
function _prop(ctx, name, cx, bottomY, h, alpha = 1, glow = null) {
  const img = IMG[name];
  if (!img) return;
  const w = h * (img.width / img.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = glow.color; ctx.shadowBlur = glow.blur; }
  ctx.drawImage(img, cx - w / 2, bottomY - h, w, h);
  ctx.restore();
}

function _drawProps(ctx, now) {
  const zone = _getZone(state.floor);
  const flick = 24 + Math.sin(now / 180) * 9 + Math.sin(now / 70) * 5;  // 松明の炎ゆらぎ
  const lglow = 16 + Math.sin(now / 320) * 6;                           // ランタンの灯り

  // 壁の上部から吊るすランタン（上部の左右）。暖色グロー。
  // 壁領域(y230-530)の天井寄りに収め、吊り下がって見えるようにする。
  _prop(ctx, "deco_lantern", 150, 430, 200, 1, { color: "#ffcc66", blur: lglow });
  _prop(ctx, "deco_lantern", 930, 430, 200, 1, { color: "#ffcc66", blur: lglow });

  // 奥壁の鉄格子（中央の敵を挟む窓・高め）
  _prop(ctx, "prop_grate", 432, 372, 104, 0.82);
  _prop(ctx, "prop_grate", 648, 372, 104, 0.82);

  // 壁に取り付けた松明（炎グロー）。メイン光源。
  // 壁領域(y230-530)内に収め、床に立たず壁付けに見えるサイズ・位置。
  _prop(ctx, "deco_torch", 300, 512, 210, 1, { color: "#ff8a3d", blur: flick });
  _prop(ctx, "deco_torch", 780, 512, 210, 1, { color: "#ff8a3d", blur: flick });

  // 大型クリスタルの無いゾーン（森）は手前隅に燭台（既存素材）を残す
  if (!zone.bigCrystals) {
    _prop(ctx, "prop_candelabra", 66,   792, 208, 1, { color: "#ffb300", blur: flick });
    _prop(ctx, "prop_candelabra", 1014, 792, 208, 1, { color: "#ffb300", blur: flick });
  }

  // ランキング#1の宝箱（金）。宝の輝き。
  _prop(ctx, "deco_chest_gold", 986, L.rankY + 16, 92, 0.98, { color: "#ffd54f", blur: 14 });

  // 最下段コマンド帯の背後にダンジョン扉（薄く敷く）
  _prop(ctx, "prop_doors", CW / 2, CH - 6, 196, 0.5);
}

// ---- 発光クリスタル（多面体ジェム）----
function _drawCrystal(ctx, x, baseY, h, color, now, phase) {
  const w = h * 0.44;
  const pulse = 0.5 + 0.5 * Math.sin(now / 600 + phase);
  const topY = baseY - h;
  const midY = baseY - h * 0.34;
  const lowY = baseY - h * 0.06;

  ctx.save();
  // 本体（発光）
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 + pulse * 16;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x + w / 2, midY);
  ctx.lineTo(x + w / 2, lowY);
  ctx.lineTo(x, baseY);
  ctx.lineTo(x - w / 2, lowY);
  ctx.lineTo(x - w / 2, midY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 左側の面を明るく（立体感）
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, baseY);
  ctx.lineTo(x - w / 2, lowY);
  ctx.lineTo(x - w / 2, midY);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.fill();

  // 中央のハイライト（明滅）
  ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`;
  ctx.fillRect(x - 2, baseY - h * 0.6, 4, h * 0.24);
  ctx.restore();
}

// ---- タイトルバー ----
function _drawTitle(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, CW, L.titleH);

  ctx.font = "bold 36px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700";
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 10;
  ctx.fillText("COMMENT QUEST", CW / 2, 54);
  ctx.shadowBlur = 0;

  ctx.font = "18px monospace";
  ctx.fillStyle = "#aaa";
  ctx.fillText(`Floor ${state.floor}  Kills: ${state.killCount}  Gold: ${state.hero.gold}G`, CW / 2, 78);

  // タイトル下の装飾ボーダー（石＋宝石の帯）
  const deco = window.IMG && IMG.ui_deco_border;
  if (deco) {
    const dh = 34;
    const dw = deco.width * (dh / deco.height);
    ctx.imageSmoothingEnabled = false;
    // 横方向にタイル状に並べて画面幅いっぱいに
    for (let dx = 0; dx < CW; dx += dw - 1) {
      ctx.drawImage(deco, dx, L.titleH - dh / 2, dw, dh);
    }
  }
}

// ---- 敵HPバー ----
function _drawEnemyHpBar(ctx) {
  const enemy = state.enemy;
  if (!enemy) return;

  const bw = CW - 80;
  const bh = 36;
  const bx = 40;
  const by = L.enemyHpY;

  // ラベル
  ctx.font = "bold 20px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = enemy.isBoss ? "#ffd700" : "#eee";
  ctx.fillText(enemy.nameJP ?? enemy.name, bx, by - 6);

  // 背景
  ctx.fillStyle = "#111";
  ctx.fillRect(bx, by, bw, bh);

  // 残量
  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  const hpColor = ratio > 0.5 ? "#e53935" : ratio > 0.25 ? "#ff6d00" : "#ff1744";
  ctx.fillStyle = hpColor;
  ctx.fillRect(bx, by, bw * ratio, bh);

  // ボスHP文字
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.max(0, enemy.hp)} / ${enemy.maxHp}`, bx + bw / 2, by + 24);

  // ボス特殊イベントマーカー（75%・50%・25%）
  if (enemy.isBoss) {
    for (const pct of [0.75, 0.5, 0.25]) {
      const mx = bx + bw * pct;
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx, by);
      ctx.lineTo(mx, by + bh);
      ctx.stroke();
    }
  }
}

// ---- 戦闘フィールド ----
function _drawField(ctx, now) {
  const e = state.enemy;

  // 敵の足元に魔法陣（ルーンタイルを床に伏せて表示）
  if (e && e.hp > 0 && IMG.tile_rune) {
    const pw = (e.size || 60) * 3;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG.tile_rune, e.x - pw / 2, e.y + (e.size || 60) * 0.55, pw, pw * 0.5);
    ctx.restore();
  }

  // 敵を描画
  if (e) drawEnemy(ctx, e, now);
}

// ---- 進化ステージ情報 ----
function _getHeroEvoInfo(level) {
  if (level < 5)  return { stage: 1, name: "Novice",    sprite: "hero_evo1", color: "#a5d6a7" };
  if (level < 10) return { stage: 2, name: "Squire",    sprite: "hero_evo2", color: "#ffcc80" };
  if (level < 15) return { stage: 3, name: "Knight",    sprite: "hero_evo3", color: "#90caf9" };
  if (level < 20) return { stage: 4, name: "Crusader",  sprite: "hero_evo4", color: "#b0bec5" };
  if (level < 25) return { stage: 5, name: "Paladin",   sprite: "hero_evo5", color: "#ce93d8" };
  return           { stage: 6, name: "LEGENDARY",  sprite: "hero_evo6", color: "#ffd700" };
}

// ---- 勇者（ドット絵ナイト）----
function _drawHero(ctx, now) {
  const h = state.hero;
  const awk = h.isAwakened, def = h.isDefending;
  const evo = _getHeroEvoInfo(h.level);

  let dx = 0, dy = 0;
  if (now < h.shakeUntil) { dx = (Math.random() - 0.5) * 10; dy = (Math.random() - 0.5) * 6; }

  const lunge = now < h.attackFlash ? 16 : 0;   // 攻撃時に敵方向へ踏み込む
  const bob = Math.sin(now / 350) * 3;          // 待機のゆらぎ

  // ---- スプライト描画（進化ステージスプライト → 汎用 hero の順でフォールバック）----
  const evoImg = window.IMG && (IMG[evo.sprite] || IMG.hero);
  if (evoImg) {
    const img = evoImg;
    const dh = 172;
    const dw = dh * (img.width / img.height);
    const cx = h.x + dx + lunge;
    const cy = h.y + dy + bob;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 進化ステージのグロー（覚醒 > 防御 > ステージ固有グロー の優先順）
    const glowColor = awk ? "#ffd700" : def ? "#4fc3f7" : evo.stage === 6 ? "#ffd700" : evo.color;
    const glowBlur  = awk ? 26 + Math.sin(now / 200) * 8
                         : def ? 16
                         : evo.stage >= 4 ? 14 + Math.sin(now / 500) * 4 : 0;
    if (glowBlur > 0) { ctx.shadowColor = glowColor; ctx.shadowBlur = glowBlur; }
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.shadowBlur = 0;
    // 攻撃時の白フラッシュ（スプライト形状のみ）
    if (now < h.attackFlash) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(whiteSilhouette(img), cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 名前ラベル + 進化ステージバッジ
    const nameColor = awk ? "#ffd700" : evo.stage === 6 ? "#ffd700" : evo.color;
    ctx.font = "bold 16px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = nameColor;
    ctx.fillText(`Lv.${h.level} ${h.name}`, h.x, cy + dh / 2 + 22);
    // Stage バッジ（小さく右下に）
    _drawHeroStageBadge(ctx, h.x + dw / 2 - 6, cy + dh / 2 - 6, evo);
    return;
  }

  const u = 6;                                   // ドット1辺
  const cx = Math.round(h.x + dx + lunge);
  const top = Math.round(h.y + dy + bob - 66);
  const left = cx - 7 * u;

  // パレット（覚醒=金 / 防御=水 / 通常=藍）
  const arm  = awk ? "#ffca28" : def ? "#29b6f6" : "#5c6bc0";
  const armL = awk ? "#fff59d" : def ? "#81d4fa" : "#9fa8da";
  const armD = awk ? "#f57f17" : def ? "#0277bd" : "#303f9f";
  const steel = "#cfd8dc", steelL = "#eceff1", steelD = "#78909c";
  const skin = "#ffd2b0";
  const OUT = "#0c0c16";
  const PLUME = awk ? "#fff176" : "#e53935";

  const P = (col, row, w, hh, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(left + col * u, top + row * u, w * u, hh * u);
  };

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // グロー（シルエットだけに影を付けてから詳細描画）
  if (awk || def) {
    ctx.shadowColor = awk ? "#ffd700" : "#4fc3f7";
    ctx.shadowBlur = awk ? 26 + Math.sin(now / 200) * 8 : 16;
    ctx.fillStyle = arm;
    ctx.fillRect(left + 2 * u, top + 2 * u, 10 * u, 16 * u);
    ctx.shadowBlur = 0;
  }

  // 盾（防御中・左手側）
  if (def) {
    P(0, 9, 2, 5, OUT);
    P(0, 9, 2, 4, armL);
    P(0, 11, 2, 1, "#ffffff");
  }

  // 剣（右手側・縦持ち）
  P(12, 0, 2, 1, OUT);
  P(12, 1, 1, 9, steelL);
  P(13, 1, 1, 9, steel);
  P(11, 9, 3, 1, armD);
  P(12, 10, 1, 3, awk ? "#f57f17" : "#8d6e63");

  // 脚・ブーツ
  P(4, 15, 2, 4, OUT);
  P(8, 15, 2, 4, OUT);
  P(4, 15, 2, 3, armD);
  P(8, 15, 2, 3, armD);
  P(3, 18, 3, 1, "#3e2723");
  P(8, 18, 3, 1, "#3e2723");

  // 胴体
  P(2, 9, 10, 7, OUT);
  P(3, 9, 8, 6, arm);
  P(6, 9, 2, 6, armL);
  P(3, 9, 8, 1, armL);
  P(3, 14, 8, 1, armD);

  // 腕・手
  P(2, 10, 1, 4, arm);
  P(11, 10, 1, 4, arm);
  P(2, 13, 1, 1, skin);
  P(11, 13, 1, 1, skin);

  // 顔
  P(4, 6, 6, 4, OUT);
  P(5, 6, 4, 3, skin);
  P(5, 7, 1, 1, OUT);
  P(8, 7, 1, 1, OUT);

  // 兜
  P(3, 2, 8, 1, OUT);
  P(3, 2, 1, 5, OUT);
  P(10, 2, 1, 5, OUT);
  P(4, 3, 6, 3, steel);
  P(5, 3, 4, 1, steelL);
  P(4, 5, 6, 1, steelD);

  // 羽根飾り
  P(6, 0, 2, 2, PLUME);
  P(6, 0, 1, 2, OUT);

  // 攻撃フラッシュ（全身うっすら白）
  if (now < h.attackFlash) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, top, 14 * u, 19 * u);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // 名前ラベル
  ctx.font = "bold 16px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = awk ? "#ffd700" : "#90caf9";
  ctx.fillText(`Lv.${h.level} ${h.name}`, h.x, h.y + 74);
}

// ---- 進化ステージバッジ（スプライト右下の小さなアイコン）----
function _drawHeroStageBadge(ctx, rx, by, evo) {
  const r = 18;
  // 背景円
  ctx.save();
  ctx.beginPath();
  ctx.arc(rx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fill();
  ctx.strokeStyle = evo.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  // ★の数（stage分の☆をひとまとめにせず、Stage番号を数字で表示）
  ctx.font = `bold 14px 'Press Start 2P', monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = evo.color;
  ctx.fillText(`S${evo.stage}`, rx, by + 5);
  ctx.restore();
}

// ---- 勇者HPバー ----
// 石フレーム内スロットの相対座標（ui_hpframe.png から実測）
const _HPFRAME_SLOT = { x: 0.167, y: 0.296, w: 0.694, h: 0.422 };

function _drawHeroHpBar(ctx) {
  const h = state.hero;
  const ratio = Math.max(0, h.hp / h.maxHp);
  const hpColor = ratio > 0.5 ? "#43a047" : ratio > 0.25 ? "#fbc02d" : "#e53935";
  const frame = window.IMG && IMG.ui_hpframe;

  if (frame) {
    // ---- 石フレーム付き HP ゲージ ----
    const fw = CW - 36;
    const fh = 104;
    const fx = 18;
    const fy = L.heroHpY - 34;

    // スロット（バーを描く窪み）
    const sx = fx + _HPFRAME_SLOT.x * fw;
    const sy = fy + _HPFRAME_SLOT.y * fh;
    const sw = _HPFRAME_SLOT.w * fw;
    const sh = _HPFRAME_SLOT.h * fh;

    // フレーム本体（石枠＋HP/MPアイコン＋暗いスロット）を先に描く
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, fx, fy, fw, fh);

    // スロット内に HP フィルを重ねる（アスペクト誤差を吸収する小インセット）
    const pad = 5;
    const fillW = (sw - pad * 2) * ratio;
    ctx.fillStyle = hpColor;
    ctx.fillRect(sx + pad, sy + pad, fillW, sh - pad * 2);
    // フィル上部のハイライト
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sx + pad, sy + pad, fillW, (sh - pad * 2) * 0.4);
    ctx.globalAlpha = 1;

    // HP 数値
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.fillText(`${h.hp} / ${h.maxHp}`, sx + sw / 2, sy + sh / 2 + 6);
    ctx.shadowBlur = 0;

    // 覚醒タイマー
    if (h.isAwakened) {
      const remain = Math.ceil((h.awakenEndTime - performance.now()) / 1000);
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = "#ffd700";
      ctx.textAlign = "right";
      ctx.fillText(`⚡AWAKEN ${remain}s`, fx + fw - 8, fy - 4);
    }
    return;
  }

  // ---- フォールバック（フレーム未読込時の素のバー）----
  const bw = CW - 80, bh = 32, bx = 40, by = L.heroHpY;
  ctx.font = "bold 16px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#90caf9";
  ctx.fillText("HERO HP", bx, by - 6);
  ctx.fillStyle = "#111";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = hpColor;
  ctx.fillRect(bx, by, bw * ratio, bh);
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${h.hp} / ${h.maxHp}`, bx + bw / 2, by + 22);
  if (h.isAwakened) {
    const remain = Math.ceil((h.awakenEndTime - performance.now()) / 1000);
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#ffd700";
    ctx.textAlign = "right";
    ctx.fillText(`⚡AWAKEN ${remain}s`, bx + bw - 4, by - 6);
  }
}

// ---- 応援ゲージ ----
function _drawSupportGauge(ctx) {
  const bw = CW - 80;
  const bh = 26;
  const bx = 40;
  const by = L.gaugeY;

  ctx.font = "bold 15px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ce93d8";
  ctx.fillText("SUPPORT GAUGE", bx, by - 6);

  ctx.fillStyle = "#111";
  ctx.fillRect(bx, by, bw, bh);

  const ratio = state.supportGauge / state.supportGaugeMax;
  const gx = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  gx.addColorStop(0, "#7b1fa2");
  gx.addColorStop(1, "#e91e63");
  ctx.fillStyle = gx;
  ctx.fillRect(bx, by, bw * Math.min(1, ratio), bh);

  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.round(state.supportGauge)} / ${state.supportGaugeMax}`, bx + bw / 2, by + 18);
}

// ---- ランキング ----
function _drawRanking(ctx) {
  const top = getRanking(5);
  const startY = L.rankY;
  const rowH = 52;

  ctx.font = "bold 20px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd700";
  ctx.fillText("🏆 RANKING", 40, startY);

  // 👑 トップサポーター（救世主）バナー — ギフト最多の人を称える
  const ts = state.topSupporter;
  if (ts && ts.coins > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
    ctx.textAlign = "right";
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = `rgba(255,200,40,${0.65 + 0.35 * pulse})`;
    ctx.shadowColor = "#ff9800";
    ctx.shadowBlur = 8 + 8 * pulse;
    ctx.fillText(`👑 救世主 ${ts.user} (${ts.coins}🪙)`, CW - 40, startY);
    ctx.shadowBlur = 0;
  }

  const medals = ["🥇", "🥈", "🥉", "4.", "5."];

  top.forEach((entry, i) => {
    const ry = startY + 28 + i * rowH;
    const isSavior = ts && entry.user === ts.user;
    ctx.fillStyle = i === 0 ? "rgba(255,215,0,0.12)" : "rgba(255,255,255,0.04)";
    ctx.fillRect(40, ry, CW - 80, rowH - 4);
    if (isSavior) {
      ctx.strokeStyle = "rgba(255,200,40,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(41, ry + 1, CW - 82, rowH - 6);
    }

    ctx.font = `bold ${i === 0 ? 20 : 17}px monospace`;
    ctx.fillStyle = i === 0 ? "#ffd700" : "#ddd";
    ctx.textAlign = "left";
    const crown = isSavior ? "👑" : medals[i];
    ctx.fillText(`${crown} ${entry.user}`, 52, ry + 30);

    ctx.textAlign = "right";
    ctx.fillStyle = "#aaa";
    ctx.fillText(`${entry.score}pt`, CW - 52, ry + 30);
  });
}

// ---- バトルログ ----
function _drawBattleLog(ctx, now) {
  const LOG_TTL = 8000;
  const startY = L.logY;
  const lineH = 30;

  ctx.font = "15px monospace";
  ctx.textAlign = "left";

  state.battleLog.forEach((entry, i) => {
    const age = now - entry.born;
    if (age > LOG_TTL) return;
    const alpha = Math.min(1, 1 - (age - LOG_TTL * 0.7) / (LOG_TTL * 0.3));
    ctx.fillStyle = `rgba(180,180,180,${alpha})`;
    ctx.fillText(entry.text, 50, startY + i * lineH);
  });
}

// ---- ラストヒット ----
function _drawLastHit(ctx, now) {
  const lh = state.lastHit;
  if (!lh) return;
  const age = now - lh.time;
  const TTL = 4000;
  if (age > TTL) return;

  const alpha = Math.max(0, 1 - age / TTL);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "bold 28px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700";
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 14;
  ctx.fillText("⚔ LAST HIT!", CW / 2, L.lastHitY);
  ctx.font = "bold 22px monospace";
  ctx.fillStyle = "#fff";
  ctx.shadowBlur = 0;
  ctx.fillText(lh.user, CW / 2, L.lastHitY + 40);
  ctx.restore();
}

// ======================================================
// ① ボス来訪カウントダウン（敵HPバーの下）
// ======================================================
function _drawBossCountdown(ctx, now) {
  if (state.phase === "result") return;
  if (state.enemy && state.enemy.isBoss) return;  // 既にボス戦

  const toNextBoss = 5 - (state.floor % 5);   // あと何フロアでボス
  if (toNextBoss > 2) return;                  // 3フロア以上なら表示しない

  const pulse = 0.65 + 0.35 * Math.abs(Math.sin(now / (toNextBoss === 1 ? 280 : 500)));
  ctx.save();
  ctx.globalAlpha = pulse;

  if (toNextBoss === 1) {
    // 1フロア前: 大きく赤橙
    ctx.font = "bold 24px 'Press Start 2P', monospace";
    ctx.fillStyle = "#ff5722";
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 16;
    ctx.textAlign = "center";
    ctx.fillText("⚠ BOSS NEXT FLOOR! ⚠", CW / 2, L.enemyHpY + 58);
  } else {
    // 2フロア前: 小さく黄
    ctx.font = "bold 18px 'Press Start 2P', monospace";
    ctx.fillStyle = "#ffc107";
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.fillText(`BOSS IN ${toNextBoss} FLOORS`, CW / 2, L.enemyHpY + 54);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ======================================================
// ② 勇者HP低下時の赤フラッシュオーバーレイ
// ======================================================
function _drawDangerOverlay(ctx, now) {
  const h = state.hero;
  const ratio = h.maxHp > 0 ? h.hp / h.maxHp : 0;
  if (ratio > 0.3 || h.hp <= 0) return;

  const severity = (0.3 - ratio) / 0.3;         // HP が低いほど1に近づく
  const pulse    = (Math.sin(now / (200 - severity * 80)) + 1) / 2;  // 危険度高いほど速い

  ctx.save();
  // 画面周囲の赤ビネット
  const grad = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.25, CW / 2, CH / 2, CH * 0.75);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(220,0,0,${(0.15 + 0.25 * pulse) * severity})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CW, CH);

  // HP < 15% で DANGER テキスト + コマンドヒント
  if (ratio < 0.15) {
    const ta = 0.55 + 0.45 * pulse;
    ctx.globalAlpha = ta;
    ctx.font = "bold 52px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff1744";
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 28;
    ctx.fillText("⚠ DANGER!", CW / 2, L.fieldTop + 120);
    ctx.font = "bold 26px 'Press Start 2P', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 10;
    ctx.fillText("💚/2  HEAL NOW!", CW / 2, L.fieldTop + 180);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ======================================================
// ③ 応援バーストフラッシュ
// ======================================================
function _drawSupportBurstFlash(ctx, now) {
  const t = state.supportBurstAt;
  if (!t) return;
  const age = now - t;
  const TTL = 800;
  if (age > TTL) return;

  const alpha = (1 - age / TTL) * 0.55;
  ctx.save();
  ctx.globalAlpha = alpha;
  // ピンク→透明のグラデーション
  const g = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, CH * 0.7);
  g.addColorStop(0, "#ff4081");
  g.addColorStop(1, "rgba(233,30,99,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
}

// ======================================================
// ④ ラストヒット大演出（敵撃破の瞬間）
// ======================================================
function _drawLastHitFlash(ctx, now) {
  const lhf = state.lastHitFlash;
  if (!lhf) return;
  const age = now - lhf.time;
  const TTL = 3800;
  if (age > TTL) return;

  ctx.save();

  // 画面ゴールドフラッシュ（最初の 350ms）
  if (age < 350) {
    ctx.globalAlpha = (1 - age / 350) * 0.5;
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(0, L.fieldTop, CW, L.fieldBot - L.fieldTop);
  }

  // メインテキスト（フェードイン → フェードアウト）
  const fadeIn  = Math.min(1, age / 180);
  const fadeOut = Math.max(0, 1 - Math.max(0, age - 1200) / 2600);
  const alpha   = fadeIn * fadeOut;
  if (alpha <= 0) { ctx.restore(); return; }

  ctx.globalAlpha = alpha;

  // スケールアニメ（小→等倍）
  const sc = Math.min(1, 0.4 + age / 280);
  ctx.translate(CW / 2, L.lastHitY - 30);
  ctx.scale(sc, sc);
  ctx.translate(-CW / 2, -(L.lastHitY - 30));

  // "⚔ LAST HIT!" — 大きめゴールド
  const fs1 = 46;
  ctx.font = `bold ${fs1}px 'Press Start 2P', monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700";
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 30;
  ctx.fillText("⚔ LAST HIT!", CW / 2, L.lastHitY - 30);

  // ユーザー名
  ctx.font = "bold 34px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffd700";
  ctx.shadowBlur = 14;
  ctx.fillText(lhf.user, CW / 2, L.lastHitY + 26);

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ---- ボス登場の暗転イベント ----
function _drawBossIntro(ctx, now) {
  const bi = state.bossIntro;
  if (!bi) return;
  const age = now - bi.start;
  if (age > bi.duration) { state.bossIntro = null; return; }
  const t = age / bi.duration;

  // 暗転の不透明度（最初にフェードイン → 最後にフェードアウト）
  let dark = 0.82;
  if (t < 0.15) dark = (t / 0.15) * 0.82;
  else if (t > 0.82) dark = (1 - (t - 0.82) / 0.18) * 0.82;

  ctx.save();
  ctx.fillStyle = `rgba(8,0,4,${dark})`;
  ctx.fillRect(0, 0, CW, CH);

  // 中央の赤い帯
  const bandY = CH * 0.42;
  const bandH = 200;
  ctx.globalAlpha = Math.min(1, dark / 0.82);
  const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  grad.addColorStop(0, "rgba(120,0,0,0)");
  grad.addColorStop(0.5, "rgba(140,0,0,0.55)");
  grad.addColorStop(1, "rgba(120,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, CW, bandH);

  ctx.textAlign = "center";

  // ⚠ WARNING ⚠（赤、点滅）
  const pulse = 0.6 + 0.4 * Math.sin(age / 90);
  ctx.globalAlpha = Math.min(1, dark / 0.82) * pulse;
  ctx.font = "bold 34px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ff1744";
  ctx.shadowColor = "#ff1744";
  ctx.shadowBlur = 24;
  ctx.fillText("⚠ WARNING ⚠", CW / 2, bandY + 30);

  // ボス名（日本語・ゴールド）
  ctx.globalAlpha = Math.min(1, dark / 0.82);
  ctx.font = "bold 46px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd700";
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 28;
  ctx.fillText(bi.nameJP, CW / 2, bandY + 110);

  // ボス名（英語・白・小）
  ctx.font = "20px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 10;
  ctx.fillText(bi.nameEN, CW / 2, bandY + 150);

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ======================================================
// 💰 ギフトテイクオーバー（large 以上のフル画面演出）
// コイン額(tier)で暗転・サイズ・放射・文言がエスカレートする「価値のはしご」。
// ======================================================
function _drawGiftTakeover(ctx, now) {
  const fx = state.giftFx;
  if (!fx) return;
  const age = now - fx.born;
  if (age > fx.duration) { state.giftFx = null; return; }
  const t = age / fx.duration;

  const CFG = {
    large: { dark: 0.55, accent: "#ff7043", ring: "#ffab40", kh: 420, label: "SPECIAL MOVE!", rays: 16 },
    super: { dark: 0.74, accent: "#ffd54f", ring: "#ffe082", kh: 500, label: "★ AWAKENING ★", rays: 20 },
    ultra: { dark: 0.88, accent: "#ff5252", ring: "#ff8a80", kh: 580, label: "‼ LEGENDARY ‼", rays: 28 },
  }[fx.tier] || { dark: 0.5, accent: "#fff", ring: "#fff", kh: 380, label: "GIFT!", rays: 14 };

  // フェードイン/アウトのエンベロープ
  let env = 1;
  if (t < 0.12) env = t / 0.12;
  else if (t > 0.82) env = Math.max(0, (1 - t) / 0.18);

  const cx = CW / 2, cy = CH * 0.40;

  ctx.save();

  // 1) 暗転
  ctx.globalAlpha = env;
  ctx.fillStyle = `rgba(6,2,12,${CFG.dark})`;
  ctx.fillRect(0, 0, CW, CH);

  // 2) 回転する放射光
  ctx.save();
  ctx.globalAlpha = env * 0.45;
  ctx.translate(cx, cy);
  ctx.rotate(now / 2400);
  for (let i = 0; i < CFG.rays; i++) {
    ctx.rotate((Math.PI * 2) / CFG.rays);
    const g = ctx.createLinearGradient(0, 0, 0, -CH * 0.75);
    g.addColorStop(0, CFG.accent);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.lineTo(0, -CH * 0.75); ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3) 中央の光輪
  const pop = Math.min(1, age / 320);
  const kh = CFG.kh * (0.62 + 0.38 * pop);
  ctx.globalAlpha = env * 0.5;
  const halo = ctx.createRadialGradient(cx, cy, 20, cx, cy, kh * 0.9);
  halo.addColorStop(0, CFG.ring);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, kh * 0.9, 0, Math.PI * 2); ctx.fill();

  // 4) 巨大ミニ勇者（送り主アバターを顔にはめる）
  ctx.globalAlpha = env;
  _drawMiniHero(ctx, { user: fx.user, avatar: fx.avatar, count: 1 }, cx, cy + kh * 0.45, kh, now, { bare: true });

  // 5) ティアラベル（上）
  ctx.textAlign = "center";
  ctx.globalAlpha = env;
  ctx.font = "bold 40px 'Press Start 2P', monospace";
  ctx.fillStyle = CFG.accent;
  ctx.shadowColor = CFG.accent;
  ctx.shadowBlur = 28;
  ctx.fillText(CFG.label, cx, cy - kh * 0.45);

  // 6) 送り主名（下・大きく）
  ctx.font = "bold 38px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = CFG.ring;
  ctx.shadowBlur = 16;
  const nm = (fx.user || "").length > 14 ? fx.user.slice(0, 13) + "…" : (fx.user || "");
  ctx.fillText(nm, cx, cy + kh * 0.45 + 64);

  // 7) ギフト名＋累計貢献（承認）
  ctx.font = "bold 22px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd54f";
  ctx.shadowBlur = 8;
  ctx.fillText(`🎁 ${fx.giftName || "GIFT"}`, cx, cy + kh * 0.45 + 104);
  if (fx.total) {
    ctx.font = "16px 'Press Start 2P', monospace";
    ctx.fillStyle = "#ffe082";
    ctx.fillText(`TOTAL ${fx.total.toLocaleString()} 🪙`, cx, cy + kh * 0.45 + 138);
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ======================================================
// 💀 勇者ダウン（ギフト蘇生待ち）オーバーレイ
// ======================================================
function _drawHeroDownOverlay(ctx, now) {
  const d = state.heroDown;
  if (!d) return;
  const remain = Math.max(0, d.until - now);
  const ratio = remain / (d.until - d.since);
  const pulse = 0.6 + 0.4 * Math.sin(now / 180);

  ctx.save();
  // 赤い暗転ビネット
  const g = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.15, CW / 2, CH / 2, CH * 0.7);
  g.addColorStop(0, "rgba(40,0,0,0.35)");
  g.addColorStop(1, `rgba(140,0,0,${0.45 + 0.2 * pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);

  ctx.textAlign = "center";
  // 💀 DOWN
  ctx.font = "bold 60px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ff1744";
  ctx.shadowColor = "#ff1744";
  ctx.shadowBlur = 30;
  ctx.fillText("💀 DOWN!", CW / 2, CH * 0.34);

  // 蘇生CTA（点滅）
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.font = "bold 34px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd54f";
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 20;
  ctx.fillText("🎁 ギフトで蘇生せよ！", CW / 2, CH * 0.34 + 70);
  ctx.globalAlpha = 1;
  ctx.font = "18px 'Press Start 2P', monospace";
  ctx.fillStyle = "#fff";
  ctx.shadowBlur = 6;
  ctx.fillText("REVIVE THE HERO WITH A GIFT", CW / 2, CH * 0.34 + 112);

  // カウントダウンバー
  const bw = CW * 0.6, bx = (CW - bw) / 2, by = CH * 0.34 + 150, bh = 22;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = ratio > 0.3 ? "#ffb300" : "#ff1744";
  ctx.fillRect(bx, by, bw * ratio, bh);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px monospace";
  ctx.fillText(`${(remain / 1000).toFixed(1)}s`, CW / 2, by + 16);

  ctx.restore();
}

// ======================================================
// 🎯 集団目標メーター（セッション累計ギフトコイン）
// 「みんなで魔王を倒す」共通ゴール → 共同体で課金に向かわせる。
// ======================================================
function _drawGoalMeter(ctx, now) {
  const bw = CW - 120, bx = 60, by = 152, bh = 22;

  ctx.save();
  ctx.font = "bold 13px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ff8a80";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
  ctx.fillText("🎯 みんなで魔王討伐", bx, by - 6);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffd54f";
  ctx.fillText(`${state.goalCoins.toLocaleString()} / ${state.goalTarget.toLocaleString()} 🪙`, bx + bw, by - 6);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(bx, by, bw, bh);
  const ratio = Math.min(1, state.goalCoins / state.goalTarget);
  const gx = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  gx.addColorStop(0, "#7c4dff");
  gx.addColorStop(0.5, "#ff4081");
  gx.addColorStop(1, "#ffd740");
  ctx.fillStyle = gx;
  ctx.fillRect(bx, by, bw * ratio, bh);
  ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);

  // 達成フラッシュ
  if (state.goalReached) {
    const age = now - state.goalReachedAt;
    if (age < 4000) {
      const a = age < 200 ? age / 200 : Math.max(0, 1 - (age - 1500) / 2500);
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = "bold 20px 'Press Start 2P', monospace";
      ctx.fillStyle = "#ffd740";
      ctx.shadowColor = "#ff4081"; ctx.shadowBlur = 16;
      ctx.fillText("🎉 GOAL CLEAR! ありがとう！", CW / 2, by + bh + 28);
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

// ---- フローティングダメージ数字 ----
function _drawDamageNumbers(ctx, now) {
  const TTL = 1200;
  for (let i = state.damageNumbers.length - 1; i >= 0; i--) {
    const dn = state.damageNumbers[i];
    const age = now - dn.born;
    if (age > TTL) { state.damageNumbers.splice(i, 1); continue; }
    const alpha = 1 - age / TTL;
    const y = dn.y - (age / TTL) * 80;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold 26px 'Press Start 2P', monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = dn.color;
    ctx.shadowColor = dn.color;
    ctx.shadowBlur = 8;
    ctx.fillText(dn.text, dn.x, y);
    ctx.restore();
  }
}

// ---- 通知 ----
function _drawNotifications(ctx, now) {
  const visible = state.notifications.filter(n => now - n.born < n.duration);
  state.notifications = visible;

  visible.slice(0, 3).forEach((n, i) => {
    const age = now - n.born;
    const alpha = Math.min(1, Math.min((age / 200), (n.duration - age) / 400));
    const y = L.fieldTop + 40 + i * 68;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.roundRect(60, y, CW - 120, 52, 12);
    ctx.fill();

    ctx.font = "bold 20px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, CW / 2, y + 34);
    ctx.restore();
  });
}

// ---- エフェクト ----
function _drawEffects(ctx, now) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const ef = state.effects[i];
    const age = now - ef.born;
    if (age > ef.duration) { state.effects.splice(i, 1); continue; }
    if (age < 0) continue;   // born を未来に設定した遅延エフェクト（着弾爆発など）
    const t = age / ef.duration;
    const alpha = 1 - t;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (ef.type === "magic_burst") {
      const r = 40 + t * 80;
      ctx.strokeStyle = "#ff9800";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ef.type === "heal_burst") {
      const r = 30 + t * 60;
      ctx.strokeStyle = "#69f0ae";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ef.type === "explosion") {
      for (let j = 0; j < 8; j++) {
        const angle = (j / 8) * Math.PI * 2;
        const r = t * 120;
        const ex = ef.x + Math.cos(angle) * r;
        const ey = ef.y + Math.sin(angle) * r;
        ctx.fillStyle = j % 2 === 0 ? "#ff5722" : "#ffd700";
        ctx.beginPath();
        ctx.arc(ex, ey, 8 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ef.type === "awaken") {
      const r = t * 200;
      const grad = ctx.createRadialGradient(ef.x, ef.y, 0, ef.x, ef.y, r);
      grad.addColorStop(0, "rgba(255,215,0,0.6)");
      grad.addColorStop(1, "rgba(255,215,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (ef.type === "enemy_death") {
      const ageF = age / 16;               // フレーム換算（60fps基準）
      // 中央フラッシュ（最初の25%だけ強く光る）
      if (t < 0.25) {
        const fa = 1 - t / 0.25;
        const fr = ef.isBoss ? 200 : 130;
        const g = ctx.createRadialGradient(ef.x, ef.y, 0, ef.x, ef.y, fr);
        g.addColorStop(0, `rgba(255,255,255,${0.85 * fa})`);
        g.addColorStop(0.5, `rgba(255,235,180,${0.4 * fa})`);
        g.addColorStop(1, "rgba(255,235,180,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, fr, 0, Math.PI * 2);
        ctx.fill();
      }
      // 衝撃波リング
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ef.isBoss ? "#ff5252" : "#ffffff";
      ctx.lineWidth = (ef.isBoss ? 7 : 4) * (1 - t);
      const rw = (ef.isBoss ? 170 : 115) * t;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, rw, 0, Math.PI * 2);
      ctx.stroke();
      if (ef.isBoss) {
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, rw * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 破片（敵色の四角が飛び散る＋重力で落下＋回転）
      ctx.fillStyle = ef.color;
      for (const s of ef.shards) {
        const px = ef.x + s.ox + s.vx * ageF;
        const py = ef.y + s.oy + s.vy * ageF + 0.16 * ageF * ageF;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(px, py);
        ctx.rotate(s.rot + s.vr * ageF);
        ctx.fillRect(-s.sz / 2, -s.sz / 2, s.sz, s.sz);
        ctx.restore();
      }
    } else if (ef.type === "slash") {
      // 三日月の斬撃（白→淡青、外側に開きながら消える）
      const base = ef.angle ?? -0.7;
      const r = 50 + t * 70;
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.shadowBlur = 18;
      ctx.shadowColor = ef.color ?? "#ffffff";
      ctx.strokeStyle = ef.color ?? "#ffffff";
      ctx.lineWidth = 10 * (1 - t) + 2;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, r, base, base + 1.3);
      ctx.stroke();
      ctx.strokeStyle = "#b3e5fc";
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, r + 10, base + 0.1, base + 1.15);
      ctx.stroke();
    } else if (ef.type === "projectile") {
      // 飛翔する炎弾（軌跡を引きながら敵へ向かう）
      const p = Math.min(1, t / 0.85);
      const px = ef.sx + (ef.tx - ef.sx) * p;
      const py = ef.sy + (ef.ty - ef.sy) * p;
      ctx.globalAlpha = 1;
      // 軌跡
      for (let k = 1; k <= 5; k++) {
        const tp = Math.max(0, p - k * 0.05);
        const tx = ef.sx + (ef.tx - ef.sx) * tp;
        const ty = ef.sy + (ef.ty - ef.sy) * tp;
        ctx.globalAlpha = (1 - k / 6) * 0.6;
        ctx.fillStyle = ef.color ?? "#ff7043";
        ctx.beginPath();
        ctx.arc(tx, ty, 10 - k, 0, Math.PI * 2);
        ctx.fill();
      }
      // 本体（外炎＋白核）
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 20;
      ctx.shadowColor = ef.color ?? "#ff7043";
      ctx.fillStyle = ef.color ?? "#ff7043";
      ctx.beginPath();
      ctx.arc(px, py, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff3e0";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ---- ギフト応援団（アバター列＋ポップイン）----
const _avatarCache = new Map();   // url -> Image
const GIFTER_TTL = 120000;        // 応援団に残る時間(ms)

/** アバター画像を遅延ロード（pixel読み出しはしないので crossOrigin 不要）*/
function _getAvatarImg(url) {
  if (!url) return null;
  if (_avatarCache.has(url)) return _avatarCache.get(url);
  const img = new Image();
  img.src = url;
  _avatarCache.set(url, img);
  return img;
}

// avatar_frame.png の顔ホール位置（正規化座標：枠の幅/高さに対する比）
const _AVF = { cx: 0.4844, cy: 0.4361, rx: 0.2128, ry: 0.1218 };

function _drawGifterRow(ctx, now) {
  const gs = state.gifters;
  if (!gs || gs.length === 0) return;

  // 期限切れを除去
  for (let i = gs.length - 1; i >= 0; i--) {
    if (now - gs[i].lastGiftAt > GIFTER_TTL) gs.splice(i, 1);
  }
  if (gs.length === 0) return;

  const KH = 116;                 // ミニ勇者の高さ(等倍)
  const gap = 96;                 // 中心間隔
  const baseY = L.fieldBot - 2;   // 足元ライン（床の上）
  const totalW = (gs.length - 1) * gap;
  let x = CW / 2 - totalW / 2;    // 中央寄せ

  // 見出し
  ctx.save();
  ctx.font = "bold 13px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd54f";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 4;
  ctx.fillText("🎁 SUPPORTERS", CW / 2, baseY - KH - 14);
  ctx.restore();

  for (const g of gs) {
    const age = now - g.popAt;
    // ポップイン: 0→520ms で 1.55倍 → 1.0倍に収束（足元を基準に拡大）
    let scale = 1;
    if (age < 520) scale = 1 + 0.55 * (1 - age / 520);
    _drawMiniHero(ctx, g, x, baseY, KH * scale, now);
    x += gap;
  }
}

/** ギフトをくれた人をミニ勇者（騎士）として描く。顔の穴に視聴者アバターをはめ込む。
 *  opts.bare=true で名前・カウント・🎁ポップを省略（テイクオーバーの巨大表示用）。*/
function _drawMiniHero(ctx, g, cx, baseY, kh, now, opts = {}) {
  const frame = window.IMG && IMG.avatar_frame;
  const av = _getAvatarImg(g.avatar);
  const kw = frame ? kh * (frame.width / frame.height) : kh * 0.66;
  const kx = cx - kw / 2;
  const ky = baseY - kh;

  // 顔ホールの位置（フレーム正規化座標→実ピクセル）
  const fcx = kx + _AVF.cx * kw;
  const fcy = ky + _AVF.cy * kh;
  const frx = _AVF.rx * kw;
  const fry = _AVF.ry * kh;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // 1) 顔にアバターをはめる（楕円クリップ・アスペクト維持の cover）
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(fcx, fcy, frx, fry, 0, 0, Math.PI * 2);
  ctx.clip();
  if (av && av.complete && av.naturalWidth > 0) {
    const side = Math.max(frx, fry) * 2;
    ctx.drawImage(av, fcx - side / 2, fcy - side / 2, side, side);
  } else {
    // フォールバック: 色付き楕円＋頭文字
    ctx.fillStyle = "#5c6bc0";
    ctx.fillRect(fcx - frx, fcy - fry, frx * 2, fry * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(fry * 1.5)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((g.user || "?").charAt(0).toUpperCase(), fcx, fcy + 1);
  }
  ctx.restore();

  // 2) ミニ勇者フレームを上に重ねる（顔の穴からアバターが見える）
  if (frame) {
    ctx.drawImage(frame, kx, ky, kw, kh);
  } else {
    // フレーム未ロード時: 金リングの丸で代用
    ctx.beginPath();
    ctx.arc(fcx, fcy, Math.max(frx, fry) + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (opts.bare) { ctx.restore(); return; }   // 巨大表示は装飾を省略

  // 3) 名前（足元の下・長いものは切り詰め）
  ctx.font = "11px monospace";
  ctx.fillStyle = "#eeeeee";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 3;
  const nm = (g.user || "").length > 7 ? g.user.slice(0, 6) + "…" : g.user;
  ctx.fillText(nm, cx, baseY + 14);
  ctx.shadowBlur = 0;

  // 4) 複数回くれた人にはカウントバッジ（頭上右）
  if (g.count > 1) {
    const bx = kx + kw - 4;
    const by = ky + 8;
    ctx.fillStyle = "#ff5252";
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(`×${g.count}`, bx, by + 1);
    ctx.textBaseline = "alphabetic";
  }

  // 5) ポップ中: 🎁 が頭上にふわっと
  const age = now - g.popAt;
  if (age < 900) {
    const a = 1 - age / 900;
    ctx.globalAlpha = a;
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.fillText("🎁", cx, ky - 4 - (1 - a) * 16);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---- コマンドガイド ----
function _drawCommandGuide(ctx) {
  const y = L.guideY;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, y, CW, CH - y);

  ctx.font = "bold 18px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#90caf9";
  ctx.fillText("COMMENT TO JOIN!", CW / 2, y + 36);

  const cmds = [
    { icon: "⚔️", num: "1", label: "ATK",  color: "#ef5350" },
    { icon: "💚", num: "2", label: "HEAL", color: "#66bb6a" },
    { icon: "🛡️", num: "3", label: "DEF",  color: "#42a5f5" },
    { icon: "🔥", num: "4", label: "MAG",  color: "#ff7043" },
    { icon: "💰", num: "5", label: "GOLD", color: "#ffd700" },
  ];

  const startX = 60;
  const colW = (CW - 120) / cmds.length;
  cmds.forEach((cmd, i) => {
    const cx = startX + colW * i + colW / 2;

    ctx.font = "36px serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(cmd.icon, cx, y + 100);

    ctx.font = `bold 20px 'Press Start 2P', monospace`;
    ctx.fillStyle = cmd.color;
    ctx.fillText(`/${cmd.num}`, cx, y + 136);

    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#ccc";
    ctx.fillText(cmd.label, cx, y + 160);
  });

  // 🎁 ギフトCTA — 課金導線の主役。脈動で強く訴求。
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
  ctx.textAlign = "center";
  ctx.font = "bold 19px 'Press Start 2P', monospace";
  ctx.fillStyle = `rgba(255,213,79,${0.7 + 0.3 * pulse})`;
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 10 + 14 * pulse;
  ctx.fillText("🎁 GIFT = 必殺技！ あなたが主役に！", CW / 2, y + 198);
  ctx.shadowBlur = 0;
}

// ---- WS接続状態インジケーター ----
function _drawWsStatus(ctx) {
  const connected = state.wsConnected;
  ctx.fillStyle = connected ? "#4caf50" : "#f44336";
  ctx.beginPath();
  ctx.arc(CW - 28, 28, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "12px monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "#888";
  ctx.fillText(connected ? "LIVE" : "OFF", CW - 42, 33);
}

// ---- ドット風ウィンドウ枠（DQ風）----
function _pixelFrame(ctx, x, y, w, h) {
  ctx.fillStyle = "rgba(8,8,20,0.96)";
  ctx.fillRect(x, y, w, h);

  // 外枠（白）
  const b = 6;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, b);
  ctx.fillRect(x, y + h - b, w, b);
  ctx.fillRect(x, y, b, h);
  ctx.fillRect(x + w - b, y, b, h);

  // 内側の青ライン
  const g = 14, t = 3;
  ctx.fillStyle = "#1e88e5";
  ctx.fillRect(x + g, y + g, w - 2 * g, t);
  ctx.fillRect(x + g, y + h - g - t, w - 2 * g, t);
  ctx.fillRect(x + g, y + g, t, h - 2 * g);
  ctx.fillRect(x + w - g - t, y + g, t, h - 2 * g);
}

// ---- リザルト画面 ----
function _drawResultScreen(ctx, now) {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, CW, CH);

  _drawConfetti(ctx, now);

  const fx = 90, fy = 360, fw = CW - 180, fh = 1180;
  _pixelFrame(ctx, fx, fy, fw, fh);

  // タイトル
  ctx.textAlign = "center";
  ctx.font = "bold 56px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd700";
  ctx.shadowColor = "#ff9800";
  ctx.shadowBlur = 16;
  ctx.fillText("RESULT", CW / 2, fy + 110);
  ctx.shadowBlur = 0;
  ctx.font = "20px 'Press Start 2P', monospace";
  ctx.fillStyle = "#90caf9";
  ctx.fillText("QUEST COMPLETE", CW / 2, fy + 152);

  // 集計データ
  const h = state.hero;
  const rank = getRanking(1);
  const mvp = rank.length ? rank[0] : null;

  let healKing = null, healMax = 0;
  for (const [user, d] of state.ranking.entries()) {
    if (d.heal > healMax) { healMax = d.heal; healKing = user; }
  }
  const lastHit = state.lastHit ? state.lastHit.user : "—";
  const dur = Math.max(0, Math.round((now - state.sessionStart) / 1000));
  const mm = String(Math.floor(dur / 60)).padStart(2, "0");
  const ss = String(dur % 60).padStart(2, "0");

  const rows = [
    ["討伐数 KILLS", `${state.killCount}`],
    ["到達 FLOOR", `${state.floor}`],
    ["GOLD", `${h.gold} G`],
    ["LEVEL", `${state.startLevel} → ${h.level}`],
    ["TIME", `${mm}:${ss}`],
  ];

  let ry = fy + 230;
  ctx.font = "24px 'Press Start 2P', monospace";
  for (const [label, val] of rows) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#bbb";
    ctx.fillText(label, fx + 64, ry);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.fillText(val, fx + fw - 64, ry);
    ry += 70;
  }

  // 区切り線
  ry += 8;
  ctx.fillStyle = "#1e88e5";
  ctx.fillRect(fx + 60, ry, fw - 120, 3);
  ry += 58;

  // MVP
  ctx.textAlign = "center";
  ctx.font = "24px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd700";
  ctx.fillText("🏆 MVP", CW / 2, ry); ry += 46;
  ctx.fillStyle = "#fff";
  ctx.font = "28px 'Press Start 2P', monospace";
  ctx.fillText(mvp ? `${mvp.user}` : "—", CW / 2, ry); ry += 34;
  ctx.font = "18px 'Press Start 2P', monospace";
  ctx.fillStyle = "#aaa";
  ctx.fillText(mvp ? `${mvp.score} pt` : "", CW / 2, ry); ry += 64;

  // 回復王
  ctx.font = "22px 'Press Start 2P', monospace";
  ctx.fillStyle = "#69f0ae";
  ctx.fillText("💚 HEAL KING", CW / 2, ry); ry += 42;
  ctx.fillStyle = "#fff";
  ctx.font = "24px 'Press Start 2P', monospace";
  ctx.fillText(healKing ? `${healKing} (${healMax})` : "—", CW / 2, ry); ry += 66;

  // ラストヒット
  ctx.font = "22px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ff9800";
  ctx.fillText("⚔ LAST HIT", CW / 2, ry); ry += 42;
  ctx.fillStyle = "#fff";
  ctx.font = "24px 'Press Start 2P', monospace";
  ctx.fillText(lastHit, CW / 2, ry);

  // フッター
  ctx.font = "16px 'Press Start 2P', monospace";
  ctx.fillStyle = "#888";
  ctx.fillText("PRESS  R  TO CONTINUE", CW / 2, fy + fh - 38);
}

// ---- 紙吹雪（リザルト演出）----
function _drawConfetti(ctx, now) {
  const colors = ["#ffd700", "#e91e63", "#4fc3f7", "#69f0ae", "#ff7043"];
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 44; i++) {
    const seed = i * 97.13;
    const x = (seed * 13.7) % CW;
    const speed = 70 + (i % 5) * 28;
    const y = ((now / 1000 * speed) + seed * 7) % CH;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, 8, 8);
  }
  ctx.restore();
}

window.render = render;
window.CW = CW;
window.CH = CH;
