/**
 * 敵エンティティの描画補助データ
 * ロジックは hero.js の enemyAttack / _checkEnemyDead に集約している
 * ここでは敵の「見た目」に関わる定数や描画ヘルパーをまとめる
 */

const ENEMY_AUTO_INTERVAL = 2500; // 敵自動攻撃間隔 (ms)

/**
 * 敵の shape 文字列に対応した Canvas 描画関数
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} enemy - state.enemy
 * @param {number} now - performance.now()
 */
function drawEnemy(ctx, enemy, now) {
  if (!enemy) return;

  const { x, y, size, color, shape, hp, maxHp } = enemy;
  const isFlash = now < enemy.flashUntil;
  const alpha = (hp <= 0 && enemy.diedAt) ? Math.max(0, 1 - (now - enemy.diedAt) / 400) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 視覚的な高さの半分（名前・HPバーの配置基準）
  let halfH;

  const img = enemy.sprite && window.IMG ? IMG[enemy.sprite] : null;
  if (img) {
    // ---- スプライト描画 ----
    const dh = size * 2.6;
    const dw = dh * (img.width / img.height);
    halfH = dh / 2;
    const dx = x - dw / 2;
    const dy = y - dh / 2;
    if (enemy.isBoss) {
      ctx.shadowColor = "#ff1744";
      ctx.shadowBlur = 28;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.shadowBlur = 0;
    // ヒット時のフラッシュ（ボスは赤、通常は白、ともに低不透明度）
    if (isFlash) {
      ctx.save();
      const flashColor  = enemy.isBoss ? "#ff6030" : "#ffffff";
      const flashAlpha  = enemy.isBoss ? 0.45       : 0.5;
      ctx.globalAlpha   = alpha * flashAlpha;
      ctx.drawImage(colorSilhouette(img, flashColor), dx, dy, dw, dh);
      ctx.restore();
    }
  } else {
    // ---- 手描きフォールバック ----
    const fillColor = isFlash ? "#ffffff" : color;
    if (enemy.isBoss) {
      ctx.shadowColor = "#ff1744";
      ctx.shadowBlur = 24;
    }
    switch (shape) {
      case "circle":
        _drawCircle(ctx, x, y, size / 2, fillColor);
        break;
      case "diamond":
        _drawDiamond(ctx, x, y, size, fillColor);
        break;
      case "rect":
      default:
        _drawRect(ctx, x, y, size, size * 1.2, fillColor, enemy.isBoss);
        break;
    }
    ctx.shadowBlur = 0;
    halfH = shape === "rect" ? size * 0.6 : size / 2;
  }

  // 敵の名前
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${enemy.isBoss ? 22 : 16}px 'Press Start 2P', monospace`;
  ctx.textAlign = "center";
  ctx.fillText(enemy.nameJP ?? enemy.name, x, y + halfH + 28);

  // 敵のHPバー（ミニ）
  const barW = size + 20;
  const barH = 8;
  const bx = x - barW / 2;
  const by = y + halfH + 36;
  const ratio = Math.max(0, hp / maxHp);
  ctx.fillStyle = "#333";
  ctx.fillRect(bx, by, barW, barH);
  const hpColor = ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#ffc107" : "#f44336";
  ctx.fillStyle = hpColor;
  ctx.fillRect(bx, by, barW * ratio, barH);

  ctx.restore();
}

function _drawCircle(ctx, cx, cy, r, color) {
  // 暗い輪郭
  ctx.fillStyle = "#0c0c16";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 目のような白点（スライムっぽさ）
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.25, cy - r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function _drawDiamond(ctx, cx, cy, size, color) {
  const h = size / 2;
  const o = 3;
  // 暗い輪郭
  ctx.fillStyle = "#0c0c16";
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - o);
  ctx.lineTo(cx + h * 0.7 + o, cy);
  ctx.lineTo(cx, cy + h + o);
  ctx.lineTo(cx - h * 0.7 - o, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h);
  ctx.lineTo(cx + h * 0.7, cy);
  ctx.lineTo(cx, cy + h);
  ctx.lineTo(cx - h * 0.7, cy);
  ctx.closePath();
  ctx.fill();
}

function _drawRect(ctx, cx, cy, w, h, color, isBoss) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  // 暗い輪郭
  ctx.fillStyle = "#0c0c16";
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  // ボスは顔の飾り + 赤い目
  if (isBoss) {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 8, y + 12, w - 16, 6);
    ctx.fillStyle = "#ff1744";
    ctx.fillRect(x + w * 0.28 - 6, y + h * 0.34, 12, 12);
    ctx.fillRect(x + w * 0.72 - 6, y + h * 0.34, 12, 12);
  }
}

window.drawEnemy = drawEnemy;
window.ENEMY_AUTO_INTERVAL = ENEMY_AUTO_INTERVAL;
