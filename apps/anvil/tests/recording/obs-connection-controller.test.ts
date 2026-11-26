test('controller uses bridge contract, awaits auth, propagates disconnect, and initializes once', async () => {
  jest.resetModules(); localStorage.clear();
  const state = await import('../../src/state/recorder-settings');
  const handlers: Record<string, (...args: any[]) => void> = {};
  let connected = false;
  let complete!: (ok: boolean) => void;
  const connection = new Promise<boolean>((resolve) => { complete = resolve; });
  const bridge = {
    configure: jest.fn(), setArmed: jest.fn(), isConnected: () => connected,
    connect: jest.fn(() => connection),
    on: jest.fn((name: string, fn: (...args: any[]) => void) => { handlers[name] = fn; return () => {}; }),
  };
  (window as any).__obsBridge = bridge;
  const controller = await import('../../src/obs/obs-connection');
  controller.initObsConnection(); controller.initObsConnection();
  state.setRecorderEnabled('obs', true);
  expect(state.getRecorderSettings().obsStatus).toBe('connecting');
  handlers.connect();
  expect(state.getRecorderSettings().obsStatus).toBe('connecting');
  const pending = controller.connectObs();
  connected = true; complete(true); await pending;
  expect(state.getRecorderSettings().obsStatus).toBe('connected');
  expect(bridge.on).toHaveBeenCalledTimes(3);
  connected = false; handlers.disconnect();
  expect(state.getRecorderSettings().obsStatus).toBe('disconnected');
  handlers.error(new Error('Authentication failed'));
  expect(state.getRecorderSettings()).toMatchObject({ obsStatus: 'error', obsLastError: 'Authentication failed' });
  state.setRecorderEnabled('obs', false);
  expect(bridge.setArmed).toHaveBeenLastCalledWith(false);
  delete (window as any).__obsBridge;
});

test('a rejected connection cannot be mistaken for connected', async () => {
  jest.resetModules(); localStorage.clear();
  (window as any).__obsBridge = { configure: () => {}, setArmed: () => {}, isConnected: () => false,
    connect: async () => false, on: () => () => {} };
  const state = await import('../../src/state/recorder-settings');
  state.setRecorderEnabled('obs', true);
  const { connectObs } = await import('../../src/obs/obs-connection');
  await expect(connectObs()).resolves.toBe(false);
  expect(state.getRecorderSettings().obsStatus).toBe('error');
  state.setRecorderEnabled('obs', false); delete (window as any).__obsBridge;
});

test('an engine-only legacy cache cannot erase default OBS enabled/configuration state', async () => {
  jest.resetModules();
  localStorage.setItem('tp_rec_settings_v1', JSON.stringify({ mode: 'single', selected: ['obs'], recordingMode: 'av', configs: {} }));
  const state = await import('../../src/state/recorder-settings');
  expect(state.getRecorderSettings()).toMatchObject({ enabled: { obs: false }, configs: { obs: { url: 'ws://127.0.0.1:4455', password: '' } } });
  state.setObsStatus('connected');
  expect(JSON.parse(localStorage.getItem('tp_rec_settings_v1')!).selected).toEqual(['obs']);
});
