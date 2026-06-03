/** @jest-environment jsdom */

describe('ASR log buffer boot install', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    window.history.replaceState({}, '', '/?dev=1');
    delete (window as any).__ASR_LOG_BUFFER__;
    delete (window as any).__copyAsrLog;
    delete (window as any).__downloadAsrLog;
    delete (window as any).__clearAsrLog;
    delete (window as any).__getAsrLogSummary;
    delete (window as any).__asrLogBufferInstalled;
    delete (window as any).__tpAsrMode;
    delete (window as any).__ASR_DIAGNOSTIC_PROOF__;
    delete (window as any).__ASR_INIT_IMPL__;
    delete (globalThis as any).__downloadAsrLog;
  });

  test('initAsrFeature installs __downloadAsrLog in dev boot path', async () => {
    jest.doMock('../../src/ui/topbar-asr', () => ({
      AsrTopbar: class {
        mount() {
          // no-op for test
        }
      },
    }));
    jest.doMock('../../src/hotkeys/asr-hotkeys', () => ({
      installAsrHotkeys: jest.fn(),
    }));
    jest.doMock('../../src/ui/settings-asr', () => ({
      ensureAsrSettingsWired: jest.fn(),
    }));

    const { initAsrFeature } = await import('../../src/index-hooks/asr');
    initAsrFeature();

    expect(typeof (window as any).__downloadAsrLog).toBe('function');
    expect(typeof (globalThis as any).__downloadAsrLog).toBe('function');
  });
});
