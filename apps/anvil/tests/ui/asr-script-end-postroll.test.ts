/** @jest-environment jsdom */

let closingLineTop = 380;

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
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('waits for the terminal line to reach the marker before stopping', async () => {
    const { appStore } = await import('../../src/state/app-store');
    const { initSession, setSessionPhase } = await import('../../src/state/session');
    const { installSpeech } = await import('../../src/features/speech-loader');

    initSession();
    (window as any).__tpStore = appStore;
    appStore.set('scrollMode', 'asr' as any);

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

    await jest.advanceTimersByTimeAsync(32);
    expect(appStore.get('session.phase')).toBe('live');
    expect(stopSpy).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(499);
    expect(appStore.get('session.phase')).toBe('live');
    expect(stopSpy).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
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
});
