@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================
echo   コメントクエスト  リハーサル（モック）
echo ============================================
echo  ゲーム画面サーバーとモックイベントを起動します。
echo  終了するには各ウィンドウを閉じてください。
echo.

REM 1) ゲーム画面サーバー（http://localhost:3000）
start "Game Server (3000)" cmd /k python -m http.server 3000 --directory game

REM 少し待ってからイベントサーバー起動
timeout /t 2 >nul

REM 2) モックイベント配信（ws://localhost:8765）
start "Mock Events (8765)" cmd /k python server\mock.py

echo.
echo  ブラウザで  http://localhost:3000  を開いてください。
echo  OBSのブラウザソースも同じURLを指定します。
echo.
pause
