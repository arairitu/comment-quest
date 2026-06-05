/**
 * スプライト画像のプリロード
 * game/assets/*.png を読み込み、window.IMG に格納する。
 * 読み込み完了まで該当キーは undefined のまま → 描画側は IMG.xxx の truthy 判定で
 * フォールバック（手描き）に切り替えられる。画像はネットワーク不要のローカル同梱。
 */
const IMG = {};

// 画像キャッシュ対策のバージョン。素材を差し替えたらバンプする。
const ASSET_VER = 2;

const SPRITE_FILES = [
  // キャラクター（進化ステージ別）
  "hero", "hero_evo1", "hero_evo2", "hero_evo3", "hero_evo4", "hero_evo5", "hero_evo6",
  "en_goblin", "en_mushroom",
  // 敵（実素材）
  "en_slime", "en_wolf", "en_bat", "en_boss_golem", "en_boss_guardian",
  // 敵（ゾーン追加分・素材未着のものは手描きフォールバック）
  "en_ice_spirit",                                   // Zone1 氷窟
  "en_skeleton", "en_wisp", "en_darkmage", "en_boss_lich",   // Zone2 魔導
  "en_merman", "en_jelly", "en_crab", "en_boss_serpent",     // Zone3 深海
  "en_imp", "en_dark_knight", "en_hellhound", "en_boss_demon", // Zone4 魔城
  // アイテム
  "item_helmet", "item_hammer", "item_crown", "item_key", "item_potion",
  "item_gem", "item_crystal", "item_book", "item_ring",
  // 小物・装飾
  "prop_chest_silver", "prop_chest_green", "prop_doors",
  "prop_grate", "prop_candelabra", "prop_campfire",
  // 背景・UI（実素材）
  "bg_wall_dark", "ui_border", "ui_panel", "ui_hpframe", "ui_deco_border",
  // タイル
  "tile_grass", "tile_water", "tile_stone", "tile_wood", "tile_brick", "tile_rune",
  // ギフト応援団のミニ勇者フレーム（顔にアバターをはめる）
  "avatar_frame",
  // 追加装飾（新素材：クリスタル洞窟系）
  "deco_torch", "deco_lantern", "deco_crystal_blue", "deco_crystal_purple",
  "deco_chest_gold", "deco_chest_frozen",
  // 追加壁/床テクスチャ（パネルとして使用）
  "wall_dungeon", "wall_demonic", "floor_damp",
];

let assetsLoaded = 0;
for (const name of SPRITE_FILES) {
  const img = new Image();
  img.onload = () => { IMG[name] = img; assetsLoaded++; };
  img.onerror = () => console.warn("[Assets] 読み込み失敗:", name);
  img.src = `assets/${name}.png?v=${ASSET_VER}`;
}

// 白シルエット（ヒット/攻撃時のフラッシュ用）。スプライト形状だけを白く塗った
// オフスクリーンを生成してキャッシュする（背景を巻き込まないよう source-atop で隔離）。
const _whiteCache  = new WeakMap();
const _colorCache  = new Map();  // key: `${img.src}|${color}`

/** スプライト形状のみを白で塗りつぶしたオフスクリーン（ヒットフラッシュ用）*/
function whiteSilhouette(img) {
  return colorSilhouette(img, "#ffffff");
}

/** スプライト形状を任意の色で塗りつぶしたオフスクリーンを返す */
function colorSilhouette(img, color) {
  const key = img.src + "|" + color;
  if (_colorCache.has(key)) return _colorCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const c = cv.getContext("2d");
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = color;
  c.fillRect(0, 0, cv.width, cv.height);
  _colorCache.set(key, cv);
  return cv;
}

window.IMG = IMG;
window.whiteSilhouette  = whiteSilhouette;
window.colorSilhouette  = colorSilhouette;
