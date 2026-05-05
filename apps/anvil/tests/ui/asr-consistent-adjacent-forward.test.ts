/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR consistent adjacent forward commit', () => {
  let rafSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cafSpy: jest.SpyInstance<void, [number]>;

  beforeEach(() => {
    jest.useFakeTimers();
    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
    });
    cafSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Doors sigh.</div>
          <div class="line" data-line="1">Farebox chirps, coffee lids do that little click.</div>
          <div class="line" data-line="2">The seats remember every early shift.</div>
        </div>
      </main>
    `;

    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2200 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
    });
    scroller.scrollTop = 0;

    const metrics = [
      { top: 0, height: 220 },
      { top: 560, height: 220 },
      { top: 1120, height: 220 },
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

    (window as any).__tpStore = {
      get(key: string) {
        if (key === 'scrollMode') return 'asr';
        if (key === 'session.phase') return 'live';
        if (key === 'session.asrArmed') return true;
        return undefined;
      },
    };
    (window as any).__TP_MARKER_PCT = 0.4;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
  });

test('holds repeated weak +1 candidate instead of nudging forward without stronger restabilizing proof', async () => {
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

    driver.setLastLineIndex(0);

    for (let i = 0; i < 3; i += 1) {
      driver.ingest('farebox chirps coffee lids', false, {
        currentIdx: 0,
        matchId: `consistent-forward-${i}`,
        match: {
          bestIdx: 1,
          bestSim: 0.3,
          topScores: [
            { idx: 1, score: 0.3 },
            { idx: 0, score: 0.28 },
          ],
        } as any,
      });
      await jest.advanceTimersByTimeAsync(80);
    }

    await jest.advanceTimersByTimeAsync(500);

    expect(driver.getLastLineIndex()).toBe(0);
    expect(scroller.scrollTop).toBe(0);

    driver.dispose();
  });
});
