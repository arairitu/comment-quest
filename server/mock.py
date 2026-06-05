#!/usr/bin/env python3
"""
開発用モックサーバー
TikTok本番接続の代わりに偽コメント・ギフトイベントを WebSocket で流す

起動: python server/mock.py
接続: ws://localhost:8765
"""
import asyncio
import json
import random
import sys
import urllib.parse
import websockets

HOST = "localhost"
PORT = 8765


def avatar_for(user: str) -> str:
    """モック用のダミーアバターURL（ユーザー名から決定的に生成）。
    本番では TikTokLive のプロフィール画像URLに差し替える。"""
    seed = urllib.parse.quote(user)
    return f"https://api.dicebear.com/7.x/pixel-art/png?seed={seed}&size=80"

FAKE_USERS = [
    "UserAlpha", "スライム倒せ", "Dragon_Fan_UK", "김용사씨",
    "用户一号", "HeroHelper99", "GoldHunter", "MagicWizard_KR",
    "攻撃大好き", "healerJP", "DeathKnight_BR", "연속공격",
    "RPGlover", "FantasyFan_ES", "戦士見習い", "Destroyer_TW",
]

# (コメントテキスト, 期待アクション)  ※アクション比率を attack 多めに
MOCK_COMMENTS = [
    # 攻撃 (attack) × 8パターン
    ("⚔️",      "attack"),
    ("1",       "attack"),
    ("攻撃",    "attack"),
    ("attack",  "attack"),
    ("atk",     "attack"),
    ("atacar",  "attack"),
    ("공격",    "attack"),
    ("攻击",    "attack"),
    # 回復 (heal) × 7パターン
    ("💚",      "heal"),
    ("2",       "heal"),
    ("回復",    "heal"),
    ("heal",    "heal"),
    ("hp",      "heal"),
    ("curar",   "heal"),
    ("힐",      "heal"),
    ("治疗",    "heal"),
    # 守る (defend) × 8パターン
    ("🛡️",     "defend"),
    ("3",       "defend"),
    ("守る",    "defend"),
    ("defend",  "defend"),
    ("guard",   "defend"),
    ("def",     "defend"),
    ("방어",    "defend"),
    ("防御",    "defend"),
    # 魔法 (magic) × 7パターン
    ("🔥",      "magic"),
    ("4",       "magic"),
    ("魔法",    "magic"),
    ("magic",   "magic"),
    ("mag",     "magic"),
    ("magia",   "magic"),
    ("마법",    "magic"),
    # 盗む (steal) × 8パターン
    ("💰",      "steal"),
    ("5",       "steal"),
    ("盗む",    "steal"),
    ("steal",   "steal"),
    ("gold",    "steal"),
    ("robar",   "steal"),
    ("훔치기",  "steal"),
    ("偷",      "steal"),
    # 応援（不明コメント） × 8パターン — 全体の約15%になるよう選択確率で調整
    ("がんばれ！",   None),
    ("GO GO!",       None),
    ("응원해!",      None),
    ("加油!",        None),
    ("nice",         None),
    ("すごい！",     None),
    ("wow",          None),
    ("すばらしい",   None),
]

# アクション別コメント重み（多めに攻撃が来る配信らしさ）
ACTION_WEIGHTS = {
    "attack": 35,
    "heal":   20,
    "defend": 15,
    "magic":  15,
    "steal":  10,
    None:     5,   # 応援
}

def _weighted_comment():
    """重み付きランダムでコメントを1件選ぶ"""
    buckets = []
    for entry in MOCK_COMMENTS:
        action = entry[1]
        buckets.append((entry, ACTION_WEIGHTS[action]))
    total = sum(w for _, w in buckets)
    r = random.uniform(0, total)
    cumsum = 0
    for entry, w in buckets:
        cumsum += w
        if r <= cumsum:
            return entry
    return buckets[-1][0]

MOCK_GIFTS = [
    # (giftName, coin, tier)
    ("rose",        1,    "small"),
    ("like",        1,    "small"),
    ("heart",       5,    "small"),
    ("star",        9,    "small"),
    ("controller", 15,    "medium"),
    ("game",       50,    "medium"),
    ("diamond",    99,    "medium"),
    ("lion",      200,    "large"),
    ("crown",     500,    "large"),
    ("universe", 1500,    "super"),
]

GIFT_WEIGHTS = [20, 20, 15, 10, 10, 8, 5, 5, 4, 3]

connected: set = set()


async def broadcast(event: dict):
    if not connected:
        return
    msg = json.dumps(event, ensure_ascii=False)
    websockets.broadcast(connected, msg)
    tier = event.get("tier", "")
    label = f"[{tier}]" if tier else ""
    user = event["user"]
    if event["type"] == "comment":
        print(f"  📢  {user}: {event['text']}")
    else:
        print(f"  🎁  {user}: {event['giftName']} ({event['coin']}コイン×{event['count']}) {label}")


async def random_event_loop():
    """ランダムにコメント・ギフトを流し続ける"""
    await asyncio.sleep(1.5)
    while True:
        roll = random.random()
        if roll < 0.88:
            text, _ = _weighted_comment()
            user = random.choice(FAKE_USERS)
            await broadcast({"type": "comment", "user": user, "text": text})
        else:
            gift_name, coin, tier = random.choices(MOCK_GIFTS, weights=GIFT_WEIGHTS, k=1)[0]
            user = random.choice(FAKE_USERS)
            count = random.randint(1, 5) if coin <= 9 else 1
            await broadcast({
                "type": "gift",
                "user": user,
                "giftName": gift_name,
                "coin": coin,
                "count": count,
                "tier": tier,
                "avatar": avatar_for(user),
            })
        await asyncio.sleep(random.uniform(0.6, 2.0))


async def handler(websocket):
    connected.add(websocket)
    print(f"[+] 接続: {websocket.remote_address}  (計{len(connected)}台)")
    try:
        async for _ in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected.discard(websocket)
        print(f"[-] 切断: {websocket.remote_address}  (計{len(connected)}台)")


MANUAL_MAP = {
    "a": "⚔️",  "1": "攻撃",
    "h": "💚",  "2": "回復",
    "d": "🛡️", "3": "守る",
    "m": "🔥",  "4": "魔法",
    "s": "💰",  "5": "盗む",
}


async def manual_input_loop():
    """キーボードからイベントを手動送信（開発テスト用）"""
    loop = asyncio.get_event_loop()
    print("\n" + "="*40)
    print("  手動送信キー（Enterで確定）")
    print("  a/1=攻撃  h/2=回復  d/3=守る  m/4=魔法  s/5=盗む")
    print("  g=ランダムギフト  G=超大ギフト(universe)  q=終了")
    print("="*40 + "\n")

    while True:
        try:
            key = await loop.run_in_executor(None, sys.stdin.readline)
        except (EOFError, OSError):
            break
        key = key.strip()
        if not key:
            continue
        if key == "q":
            print("終了します")
            break
        elif key in MANUAL_MAP:
            text = MANUAL_MAP[key]
            await broadcast({"type": "comment", "user": "【手動】", "text": text})
        elif key == "g":
            gift_name, coin, tier = random.choices(MOCK_GIFTS, weights=GIFT_WEIGHTS, k=1)[0]
            await broadcast({"type": "gift", "user": "【手動】", "giftName": gift_name, "coin": coin, "count": 1, "tier": tier, "avatar": avatar_for("【手動】")})
        elif key == "G":
            await broadcast({"type": "gift", "user": "【手動】", "giftName": "universe", "coin": 1500, "count": 1, "tier": "super", "avatar": avatar_for("【手動】")})
        else:
            # そのままコメントとして送信
            await broadcast({"type": "comment", "user": "【手動】", "text": key})


async def main():
    print(f"モックサーバー起動 → ws://{HOST}:{PORT}")
    print("ブラウザで game/index.html を開くか OBS ブラウザソースに設定してください\n")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.gather(
            random_event_loop(),
            manual_input_loop(),
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n終了しました")
