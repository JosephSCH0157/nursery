/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

function bootstrapLiveAsrRuntime(): void {
  (window as any).__tpAsrRuntimeStatus = {
    recognizerAttached: true,
    activeReadMode: true,
    speechRunningActual: true,
  };
  window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
    detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
  }));
  window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));
}

describe('ASR reread recovery', () => {
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    window.history.replaceState({}, '', '/?dev=1');
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0">Florida citrus didn't start small.</div>
          <div class="line" data-line="1">It started with porch crates and side roads.</div>
          <div class="line" data-line="2">This wasn't betrayal, it was math.</div>
          <div class="line" data-line="3">Then came the hurricanes.</div>
          <div class="line" data-line="4">Weather has always been Florida citrus's oldest enemy.</div>
          <div class="line" data-line="5">The houses kept marching inland anyway.</div>
          <div class="line" data-line="6">Some growers called it progress.</div>
          <div class="line" data-line="7">Others called it surrender.</div>
        </div>
      </main>
    `;
    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 6000 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
    });
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: idx * 567 });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: 236 });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: 236 });
      Object.defineProperty(lineEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: idx * 567,
          left: 0,
          right: 800,
          bottom: idx * 567 + 236,
          width: 800,
          height: 236,
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
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__tpAsrRuntimeStatus;
    window.history.replaceState({}, '', '/');
  });

  test('off-script speech quarantines and corroborated reread produces one clean re-anchor', async () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugGetAuthoritySnapshot(): {
        reanchorPending: boolean;
        reanchorCandidateLineIdx: number;
        reanchorCandidateHits: number;
        semanticEpoch: number;
        lastVisualWriteOwner: string;
        lastVisualWriteDirection: 'forward' | 'backward' | 'hold';
      };
    };
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('go back to the mark for me', true, {
      currentIdx: 5,
      noMatch: true,
      source: 'openai-whisper-bridge',
      match: { bestIdx: -1, bestSim: Number.NaN, topScores: [] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'reread-1',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [101],
      supportingRawSeqs: [101],
      requestCaptureEvidence: [{ requestSeq: 101, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorCandidateLineIdx).toBe(2);
    expect(snapshot.reanchorCandidateHits).toBe(1);

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'reread-2',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [102],
      supportingRawSeqs: [102],
      requestCaptureEvidence: [{ requestSeq: 102, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(160);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(driver.getLastLineIndex()).toBe(2);
    expect(scroller.scrollTop).toBeLessThan(3200);
    expect(snapshot.lastVisualWriteOwner).toBe('reanchor_confirmed');
    expect(snapshot.lastVisualWriteDirection).toBe('backward');

    const afterReanchorTop = scroller.scrollTop;
    driver.ingest('Then came the hurricanes.', true, {
      currentIdx: 2,
      matchId: 'post-reread-forward',
      source: 'openai-whisper-bridge',
      rawText: 'Then came the hurricanes.',
      assembledText: 'Then came the hurricanes.',
      rawTextHash: 'same-a',
      assembledTextHash: 'same-a',
      sourceRequestSeqs: [103],
      supportingRawSeqs: [103],
      requestCaptureEvidence: [{ requestSeq: 103, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 3, bestSim: 0.97, topScores: [{ idx: 3, score: 0.97 }] },
      rawMatchIndex: 3,
      assembledMatchIndex: 3,
      match: { bestIdx: 3, bestSim: 0.97, topScores: [{ idx: 3, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(220);

    expect(driver.getLastLineIndex()).toBe(3);
    expect(scroller.scrollTop).toBeGreaterThan(afterReanchorTop);

    const warnLines = consoleWarnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warnLines.some((line) => line.includes('ASR_REANCHOR_PENDING'))).toBe(true);
    expect(warnLines.some((line) => line.includes('ASR_REANCHOR_COMMIT'))).toBe(true);
    expect(warnLines.some((line) => line.includes('ASR_SCROLL_AUTHORITY_CONFLICT'))).toBe(false);

    driver.dispose();
  });
});
