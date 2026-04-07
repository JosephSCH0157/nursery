/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR live commit motion', () => {
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

  test('caps a forward commit below the wrapped block jump distance without continuing to glide afterward', async () => {
    const driver = createAsrScrollDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'motion-cap-test',
      match: {
        bestIdx: 1,
        bestSim: 0.82,
        topScores: [{ idx: 1, score: 0.82 }],
      },
    });

    await jest.advanceTimersByTimeAsync(32);

    const settledTop = scroller.scrollTop;

    await jest.advanceTimersByTimeAsync(800);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBe(settledTop);

    driver.dispose();
  });

  test('caps a far future live ASR match to the next readable line when that line has local support', async () => {
    const driver = createAsrScrollDriver();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'single-step-prime-cap',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'single-step-cap',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 2, score: 0.74 },
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('still caps a far future live ASR match to the next readable line when later content matches more strongly', async () => {
    const driver = createAsrScrollDriver();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'single-step-prime-cap-late',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'single-step-cap-late',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('does not let a stalled far-future final keep the script walking forward on its own', async () => {
    const driver = createAsrScrollDriver();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'stalled-prime-hold',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(2000);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'stalled-far-future-hold',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [
          { idx: 3, score: 0.95 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });

  test('does not let stalled tie-forward evidence promote the next readable line by itself', async () => {
    const driver = createAsrScrollDriver();

    driver.setLastLineIndex(0);
    driver.ingest('Farebox chirps, coffee lids do that little click.', true, {
      currentIdx: 0,
      matchId: 'stalled-tie-prime',
      match: {
        bestIdx: 1,
        bestSim: 0.88,
        topScores: [
          { idx: 1, score: 0.88 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    await jest.advanceTimersByTimeAsync(2000);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 1,
      matchId: 'stalled-tie-forward-hold',
      match: {
        bestIdx: 3,
        bestSim: 0.84,
        topScores: [
          { idx: 2, score: 0.82 },
          { idx: 3, score: 0.84 },
        ],
      },
    });

    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);

    driver.dispose();
  });
});
