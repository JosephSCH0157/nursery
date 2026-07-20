/** @jest-environment jsdom */

import { captureConsoleMethods, captureWindowListeners } from '../helpers/window-listener-scope';

jest.mock('../../src/speech/backend-guard', () => ({
  ...jest.requireActual('../../src/speech/backend-guard'),
  isSpeechBackendAllowed: () => false,
}));

describe('speech loader blocked driver lifecycle', () => {
  let releaseWindowListeners: (() => void) | null = null;
  let restoreConsoleMethods: (() => void) | null = null;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    restoreConsoleMethods = captureConsoleMethods();
    releaseWindowListeners = captureWindowListeners();
    localStorage.clear();
    localStorage.setItem('tp_dev_mode', '1');
    window.history.replaceState({}, '', '/?dev=1');
    delete (window as any).__tpSpeech;
    delete (window as any).__tpSpeechOrchestrator;
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = 24;
  });

  afterEach(() => {
    jest.clearAllTimers();
    releaseWindowListeners?.();
    releaseWindowListeners = null;
    delete (window as any).__tpStore;
    delete (window as any).__tpAsrBlocksReady;
    delete (window as any).__tpAsrBlockCount;
    jest.restoreAllMocks();
    restoreConsoleMethods?.();
    restoreConsoleMethods = null;
  });

  async function installBlockedSpeechFixture() {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.phase', 'live' as any);
    appStore.set('session.asrDesired', true as any);
    appStore.set('session.asrArmed', true as any);
    const { installSpeech } = await import('../../src/features/speech-loader');
    installSpeech();
    return appStore;
  }

  test('coalesces repeated driver create blocked diagnostics by signature', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await installBlockedSpeechFixture();
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    for (let i = 0; i < 30; i += 1) {
      window.dispatchEvent(new CustomEvent('tp:scroll:mode', { detail: { mode: 'asr', reason: 'store-change' } }));
    }
    const blockedLogs = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[ASR] driver create blocked'));
    expect(blockedLogs.length).toBeLessThanOrEqual(4);
  });

});
