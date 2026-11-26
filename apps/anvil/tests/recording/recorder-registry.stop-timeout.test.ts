import type * as RecorderRegistry from '../../src/recording/recorderRegistry';
async function loadRegistry(): Promise<typeof RecorderRegistry> {
  jest.resetModules();
  return import('../../src/recording/recorderRegistry');
}
describe('recorderRegistry stop confirmation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test('unconfirmed OBS stop retains active ownership and surfaces failure for retry', async () => {
    const registry = await loadRegistry();
    const stop = jest.fn().mockImplementationOnce(() => new Promise<void>(() => {})).mockResolvedValue(undefined);
    registry.registerRecorder({ id: 'obs', label: 'OBS', isAvailable: async () => true, start: async () => {}, stop });
    await registry.startSessionRecording({ engine: 'obs', obsEnabled: true });
    const result = expect(registry.stopSessionRecording()).rejects.toThrow('obs:stop');
    await jest.advanceTimersByTimeAsync(16000); await result;
    expect(registry.isSessionRecording()).toBe(true);
    await registry.stopSessionRecording();
    expect(registry.isSessionRecording()).toBe(false);
    expect(stop).toHaveBeenCalledTimes(2);
  });
  test('Core Stop awaits finalization once under concurrent requests', async () => {
    const registry = await loadRegistry();
    let finish!: () => void;
    const finalized = new Promise<void>((resolve) => { finish = resolve; });
    const stop = jest.fn(() => finalized);
    registry.registerRecorder({ id: 'core', label: 'Core', isAvailable: async () => true, start: async () => {}, stop });
    await registry.startSessionRecording({ engine: 'core' });
    const first = registry.stopSessionRecording(); const second = registry.stopSessionRecording();
    await jest.advanceTimersByTimeAsync(3000);
    expect(stop).toHaveBeenCalledTimes(1); expect(registry.isSessionRecording()).toBe(true);
    finish(); await Promise.all([first, second]);
    expect(registry.isSessionRecording()).toBe(false);
  });
});
