# コメントクエスト

視聴者参加型 TikTok LIVE RPG。コメントとギフトで勇者を育てる、顔出しなし・自律稼働の配信エンタメ。

## これは何

- 視聴者全員で1人の勇者を共有して育てる参加型RPGライブ
- コメント（攻撃/回復/守る/魔法/盗む）とギフトがリアルタイムでゲームに反映される
- 2Dドット絵・無限ダンジョン・ボス戦は全員で共闘

詳しくは [`docs/企画書.md`](docs/企画書.md) を参照。
プロジェクトの作り方・方針は [`CLAUDE.md`](CLAUDE.md) を参照。

## 構成（2プロセス）

```
①映像を送る管:  OBS ──[stream key]──▶ TikTok（視聴者が見る画面）
②データを読む管: TikTok ──[TikTokLive]──▶ server/main.py ──[WebSocket:8765]──▶ game/（ブラウザ）
```
- ゲーム画面サーバー: `http://localhost:3000`（OBSブラウザソースに指定）
- イベントサーバー: `ws://localhost:8765`（開発=`mock.py` / 本番=`main.py`）

## セットアップ

### 依存インストール（初回のみ）
```bash
pip install -r server/requirements.txt
```

### リハーサル（モックで通し確認）
```bash
# ターミナル1: ゲーム画面サーバー
python -m http.server 3000 --directory game
# ターミナル2: 偽コメント/ギフトを流す
python server/mock.py
# ブラウザで http://localhost:3000 を開く
```

### 本番（TikTok LIVE 実接続）
```bash
# 1) ゲーム画面サーバー
python -m http.server 3000 --directory game
# 2) TikTokでLIVEを開始してから…
# 3) 本番接続サーバー（自分のIDを@付きで渡す）
python server/main.py @your_tiktok_id
```
画面右上が **LIVE** になれば②の接続成功。

> `main.py` は非公式ライブラリ TikTokLive を使用。TikTok仕様変更で属性名が
> 変わることがあるため、初回は必ずテスト配信で動作確認すること。出ない場合は
> `main.py` 内の「★要確認」コメント箇所をインストール版に合わせて調整する。

## Windows での本番運用（引き継ぎ）

開発=Mac、本番=Windowsデスクトップ を想定。

```bat
REM 受け取り（初回）
git clone https://github.com/<your-id>/comment-quest.git C:\comment-quest
cd C:\comment-quest
pip install -r server\requirements.txt

REM 以降は最新を取得
git pull
```

起動はバッチをダブルクリックするだけ：
- **`start_rehearsal.bat`** … ゲーム＋モック（演出リハ用）
- **`start_live.bat`** … ゲーム＋TikTok本番接続（IDを聞かれる）

Windows前提メモ:
- Python は `python`（Macの`python3`ではない）。インストール時 "Add Python to PATH" 必須。
- 日本語パスを避け `C:\comment-quest\` のような英数字パスに置く。
- 初回起動でファイアウォール警告が出たら「アクセスを許可」。

### OBS設定
1. 設定 → 配信 → サービス「カスタム」→ Creator Network発行の Server URL + Stream Key を入力
2. 出力: 1080×1920 / 30〜60fps / 8〜12Mbps / H.264 / キーフレーム2秒
3. ソース → ブラウザ を追加、URL `http://localhost:3000`、幅1080・高さ1920

## 開発フェーズ

- **Phase 1（今ここ）:** コメント＆ギフトで敵を倒すライブRPGのMVP
- **Phase 2:** ガチャ・装備育成・5ゾーン切替
- **Phase 3:** 週間イベント・月次シーズン・運営サイクル
