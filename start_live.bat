@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================
echo   コメントクエスト  本番（TikTok LIVE）
echo ============================================
echo  先に TikTok で LIVE を開始してから実行してください。
echo  （LIVEが始まっていないと接続先が見つかりません）
echo.

REM TikTok ID を入力（@付き）。毎回同じならこの行を消して下の set 行で固定可。
set /p TTID=あなたの TikTok ID を入力 (例 @your_id):
REM set TTID=@your_id   ← 固定したい場合は上の set /p を消してこれを使う

echo.
echo  TikTok ID : %TTID%
echo.

REM 1) ゲーム画面サーバー（http://localhost:3000）
start "Game Server (3000)" cmd /k python -m http.server 3000 --directory game

REM 少し待ってから本番接続サーバー起動
timeout /t 2 >nul

REM 2) TikTok本番接続（ws://localhost:8765）
start "TikTok LIVE (8765)" cmd /k python server\main.py %TTID%

echo.
echo  ブラウザ/OBSで  http://localhost:3000  を開いてください。
echo  画面右上が LIVE になれば接続成功です。
echo.
pause
