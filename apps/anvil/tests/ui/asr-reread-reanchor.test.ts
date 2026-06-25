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

function installScriptFixture(
  lines: string[],
  options?: {
    clientHeight?: number;
    scrollHeight?: number;
    lineTopStep?: number;
    lineHeight?: number;
    topOverrides?: Record<number, number>;
  },
): HTMLElement {
  const clientHeight = options?.clientHeight ?? 669;
  const scrollHeight = options?.scrollHeight ?? 6000;
  const lineTopStep = options?.lineTopStep ?? 567;
  const lineHeight = options?.lineHeight ?? 236;
  document.body.innerHTML = `
    <main id="viewer" class="viewer" style="overflow-y:auto">
      <div id="script">
        ${lines.map((line, idx) => `<div class="line" data-line="${idx}">${line}</div>`).join('')}
      </div>
    </main>
  `;
  const scroller = document.getElementById('viewer') as HTMLElement;
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 800, bottom: clientHeight, width: 800, height: clientHeight }),
  });
  Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
    const top = options?.topOverrides?.[idx] ?? idx * lineTopStep;
    Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: top });
    Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: lineHeight });
    Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: lineHeight });
    Object.defineProperty(lineEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: top - scroller.scrollTop,
        left: 0,
        right: 800,
        bottom: top - scroller.scrollTop + lineHeight,
        width: 800,
        height: lineHeight,
      }),
    });
  });
  return scroller;
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
    installScriptFixture([
      "Florida citrus didn't start small.",
      'It started with porch crates and side roads.',
      "This wasn't betrayal, it was math.",
      'Then came the hurricanes.',
      "Weather has always been Florida citrus's oldest enemy.",
      'The houses kept marching inland anyway.',
      'Some growers called it progress.',
      'Others called it surrender.',
    ]);
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

  test('corroborated re-anchor landing targets the confirmed anchor line at the marker', async () => {
    const driver = createDriver();
    const scroller = document.getElementById('viewer') as HTMLElement;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'reread-marker-anchor-1',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [141],
      supportingRawSeqs: [141],
      requestCaptureEvidence: [{ requestSeq: 141, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(120);

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'reread-marker-anchor-2',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [142],
      supportingRawSeqs: [142],
      requestCaptureEvidence: [{ requestSeq: 142, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
    } as any);
    await jest.advanceTimersByTimeAsync(600);

    const expectedTargetTop = 1134 - ((669 * 0.4) - (236 * 0.5));
    expect(driver.getLastLineIndex()).toBe(2);
    expect(scroller.scrollTop).toBeCloseTo(expectedTargetTop, 0);
    expect(scroller.scrollTop).not.toBeCloseTo(1134, 0);

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

  test('vetoes false raw-locality reread admission when assembled path stays locally coherent with continuing voice-backed support', async () => {
    const scroller = installScriptFixture(
      Array.from({ length: 60 }, (_, idx) => `Script line ${idx}.`),
      { scrollHeight: 36000, lineTopStep: 120, lineHeight: 48, clientHeight: 720 },
    );
    const driver = createDriver();
    bootstrapLiveAsrRuntime();
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:audio-chunk', { detail: { ts: Date.now() } }));
    driver.setLastLineIndex(48);
    scroller.scrollTop = 5760;
    const currentSemanticEpoch = driver.__debugGetAuthoritySnapshot().semanticEpoch;

    driver.ingest('garbled stale locality packet', true, {
      currentIdx: 48,
      matchId: 'raw-divergence-veto',
      source: 'openai-whisper-bridge',
      rawText: 'garbled stale locality packet',
      assembledText: 'Script line 48. Script line 49.',
      sourceRequestSeqs: [6001, 6002],
      supportingRawSeqs: [6001, 6002],
      forwardSupportRequestSeqs: [6001, 6002],
      requestCaptureEvidence: [
        { requestSeq: 6001, verdict: 'voice_detected', rmsDbfs: -18 },
        { requestSeq: 6002, verdict: 'voice_detected', rmsDbfs: -18 },
      ],
      targetSupportProvenance: 'voice_backed_multi_request_support',
      rawMatch: { bestIdx: 0, bestSim: 0.94, topScores: [{ idx: 0, score: 0.94 }] },
      rawMatchIndex: 0,
      assembledMatchIndex: 48,
      match: { bestIdx: 48, bestSim: 0.95, topScores: [{ idx: 48, score: 0.95 }] },
      transcriptReceivedAtMs: Date.now(),
      responseAgeMs: 25,
      lastSpeechAgeMs: 25,
      lastAudioChunkAgeMs: 25,
      transcriptAuthorityEpoch: currentSemanticEpoch,
      runKey: 'reanchor-veto-run',
      runGeneration: 1,
    } as any);
    await jest.advanceTimersByTimeAsync(80);

    let snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(false);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(driver.getLastLineIndex()).toBeGreaterThanOrEqual(48);
    expect(driver.getLastLineIndex()).toBeLessThanOrEqual(49);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_PENDING')
    )).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(false);
    expect(consoleInfoSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_PENDING_VETOED')
    )).toBe(true);

    driver.ingest('Script line 49.', true, {
      currentIdx: driver.getLastLineIndex(),
      matchId: 'raw-divergence-veto-progress',
      source: 'openai-whisper-bridge',
      rawText: 'Script line 49.',
      assembledText: 'Script line 49.',
      rawTextHash: 'local-veto-49',
      assembledTextHash: 'local-veto-49',
      sourceRequestSeqs: [6003],
      supportingRawSeqs: [6003],
      forwardSupportRequestSeqs: [6003],
      requestCaptureEvidence: [{ requestSeq: 6003, verdict: 'voice_detected', rmsDbfs: -18 }],
      targetSupportProvenance: 'direct_raw_support',
      rawMatch: { bestIdx: 49, bestSim: 0.97, topScores: [{ idx: 49, score: 0.97 }] },
      rawMatchIndex: 49,
      assembledMatchIndex: 49,
      match: { bestIdx: 49, bestSim: 0.97, topScores: [{ idx: 49, score: 0.97 }] },
      transcriptReceivedAtMs: Date.now(),
      responseAgeMs: 20,
      lastSpeechAgeMs: 20,
      lastAudioChunkAgeMs: 20,
      runKey: 'reanchor-veto-run',
      runGeneration: 1,
    } as any);
    await jest.advanceTimersByTimeAsync(160);

    snapshot = driver.__debugGetAuthoritySnapshot();
    expect(driver.getLastLineIndex()).toBe(49);
    expect(snapshot.reanchorPending).toBe(false);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_COMMIT')
    )).toBe(false);

    driver.dispose();
  });

  test('preserves genuine reread re-anchor when raw divergence lacks safe continuing local support', async () => {
    const scroller = installScriptFixture(
      Array.from({ length: 60 }, (_, idx) => `Script line ${idx}.`),
      { scrollHeight: 36000, lineTopStep: 120, lineHeight: 48, clientHeight: 720 },
    );
    const driver = createDriver();
    bootstrapLiveAsrRuntime();
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:audio-chunk', { detail: { ts: Date.now() } }));
    driver.setLastLineIndex(48);
    scroller.scrollTop = 5760;

    driver.ingest('Script line 0.', true, {
      currentIdx: 48,
      matchId: 'genuine-reread-pending',
      source: 'openai-whisper-bridge',
      rawText: 'Script line 0.',
      assembledText: 'Script line 48. Script line 49.',
      rawTextHash: 'genuine-reread',
      assembledTextHash: 'genuine-reread-local',
      sourceRequestSeqs: [6101],
      supportingRawSeqs: [6101],
      requestCaptureEvidence: [{ requestSeq: 6101, verdict: 'voice_detected', rmsDbfs: -18 }],
      targetSupportProvenance: 'single_request_assembly_only',
      rawMatch: { bestIdx: 0, bestSim: 0.98, topScores: [{ idx: 0, score: 0.98 }] },
      rawMatchIndex: 0,
      assembledMatchIndex: 48,
      match: { bestIdx: 48, bestSim: 0.95, topScores: [{ idx: 48, score: 0.95 }] },
      transcriptReceivedAtMs: Date.now(),
      responseAgeMs: 20,
      lastSpeechAgeMs: 20,
      lastAudioChunkAgeMs: 20,
      runKey: 'genuine-reread-run',
      runGeneration: 1,
    } as any);
    await jest.advanceTimersByTimeAsync(80);

    const snapshot = driver.__debugGetAuthoritySnapshot();
    expect(snapshot.reanchorPending).toBe(true);
    expect(snapshot.reanchorCandidateLineIdx).toBe(0);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_PENDING')
    )).toBe(true);

    driver.dispose();
  });

  test('re-anchor landing settles once at scroll limit when requested target exceeds physical document bottom', async () => {
    const scroller = installScriptFixture(
      [
        "Florida citrus didn't start small.",
        'It started with porch crates and side roads.',
        "This wasn't betrayal, it was math.",
        'Then came the hurricanes.',
        "Weather has always been Florida citrus's oldest enemy.",
        'The houses kept marching inland anyway.',
        'Some growers called it progress.',
        'Others called it surrender.',
      ],
      {
        clientHeight: 600,
        scrollHeight: 1800,
        lineTopStep: 220,
        lineHeight: 60,
        topOverrides: {
          0: 0,
          1: 220,
          2: 1750,
          3: 1970,
          4: 2190,
          5: 2410,
          6: 2630,
          7: 2850,
        },
      },
    );
    const driver = createDriver();
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 1200;

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'bottom-limit-1',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [6201],
      supportingRawSeqs: [6201],
      requestCaptureEvidence: [{ requestSeq: 6201, verdict: 'voice_detected', rmsDbfs: -18 }],
      targetSupportProvenance: 'direct_raw_support',
      rawMatch: { bestIdx: 2, bestSim: 0.98, topScores: [{ idx: 2, score: 0.98 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
      transcriptReceivedAtMs: Date.now(),
      responseAgeMs: 20,
      lastSpeechAgeMs: 20,
      lastAudioChunkAgeMs: 20,
      runKey: 'bottom-limit-run',
      runGeneration: 1,
    } as any);
    await jest.advanceTimersByTimeAsync(60);

    driver.ingest('This wasn\'t betrayal, it was math.', true, {
      currentIdx: 5,
      matchId: 'bottom-limit-2',
      source: 'openai-whisper-bridge',
      rawText: 'This wasn\'t betrayal, it was math.',
      assembledText: 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [6202],
      supportingRawSeqs: [6202],
      requestCaptureEvidence: [{ requestSeq: 6202, verdict: 'voice_detected', rmsDbfs: -18 }],
      targetSupportProvenance: 'direct_raw_support',
      rawMatch: { bestIdx: 2, bestSim: 0.98, topScores: [{ idx: 2, score: 0.98 }] },
      rawMatchIndex: 2,
      assembledMatchIndex: 5,
      match: { bestIdx: 5, bestSim: 0.95, topScores: [{ idx: 5, score: 0.95 }] },
      transcriptReceivedAtMs: Date.now(),
      responseAgeMs: 20,
      lastSpeechAgeMs: 20,
      lastAudioChunkAgeMs: 20,
      runKey: 'bottom-limit-run',
      runGeneration: 1,
    } as any);
    await jest.advanceTimersByTimeAsync(300);

    const maxScrollTop = 1200;
    const snapshot = driver.__debugGetAuthoritySnapshot();
    expect(driver.getLastLineIndex()).toBe(2);
    expect(scroller.scrollTop).toBe(maxScrollTop);
    expect(snapshot.reanchorLanding).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('ASR_REANCHOR_LANDING_ACTUATOR_FAULT')
    )).toBe(false);
    expect(consoleWarnSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('reason=landing_writer_no_progress')
    )).toBe(false);

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
