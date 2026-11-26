// OBS Bridge — small wrapper around obs-websocket-js providing
// - connection lifecycle with exponential reconnect/backoff
// - simple start/stop/getStatus API
// - UI updates for connection and recording chips
// This intentionally keeps a narrow public surface so the page can use
// window.__obsBridge as a single source of truth.

let _obsClient = null;
let _connected = false;
let _connecting = false;
let _connectPromise = null;
let _generation = 0;
let _cfg = { url: 'ws://127.0.0.1:4455', password: '' };
let _autoReconnect = true;
let _reconnectTimer = null;
let _backoffMs = 1000; // start 1s
const _backoffMax = 5000;
const _backoffFactor = 2;
const _listeners = { connect: [], disconnect: [], recordstate: [], error: [] };
let _lastScene = null;
let _keepAliveTimer = null;
function _startKeepAlive() {
  if (_keepAliveTimer) return;
  _keepAliveTimer = setInterval(() => {
    try {
      if (_obsClient && _connected) {
        // cheap request OBS will answer quickly
        _obsClient.call && _obsClient.call('GetVersion').catch(() => {});
      }
    } catch {}
  }, 15000);
}
function _stopKeepAlive() {
  if (_keepAliveTimer) {
    clearInterval(_keepAliveTimer);
    _keepAliveTimer = null;
  }
}

// Return OBS stats (GetStats) if available
async function _getStats() {
  try {
    await _connectOnce();
    if (!_obsClient) return null;
    return await _obsClient.call('GetStats');
  } catch (e) {
    _emit('error', e);
    return null;
  }
}

function _setObsConnChip(connected) {
  try {
    window.__obsConnected = !!connected;
  } catch {}
}

async function _ensureObsLib() {
  if (typeof window !== 'undefined' && window.OBSWebSocket) return window.OBSWebSocket;
  // Try primary CDN, then a secondary fallback to improve resilience in restricted networks
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/obs-websocket-js@5.0.4/+esm');
    return mod.default || mod.OBSWebSocket || mod;
  } catch (e1) {
    try { void e1; } catch {}
    try {
      const mod2 = await import('https://unpkg.com/obs-websocket-js@5.0.4/dist/obs-ws.min.js');
      // Some UMD builds attach to window; prefer global if present
      if (typeof window !== 'undefined' && window.OBSWebSocket) return window.OBSWebSocket;
      return mod2.default || mod2.OBSWebSocket || mod2;
    } catch (e2) {
      try { window.HUD?.log?.('obs:error', 'obs-websocket-js load failed'); } catch {}
      throw e2;
    }
  }
}

async function _createClient() {
  if (_obsClient) return _obsClient;
  const OBSWebSocket = await _ensureObsLib();
  _obsClient = new OBSWebSocket();
  return _obsClient;
}

function _connectOnce() {
  // Respect armed gating: never connect if disabled
  try {
    if (typeof _armed !== 'undefined' && !_armed) return Promise.resolve(false);
  } catch {}
  // Rehearsal Mode: short-circuit all OBS connections (belt & suspenders)
  try { if (typeof window !== 'undefined' && window.__TP_REHEARSAL) { return Promise.resolve(false); } } catch {}
  if (_connected) return Promise.resolve(true);
  if (_connectPromise) return _connectPromise;
  const generation = _generation;
  _connecting = true;
  const task = (async () => {
  try {
    const client = await _createClient();
    if (generation !== _generation || !_armed) return false;
    // wire basic events
    client.on('ConnectionClosed', (d) => {
      if (generation !== _generation || client !== _obsClient) return;
      _generation += 1;
      _connectPromise = null;
      _obsClient = null;
      _connected = false;
      _setObsConnChip(false);
      _emit('disconnect', d);
      _stopKeepAlive();
      try { window.HUD?.warn?.('obs:close', d || { via: 'obs-websocket-js' }); } catch {}
      if (_autoReconnect && (_armed === true)) _scheduleReconnect();
    });
    // Extra observability
    try { client.on('Identified', () => { try { window.HUD?.log?.('obs:identified'); } catch {} }); } catch {}
    try { client.on('CurrentProgramSceneChanged', (e) => { try { _emit('scene', e); window.HUD?.log?.('obs:scene', e); } catch {} }); } catch {}
    client.on('RecordStateChanged', (ev) => {
      if (generation !== _generation || client !== _obsClient) return;
      try {
        const active = !!(ev && (ev.outputActive || ev.outputActive === true));
        _emit('recordstate', active, ev);
      } catch {}
    });
    // prefer configured pw, otherwise fall back to window.getObsPassword
    const pw =
      _cfg.password ||
      (typeof window !== 'undefined' && window.getObsPassword ? window.getObsPassword() : '');
    await client.connect(_cfg.url, pw);
    // The SDK resolves after authentication/identification. Confirm an RPC too.
    await client.call('GetVersion');
    if (generation !== _generation || !_armed || client !== _obsClient) return false;
    _connected = true;
    _backoffMs = 1000;
    _startKeepAlive();
    _setObsConnChip(true);
    _emit('connect');
    try {
      // Surface version info once connected
      const ver = await client.call('GetVersion').catch(() => null);
      if (ver) { try { window.HUD?.log?.('obs:connected', ver); } catch {} }
    } catch {}
    _connecting = false;
    return true;
  } catch (e) {
    if (generation !== _generation) return false;
    _connecting = false;
    _connected = false;
    _setObsConnChip(false);
    _emit('error', e);
    try { window.HUD?.log?.('obs:error', String(e && e.message || e)); } catch {}
    try {
      // ensure client cleared to allow fresh attempts
      _obsClient?.disconnect();
    } catch {}
    _obsClient = null;
    if (_autoReconnect) _scheduleReconnect();
    return false;
  }
  })();
  _connectPromise = task;
  void task.finally(() => { if (_connectPromise === task) _connectPromise = null; });
  return task;
}

function _scheduleReconnect() {
  try {
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    if (_armed === false) return; // do not schedule when disarmed
    const delay = Math.min(_backoffMs, _backoffMax);
    _backoffMs = Math.min(_backoffMax, Math.max(1000, _backoffMs * _backoffFactor));
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      if (_armed === false) return;
      _connectOnce();
    }, delay);
  } catch {}
}

function _emit(name, ...args) {
  try {
    const list = _listeners[name] || [];
    for (const cb of list.slice()) {
      try {
        cb(...args);
      } catch {}
    }
  } catch {}
}

// Observe before sending the command so an event delivered before its ACK is
// retained. Polling is a bounded fallback, not a second mandatory success gate.
const RECORD_CONFIRM_TIMEOUT_MS = 5000;
const RECORD_CONFIRM_POLL_MS = 200;
let _recordCommand = null;
function _recordingConfirmation(client, generation, active) {
  let settled = false;
  let begun = false;
  let deadline = null;
  let pollTimer = null;
  let finish;
  const result = new Promise((resolve) => { finish = resolve; });
  const clean = () => {
    clearTimeout(deadline); clearTimeout(pollTimer);
    bridge.off('recordstate', onState); bridge.off('disconnect', onDisconnect);
  };
  const complete = (value) => {
    if (settled) return;
    settled = true; clean(); finish(value);
  };
  const onDisconnect = () => complete({ ok: false, reason: 'OBS disconnected before recording confirmation. Check OBS before retrying Stop.' });
  const onState = (outputActive, event) => {
    if (generation !== _generation || client !== _obsClient) return;
    const state = event?.outputState;
    if (active && outputActive === true && state !== 'OBS_WEBSOCKET_OUTPUT_STARTING' && state !== 'OBS_WEBSOCKET_OUTPUT_STOPPING') {
      complete({ ok: true, via: 'event' });
    } else if (!active && outputActive === false && state === 'OBS_WEBSOCKET_OUTPUT_STOPPED' && typeof event.outputPath === 'string' && event.outputPath.trim()) {
      complete({ ok: true, via: 'event', outputPath: event.outputPath.trim() });
    }
  };
  bridge.on('recordstate', onState); bridge.on('disconnect', onDisconnect);
  const probe = async () => {
    if (settled) return;
    if (generation !== _generation || client !== _obsClient || !_connected) { onDisconnect(); return; }
    try {
      const status = await client.call('GetRecordStatus');
      if (!settled && generation === _generation && client === _obsClient && active && status?.outputActive === true) {
        complete({ ok: true, via: 'status' });
      }
      // Inactive status alone cannot supply the saved file path for Stop.
    } catch { /* A later terminal event can still provide authoritative proof. */ }
    if (!settled) pollTimer = setTimeout(probe, RECORD_CONFIRM_POLL_MS);
  };
  return {
    wait() {
      if (!begun && !settled) {
        begun = true;
        deadline = setTimeout(() => complete({ ok: false, reason: active
          ? 'OBS recording was not confirmed. Check OBS, then use Stop before trying another take.'
          : 'OBS did not return a finalized recording path. Check the local file in OBS before retrying.' }), RECORD_CONFIRM_TIMEOUT_MS);
        void probe();
      }
      return result;
    },
    dispose: clean,
  };
}
function _runRecordCommand(kind, action) {
  if (_recordCommand) {
    if (_recordCommand.kind === kind) return _recordCommand.promise;
    return _recordCommand.promise.catch(() => {}).then(() => _runRecordCommand(kind, action));
  }
  const promise = action();
  const operation = { kind, promise };
  _recordCommand = operation;
  const clear = () => { if (_recordCommand === operation) _recordCommand = null; };
  void promise.then(clear, clear);
  return promise;
}

const bridge = {
  connect: _connectOnce,
  maybeConnect: _connectOnce,
  setArmed,
  armed,
  disconnect() { setArmed(false); },
  configure(next) {
    _cfg = { ..._cfg, ...(next || {}) };
  },
  start() {
    return _runRecordCommand('start', async () => {
      let requested = false;
      let confirmation;
      try {
        await _connectOnce();
        if (!_connected || !_obsClient) throw new Error('OBS is disconnected. Connect OBS in Recording Settings.');
        const client = _obsClient;
        confirmation = _recordingConfirmation(client, _generation, true);
        requested = true;
        await client.call('StartRecord');
        const confirmed = await confirmation.wait();
        if (!confirmed.ok) throw new Error(confirmed.reason);
      } catch (error) {
        if (requested && error && typeof error === 'object') error.captureMayBeActive = true;
        _emit('recordingerror', error);
        throw error;
      } finally { confirmation?.dispose(); }
    });
  },
  stop() {
    return _runRecordCommand('stop', async () => {
      let confirmation;
      try {
        if (!_connected || !_obsClient) throw new Error('OBS is disconnected. Check recording status in OBS.');
        const client = _obsClient;
        confirmation = _recordingConfirmation(client, _generation, false);
        const response = await client.call('StopRecord');
        const responsePath = typeof response?.outputPath === 'string' ? response.outputPath.trim() : '';
        // StopRecord's successful saved-path response is completion evidence.
        // A subsequent failed/stale status probe must not undo that evidence.
        const confirmed = responsePath ? { ok: true, outputPath: responsePath } : await confirmation.wait();
        if (!confirmed.ok) throw new Error(confirmed.reason);
        return { adapter: 'obs', stopped: true, outputPath: confirmed.outputPath };
      } catch (error) {
        _emit('recordingerror', error);
        throw error;
      } finally { confirmation?.dispose(); }
    });
  },
  async getRecordStatus() {
    try {
      await _connectOnce();
      if (!_connected || !_obsClient) throw new Error('OBS connection unavailable');
      return await _obsClient.call('GetRecordStatus');
    } catch (e) {
      _emit('recordingerror', e);
      throw e;
    }
  },
  async getSceneList() {
    try {
      await _connectOnce();
      if (!_obsClient) return null;
      const res = await _obsClient.call('GetSceneList');
      // res.scenes expected
      return res && (res.scenes || res.sceneList || null);
    } catch (e) {
      _emit('error', e);
      return null;
    }
  },
  async getRecordDirectory() {
    try {
      await _connectOnce();
      if (!_obsClient) return null;
      const res = await _obsClient.call('GetRecordDirectory');
      return res || null; // { recordDirectory }
    } catch (e) {
      _emit('error', e);
      return null;
    }
  },
  async getCurrentProgramScene() {
    try {
      await _connectOnce();
      if (!_obsClient) return null;
      // try likely method names
      try {
        const r = await _obsClient.call('GetCurrentProgramScene');
        return r && (r.currentProgramScene || r.currentProgramSceneName || r.sceneName || null);
      } catch {
        // fallback name
        try {
          const r2 = await _obsClient.call('GetProgramScene');
          return r2 && (r2.currentProgramScene || r2.sceneName || null);
        } catch (e2) {
          _emit('error', e2);
          return null;
        }
      }
    } catch (e) {
      _emit('error', e);
      return null;
    }
  },
  async getStats() {
    return _getStats();
  },
  async setCurrentProgramScene(sceneName) {
    try {
      await _connectOnce();
      if (!_obsClient) throw new Error('Not connected');
      const target = sceneName || _lastScene || 'default';
      const res = await _obsClient.call('SetCurrentProgramScene', { sceneName: target });
      try { _lastScene = target; } catch {}
      return res;
    } catch (e) {
      _emit('error', e);
      throw e;
    }
  },
  isConnected() {
    return !!_connected;
  },
  on(name, cb) {
    if (!_listeners[name]) _listeners[name] = [];
    _listeners[name].push(cb);
    return () => this.off(name, cb);
  },
  off(name, cb) {
    if (!_listeners[name]) return;
    const i = _listeners[name].indexOf(cb);
    if (i >= 0) _listeners[name].splice(i, 1);
  },
  enableAutoReconnect(v) {
    _autoReconnect = !!v;
    if (_autoReconnect && !_connected && _armed !== false) _scheduleReconnect();
  },
};

// expose bridge on window for backwards compatibility
try {
  if (typeof window !== 'undefined') {
    window.__obsBridge = bridge;
    // set initial UI state
    _setObsConnChip(false);
  }
} catch {}

export default bridge;

// ---- Armed gating (respect Settings “OBS Off”) -----------------------------
// Unified gating: prefer store value when available, else fall back to localStorage.
// Legacy key: tp_obs_enabled (boolean '1'/'0')
// New mirror key: tp_obs_enabled_v2 (boolean '1'/'0') to allow future migrations without clobbering older sessions.
let _armed = false;
try {
  // If store is present, prefer its obsEnabled value (explicit user intent this session)
  const S = (typeof window !== 'undefined' ? window.__tpStore : null);
  if (S && typeof S.get === 'function') {
    const v = S.get('obsEnabled');
    if (typeof v === 'boolean') {
      _armed = v;
    } else {
      // Non-boolean (undefined/null) → fall back to persisted localStorage flag(s)
      _armed = (localStorage.getItem('tp_obs_enabled_v2') === '1')
        || (localStorage.getItem('tp_obs_enabled_v1') === '1')
        || (localStorage.getItem('tp_obs_enabled') === '1');
    }
  } else {
    // No store yet (early boot) → fall back to persisted flags
    _armed = (localStorage.getItem('tp_obs_enabled_v2') === '1')
      || (localStorage.getItem('tp_obs_enabled_v1') === '1')
      || (localStorage.getItem('tp_obs_enabled') === '1');
  }
} catch {}

// Early subscription (best-effort): if the store loads after this module, reflect changes immediately
try {
  const S = (typeof window !== 'undefined' ? window.__tpStore : null);
  if (S && typeof S.subscribe === 'function') {
    S.subscribe('obsEnabled', (v) => {
      try { setArmed(!!v); } catch {}
    });
  }
} catch {}

function armed(){ return !!_armed; }
function setArmed(on){
  _armed = !!on;
  // Persist all known keys for compatibility / migration across wiring paths
  try { localStorage.setItem('tp_obs_enabled', _armed ? '1' : '0'); } catch {}
  try { localStorage.setItem('tp_obs_enabled_v1', _armed ? '1' : '0'); } catch {}
  try { localStorage.setItem('tp_obs_enabled_v2', _armed ? '1' : '0'); } catch {}
  // Tie auto-reconnect to armed
  _autoReconnect = !!_armed;
  if (!_armed) {
    _generation += 1;
    _connectPromise = null;
    try { if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; } } catch {}
    try { _stopKeepAlive(); } catch {}
    try { _obsClient?.disconnect?.(); } catch {}
    try { if (_obsClient) { _obsClient = null; } } catch {}
    _connected = false;
    _connecting = false;
    _setObsConnChip(false);
    _emit('disconnect');
  } else {
    // best-effort: attempt a connect only when explicitly asked via maybeConnect
  }
}
async function maybeConnect(){
  if (!_armed) return false;
  try { return await _connectOnce(); }
  catch { if (_armed && _autoReconnect) _scheduleReconnect(); }
}

// Expose minimal control surface for Settings
try {
  if (typeof window !== 'undefined') {
    window.__tpObs = Object.assign(window.__tpObs || {}, { setArmed, armed, maybeConnect });
  }
} catch {}
