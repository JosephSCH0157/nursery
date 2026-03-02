// src/net/display-ws-display-client.ts
var DISPLAY_WS_PATH = "/ws/display";
var hasDisplayPair = () => {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return params.get("pair") || "";
  } catch {
    return "";
  }
};
var pairToken = hasDisplayPair();
var isDisplayContext = () => {
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("display") === "1") return true;
    const path = (window.location.pathname || "").toLowerCase();
    if (path.endsWith("/display.html") || path === "/display.html") return true;
    return !!window.__TP_FORCE_DISPLAY;
  } catch {
    return true;
  }
};
var shouldStart = Boolean(pairToken && isDisplayContext());
if (shouldStart) {
  const wsUrl = (() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${DISPLAY_WS_PATH}`;
  })();
  let socket = null;
  let reconnectTimer = null;
  let backoff = 1e3;
  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
    backoff = Math.min(15e3, backoff + 500);
  };
  const sendHandshake = () => {
    if (!socket) return;
    socket.send(JSON.stringify({ type: "hello", role: "display", token: pairToken }));
  };
  const deliverPayload = (data) => {
    try {
      const payload = JSON.parse(data);
      const handler = window.__tpDisplayHandleRemote;
      if (typeof handler === "function") {
        handler(payload);
      }
    } catch {
    }
  };
  const connect = () => {
    if (socket && socket.readyState === WebSocket.OPEN) return;
    try {
      socket?.close();
    } catch {
    }
    socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => {
      backoff = 1e3;
      sendHandshake();
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        deliverPayload(event.data);
      }
    });
    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      socket?.close();
    });
  };
  try {
    window.addEventListener("beforeunload", () => {
      try {
        socket?.close();
      } catch {
      }
    });
  } catch {
  }
  const waitForHandler = () => {
    const ready = typeof window.__tpDisplayHandleRemote === "function";
    if (ready) {
      connect();
    } else {
      window.setTimeout(waitForHandler, 50);
    }
  };
  waitForHandler();
}
//# sourceMappingURL=display-ws-display-client.js.map
