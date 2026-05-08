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
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  afterEach(() => {
    delete (window as any).__tpStore;
    delete (window as any).__tpMic;
    delete (window as any).__tpAsrRuntimeStatus;
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
});
