/** @jest-environment jsdom */

function bootstrapDom(): void {
  document.body.innerHTML = `
    <main id="viewer" class="viewer" style="overflow-y:auto">
      <div id="script">
        <div class="line" data-line="0" style="line-height:24px;">Doors sigh.</div>
        <div class="line" data-line="1" style="line-height:24px;">Farebox chirps, coffee lids do that little click.</div>
        <div class="line" data-line="2" style="line-height:24px;">The seats remember every early shift.</div>
        <div class="line" data-line="3" style="line-height:24px;">Neon ads hum above the aisle.</div>
      </div>
    </main>
  `;
  const scroller = document.getElementById('viewer') as HTMLElement;
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 3644 });
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
  });
  scroller.scrollTop = 0;

  const metrics = [
    { top: 0, height: 236 },
    { top: 567, height: 236 },
    { top: 1134, height: 236 },
    { top: 1701, height: 236 },
  ];
  Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
    const metric = metrics[idx];
    Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: metric.top });
    Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: metric.height });
    Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: metric.height });
    Object.defineProperty(lineEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: metric.top,
        left: 0,
        right: 800,
        bottom: metric.top + metric.height,
        width: 800,
        height: metric.height,
      }),
    });
  });
}

describe('ASR TS-primary matcher proof', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });

    bootstrapDom();
    (window as any).__TP_TS_PRIMARY__ = true;
    (window as any).__tpStore = {
      get(key: string) {
        if (key === 'scrollMode') return 'asr';
        if (key === 'session.phase') return 'live';
        if (key === 'session.asrArmed') return true;
        return undefined;
      },
    };
    (window as any).__TP_MARKER_PCT = 0.4;
    (window as any).scriptWords = [
      'doors', 'sigh',
      'farebox', 'chirps', 'coffee', 'lids', 'do', 'that', 'little', 'click',
      'the', 'seats', 'remember', 'every', 'early', 'shift',
      'neon', 'ads', 'hum', 'above', 'the', 'aisle',
    ];
    (window as any).paraIndex = [
      { start: 0, end: 1, key: 'Doors sigh.', line: 0 },
      { start: 2, end: 9, key: 'Farebox chirps, coffee lids do that little click.', line: 1 },
      { start: 10, end: 15, key: 'The seats remember every early shift.', line: 2 },
      { start: 16, end: 21, key: 'Neon ads hum above the aisle.', line: 3 },
    ];
    (window as any).__vParaIndex = [
      'Doors sigh.',
      'Farebox chirps, coffee lids do that little click.',
      'The seats remember every early shift.',
      'Neon ads hum above the aisle.',
    ];
    (window as any).currentIndex = 0;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__TP_TS_PRIMARY__;
    delete (window as any).__tpSpeech;
    delete (window as any).__tpMatcher;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).scriptWords;
    delete (window as any).paraIndex;
    delete (window as any).__vParaIndex;
    delete (window as any).currentIndex;
  });

  test('strong adjacent TS-primary match satisfies adjacent proof without no-adjacent hold', async () => {
    const { ensureSpeechGlobals } = await import('../../src/speech/backend-guard');
    const { setAsrBlocks } = await import('../../src/scroll/asr-block-store');
    ensureSpeechGlobals();
    setAsrBlocks([document.createElement('div')], {
      schemaVersion: 1,
      blockCount: 1,
      createdAt: Date.now(),
      source: 'render',
      units: [{ blockIdx: 0, unitStart: 0, unitEnd: 3, sentenceCount: 4, charCount: 124 }],
    });

    await import('../../src/features/speech/speech-store');
    const { createAsrScrollDriver } = await import('../../src/features/asr/asr-scroll-driver');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));

    driver.setLastLineIndex(0);
    await jest.advanceTimersByTimeAsync(1200);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'ts-primary-adjacent-proof',
    });
    await jest.advanceTimersByTimeAsync(240);

    expect(driver.getLastLineIndex()).toBe(1);
    const warns = warnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warns.some((line) => line.includes('asr_live_no_adjacent_match_hold'))).toBe(false);

    driver.dispose();
  });
});
