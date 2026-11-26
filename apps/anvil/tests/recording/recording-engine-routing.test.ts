const mockAuthority = jest.fn(async () => ({ ok: true }));
jest.mock('../../src/recording/obs-finished-import', () => ({ prepareObsRecordingImport: async () => (await mockAuthority()).ok }));

async function setup() {
  jest.resetModules();
  const core = { isAvailable: () => true, start: jest.fn(async () => {}), stop: jest.fn(async () => {}) };
  const obs = { isConnected: jest.fn(() => true), start: jest.fn(async () => {}), stop: jest.fn(async () => {}) };
  (window as any).__tpLocalRecorder = core;
  (window as any).__obsBridge = obs;
  const registry = await import('../../src/recording/recorderRegistry');
  (await import('../../src/recording/registerRecorders')).initRecorderBackends();
  return { core, obs, registry };
}
afterEach(() => { delete (window as any).__tpLocalRecorder; delete (window as any).__obsBridge; });

test('manual OBS start and stop use bridge, require authority, and never acquire Core devices', async () => {
  const { core, obs, registry } = await setup();
  await registry.startSessionRecording({ engine: 'obs', obsEnabled: true });
  expect(mockAuthority).toHaveBeenCalled(); expect(obs.start).toHaveBeenCalledTimes(1); expect(core.start).not.toHaveBeenCalled();
  await registry.stopSessionRecording(); expect(obs.stop).toHaveBeenCalledTimes(1); expect(core.stop).not.toHaveBeenCalled();
});
test('manual Core capture works with Auto-record disabled', async () => {
  const { core, obs, registry } = await setup();
  await registry.startSessionRecording({ engine: 'core', obsEnabled: true });
  expect(core.start).toHaveBeenCalledTimes(1); expect(obs.start).not.toHaveBeenCalled();
  await registry.stopSessionRecording(); expect(core.stop).toHaveBeenCalledTimes(1);
});
test('disconnected selected OBS fails visibly and never falls back', async () => {
  const { core, obs, registry } = await setup(); obs.isConnected.mockReturnValue(false);
  await expect(registry.startSessionRecording({ engine: 'obs', obsEnabled: true })).rejects.toThrow('Connect OBS');
  expect(core.start).not.toHaveBeenCalled(); expect(obs.start).not.toHaveBeenCalled(); expect(registry.isSessionRecording()).toBe(false);
});
test('failed capture authority blocks OBS commands', async () => {
  const { obs, registry } = await setup(); mockAuthority.mockResolvedValueOnce({ ok: false, reason: 'approved_ready_script_required' } as any);
  await expect(registry.startSessionRecording({ engine: 'obs' })).rejects.toThrow('approved script');
  expect(obs.start).not.toHaveBeenCalled();
});
test('automatic session start obeys preference and uses the selected engine', async () => {
  const { core, obs, registry } = await setup();
  const { setSettings } = await import('../../recorders-core');
  setSettings({ selected: ['obs'], mode: 'single', recordingMode: 'av' });
  let autoRecord = false;
  const { createStartOnPlay } = await import('../../src/recording/startOnPlay');
  const auto = createStartOnPlay({ get: (key: string) => key === 'autoRecord' ? autoRecord : true } as any);
  await auto.onSessionStart(); expect(obs.start).not.toHaveBeenCalled();
  autoRecord = true; await auto.onSessionStart(); expect(obs.start).toHaveBeenCalledTimes(1); expect(core.start).not.toHaveBeenCalled();
  await auto.onSessionStop(); expect(registry.isSessionRecording()).toBe(false);
});

test('uncertain OBS start retains Stop ownership without starting Core', async () => {
  const { core, obs, registry } = await setup();
  obs.start.mockRejectedValueOnce(Object.assign(new Error('OBS start confirmation lost; check OBS'), { captureMayBeActive: true }) as never);
  await expect(registry.startSessionRecording({ engine: 'obs' })).rejects.toThrow('confirmation lost');
  expect(registry.isSessionRecording()).toBe(true); expect(core.start).not.toHaveBeenCalled();
  await registry.stopSessionRecording(); expect(obs.stop).toHaveBeenCalledTimes(1);
});

test('Stop during a pending start waits and stops that capture, without leaving a late recording', async () => {
  const { core, registry } = await setup();
  let finish!: () => void;
  core.start.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const started = registry.startSessionRecording({ engine: 'core' });
  while (!finish) await Promise.resolve();
  expect(registry.isRecordingBusy()).toBe(true);
  const stopped = registry.stopSessionRecording();
  finish(); await Promise.all([started, stopped]);
  expect(core.stop).toHaveBeenCalledTimes(1);
  expect(registry.isSessionRecording()).toBe(false); expect(registry.isRecordingBusy()).toBe(false);
});
