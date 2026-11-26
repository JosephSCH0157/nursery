import test from 'node:test';
import assert from 'node:assert/strict';

let counter = 0;
async function fixture({ rejectAuth = false } = {}) {
  const clients = [];
  let authenticate;
  const authenticated = new Promise((resolve) => { authenticate = resolve; });
  class FakeObs {
    handlers = {};
    requests = [];
    recording = false;
    on(name, fn) { (this.handlers[name] ??= []).push(fn); }
    emit(name, data) { for (const fn of this.handlers[name] || []) fn(data); }
    constructor() { clients.push(this); }
    async connect(url, password) {
      this.url = url; this.password = password;
      this.emit('ConnectionOpened');
      await authenticated;
      if (rejectAuth) throw new Error('Authentication failed');
      this.emit('Identified');
    }
    async call(name) {
      this.requests.push(name);
      if (name === 'StartRecord') this.recording = true;
      if (name === 'StopRecord') { this.recording = false; return { outputPath: 'E:/OBS/take.mkv' }; }
      if (name === 'GetRecordStatus') return { outputActive: this.recording };
      return { obsVersion: 'test' };
    }
    disconnect() { this.emit('ConnectionClosed'); }
  }
  globalThis.window = { OBSWebSocket: FakeObs };
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const { default: bridge } = await import(`../adapters/obsBridge.js?contract=${++counter}`);
  bridge.configure({ url: 'ws://127.0.0.1:4455', password: 'synthetic-password' });
  bridge.setArmed(true);
  bridge.enableAutoReconnect(false);
  return { bridge, clients, authenticate };
}

test('public bridge matches controller and resolves concurrent callers after authenticated RPC', async () => {
  const f = await fixture();
  try {
    for (const name of ['configure', 'setArmed', 'connect', 'maybeConnect', 'disconnect', 'on', 'isConnected']) assert.equal(typeof f.bridge[name], 'function', name);
    const first = f.bridge.connect();
    const second = f.bridge.connect();
    assert.equal(first, second);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.bridge.isConnected(), false, 'socket open is not authenticated readiness');
    f.authenticate();
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(f.clients.length, 1);
    assert.equal(f.clients[0].password, 'synthetic-password');
    assert.ok(f.clients[0].requests.includes('GetVersion'));
    assert.equal(f.bridge.isConnected(), true);
    assert.equal(f.clients[0].recording, false, 'arming must not record');
  } finally { f.bridge.disconnect(); }
});

test('authentication failure never reports connected and is shared by waiting callers', async () => {
  const f = await fixture({ rejectAuth: true });
  let connects = 0;
  f.bridge.on('connect', () => connects++);
  try {
    const first = f.bridge.connect(); const second = f.bridge.maybeConnect();
    f.authenticate();
    assert.deepEqual(await Promise.all([first, second]), [false, false]);
    assert.equal(connects, 0);
    assert.equal(f.bridge.isConnected(), false);
    await assert.rejects(f.bridge.start(), /disconnected/);
  } finally { f.bridge.disconnect(); }
});

test('disarm during authentication prevents stale connection success', async () => {
  const f = await fixture();
  const connecting = f.bridge.connect();
  f.bridge.disconnect();
  f.authenticate();
  assert.equal(await connecting, false);
  assert.equal(f.bridge.isConnected(), false);
});

test('OBS commands confirm capture and preserve its configured output path', async () => {
  const f = await fixture();
  try {
    f.authenticate(); await f.bridge.connect();
    await f.bridge.start();
    assert.deepEqual(await f.bridge.getRecordStatus(), { outputActive: true });
    assert.deepEqual(await f.bridge.stop(), { adapter: 'obs', stopped: true, outputPath: 'E:/OBS/take.mkv' });
    assert.ok(f.clients[0].requests.every((name) => !/Directory|Profile/.test(name)));
    let disconnects = 0;
    f.bridge.on('disconnect', () => disconnects++);
    f.clients[0].disconnect();
    assert.equal(f.bridge.isConnected(), false);
    assert.equal(disconnects, 1);
  } finally { f.bridge.disconnect(); }
});

test('lost start confirmation retains uncertainty so the caller can still stop OBS', async () => {
  const f = await fixture();
  try {
    f.authenticate(); await f.bridge.connect();
    const call = f.clients[0].call.bind(f.clients[0]);
    f.clients[0].call = (name) => name === 'GetRecordStatus' ? Promise.reject(new Error('status unavailable')) : call(name);
    await assert.rejects(f.bridge.start(), (error) => error.captureMayBeActive === true);
    assert.equal(f.clients[0].recording, true);
  } finally { f.bridge.disconnect(); }
});
