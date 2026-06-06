#!/usr/bin/env python3
"""
本番サーバー — TikTok LIVE 実接続版
TikTokLive で自分のLIVEに接続し、コメント・ギフトを WebSocket でゲームに流す。

構成（mock.py と同じ "送信形式" を厳守。ゲーム側は無改修で動く）:
  TikTok LIVE ──[TikTokLive(非公式)]──▶ main.py ──[WebSocket]──▶ ブラウザ(game/)

起動:
  python server/main.py @あなたのTikTok_ID
  （または下の TIKTOK_USERNAME を書き換えて  python server/main.py ）

接続先（ゲーム側 ws.js が見にくる先）: ws://localhost:8765

事前準備:
  pip install -r server/requirements.txt
  ※ TikTokLive は非公式ライブラリ。TikTok側の仕様変更で属性名が変わることがある。
    その場合は「★要確認」と書いた行を、インストール版の TikTokLive に合わせて直す。
"""
import asyncio
import json
import sys

import websockets

from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    ConnectEvent,
    DisconnectEvent,
    CommentEvent,
    GiftEvent,
)

# ============================================================
# 設定
# ============================================================
# 配信する自分のTikTok ID（@付き）。コマンドライン引数があればそちらを優先。
TIKTOK_USERNAME = "@your_tiktok_id"   # ← ここを自分のIDに変更（または起動時に引数で渡す）

HOST = "localhost"
PORT = 8765

# 接続中のブラウザ（OBSブラウザソース）一覧
connected: set = set()


# ============================================================
# ティア判定（events.js の giftTier と同じ閾値。ログ表示用）
# ※ ゲーム側は coin から自前で再計算するので、ここは表示の参考値。
# ============================================================
def coin_to_tier(coin: int) -> str:
    if coin < 10:
        return "small"
    if coin < 100:
        return "medium"
    if coin < 1000:
        return "large"
    if coin < 5000:
        return "super"
    return "ultra"


# ============================================================
# ユーザー情報の安全な取り出し（TikTokLiveのバージョン差を吸収）
# ============================================================
def _username(user) -> str:
    """表示名 → 無ければ unique_id → 無ければ 'someone'。"""
    for attr in ("nickname", "unique_id", "uniqueId", "display_id"):
        v = getattr(user, attr, None)
        if v:
            return str(v)
    return "someone"


def _avatar_url(user):
    """アバター画像URLを総当りで探す。見つからなければ None（ゲーム側はNULL許容）。★要確認"""
    # よくある形: user.avatar_thumb.url_list[0]  /  user.profile_picture.urls[0]
    for attr in ("avatar_thumb", "avatar_medium", "avatar_large", "profile_picture"):
        img = getattr(user, attr, None)
        if not img:
            continue
        for list_attr in ("url_list", "urls", "m_urls"):
            urls = getattr(img, list_attr, None)
            if urls:
                try:
                    return urls[0]
                except (IndexError, TypeError):
                    pass
    return None


# ============================================================
# ブラウザへ送信（mock.py の broadcast と同一形式）
# ============================================================
def broadcast(event: dict):
    if connected:
        msg = json.dumps(event, ensure_ascii=False)
        websockets.broadcast(connected, msg)
    # コンソールログ
    user = event.get("user", "?")
    if event["type"] == "comment":
        print(f"  📢  {user}: {event['text']}")
    else:
        tier = event.get("tier", "")
        label = f"[{tier}]" if tier else ""
        print(f"  🎁  {user}: {event['giftName']} ({event['coin']}coin×{event['count']}) {label}")


# ============================================================
# ブラウザ側WebSocketハンドラ（mock.py と同じ）
# ============================================================
async def ws_handler(websocket):
    connected.add(websocket)
    print(f"[+] ブラウザ接続: {websocket.remote_address}  (計{len(connected)}台)")
    try:
        async for _ in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected.discard(websocket)
        print(f"[-] ブラウザ切断: {websocket.remote_address}  (計{len(connected)}台)")


# ============================================================
# TikTokLive クライアント構築 & イベント登録
# ============================================================
def build_tiktok_client(username: str) -> TikTokLiveClient:
    client = TikTokLiveClient(unique_id=username)

    @client.on(ConnectEvent)
    async def on_connect(event: ConnectEvent):
        print(f"\n✅ TikTok LIVE に接続しました: {username}")
        print("   コメント・ギフトの受信を開始します。\n")

    @client.on(DisconnectEvent)
    async def on_disconnect(event: DisconnectEvent):
        print("⚠️  TikTok LIVE から切断されました。再接続を試みます…")

    @client.on(CommentEvent)
    async def on_comment(event: CommentEvent):
        # event.comment = コメント本文 / event.user = 送信者  ★要確認
        text = getattr(event, "comment", "") or ""
        broadcast({
            "type": "comment",
            "user": _username(event.user),
            "text": text,
        })

    @client.on(GiftEvent)
    async def on_gift(event: GiftEvent):
        # ----- ギフトの値を安全に取り出す -----
        gift = event.gift
        gift_name = getattr(gift, "name", None) or "gift"
        # コイン価値（ダイヤ数）  ★要確認: diamond_count が一般的
        coin = getattr(gift, "diamond_count", None) or getattr(gift, "diamondCount", 0) or 0

        # ----- 連打ギフト(streakable)は「連打が終わった時」だけ確定送信 -----
        # 連打中に毎回送るとゲームが多重発火するため。
        streakable = getattr(gift, "streakable", False)
        repeat_end = getattr(event, "repeat_end", True)   # 非対応版では常にTrue扱い
        repeat_count = getattr(event, "repeat_count", 1) or 1

        if streakable and not repeat_end:
            return  # 連打継続中 → まだ送らない

        count = repeat_count if streakable else (repeat_count or 1)
        total = coin * count

        broadcast({
            "type": "gift",
            "user": _username(event.user),
            "giftName": gift_name,
            "coin": coin,
            "count": count,
            "tier": coin_to_tier(total),
            "avatar": _avatar_url(event.user),
        })

    return client


# ============================================================
# TikTok接続を見張る（落ちたら自動で再接続）
# ============================================================
async def tiktok_loop(username: str):
    backoff = 5
    while True:
        client = build_tiktok_client(username)
        try:
            # start() は接続をスケジュールして Task を返すだけ（即座に戻る）。
            # 返ってきた Task を await して「切断されるまで」ブロックする。
            # （TikTokLive 6.x で検証済み。古い版で start が無ければ connect を使う）
            task = await client.start()
            await task
        except Exception as e:
            print(f"❌ TikTok接続エラー: {e}")
        # ここに来たら切断/失敗。少し待って再接続。
        print(f"   {backoff}秒後に再接続します…（配信が始まっているか確認してください）")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)   # 最大60秒まで指数バックオフ


# ============================================================
# メイン
# ============================================================
async def main(username: str):
    print("=" * 50)
    print(f"  コメントクエスト 本番サーバー")
    print(f"  TikTok ID : {username}")
    print(f"  ブラウザ接続先: ws://{HOST}:{PORT}")
    print("=" * 50)
    print("  OBSのブラウザソースに http://localhost:3000 を設定し、")
    print("  TikTokでLIVEを開始してから本サーバーを起動してください。")
    print("=" * 50 + "\n")

    async with websockets.serve(ws_handler, HOST, PORT):
        await tiktok_loop(username)


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else TIKTOK_USERNAME
    if not name.startswith("@"):
        name = "@" + name
    if name == "@your_tiktok_id":
        print("⚠️  TikTok IDが未設定です。")
        print("   起動例:  python server/main.py @あなたのID")
        print("   または main.py 内の TIKTOK_USERNAME を書き換えてください。")
        sys.exit(1)
    try:
        asyncio.run(main(name))
    except KeyboardInterrupt:
        print("\n終了しました")
