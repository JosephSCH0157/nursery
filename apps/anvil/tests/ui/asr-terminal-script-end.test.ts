/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR terminal script-end watchdog suppression', () => {
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
  });

  test('re-emits script end instead of logging a terminal stall', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const scriptEndSpy = jest.fn();
    window.addEventListener('tp:asr:script-end', scriptEndSpy as EventListener);

    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    jest.advanceTimersByTime(16000);

    driver.ingest('Closing line', true, {
      currentIdx: 1,
      matchId: 'terminal-stall-test',
      match: {
        bestIdx: 1,
        bestSim: 0.95,
        topScores: [{ idx: 1, score: 0.95 }],
      },
    });

    expect(scriptEndSpy).toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes('[ASR_STALLED]')),
    ).toBe(false);

    window.removeEventListener('tp:asr:script-end', scriptEndSpy as EventListener);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('applies starvation override for single-step live target under live guard', () => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Alpha opening line</div>
          <div class="line" data-line="1">Beta bridge line</div>
          <div class="line" data-line="2">Gamma follow line</div>
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

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    // Prime a forward commit so starvation detection has a commit anchor.
    driver.ingest('Beta bridge line', true, {
      currentIdx: 0,
      matchId: 'prime-forward',
      match: {
        bestIdx: 1,
        bestSim: 0.96,
        topScores: [{ idx: 1, score: 0.96 }],
      },
    });
    jest.advanceTimersByTime(50);
    expect(driver.getLastLineIndex()).toBe(1);

    // Mark runtime speech as active so override eligibility is satisfied.
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    // Force starvation window; then request exactly +1 (requested == liveStepTarget).
    jest.advanceTimersByTime(1700);
    driver.ingest('Gamma follow line', true, {
      currentIdx: 1,
      matchId: 'equal-live-step',
      match: {
        bestIdx: 2,
        bestSim: 0.84,
        topScores: [{ idx: 2, score: 0.84 }],
      },
    });
    jest.advanceTimersByTime(50);

    expect(driver.getLastLineIndex()).toBe(2);
    warnSpy.mockRestore();
    driver.dispose();
  });

  test('legacy direct-adjacent hold no longer blocks a clean +1 bestIdx commit with missing adjacent score', () => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Alpha opening line</div>
          <div class="line" data-line="1">Beta bridge line</div>
          <div class="line" data-line="2">Gamma follow line</div>
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

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.ingest('Gamma follow line', true, {
      currentIdx: 0,
      matchId: 'missing-adjacent-direct-score',
      match: {
        bestIdx: 1,
        bestSim: 0.96,
        topScores: [{ idx: 2, score: 0.96 }],
      },
    });

    jest.advanceTimersByTime(50);

    // New contract: clean adjacent (+1) bestIdx may still commit even when topScores omit target line.
    expect(driver.getLastLineIndex()).toBe(1);

    warnSpy.mockRestore();
    debugSpy.mockRestore();
    driver.dispose();
  });

  test('post-recovery skepticism rejects eager forward push until alignment restabilizes', () => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Alpha opening line</div>
          <div class="line" data-line="1">Beta bridge line</div>
          <div class="line" data-line="2">Gamma settle line</div>
          <div class="line" data-line="3">Delta follow line</div>
          <div class="line" data-line="4">Epsilon close line</div>
        </div>
      </main>
    `;

    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2200 });
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

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.ingest('Beta bridge line', true, {
      currentIdx: 0,
      matchId: 'prime-forward-skeptic',
      match: {
        bestIdx: 1,
        bestSim: 0.96,
        topScores: [{ idx: 1, score: 0.96 }],
      },
    });
    jest.advanceTimersByTime(50);
    expect(driver.getLastLineIndex()).toBe(1);

    // Recovery-style commit enters skepticism mode.
    jest.advanceTimersByTime(1700);
    driver.ingest('Gamma settle line', true, {
      currentIdx: 1,
      matchId: 'stall-rescue-entry',
      match: {
        bestIdx: 2,
        bestSim: 0.9,
        topScores: [{ idx: 2, score: 0.9 }],
      },
    });
    jest.advanceTimersByTime(50);
    expect(driver.getLastLineIndex()).toBe(2);

    // During skepticism, eager far-forward push is rejected.
    driver.ingest('Delta follow line Epsilon close line now', true, {
      currentIdx: 2,
      matchId: 'skeptic-forward-attempt',
      match: {
        bestIdx: 4,
        bestSim: 0.97,
        topScores: [
          { idx: 4, score: 0.97 },
          { idx: 3, score: 0.82 },
        ],
      },
    });
    jest.advanceTimersByTime(50);
    expect(driver.getLastLineIndex()).toBe(2);

    // Re-align with same-line confirmations.
    driver.ingest('Gamma settle line', true, {
      currentIdx: 2,
      matchId: 'skeptic-same-line-1',
      match: { bestIdx: 2, bestSim: 0.92, topScores: [{ idx: 2, score: 0.92 }] },
    });
    jest.advanceTimersByTime(30);
    driver.ingest('Gamma settle line', true, {
      currentIdx: 2,
      matchId: 'skeptic-same-line-2',
      match: { bestIdx: 2, bestSim: 0.93, topScores: [{ idx: 2, score: 0.93 }] },
    });
    jest.advanceTimersByTime(30);

    // Resume normal adjacent movement.
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.ingest('Delta follow line with enough confirming spoken tokens now', true, {
      currentIdx: 2,
      matchId: 'skeptic-adjacent-1',
      match: { bestIdx: 3, bestSim: 1, topScores: [{ idx: 3, score: 1 }] },
    });
    jest.advanceTimersByTime(50);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));
    driver.ingest('Epsilon close line with enough confirming spoken tokens now', true, {
      currentIdx: 3,
      matchId: 'skeptic-adjacent-2',
      match: { bestIdx: 4, bestSim: 1, topScores: [{ idx: 4, score: 1 }] },
    });
    jest.advanceTimersByTime(50);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(2);

    // Allow skepticism timeout path to clear deterministically in test mode.
    jest.advanceTimersByTime(7500);
    driver.ingest('Gamma settle line', true, {
      currentIdx: 2,
      matchId: 'skeptic-timeout-clear',
      match: { bestIdx: 2, bestSim: 0.95, topScores: [{ idx: 2, score: 0.95 }] },
    });
    jest.advanceTimersByTime(30);

    const guardLines = warnSpy.mock.calls.flat().map((arg) => String(arg));
    expect(guardLines.some((line) => line.includes('asr_alignment_skeptic_mode_enter'))).toBe(true);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(2);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('blocks delayed WhisperBridge final packets from moving scroll after speech ends', () => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Alpha opening line</div>
          <div class="line" data-line="1">Beta follow line</div>
          <div class="line" data-line="2">Gamma tail line</div>
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

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    // Simulate live speech first, then speech ending before a delayed final packet arrives.
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    jest.advanceTimersByTime(1000);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: false },
    }));

    driver.ingest('Beta follow line', true, {
      source: 'openai-whisper-bridge',
      currentIdx: 0,
      matchId: 'delayed-whisper-final-after-stop',
      match: {
        bestIdx: 1,
        bestSim: 0.97,
        topScores: [{ idx: 1, score: 0.97 }],
      },
    });

    jest.advanceTimersByTime(50);

    expect(driver.getLastLineIndex()).toBe(0);
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes('asr_commit_blocked_stale_whisperbridge_packet')),
    ).toBe(true);

    warnSpy.mockRestore();
    driver.dispose();
  });

  test('allows adjacent WhisperBridge final commit when runtime and VAD are fresh even if silence flag is stale', () => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Opening line</div>
          <div class="line" data-line="1">It earned the name.</div>
          <div class="line" data-line="2">Closing line</div>
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

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(0);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: true } }));
    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true },
    }));

    driver.ingest('It earned the name.', true, {
      source: 'openai-whisper-bridge',
      currentIdx: 0,
      matchId: 'live-forward-adjacent',
      match: {
        bestIdx: 1,
        bestSim: 0.95,
        topScores: [{ idx: 1, score: 0.95 }],
      },
    });

    jest.advanceTimersByTime(50);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes('asr_commit_blocked_stale_whisperbridge_packet')),
    ).toBe(false);

    warnSpy.mockRestore();
    driver.dispose();
  });
});
