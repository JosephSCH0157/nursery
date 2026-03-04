import type * as RecorderRegistry from '../../src/recording/recorderRegistry';

type RecorderRegistryModule = typeof RecorderRegistry;

async function loadRegistry(): Promise<RecorderRegistryModule> {
  jest.resetModules();
  return import('../../src/recording/recorderRegistry');
}

describe('recorderRegistry stop hardening', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('stuck recorder stop times out and releases recording state', async () => {
    const registry = await loadRegistry();
    let stopCalls = 0;

    registry.registerRecorder({
      id: 'core',
      label: 'core',
      async isAvailable() {
        return true;
      },
      async start() {},
      async stop() {
        stopCalls += 1;
        return await new Promise<void>(() => {});
      },
    });

    await registry.startSessionRecording({ engine: 'core', obsEnabled: false });
    expect(registry.isSessionRecording()).toBe(true);

    const stopPromise = registry.stopSessionRecording();
    await jest.advanceTimersByTimeAsync(2300);
    await stopPromise;

    expect(stopCalls).toBe(1);
    expect(registry.isSessionRecording()).toBe(false);
  });

  test('stop is idempotent under rapid repeated calls', async () => {
    const registry = await loadRegistry();
    let stopCalls = 0;

    registry.registerRecorder({
      id: 'core',
      label: 'core',
      async isAvailable() {
        return true;
      },
      async start() {},
      async stop() {
        stopCalls += 1;
        return await new Promise<void>(() => {});
      },
    });

    await registry.startSessionRecording({ engine: 'core', obsEnabled: false });
    expect(registry.isSessionRecording()).toBe(true);

    const first = registry.stopSessionRecording();
    const second = registry.stopSessionRecording();
    await jest.advanceTimersByTimeAsync(2300);
    await Promise.all([first, second]);

    expect(stopCalls).toBe(1);
    expect(registry.isSessionRecording()).toBe(false);
  });
});
