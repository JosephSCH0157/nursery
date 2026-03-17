/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR auto stall rescue', () => {
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2400 });
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

  test('self-recovers one content line forward after an auto stall', async () => {
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

    driver.setLastLineIndex(0);

    driver.ingest('farebox chirps coffee lids click', false, {
      currentIdx: 0,
      matchId: 'initial-forward-0',
      match: {
        bestIdx: 1,
        bestSim: 0.82,
        topScores: [{ idx: 1, score: 0.82 }],
      } as any,
    });

    await jest.advanceTimersByTimeAsync(250);

    expect(driver.getLastLineIndex()).toBe(1);

    for (let i = 0; i < 3; i += 1) {
      driver.ingest('the seats remember every early shift', false, {
        currentIdx: 1,
        matchId: `stall-content-${i}`,
        match: {
          bestIdx: 2,
          bestSim: 0.12,
          topScores: [
            { idx: 2, score: 0.12 },
            { idx: 1, score: 0.11 },
          ],
        } as any,
      });
      await jest.advanceTimersByTimeAsync(500);
    }

    await jest.advanceTimersByTimeAsync(250);

    expect(driver.getLastLineIndex()).toBe(2);
    expect(scroller.scrollTop).toBeGreaterThan(0);

    driver.dispose();
  });
});
