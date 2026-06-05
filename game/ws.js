/**
 * WebSocket クライアント
 * mock.py（または本番サーバー）からイベントを受信してゲームに渡す
 */
const WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY = 3000;

let _socket = null;
let _onEventCallback = null;

function wsConnect() {
  console.log(`[WS] 接続試行: ${WS_URL}`);
  _socket = new WebSocket(WS_URL);

  _socket.addEventListener("open", () => {
    console.log("[WS] 接続成功");
    if (window.onWsStatus) window.onWsStatus("connected");
  });

  _socket.addEventListener("message", (e) => {
    let event;
    try {
      event = JSON.parse(e.data);
    } catch {
      console.warn("[WS] JSON パース失敗:", e.data);
      return;
    }
    if (_onEventCallback) _onEventCallback(event);
  });

  _socket.addEventListener("close", () => {
    console.warn(`[WS] 切断 — ${RECONNECT_DELAY / 1000}秒後に再接続`);
    if (window.onWsStatus) window.onWsStatus("disconnected");
    setTimeout(wsConnect, RECONNECT_DELAY);
  });

  _socket.addEventListener("error", (err) => {
    console.error("[WS] エラー:", err);
  });
}

/**
 * イベント受信コールバックを登録して接続開始
 * @param {(event: object) => void} callback
 */
function wsInit(callback) {
  _onEventCallback = callback;
  wsConnect();
}

window.wsInit = wsInit;
