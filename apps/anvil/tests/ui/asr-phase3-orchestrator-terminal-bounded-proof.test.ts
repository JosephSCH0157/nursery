/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';
import { installAsrLogBuffer } from '../../src/features/asr/asr-log-buffer';

function bootstrapLiveAsrRuntime(): void {
  (window as any).__tpAsrRuntimeStatus = {
    recognizerAttached: true,
    activeReadMode: true,
    speechRunningActual: true,
  };
  window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
    detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
  }));
}

describe('ASR Phase 3 orchestrator terminal bounded proof', () => {
  let rafSpy: jest.SpyInstance<number, [FrameRequestCallback]>;
  let cafSpy: jest.SpyInstance<void, [number]>;
  let consoleLogSpy: jest.SpyInstance<void, any[]>;
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;
  let consoleDebugSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
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
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2370 });
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
    (window as any).__TP_BUILD_STAMP = 'asr-scroll-2026-06-04T15:00:00.000Z';

    window.localStorage.clear();
    window.localStorage.setItem('asr_log_buffer', '1');
    window.history.replaceState({}, '', '/?dev=1');
    installAsrLogBuffer(window as any);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__TP_BUILD_STAMP;
    delete (window as any).__tpAsrRuntimeStatus;
    delete (window as any).__ASR_LOG_BUFFER__;
    delete (window as any).__copyAsrLog;
    delete (window as any).__downloadAsrLog;
    delete (window as any).__clearAsrLog;
    delete (window as any).__getAsrLogSummary;
    delete (window as any).__asrLogBufferInstalled;
  });

  test('bounds repeated terminal observations without minting fake commits past the final speakable line', async () => {
    expect(typeof (window as any).__copyAsrLog).toBe('function');

    const scroller = document.getElementById('viewer') as HTMLElement;
    const maxScrollTop = Math.max(0, Number(scroller.scrollHeight || 0) - Number(scroller.clientHeight || 0));

    const driver = createAsrScrollDriver({ runKey: 'phase3-terminal-bounded-run', runGeneration: 1 });
    bootstrapLiveAsrRuntime();

    driver.setLastLineIndex(2);
    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 2,
      matchId: 'phase3-terminal-prime-final',
      match: {
        bestIdx: 3,
        bestSim: 0.93,
        topScores: [{ idx: 3, score: 0.93 }],
      },
    });
    await jest.advanceTimersByTimeAsync(320);

    expect(driver.getLastLineIndex()).toBe(3);
    expect(driver.getStats().commitCount).toBe(1);

    const exportedAfterPrime = await (window as any).__copyAsrLog();
    const commitTagCountAfterPrime = exportedAfterPrime.tagCounts.ASR_COMMIT || 0;
    const proofTagCountAfterPrime =
      (exportedAfterPrime.tagCounts.ASR_POST_COMMIT_VISUAL_FOLLOW_OK || 0) +
      (exportedAfterPrime.tagCounts.ASR_POST_COMMIT_VISUAL_FOLLOW_BLOCKED || 0);

    expect(commitTagCountAfterPrime).toBeGreaterThan(0);
    expect(proofTagCountAfterPrime).toBeGreaterThan(0);

    scroller.scrollTop = maxScrollTop;

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 3,
      matchId: 'phase3-terminal-hold-1',
      match: {
        bestIdx: 3,
        bestSim: 0.95,
        topScores: [{ idx: 3, score: 0.95 }],
      },
    });
    await jest.advanceTimersByTimeAsync(220);

    driver.ingest('Neon ads hum above the aisle.', true, {
      currentIdx: 3,
      matchId: 'phase3-terminal-hold-2',
      match: {
        bestIdx: 3,
        bestSim: 0.96,
        topScores: [{ idx: 3, score: 0.96 }],
      },
    });
    await jest.advanceTimersByTimeAsync(220);

    driver.ingest('', true, {
      currentIdx: 3,
      matchId: 'phase3-terminal-hold-3',
      noMatch: true,
      match: {
        bestIdx: -1,
        bestSim: Number.NaN,
        topScores: [],
      },
    });
    await jest.advanceTimersByTimeAsync(350);

    expect(driver.getLastLineIndex()).toBe(3);
    expect(driver.getLastLineIndex()).toBeLessThanOrEqual(3);
    expect(driver.getStats().commitCount).toBe(1);

    const exportedAfterTerminal = await (window as any).__copyAsrLog();
    expect(exportedAfterTerminal.entryCount).toBeGreaterThan(0);
    expect(exportedAfterTerminal.tagCounts.ASR_COMMIT || 0).toBe(commitTagCountAfterPrime);

    const proofTagCountAfterTerminal =
      (exportedAfterTerminal.tagCounts.ASR_POST_COMMIT_VISUAL_FOLLOW_OK || 0) +
      (exportedAfterTerminal.tagCounts.ASR_POST_COMMIT_VISUAL_FOLLOW_BLOCKED || 0);
    expect(proofTagCountAfterTerminal).toBe(proofTagCountAfterPrime);

    const terminalIdentityPreserved = exportedAfterTerminal.entries.some((entry: any) => {
      const line = String(entry?.stringLine || '');
      const payloadNext = entry?.payload?.nextIndex ?? entry?.payload?.index;
      return (
        payloadNext === 3 ||
        line.includes('line=3') ||
        line.includes('currentLineIdx=3') ||
        line.includes('committedLineIdx=3') ||
        line.includes('newSemanticLineIdx=3')
      );
    });
    expect(terminalIdentityPreserved).toBe(true);

    const terminalContextEntries = exportedAfterTerminal.entries.filter((entry: any) => {
      const line = String(entry?.stringLine || '');
      return (
        line.includes('ASR_TERMINAL_SCRIPT_HOLD') ||
        line.includes('terminal_script_hold') ||
        line.includes('lastSpeakableLineIdx=3') ||
        line.includes('holdLineIdx=3') ||
        line.includes('noMatch=1') ||
        line.includes('no_match') ||
        line.includes('bestIdx=-1')
      );
    });
    expect(terminalContextEntries.length).toBeGreaterThan(0);
    expect(terminalContextEntries.length).toBeLessThanOrEqual(8);

    driver.dispose();
  });
});
