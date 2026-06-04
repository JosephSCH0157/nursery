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

describe('ASR Phase 3 orchestrator sequence proof', () => {
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
          <div class="line" data-line="4" style="line-height:24px;">Station lights slide across the glass.</div>
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
      { top: 2268, height: 236 },
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
    (window as any).__TP_BUILD_STAMP = 'asr-scroll-2026-06-04T12:30:00.000Z';

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

  test('repeats the Phase 3 proof trail predictably for three adjacent commits', async () => {
    expect(typeof (window as any).__copyAsrLog).toBe('function');

    const driver = createAsrScrollDriver({ runKey: 'phase3-sequence-run', runGeneration: 1 });
    bootstrapLiveAsrRuntime();

    const commits = [
      {
        expectedLine: 1,
        text: 'Farebox chirps, coffee lids do that little click.',
        matchId: 'phase3-sequence-1',
      },
      {
        expectedLine: 2,
        text: 'The seats remember every early shift.',
        matchId: 'phase3-sequence-2',
      },
      {
        expectedLine: 3,
        text: 'Neon ads hum above the aisle.',
        matchId: 'phase3-sequence-3',
      },
    ];

    driver.setLastLineIndex(0);

    for (const commit of commits) {
      driver.ingest(commit.text, true, {
        currentIdx: driver.getLastLineIndex(),
        matchId: commit.matchId,
        match: {
          bestIdx: commit.expectedLine,
          bestSim: 0.9,
          topScores: [{ idx: commit.expectedLine, score: 0.9 }],
        },
      });
      await jest.advanceTimersByTimeAsync(320);
      expect(driver.getLastLineIndex()).toBe(commit.expectedLine);
    }

    const exported = await (window as any).__copyAsrLog();
    expect(exported.entryCount).toBeGreaterThan(0);
    expect(exported.tagCounts.ASR_COMMIT).toBeGreaterThanOrEqual(3);

    const okCount = exported.tagCounts.ASR_POST_COMMIT_VISUAL_FOLLOW_OK || 0;
    const blockedCount = exported.tagCounts.ASR_POST_COMMIT_VISUAL_FOLLOW_BLOCKED || 0;
    expect(okCount + blockedCount).toBeGreaterThanOrEqual(3);

    const commitEntries = exported.entries.filter((entry: any) => entry.tag === 'ASR_COMMIT');
    const proofEntries = exported.entries.filter((entry: any) =>
      entry.tag === 'ASR_POST_COMMIT_VISUAL_FOLLOW_OK' ||
      entry.tag === 'ASR_POST_COMMIT_VISUAL_FOLLOW_BLOCKED',
    );

    const commitNextLines = commitEntries
      .map((entry: any) => {
        const payloadValue = entry?.payload?.nextIndex ?? entry?.payload?.index;
        if (typeof payloadValue === 'number') return payloadValue;
        const match = String(entry?.stringLine || '').match(/\bline=(\d+)\b/);
        return match ? Number(match[1]) : null;
      })
      .filter((value: unknown) => typeof value === 'number');
    expect(commitNextLines).toEqual(expect.arrayContaining([1, 2, 3]));

    for (const expectedLine of [1, 2, 3]) {
      const matchingProofEntry = proofEntries.find((entry: any) =>
        String(entry?.stringLine || '').includes(`newSemanticLineIdx=${expectedLine}`) &&
        String(entry?.stringLine || '').includes(`committedLineIdx=${expectedLine}`) &&
        String(entry?.stringLine || '').includes(`currentLineIdx=${expectedLine}`),
      );
      expect(matchingProofEntry).toBeTruthy();
    }

    driver.dispose();
  });
});
