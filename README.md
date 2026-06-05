# コメントクエスト

視聴者参加型 TikTok LIVE RPG。コメントとギフトで勇者を育てる、顔出しなし・自律稼働の配信エンタメ。

## これは何

- 視聴者全員で1人の勇者を共有して育てる参加型RPGライブ
- コメント（攻撃/回復/守る/魔法/盗む）とギフトがリアルタイムでゲームに反映される
- 2Dドット絵・無限ダンジョン・ボス戦は全員で共闘

詳しくは [`docs/企画書.md`](docs/企画書.md) を参照。
プロジェクトの作り方・方針は [`CLAUDE.md`](CLAUDE.md) を参照。

## セットアップ（Phase 1 / MVP 開発時）

### サーバー側（Python）
```bash
cd server
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python mock.py              # まずは偽イベントでゲーム側をテスト
# 本番接続は main.py（TikTokLive）に差し替え
```

### ゲーム側（ブラウザ）
```bash
cd game
# ローカルサーバーで開く（WebSocket接続のため file:// では不可）
python -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

### OBS設定
1. ソース → ブラウザ を追加
2. URL に `http://localhost:8000`、解像度 1080×1920（縦型9:16）
3. TikTok LIVE Studio などで配信

## 開発フェーズ

- **Phase 1（今ここ）:** コメント＆ギフトで敵を倒すライブRPGのMVP
- **Phase 2:** ガチャ・装備育成・5ゾーン切替
- **Phase 3:** 週間イベント・月次シーズン・運営サイクル
