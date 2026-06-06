/** @jest-environment jsdom */

function installAsrDom(): void {
  document.body.innerHTML = `
    <main id="viewer" class="viewer" style="overflow-y:auto; scroll-padding-top:240px;">
      <div id="script" style="padding-top:240px;">
        <div class="line" data-line="0">Alpha beta gamma</div>
      </div>
    </main>
  `;
  const viewer = document.getElementById('viewer') as HTMLElement;
  const script = document.getElementById('script') as HTMLElement;
  const line = document.querySelector('.line') as HTMLElement;
  Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: 1800 });
  Object.defineProperty(viewer, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  });
  Object.defineProperty(script, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 800, bottom: 1000, width: 800, height: 1000 }),
  });
  Object.defineProperty(line, 'offsetTop', { configurable: true, value: 240 });
  Object.defineProperty(line, 'offsetHeight', { configurable: true, value: 120 });
  Object.defineProperty(line, 'clientHeight', { configurable: true, value: 120 });
  Object.defineProperty(line, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 240, left: 0, right: 800, bottom: 360, width: 800, height: 120 }),
  });
}

describe('speech loader runtime status', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    installAsrDom();
    delete (window as any).__tpStore;
    delete (window as any).__tpMic;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).__tpAsrBlocksReady;
    delete (window as any).__tpAsrBlockCount;
    delete (window as any).__TP_TS_PRIMARY__;
    delete (window as any).__TP_LAST_APPLIED_HASH;
    delete (window as any).__tpSpeech;
    delete (window as any).__tpMatcher;
    delete (window as any).__tpEmitSpeech;
    delete (window as any).scriptWords;
    delete (window as any).paraIndex;
    delete (window as any).__vParaIndex;
    delete (window as any).currentIndex;
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  afterEach(() => {
    delete (window as any).__tpStore;
    delete (window as any).__tpMic;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).__tpAsrBlocksReady;
    delete (window as any).__tpAsrBlockCount;
    delete (window as any).__TP_TS_PRIMARY__;
    delete (window as any).__TP_LAST_APPLIED_HASH;
    delete (window as any).__tpSpeech;
    delete (window as any).__tpMatcher;
    delete (window as any).__tpEmitSpeech;
    delete (window as any).scriptWords;
    delete (window as any).paraIndex;
    delete (window as any).__vParaIndex;
    delete (window as any).currentIndex;
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    jest.restoreAllMocks();
  });

  test('surfaces whisper fallback through the canonical runtime status', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const whisperStart = jest.fn(async () => {
      throw new Error('bridge-down');
    });
    const whisperOn = jest.fn();

    jest.doMock('../../src/speech/engines/whisper-bridge', () => ({
      createWhisperBridgeRecognizer: jest.fn(() => ({
        start: whisperStart,
        on: whisperOn,
      })),
    }));
    jest.doMock('../../src/features/asr/asr-scroll-driver', () => ({
      createAsrScrollDriver: jest.fn(() => ({
        getStats: () => ({
          lastIngestAt: 0,
          lastCommitAt: 0,
          commitCount: 0,
          eventsSinceCommit: 0,
          finalsSinceCommit: 0,
        }),
        getLastLineIndex: () => 0,
        setLastLineIndex: jest.fn(),
        ingest: jest.fn(),
        dispose: jest.fn(),
      })),
    }));

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onstart: ((ev: Event) => void) | null = null;
      start = jest.fn(() => {
        this.onstart?.(new Event('start'));
      });
      stop = jest.fn();
      abort = jest.fn();
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;

    const statuses: Array<Record<string, unknown>> = [];
    window.addEventListener('tp:asr:runtime-status', ((event: Event) => {
      statuses.push(((event as CustomEvent).detail || {}) as Record<string, unknown>);
    }) as EventListener);

    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');

    initSession();
    (window as any).__tpStore = appStore;
    (window as any).__tpMic = {
      requestMic: jest.fn(),
      releaseMic: jest.fn(),
    };
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('asr.engine', 'whisper');

    const {
      startSpeechBackendForSession,
      stopSpeechBackendForSession,
    } = await import('../../src/features/speech-loader');

    const ok = await startSpeechBackendForSession({ mode: 'asr', reason: 'test-runtime-fallback' });
    const runtimeStatus = (window as any).__tpAsrRuntimeStatus;

    expect(ok).toBe(true);
    expect(runtimeStatus).toEqual(expect.objectContaining({
      requestedEngine: 'whisper',
      persistedEngine: 'whisper',
      appStoreEngine: 'whisper',
      actualEngine: 'webspeech',
      fallbackActive: true,
      fallbackReason: 'whisper-start-failed',
      recognizerAttached: true,
    }));
    expect(
      statuses.some((status) => (
        status.reason === 'backend-fallback:whisper' &&
        status.requestedEngine === 'whisper' &&
        status.actualEngine === 'webspeech'
      )),
    ).toBe(true);
    expect(typeof (window as any).__tpEmitSpeech).toBe('function');

    stopSpeechBackendForSession('test-runtime-fallback');
    expect((window as any).__tpEmitSpeech).toBeUndefined();
  });

  test('reports whisper-large-live runtime path in ASR2 diagnostics', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('tp_asr_experimental_lane_v1', 'ASR2_WHISPER_LARGE_V3_EXPERIMENTAL');

    const whisperStart = jest.fn(async () => {
      throw new Error('bridge-down');
    });
    const whisperOn = jest.fn();
    jest.doMock('../../src/speech/engines/whisper-bridge', () => ({
      createWhisperBridgeRecognizer: jest.fn(() => ({
        start: whisperStart,
        on: whisperOn,
      })),
    }));
    jest.doMock('../../src/features/asr/asr-scroll-driver', () => ({
      createAsrScrollDriver: jest.fn(() => ({
        getStats: () => ({
          lastIngestAt: 0,
          lastCommitAt: 0,
          commitCount: 0,
          eventsSinceCommit: 0,
          finalsSinceCommit: 0,
        }),
        getLastLineIndex: () => 0,
        setLastLineIndex: jest.fn(),
        ingest: jest.fn(),
        dispose: jest.fn(),
      })),
    }));

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onstart: ((ev: Event) => void) | null = null;
      start = jest.fn(() => {
        this.onstart?.(new Event('start'));
      });
      stop = jest.fn();
      abort = jest.fn();
    }
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const statuses: Array<Record<string, unknown>> = [];
    window.addEventListener('tp:asr:runtime-status', ((event: Event) => {
      statuses.push(((event as CustomEvent).detail || {}) as Record<string, unknown>);
    }) as EventListener);

    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    initSession();
    (window as any).__tpStore = appStore;
    (window as any).__tpMic = {
      requestMic: jest.fn(),
      releaseMic: jest.fn(),
    };
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('asr.engine', 'whisper');

    const { startSpeechBackendForSession, stopSpeechBackendForSession } = await import('../../src/features/speech-loader');
    const ok = await startSpeechBackendForSession({ mode: 'asr', reason: 'test-asr2-runtime-path' });
    expect(ok).toBe(true);

    const runtimeStatus = (window as any).__tpAsrRuntimeStatus;
    expect(runtimeStatus).toEqual(expect.objectContaining({
      activeAsrLane: 'ASR2_WHISPER_LARGE_V3_EXPERIMENTAL',
      runtimePath: 'whisper-large-live',
      requestedEngine: 'whisper',
      actualEngine: 'webspeech',
    }));
    expect(statuses.some((status) => status.runtimePath === 'whisper-large-live')).toBe(true);

    stopSpeechBackendForSession('test-asr2-runtime-path');
  });

  test('uses the canonical TS-primary matcher provider for transcript summaries once blocks are ready', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    (window as any).__TP_TS_PRIMARY__ = true;
    (window as any).__TP_LAST_APPLIED_HASH = 'ts-primary-runtime-proof';
    (window as any).scriptWords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    (window as any).paraIndex = [
      { start: 0, end: 2, key: 'alpha beta gamma', line: 0 },
      { start: 3, end: 5, key: 'delta epsilon zeta', line: 1 },
    ];
    (window as any).__vParaIndex = ['alpha beta gamma', 'delta epsilon zeta'];
    (window as any).currentIndex = 0;

    jest.doMock('../../src/features/asr/asr-scroll-driver', () => ({
      createAsrScrollDriver: jest.fn(() => ({
        getStats: () => ({
          lastIngestAt: 0,
          lastCommitAt: 0,
          commitCount: 0,
          eventsSinceCommit: 0,
          finalsSinceCommit: 0,
        }),
        getLastLineIndex: () => 0,
        setLastLineIndex: jest.fn(),
        ingest: jest.fn(),
        dispose: jest.fn(),
      })),
    }));

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onstart: ((ev: Event) => void) | null = null;
      start = jest.fn(() => {
        this.onstart?.(new Event('start'));
      });
      stop = jest.fn();
      abort = jest.fn();
    }
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    const { setAsrBlocks } = await import('../../src/scroll/asr-block-store');
    ensureSpeechGlobals();
    await import('../../src/features/speech/speech-store');
    setAsrBlocks([document.createElement('div')], {
      schemaVersion: 1,
      blockCount: 1,
      createdAt: Date.now(),
      source: 'render',
      units: [{ blockIdx: 0, unitStart: 0, unitEnd: 1, sentenceCount: 2, charCount: 32 }],
    });

    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    initSession();
    (window as any).__tpStore = appStore;
    (window as any).__tpMic = {
      requestMic: jest.fn(),
      releaseMic: jest.fn(),
      isOpen: jest.fn(() => true),
    };
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('asr.engine', 'webspeech');

    const { startSpeechBackendForSession, stopSpeechBackendForSession } = await import('../../src/features/speech-loader');
    const ok = await startSpeechBackendForSession({ mode: 'asr', reason: 'test-ts-primary-canonical-summary' });
    expect(ok).toBe(true);
    expect(typeof (window as any).__tpEmitSpeech).toBe('function');

    (window as any).__tpEmitSpeech('delta epsilon zeta', true);

    const summaryCall = infoSpy.mock.calls.find((call) =>
      String(call[0] || '').includes('[speech-loader] tp:speech:transcript emit summary'));
    expect(summaryCall).toBeTruthy();
    const summary = JSON.parse(String(summaryCall?.[1] || '{}'));
    expect(summary).toEqual(expect.objectContaining({
      matchReason: 'ts_primary_matcher',
      matchVia: 'backend',
      primaryBypassReason: null,
      blockCount: 1,
      scriptHash: 'ts-primary-runtime-proof',
    }));

    stopSpeechBackendForSession('test-ts-primary-canonical-summary');
  });

  test('coalesces repeated driver create blocked diagnostics by signature', async () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('tp_dev_mode', '1');

    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.phase', 'live' as any);
    appStore.set('session.asrDesired', true as any);
    appStore.set('session.asrArmed', true as any);
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = 24;

    const { installSpeech } = await import('../../src/features/speech-loader');
    installSpeech();

    for (let i = 0; i < 30; i += 1) {
      window.dispatchEvent(new CustomEvent('tp:scroll:mode', { detail: { mode: 'asr', reason: 'store-change' } }));
    }

    const blockedLogs = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[ASR] driver create blocked'));

    // Each unique create-block signature should log once, then aggregate repeats.
    expect(blockedLogs.length).toBeLessThanOrEqual(4);
  });

  test('session stop disarms ASR create attempts and prevents blocked create spam', async () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('tp_dev_mode', '1');

    const { appStore } = await import('../../src/state/app-store');
    const { initSession } = await import('../../src/state/session');
    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.phase', 'live' as any);
    appStore.set('session.asrDesired', true as any);
    appStore.set('session.asrArmed', true as any);
    (window as any).__tpAsrBlocksReady = true;
    (window as any).__tpAsrBlockCount = 24;

    const { installSpeech } = await import('../../src/features/speech-loader');
    installSpeech();

    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(new CustomEvent('tp:scroll:mode', { detail: { mode: 'asr', reason: 'store-change' } }));
    }
    expect(debugSpy.mock.calls.some((call) => String(call[0] || '').includes('[ASR] driver create blocked'))).toBe(true);

    debugSpy.mockClear();
    appStore.set('session.phase', 'wrap' as any);
    window.dispatchEvent(new CustomEvent('tp:session:phase', { detail: { phase: 'wrap' } }));
    window.dispatchEvent(new CustomEvent('tp:session:stop', { detail: { source: 'recBtn', reason: 'user' } }));

    for (let i = 0; i < 15; i += 1) {
      appStore.set('session.phase', 'wrap' as any);
      window.dispatchEvent(new CustomEvent('tp:scroll:mode', { detail: { mode: 'asr', reason: 'store-change' } }));
    }

    const blockedAfterStop = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[ASR] driver create blocked'));
    const blockedSuppressedAfterStop = debugSpy.mock.calls.filter((call) => String(call[0] || '').includes('[ASR] driver create blocked (suppressed)'));
    expect(blockedAfterStop.length).toBeLessThanOrEqual(2);
    expect(blockedSuppressedAfterStop).toHaveLength(0);
    expect(appStore.get('session.asrArmed')).toBe(false);
    expect(appStore.get('session.asrDesired')).toBe(false);
  });
});
