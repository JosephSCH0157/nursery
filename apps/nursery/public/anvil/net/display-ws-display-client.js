// src/net/display-ws-endpoint.ts
var DEFAULT_DISPLAY_WS_BASE = "wss://wtvdjndyxegudufrompx.functions.supabase.co/display-ws";
function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function resolveConfiguredBase() {
  const w = typeof window !== "undefined" ? window : {};
  const metaEnv = typeof import.meta !== "undefined" ? import.meta.env || {} : {};
  return readString(w.__TP_DISPLAY_WS_URL) || readString(metaEnv.VITE_DISPLAY_WS_URL) || DEFAULT_DISPLAY_WS_BASE;
}
function normalizeWsBase(candidate) {
  try {
    const url = new URL(candidate);
    const protocol = url.protocol.toLowerCase();
    if (protocol === "https:") {
      url.protocol = "wss:";
    } else if (protocol === "http:") {
      url.protocol = "ws:";
    } else if (protocol !== "ws:" && protocol !== "wss:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
function resolveDisplayWsBase() {
  return normalizeWsBase(resolveConfiguredBase()) || DEFAULT_DISPLAY_WS_BASE;
}
function buildDisplayWsUrl(pairToken2) {
  const token = readString(pairToken2);
  if (!token) return null;
  try {
    const url = new URL(resolveDisplayWsBase());
    url.searchParams.set("pair", token);
    return url.toString();
  } catch {
    return null;
  }
}

// src/net/display-ws-display-client.ts
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
  const wsUrl = buildDisplayWsUrl(pairToken);
  if (!wsUrl) {
    try {
      console.warn("[display-ws] missing/invalid websocket endpoint");
    } catch {
    }
  } else {
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
        try {
          socket?.send("ping");
        } catch {
        }
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
}
