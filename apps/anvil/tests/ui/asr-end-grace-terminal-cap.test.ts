/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR end grace terminal cap', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Opening line</div>
          <div class="line" data-line="1">Closing line</div>
          <div class="line" data-line="2">[pause]</div>
        </div>
      </main>
    `;

    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1600 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 400, bottom: 500, width: 400, height: 500 }),
    });
    scroller.scrollTop = 0;

    const lineEls = Array.from(document.querySelectorAll<HTMLElement>('.line'));
    lineEls.forEach((lineEl, idx) => {
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: idx * 180 });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: 120 });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: 120 });
      Object.defineProperty(lineEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: idx * 180,
          left: 0,
          right: 400,
          bottom: idx * 180 + 120,
          width: 400,
          height: 120,
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
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as any).__tpStore;
    delete (window as any).__tpAsrEndGrace;
  });

  test('no scroll beyond terminal during grace', () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);
    (window as any).__tpAsrEndGrace = {
      active: true,
      startedAt: Date.now(),
      until: Date.now() + 6000,
      lastSpeakableLineIndex: 1,
      reason: 'terminal_line_reached',
    };

    driver.ingest('pause', true, {
      currentIdx: 1,
      matchId: 'terminal-grace-cap',
      match: {
        bestIdx: 2,
        bestSim: 0.98,
        topScores: [{ idx: 2, score: 0.98 }],
      },
    });

    expect(driver.getLastLineIndex()).toBeLessThanOrEqual(1);

    driver.dispose();
  });
});
