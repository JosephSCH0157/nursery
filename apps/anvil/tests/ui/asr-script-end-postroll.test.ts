/** @jest-environment jsdom */

let closingLineTop = 380;

async function advanceUntil(
  predicate: () => boolean,
  options?: { stepMs?: number; timeoutMs?: number },
): Promise<void> {
  const stepMs = options?.stepMs ?? 100;
  const timeoutMs = options?.timeoutMs ?? 12000;
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    if (predicate()) return;
    await jest.advanceTimersByTimeAsync(stepMs);
    elapsed += stepMs;
  }
  expect(predicate()).toBe(true);
}

function installAsrTerminalDom(): void {
  document.body.innerHTML = `
    <button id="recBtn" type="button">Start speech sync</button>
    <main id="viewer" class="viewer" style="overflow-y:auto; scroll-padding-top:200px;">
      <div id="script" style="padding-top:200px;">
        <div class="line" data-line="0">Opening line</div>
        <div class="line" data-line="1">Closing line</div>
      </div>
    </main>
  `;

  const viewer = document.getElementById('viewer') as HTMLElement;
  const script = document.getElementById('script') as HTMLElement;
  const openingLine = document.querySelector<HTMLElement>('.line[data-line="0"]') as HTMLElement;
  const closingLine = document.querySelector<HTMLElement>('.line[data-line="1"]') as HTMLElement;

  Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 500 });
  Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: 1600 });
  Object.defineProperty(viewer, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 400, bottom: 500, width: 400, height: 500 }),
  });
  viewer.scrollTop = 0;

  Object.defineProperty(script, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 400, bottom: 1000, width: 400, height: 1000 }),
  });

  Object.defineProperty(openingLine, 'offsetTop', { configurable: true, value: 40 });
  Object.defineProperty(openingLine, 'offsetHeight', { configurable: true, value: 120 });
  Object.defineProperty(openingLine, 'clientHeight', { configurable: true, value: 120 });
  Object.defineProperty(openingLine, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 40, left: 0, right: 400, bottom: 160, width: 400, height: 120 }),
  });

  Object.defineProperty(closingLine, 'offsetTop', {
    configurable: true,
    get: () => closingLineTop,
  });
  Object.defineProperty(closingLine, 'offsetHeight', { configurable: true, value: 120 });
  Object.defineProperty(closingLine, 'clientHeight', { configurable: true, value: 120 });
  Object.defineProperty(closingLine, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: closingLineTop,
      left: 0,
      right: 400,
      bottom: closingLineTop + 120,
      width: 400,
      height: 120,
    }),
  });
}

describe('ASR script-end postroll', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    localStorage.clear();
    closingLineTop = 380;
    installAsrTerminalDom();

    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.doMock('../../src/features/asr/asr-scroll-driver', () => ({
      createAsrScrollDriver: jest.fn(() => ({
        getStats: () => ({
          lastIngestAt: 0,
          lastCommitAt: 0,
          commitCount: 0,
          eventsSinceCommit: 0,
          finalsSinceCommit: 0,
        }),
        getLastLineIndex: () => 1,
        setLastLineIndex: jest.fn(),
        ingest: jest.fn(),
        dispose: jest.fn(),
      })),
    }));
  });

  afterEach(() => {
    delete (window as any).__tpStore;
    delete (window as any).__tpAiActivity;
    delete (window as any).__tpAsrEndGrace;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('terminal line reached does not immediately stop ASR and completes after end grace', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.asrArmed', true);

    installSpeech();
    setSessionPhase('live');

    const stopSpy = jest.fn();
    window.addEventListener('tp:session:stop', stopSpy as EventListener);

    window.dispatchEvent(new CustomEvent('tp:asr:script-end', {
      detail: {
        mode: 'asr',
        lineIndex: 1,
        lastSpeakableLineIndex: 1,
        runKey: 'script-end-postroll-test',
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Closing line',
        final: true,
        isFinal: true,
        currentIdx: 1,
        line: 1,
        mode: 'asr',
        source: 'test',
      },
    }));

    await jest.advanceTimersByTimeAsync(120);
    expect(appStore.get('session.phase')).toBe('live');
    expect(stopSpy).not.toHaveBeenCalled();

    closingLineTop = 140;

    await advanceUntil(() => Boolean((window as any).__tpAsrEndGrace?.active), {
      stepMs: 50,
      timeoutMs: 1500,
    });
    expect(appStore.get('session.phase')).toBe('live');
    expect(stopSpy).not.toHaveBeenCalled();

    await advanceUntil(() => appStore.get('session.phase') === 'wrap', {
      stepMs: 100,
      timeoutMs: 9000,
    });
    expect(appStore.get('session.phase')).toBe('wrap');
    expect(stopSpy).toHaveBeenCalledTimes(1);

    const detail = (stopSpy.mock.calls[0]?.[0] as CustomEvent)?.detail || {};
    expect(detail).toEqual(expect.objectContaining({
      intentSource: 'asr-script-end',
      lineIndex: 1,
      lastSpeakableLineIndex: 1,
      postrollMs: 500,
    }));
    expect(detail.markerWaitMs).toBeGreaterThanOrEqual(0);

    window.removeEventListener('tp:session:stop', stopSpy as EventListener);
  });

  test('grace extends while speech is active and fresh', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.asrArmed', true);

    installSpeech();
    setSessionPhase('live');

    const stopSpy = jest.fn();
    window.addEventListener('tp:session:stop', stopSpy as EventListener);

    window.dispatchEvent(new CustomEvent('tp:asr:script-end', {
      detail: {
        mode: 'asr',
        lineIndex: 1,
        lastSpeakableLineIndex: 1,
        runKey: 'script-end-grace-extend-test',
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Closing line',
        final: true,
        isFinal: true,
        currentIdx: 1,
        line: 1,
        mode: 'asr',
        source: 'test',
      },
    }));

    closingLineTop = 140;
    await advanceUntil(() => Boolean((window as any).__tpAsrEndGrace?.active), {
      stepMs: 50,
      timeoutMs: 1500,
    });
    await jest.advanceTimersByTimeAsync(5000);
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Closing line continued',
        final: true,
        isFinal: true,
        currentIdx: 1,
        line: 1,
        mode: 'asr',
        source: 'test',
      },
    }));

    await jest.advanceTimersByTimeAsync(600);
    expect(appStore.get('session.phase')).toBe('live');
    expect(stopSpy).not.toHaveBeenCalled();

    await advanceUntil(() => appStore.get('session.phase') === 'wrap', {
      stepMs: 100,
      timeoutMs: 3500,
    });
    expect(appStore.get('session.phase')).toBe('wrap');
    expect(stopSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('tp:session:stop', stopSpy as EventListener);
  });

  test('grace waits for pending Whisper response before stopping', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.asrArmed', true);
    (window as any).__tpAiActivity = { requestsInFlight: 1, queueDepth: 0 };

    installSpeech();
    setSessionPhase('live');

    const stopSpy = jest.fn();
    window.addEventListener('tp:session:stop', stopSpy as EventListener);

    window.dispatchEvent(new CustomEvent('tp:asr:script-end', {
      detail: {
        mode: 'asr',
        lineIndex: 1,
        lastSpeakableLineIndex: 1,
        runKey: 'script-end-pending-whisper-test',
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Closing line',
        final: true,
        isFinal: true,
        currentIdx: 1,
        line: 1,
        mode: 'asr',
        source: 'test',
      },
    }));

    closingLineTop = 140;
    await advanceUntil(() => Boolean((window as any).__tpAsrEndGrace?.active), {
      stepMs: 50,
      timeoutMs: 1500,
    });
    await jest.advanceTimersByTimeAsync(6400);
    expect(appStore.get('session.phase')).toBe('live');
    expect(stopSpy).not.toHaveBeenCalled();

    (window as any).__tpAiActivity = { requestsInFlight: 0, queueDepth: 0 };
    await advanceUntil(() => appStore.get('session.phase') === 'wrap', {
      stepMs: 100,
      timeoutMs: 3500,
    });
    expect(appStore.get('session.phase')).toBe('wrap');
    expect(stopSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('tp:session:stop', stopSpy as EventListener);
  });

  test('user stop cancels grace immediately', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);
    appStore.set('session.asrArmed', true);

    installSpeech();
    setSessionPhase('live');

    window.dispatchEvent(new CustomEvent('tp:asr:script-end', {
      detail: {
        mode: 'asr',
        lineIndex: 1,
        lastSpeakableLineIndex: 1,
        runKey: 'script-end-cancel-test',
      },
    }));
    window.dispatchEvent(new CustomEvent('tp:speech:transcript', {
      detail: {
        text: 'Closing line',
        final: true,
        isFinal: true,
        currentIdx: 1,
        line: 1,
        mode: 'asr',
        source: 'test',
      },
    }));

    closingLineTop = 140;
    await advanceUntil(() => Boolean((window as any).__tpAsrEndGrace?.active), {
      stepMs: 50,
      timeoutMs: 1500,
    });
    window.dispatchEvent(new CustomEvent('tp:session:stop', {
      detail: { reason: 'user', source: 'user', mode: 'asr' },
    }));

    expect(infoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_END_GRACE_CANCELLED_BY_USER'))).toBe(true);
    expect((window as any).__tpAsrEndGrace ?? null).toBeNull();
    infoSpy.mockRestore();
  });
});
