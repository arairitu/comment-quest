/**
 * コメント → アクションID の正規化テーブル
 * 絵文字 / 数字 / 多言語キーワードの3併用で受け付ける
 */
const ACTION_TABLE = {
  attack: {
    emoji:    ["⚔️", "⚔"],
    numbers:  ["1"],
    keywords: ["攻撃", "attack", "atk", "atacar", "공격", "攻击"],
  },
  heal: {
    emoji:    ["💚", "❤️‍🩹"],
    numbers:  ["2"],
    keywords: ["回復", "heal", "hp", "curar", "힐", "治疗"],
  },
  defend: {
    emoji:    ["🛡️", "🛡"],
    numbers:  ["3"],
    keywords: ["守る", "defend", "guard", "def", "방어", "防御"],
  },
  magic: {
    emoji:    ["🔥", "✨", "⚡"],
    numbers:  ["4"],
    keywords: ["魔法", "magic", "mag", "magia", "마법"],
  },
  steal: {
    emoji:    ["💰", "🪙"],
    numbers:  ["5"],
    keywords: ["盗む", "steal", "gold", "robar", "훔치기", "偷"],
  },
};

/**
 * コメントテキストをアクションIDに変換する
 * @param {string} text - コメント文字列
 * @returns {"attack"|"heal"|"defend"|"magic"|"steal"|"cheer"}
 */
function normalizeComment(text) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  for (const [action, table] of Object.entries(ACTION_TABLE)) {
    // 絵文字チェック（部分一致）
    if (table.emoji.some(e => trimmed.includes(e))) return action;
    // 数字チェック（完全一致）
    if (table.numbers.includes(lower)) return action;
    // キーワードチェック（部分一致・小文字化）
    if (table.keywords.some(k => lower.includes(k.toLowerCase()))) return action;
  }

  return "cheer"; // どれにも合致しなければ「応援」
}

/**
 * ギフトのコイン合計からティアを判定。
 * TikTokギフトのコイン値の目安: バラ=1 / フィンガーハート=5 / パフューム=20 /
 * ギャラクシー=1000 / ドラマクイーン=5000 / ライオン=29999 / ユニバース=34999。
 * 高額ギフトに天井（ultra）を設け、課金の伸びしろ＝演出のグレードを作る。
 * @param {number} totalCoin - coin × count
 * @returns {"small"|"medium"|"large"|"super"|"ultra"}
 */
function giftTier(totalCoin) {
  if (totalCoin < 10)   return "small";
  if (totalCoin < 100)  return "medium";
  if (totalCoin < 1000) return "large";
  if (totalCoin < 5000) return "super";
  return "ultra";
}

// グローバルに公開
window.normalizeComment = normalizeComment;
window.giftTier = giftTier;
window.ACTION_TABLE = ACTION_TABLE;
