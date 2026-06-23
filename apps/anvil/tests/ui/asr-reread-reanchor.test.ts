/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

type DebugDriver = ReturnType<typeof createAsrScrollDriver> & {
  __debugGetAuthoritySnapshot(): {
    reanchorPending: boolean;
    reanchorCandidateLineIdx: number;
    reanchorCandidateHits: number;
    reanchorLanding: boolean;
    reanchorLandingAnchorLineIdx: number;
    reanchorLandingTargetLineIdx: number;
    semanticEpoch: number;
    lastVisualWriteOwner: string;
    lastVisualWriteDirection: 'forward' | 'backward' | 'hold';
  };
};

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
  let consoleLogSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
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
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__tpAsrRuntimeStatus;
    window.history.replaceState({}, '', '/');
  });

  function createDriver(): DebugDriver {
    return createAsrScrollDriver() as DebugDriver;
  }

  test('off-script speech quarantines and corroborated reread produces one clean re-anchor', async () => {
    const driver = createDriver();
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
    await jest.advanceTimersByTimeAsync(20);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(driver.getLastLineIndex()).toBe(2);
    expect(scroller.scrollTop).toBeLessThan(3200);
    expect(scroller.scrollTop).toBeGreaterThan(1134);
    expect(snapshot.reanchorLanding).toBe(true);
    expect(snapshot.reanchorLandingAnchorLineIdx).toBe(2);
    expect(snapshot.reanchorLandingTargetLineIdx).toBe(2);
    expect(snapshot.lastVisualWriteOwner).toBe('reanchor_landing');
    expect(snapshot.lastVisualWriteDirection).toBe('backward');

    const afterReanchorTop = scroller.scrollTop;
    const reanchorCommitCountBeforeReinforce = consoleWarnSpy.mock.calls.filter((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    ).length;
    const semanticEpochBeforeReinforce = snapshot.semanticEpoch;
    driver.ingest('Then came the hurricanes.', true, {
      currentIdx: 2,
      matchId: 'reread-reinforce',
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
    await jest.advanceTimersByTimeAsync(20);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorLanding).toBe(true);
    expect(snapshot.reanchorLandingAnchorLineIdx).toBe(2);
    expect(snapshot.reanchorLandingTargetLineIdx).toBe(3);
    expect(snapshot.semanticEpoch).toBe(semanticEpochBeforeReinforce);
    expect(consoleWarnSpy.mock.calls.filter((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    ).length).toBe(reanchorCommitCountBeforeReinforce);

    expect(driver.getLastLineIndex()).toBe(2);
    expect(Number.isFinite(scroller.scrollTop)).toBe(true);

    const warnLines = consoleWarnSpy.mock.calls.map((call) => String(call[0] || ''));
    expect(warnLines.some((line) => line.includes('ASR_REANCHOR_PENDING'))).toBe(true);
    expect(warnLines.some((line) => line.includes('ASR_REANCHOR_COMMIT'))).toBe(true);
    expect(warnLines.some((line) => line.includes('LOST_FORWARD on'))).toBe(false);
    expect(warnLines.some((line) => line.includes('ASR_SCROLL_AUTHORITY_CONFLICT'))).toBe(false);

    driver.dispose();
  });

  test('pending reread re-anchor clears when raw locality rejoins forward continuity', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'reread-pending-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [201],
      supportingRawSeqs: [201],
      requestCaptureEvidence: [{ requestSeq: 201, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorCandidateLineIdx).toBe(2);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);

    driver.ingest('The houses kept marching inland anyway.', true, {
      currentIdx: 5,
      matchId: 'reread-pending-resolved',
      source: 'openai-whisper-bridge',
      rawText: 'The houses kept marching inland anyway.',
      assembledText: 'The houses kept marching inland anyway.',
      rawTextHash: 'same-b',
      assembledTextHash: 'same-b',
      sourceRequestSeqs: [202],
      supportingRawSeqs: [202],
      requestCaptureEvidence: [{ requestSeq: 202, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 5, bestSim: 0.97, topScores: [{ idx: 5, score: 0.97 }] },
      rawMatchIndex: 5,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.97, topScores: [{ idx: 5, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(false);
    expect(consoleInfoSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_PENDING_CLEARED') &&
      String(call[0] || '').includes('resolved_to_forward_continuity')
    )).toBe(true);

    driver.dispose();
  });

  test('far-forward agreement does not clear pending reread state', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'far-forward-pending-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [301],
      supportingRawSeqs: [301],
      requestCaptureEvidence: [{ requestSeq: 301, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);

    driver.ingest('Others called it surrender.', true, {
      currentIdx: 5,
      matchId: 'far-forward-pending-continue',
      source: 'openai-whisper-bridge',
      rawText: 'Others called it surrender.',
      assembledText: 'Others called it surrender.',
      rawTextHash: 'same-c',
      assembledTextHash: 'same-c',
      sourceRequestSeqs: [302],
      supportingRawSeqs: [302],
      requestCaptureEvidence: [{ requestSeq: 302, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 7, bestSim: 0.97, topScores: [{ idx: 7, score: 0.97 }] },
      rawMatchIndex: 7,
      assembledMatchIndex: 7,
      match: { bestIdx: 7, bestSim: 0.97, topScores: [{ idx: 7, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);

    driver.dispose();
  });

  test('weak local match does not clear pending reread state', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'weak-local-pending-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [401],
      supportingRawSeqs: [401],
      requestCaptureEvidence: [{ requestSeq: 401, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);

    driver.ingest('The houses kept marching inland anyway.', true, {
      currentIdx: 5,
      matchId: 'weak-local-pending-continue',
      source: 'openai-whisper-bridge',
      rawText: 'The houses kept marching inland anyway.',
      assembledText: 'The houses kept marching inland anyway.',
      rawTextHash: 'same-d',
      assembledTextHash: 'same-d',
      sourceRequestSeqs: [402],
      supportingRawSeqs: [402],
      requestCaptureEvidence: [{ requestSeq: 402, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 5, bestSim: 0.2, topScores: [{ idx: 5, score: 0.2 }] },
      rawMatchIndex: 5,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.2, topScores: [{ idx: 5, score: 0.2 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);

    driver.dispose();
  });

  test('strong assembled match alone does not clear pending reread state', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'assembled-only-pending-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [451],
      supportingRawSeqs: [451],
      requestCaptureEvidence: [{ requestSeq: 451, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);

    driver.ingest('The houses kept marching inland anyway.', true, {
      currentIdx: 5,
      matchId: 'assembled-only-pending-continue',
      source: 'openai-whisper-bridge',
      rawText: 'The houses kept marching inland anyway.',
      assembledText: 'The houses kept marching inland anyway.',
      rawTextHash: 'same-da',
      assembledTextHash: 'same-da',
      sourceRequestSeqs: [452],
      supportingRawSeqs: [452],
      requestCaptureEvidence: [{ requestSeq: 452, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 5, bestSim: 0.2, topScores: [{ idx: 5, score: 0.2 }] },
      rawMatchIndex: 5,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.97, topScores: [{ idx: 5, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(false);
    expect(consoleInfoSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_PENDING_CLEARED') &&
      String(call[0] || '').includes('resolved_to_forward_continuity')
    )).toBe(false);

    driver.dispose();
  });

  test('assembled-only backward corroboration preserves existing re-anchor confirmation policy', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'assembled-backward-policy-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [471],
      supportingRawSeqs: [471],
      requestCaptureEvidence: [{ requestSeq: 471, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.2, topScores: [{ idx: 2, score: 0.2 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.2, topScores: [{ idx: 5, score: 0.2 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorCandidateHits).toBe(1);
    expect(driver.getLastLineIndex()).toBe(5);
    expect(scroller.scrollTop).toBe(3200);

    driver.ingest('Then came the hurricanes.', true, {
      currentIdx: 5,
      matchId: 'assembled-backward-policy-confirm',
      source: 'openai-whisper-bridge',
      rawText: 'Then came the hurricanes.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [472],
      supportingRawSeqs: [472],
      requestCaptureEvidence: [{ requestSeq: 472, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 3, bestSim: Number.NaN, topScores: [] },
      rawMatchIndex: 3,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.97, topScores: [{ idx: 5, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(driver.getLastLineIndex()).toBe(3);
    expect(scroller.scrollTop).toBeLessThan(3200);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(true);
    expect(consoleInfoSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_PENDING_CLEARED') &&
      String(call[0] || '').includes('resolved_to_forward_continuity')
    )).toBe(false);

    driver.dispose();
  });

  test('clearing pending reread state resumes normal adjacent forward reading', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'resume-normal-pending-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [501],
      supportingRawSeqs: [501],
      requestCaptureEvidence: [{ requestSeq: 501, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    driver.ingest('The houses kept marching inland anyway.', true, {
      currentIdx: 5,
      matchId: 'resume-normal-clear',
      source: 'openai-whisper-bridge',
      rawText: 'The houses kept marching inland anyway.',
      assembledText: 'The houses kept marching inland anyway.',
      rawTextHash: 'same-e',
      assembledTextHash: 'same-e',
      sourceRequestSeqs: [502],
      supportingRawSeqs: [502],
      requestCaptureEvidence: [{ requestSeq: 502, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 5, bestSim: 0.97, topScores: [{ idx: 5, score: 0.97 }] },
      rawMatchIndex: 5,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.97, topScores: [{ idx: 5, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBe(5);

    driver.ingest('Some growers called it progress.', true, {
      currentIdx: 5,
      matchId: 'resume-normal-adjacent',
      source: 'openai-whisper-bridge',
      rawText: 'Some growers called it progress.',
      assembledText: 'Some growers called it progress.',
      rawTextHash: 'same-f',
      assembledTextHash: 'same-f',
      sourceRequestSeqs: [503],
      supportingRawSeqs: [503],
      requestCaptureEvidence: [{ requestSeq: 503, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 6, bestSim: 0.97, topScores: [{ idx: 6, score: 0.97 }] },
      rawMatchIndex: 6,
      assembledMatchIndex: 6,
      match: { bestIdx: 6, bestSim: 0.97, topScores: [{ idx: 6, score: 0.97 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBe(6);
    expect(scroller.scrollTop).toBeGreaterThanOrEqual(3200);
    expect(consoleLogSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_COMMIT') &&
      String(call[1]?.nextIndex ?? '').includes('6')
    )).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(false);

    driver.dispose();
  });

  test('corroborated backward reread still produces re-anchor instead of clearing prematurely', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'true-reread-start',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [601],
      supportingRawSeqs: [601],
      requestCaptureEvidence: [{ requestSeq: 601, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);

    driver.ingest('Then came the hurricanes.', true, {
      currentIdx: 5,
      matchId: 'true-reread-confirm',
      source: 'openai-whisper-bridge',
      rawText: 'Then came the hurricanes.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [602],
      supportingRawSeqs: [602],
      requestCaptureEvidence: [{ requestSeq: 602, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 3, bestSim: 0.97, topScores: [{ idx: 3, score: 0.97 }] },
      rawMatchIndex: 3,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(40);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(driver.getLastLineIndex()).toBe(3);
    expect(scroller.scrollTop).toBeLessThan(3200);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(true);

    driver.dispose();
  });
});
