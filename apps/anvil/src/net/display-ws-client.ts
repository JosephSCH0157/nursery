import { buildDisplayWsUrl } from './display-ws-endpoint';

type RelayState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RelayStatus = {
  state: RelayState;
  connectedDisplays: number;
  lastError?: string;
};

const status: RelayStatus = {
  state: 'disconnected',
  connectedDisplays: 0,
  lastError: undefined,
};

const listeners = new Set<(status: RelayStatus) => void>();
let socket: WebSocket | null = null;
let reconnectDelay = 1000;
let reconnectTimer: number | null = null;
let sendQueue: string[] = [];
const SCROLL_THROTTLE_MS = 60;
let scrollTimer: number | null = null;
let pendingScroll: string | null = null;
let relayEnabled = false;
let relayPairToken = '';
const RELAY_ENABLED_KEY = 'tp_display_ws_enabled';

const flushScroll = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    scrollTimer = null;
    pendingScroll = null;
    return;
  }
  if (pendingScroll) {
    try {
      socket.send(pendingScroll);
    } catch {
      // ignore
    }
  }
  pendingScroll = null;
  scrollTimer = null;
};

const queueScrollMessage = (serialized: string) => {
  pendingScroll = serialized;
  if (scrollTimer) return;
  scrollTimer = window.setTimeout(() => {
    flushScroll();
  }, SCROLL_THROTTLE_MS);
};

const isDisplayContext = () => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('display') === '1') return true;
    const path = (window.location.pathname || '').toLowerCase();
    if (path.endsWith('/display.html') || path === '/display.html') return true;
    if ((window as any).__TP_FORCE_DISPLAY) return true;
  } catch {
    // ignore
  }
  return false;
};

const isSupported = typeof window !== 'undefined' && typeof WebSocket !== 'undefined' && !isDisplayContext();

const isRelayDisabled = () => {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (w.__TP_DISABLE_DISPLAY_WS) return true;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('ci') === '1') return true;
    if (params.get('uiMock') === '1') return true;
    if (params.get('mockFolder') === '1') return true;
    if (params.get('noDisplayWs') === '1') return true;
  } catch {
    // ignore
  }
  return false;
};

const notifyListeners = () => {
  const snapshot = { ...status };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // ignore listener errors
    }
  });
};

const updateStatus = (patch: Partial<RelayStatus>) => {
  Object.assign(status, patch);
  notifyListeners();
};

const normalizePairToken = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const getWsUrl = () => {
  return buildDisplayWsUrl(relayPairToken);
};

const flushQueue = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!sendQueue.length) return;
  for (const msg of sendQueue) {
    try {
      socket.send(msg);
    } catch {
      // ignore per-message failures
    }
  }
  sendQueue = [];
};

const scheduleReconnect = () => {
  if (reconnectTimer || !isSupported || !relayEnabled) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(15000, reconnectDelay * 1.5);
};

const handleMessage = (event: MessageEvent<string>) => {
  try {
    const data = JSON.parse(event.data);
    if (data?.type === 'ready') {
      updateStatus({ connectedDisplays: 1 });
      return;
    }
    if (data?.type === 'tp-display-status') {
      const connected = typeof data.connected === 'number' ? data.connected : status.connectedDisplays;
      updateStatus({ connectedDisplays: connected });
    }
  } catch {
    // ignore invalid JSON
  }
};

const resetSocket = () => {
  if (socket) {
    try {
      socket.close();
    } catch {}
  }
  socket = null;
};

const connect = () => {
  if (!isSupported || !relayEnabled) return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  updateStatus({ state: 'connecting', lastError: undefined });
  const url = getWsUrl();
  if (!url) {
    updateStatus({ state: 'error', lastError: 'Pair token unavailable' });
    return;
  }
  resetSocket();
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
    updateStatus({ state: 'connected', lastError: undefined });
    try {
      ws.send('ping');
    } catch {}
    flushQueue();
  });

  ws.addEventListener('message', handleMessage);

  const cleanup = () => {
    updateStatus({ state: 'disconnected', connectedDisplays: 0, lastError: undefined });
    socket = null;
    scheduleReconnect();
  };

  ws.addEventListener('close', cleanup);
  ws.addEventListener('error', (event) => {
    updateStatus({ state: 'error', lastError: String((event as any)?.reason || 'WebSocket error') });
  });
};

const loadRelayEnabled = () => {
  if (typeof window === 'undefined') return false;
  if (isRelayDisabled()) return false;
  try {
    return localStorage.getItem(RELAY_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
};

const persistRelayEnabled = (on: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    if (on) {
      localStorage.setItem(RELAY_ENABLED_KEY, '1');
    } else {
      localStorage.removeItem(RELAY_ENABLED_KEY);
    }
  } catch {
    // ignore
  }
};

relayEnabled = loadRelayEnabled();

if (isSupported && relayEnabled) {
  connect();
}

try {
  window.addEventListener('beforeunload', () => {
    socket?.close();
  });
} catch {}

export function publishToNetworkDisplays(payload: unknown): void {
  if (!isSupported || !relayEnabled || typeof payload === 'undefined') return;
  try {
  const str = JSON.stringify(payload);
  let payloadType: string | null = null;
  if (payload && typeof payload === 'object') {
    const candidate = (payload as Record<string, unknown>).type;
    if (typeof candidate === 'string') {
      payloadType = candidate;
    }
  }
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (payloadType === 'scroll') {
      queueScrollMessage(str);
    } else {
      socket.send(str);
    }
    return;
  }
    sendQueue.push(str);
    if (sendQueue.length > 256) {
      sendQueue.shift();
    }
  } catch {
    // swallow serialization errors
  }
}

export function onNetworkDisplayStatus(fn: (status: RelayStatus) => void): () => void {
  listeners.add(fn);
  fn({ ...status });
  return () => {
    listeners.delete(fn);
  };
}

export function getNetworkDisplayStatus(): RelayStatus {
  return { ...status };
}

export function setNetworkDisplayPairToken(token: string | null): void {
  const next = normalizePairToken(token);
  if (relayPairToken === next) return;
  relayPairToken = next;
  if (!relayEnabled || !isSupported) return;
  if (!relayPairToken) {
    resetSocket();
    updateStatus({ state: 'error', connectedDisplays: 0, lastError: 'Pair token unavailable' });
    return;
  }
  resetSocket();
  connect();
}

export function enableNetworkDisplayRelay(): void {
  if (!isSupported) return;
  if (isRelayDisabled()) return;
  if (relayEnabled) return;
  if (!relayPairToken) {
    updateStatus({ state: 'error', lastError: 'Pair token unavailable' });
    return;
  }
  relayEnabled = true;
  persistRelayEnabled(true);
  connect();
}
