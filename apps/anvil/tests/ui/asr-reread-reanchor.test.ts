/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';
import * as canonicalScroller from '../../src/scroll/scroller';
import * as asrThresholds from '../../src/asr/asr-threshold-store';

type DebugDriver = ReturnType<typeof createAsrScrollDriver> & {
  __debugGetAuthoritySnapshot(): {
    reanchorPending: boolean;
    reanchorCandidateLineIdx: number;
    reanchorCandidateHits: number;
    reanchorLanding: boolean;
    reanchorLandingAnchorLineIdx: number;
    reanchorLandingTargetLineIdx: number;
    reanchorLandingFrameId: number | null;
    reanchorLandingRevision: number;
    reanchorLandingNoProgressFrames: number;
    lastMoveAt: number;
    semanticEpoch: number;
    lastVisualWriteOwner: string;
    lastVisualWriteDirection: 'forward' | 'backward' | 'hold';
  };
  __debugEvaluateForwardCommitFreshness(args: {
    currentLineIdx: number; proposedLineIdx: number; invalidateReason: string;
  }): unknown;
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

describe('one-shot pending packet continuity', () => {
  let driver: DebugDriver;
  let scroller: HTMLElement;
  let writeSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let focused: boolean;
  let sequence: number;
  const snapshot = () => driver.__debugGetAuthoritySnapshot();
  const writes = () => writeSpy.mock.calls.filter(call => call[1]?.packetContinuity);
  const outcomes = () => infoSpy.mock.calls.map(call => String(call[0])).filter(s => s.includes('ASR_PENDING_PACKET_CONTINUITY'));
  const packet = (overrides: Record<string, unknown> = {}) => ({
    currentIdx: 48, matchId: `packet-${++sequence}`, transcriptSeq: sequence, requestSeq: String(sequence),
    source: 'openai-whisper-bridge', runKey: 'packet-run', runGeneration: 1,
    receivedAtMs: Date.now(), responseAgeMs: 0,
    transcriptAuthorityEpoch: snapshot().semanticEpoch,
    rawText: 'Old distant words.', assembledText: 'Script line 49.',
    rawMatchIndex: 10, rawMatch: { bestIdx: 10, bestSim: 0.96 },
    assembledMatchIndex: 49, match: { bestIdx: 49, bestSim: 0.96 },
    sourceRequestSeqs: [sequence - 1, sequence], supportingRawSeqs: [sequence - 1, sequence],
    forwardSupportRequestSeqs: [sequence - 1, sequence],
    requestCaptureEvidence: [sequence - 1, sequence].map(requestSeq => ({ requestSeq, verdict: 'voice_detected',
      captureStartedAtMs: Date.now() - 100, captureEndedAtMs: Date.now() })),
    targetSupportProvenance: 'voice_backed_multi_request_support', forwardMatchCreatedByAssembly: true,
    ...overrides,
  });
  const ingest = (p: ReturnType<typeof packet>, final = true) => driver.ingest(p.rawText as string, final, p as any);
  const semantics = () => {
    const { outcome, pending, target, protected: protection, inFlight, attempts } = (driver as any).__debugPostCommitCompletion.state();
    return { line: driver.getLastLineIndex(), epoch: snapshot().semanticEpoch,
      accepted: (snapshot() as any).acceptedEvidenceIdentity,
      canonical: JSON.stringify((window as any).__tpCanonicalAsrAuthority),
      completion: { outcome, pending, target, protection, inFlight, attempts } };
  };
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(100000);
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    focused = true; sequence = 100;
    jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    writeSpy = jest.spyOn(canonicalScroller, 'applyCanonicalScrollTop');
    window.history.replaceState({}, '', '/?dev=1');
    scroller = installScriptFixture(Array.from({ length: 60 }, (_, i) => `Script line ${i}.`),
      { lineTopStep: 48, lineHeight: 48, clientHeight: 720, scrollHeight: 4000 });
    for (const el of document.querySelectorAll<HTMLElement>('.line')) el.style.lineHeight = '48px';
    (window as any).__tpStore = { get(key: string) {
      if (key === 'scrollMode') return 'asr';
      if (key === 'session.phase') return 'live';
      if (key === 'session.asrArmed') return true;
      return undefined;
    } };
    (window as any).__TP_MARKER_PCT = 0.4;
    (window as any).__tpAsrRunKey = 'packet-run'; (window as any).__tpAsrRunGeneration = 1;
    driver = createAsrScrollDriver({ runKey: 'packet-run', runGeneration: 1 }) as DebugDriver;
    bootstrapLiveAsrRuntime();
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    window.dispatchEvent(new CustomEvent('tp:asr:audio-chunk', { detail: { ts: Date.now() } }));
    driver.setLastLineIndex(48); scroller.scrollTop = 1950;
    ingest(packet({ rawMatchIndex: 0, rawMatch: { bestIdx: 0, bestSim: 0.96 },
      assembledMatchIndex: 48, match: { bestIdx: 48, bestSim: 0.96 },
      targetSupportProvenance: 'single_request_assembly_only' }));
    expect(snapshot().reanchorPending).toBe(true);
    writeSpy.mockClear(); infoSpy.mockClear();
  });
  afterEach(() => {
    driver.dispose(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
    for (const key of ['__tpStore', '__TP_MARKER_PCT', '__tpAsrRuntimeStatus', '__tpAsrRunKey',
      '__tpAsrRunGeneration', '__TP_LAST_APPLIED_HASH', '__forgeCanonicalReadyScript', '__tpAnvilCaptureSessionId',
      '__tpCanonicalAsrAuthority']) delete (window as any)[key];
    window.history.replaceState({}, '', '/');
  });
  test('qualified adjacent packet makes one measured bounded step, not semantic/completion authority', () => {
    const before = semantics();
    ingest(packet());
    expect(outcomes()).toContainEqual(expect.stringContaining('outcome=moved'));
    expect(writes()).toHaveLength(1);
    expect(scroller.scrollTop).toBeGreaterThan(1950);
    expect(scroller.scrollTop).toBeLessThanOrEqual(1998);
    expect(semantics()).toEqual(before);
    expect(snapshot()).toMatchObject({ reanchorPending: true, reanchorLanding: false, reanchorCandidateHits: 1 });
    const decision = writes()[0][1].packetContinuity;
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.context)).toBe(true);
    expect(decision).not.toHaveProperty('detail');
    expect(JSON.parse(decision.fingerprint)).toContain('voice_backed_multi_request_support');
  });
  test('qualified direct agreement below semantic-confirmation confidence remains visual only', () => {
    const thresholds = asrThresholds.getAsrDriverThresholds();
    jest.spyOn(asrThresholds, 'getAsrDriverThresholds').mockReturnValue({ ...thresholds, commitFinalMinSim: 0.8 });
    ingest(packet({ rawText: 'Script line 49.', rawMatchIndex: 49, rawMatch: { bestIdx: 49, bestSim: 0.56 },
      match: { bestIdx: 49, bestSim: 0.56 }, targetSupportProvenance: 'direct_raw_support', forwardMatchCreatedByAssembly: false }));
    expect(writes()).toHaveLength(1);
    expect(snapshot().reanchorPending).toBe(true); expect(driver.getLastLineIndex()).toBe(48);
  });
  test('the existing WhisperBridge monotonic timestamp/generation payload qualifies without invented receipt timing', () => {
    const before = semantics();
    ingest(packet({ receivedAtMs: undefined, responseAgeMs: undefined, transcriptAuthorityEpoch: undefined,
      timestamp: performance.now(), requestGeneration: 2, bridgeGeneration: 2 }));
    expect(writes()).toHaveLength(1); expect(semantics()).toEqual(before);
  });
  test.each(['generation', 'missing clock', 'capture before invalidation'])('bridge %s fails closed', kind => {
    if (kind === 'capture before invalidation') (driver as any).__debugPostCommitCompletion.invalidate('response');
    ingest(packet({ receivedAtMs: undefined, responseAgeMs: undefined, transcriptAuthorityEpoch: undefined,
      timestamp: kind === 'missing clock' ? undefined : performance.now(),
      requestGeneration: 2, bridgeGeneration: kind === 'generation' ? 3 : 2 }));
    expect(writes()).toHaveLength(0);
  });
  test.each([
    ['assembly only', { targetSupportProvenance: 'single_request_assembly_only' }],
    ['label without capture', { requestCaptureEvidence: [] }],
    ['stale capture despite fresh response', { requestCaptureEvidence: [101, 102].map(requestSeq => ({ requestSeq, verdict: 'voice_detected', captureEndedAtMs: 1 })) }],
    ['silence capture', { requestCaptureEvidence: [101, 102].map(requestSeq => ({ requestSeq, verdict: 'silence_detected', captureEndedAtMs: 100000 })) }],
    ['no match', { noMatch: true }],
    ['missing support', { forwardSupportRequestSeqs: [999] }],
    ['incoming outside support', { forwardSupportRequestSeqs: [100] }],
    ['raw only', { assembledText: '', assembledMatchIndex: null, match: null }],
    ['equal hashes without provenance', { rawTextHash: 'same', assembledTextHash: 'same', targetSupportProvenance: null }],
    ['old run', { runKey: 'other', runGeneration: 0 }],
    ['response epoch', { transcriptAuthorityEpoch: 999 }],
    ['old final', { receivedAtMs: 1, responseAgeMs: 99999 }],
    ['unknown timestamp', { receivedAtMs: undefined }],
    ['no request', { requestSeq: undefined }],
    ['nonlocal', { assembledMatchIndex: 52, match: { bestIdx: 52, bestSim: 0.96 } }],
    ['below current', { assembledMatchIndex: 47, match: { bestIdx: 47, bestSim: 0.96 } }],
    ['weak candidate', { match: { bestIdx: 49, bestSim: 0.1 } }],
  ])('%s cannot authorize packet movement', (_name, overrides) => {
    ingest(packet(overrides)); expect(writes()).toHaveLength(0);
    expect(scroller.scrollTop).toBe(1950); expect(driver.getLastLineIndex()).toBe(48);
  });
  test('interim packet cannot authorize movement', () => {
    ingest(packet(), false); expect(writes()).toHaveLength(0);
  });
  test('interim then final delivery of one request permits exactly one final attempt', () => {
    const p = packet(); ingest(p, false); expect(writes()).toHaveLength(0);
    ingest(p); ingest(p); expect(writes()).toHaveLength(1);
    expect(snapshot().reanchorPending).toBe(true);
  });
  test('a newer interim invalidates an older late final', () => {
    const old = packet(); ingest(packet(), false); ingest(old);
    expect(writes()).toHaveLength(0);
  });
  test('current-line multi-request continuation is local, not a semantic acceptance', () => {
    const before = semantics(); ingest(packet({ assembledMatchIndex: 48, match: { bestIdx: 48, bestSim: 0.96 } }));
    expect(writes()).toHaveLength(1); expect(semantics()).toEqual(before);
  });
  test('packet-shaped caller data and source names cannot bypass the pending writer guard', () => {
    (driver as any).__debugApplyScrollWithHybridGuard({ beforeScrollTop: 1950, proposedTop: 1998,
      targetScrollTop: 2088, currentLineIdx: 48, committedLineIdx: 48, allowedTargetIdx: 49,
      selectedAuthority: 'pending_packet_continuity', packetContinuity: Object.freeze({}),
      sourceAuthority: 'pending_packet_continuity' });
    expect(writeSpy).not.toHaveBeenCalled(); expect(scroller.scrollTop).toBe(1950);
  });
  test('replay and changed-body replay neither write nor add corroboration', () => {
    const p = packet(); ingest(p);
    const after = snapshot(); const top = scroller.scrollTop;
    ingest(p); ingest({ ...p, assembledMatchIndex: 48, sourceRequestSeqs: [888] });
    expect(writes()).toHaveLength(1); expect(scroller.scrollTop).toBe(top);
    expect(snapshot().reanchorCandidateHits).toBe(after.reanchorCandidateHits);
    expect(snapshot().reanchorPending).toBe(true);
  });
  test('out-of-order packet cannot regain authority', () => {
    const old = packet(); ingest(packet()); ingest(old); expect(writes()).toHaveLength(1);
  });
  test('a fresh confirming packet still uses only the normal landing scheduler', () => {
    ingest(packet()); expect(snapshot().reanchorPending).toBe(true);
    ingest(packet()); expect(snapshot().reanchorPending).toBe(false);
    expect(snapshot().reanchorLanding).toBe(true); expect(driver.getLastLineIndex()).toBe(10);
    expect(writes()).toHaveLength(1); expect(snapshot().reanchorLandingFrameId).not.toBeNull();
  });
  test('negative pixel target must satisfy existing backward authority', () => {
    scroller.scrollTop = 2200; ingest(packet());
    expect(writes()).toHaveLength(0); expect(scroller.scrollTop).toBe(2200);
    expect(outcomes()).toContainEqual(expect.stringContaining('backward_denied'));
  });
  test.each(['expiry', 'focus', 'run', 'response', 'geometry', 'script', 'contradiction', 'semantic', 'visual'])('%s between selection and writer rejects', kind => {
    let changed = false;
    infoSpy.mockImplementation((value: unknown) => {
      if (changed || !String(value).includes('outcome=qualified')) return;
      changed = true;
      if (kind === 'expiry') jest.setSystemTime(200000);
      if (kind === 'focus') { focused = false; window.dispatchEvent(new Event('blur')); }
      if (kind === 'run') (window as any).__tpAsrRunGeneration = 2;
      if (kind === 'response') (driver as any).__debugPostCommitCompletion.invalidate('response');
      if (kind === 'geometry') Object.defineProperty(document.querySelector('[data-line="49"]'), 'offsetTop', { value: 2800, configurable: true });
      if (kind === 'script') document.querySelector('[data-line="49"]')!.textContent = 'Replaced script.';
      if (kind === 'semantic' || kind === 'visual') (driver as any).__debugPostCommitCompletion.invalidate(kind);
      if (kind === 'contradiction') ingest(packet({ requestCaptureEvidence: [], targetSupportProvenance: 'single_request_assembly_only' }));
    });
    ingest(packet()); expect(changed).toBe(true); expect(writes()).toHaveLength(0);
    expect(scroller.scrollTop).toBe(1950);
  });
  test('no-progress writer is one attempt, not completion or a retry', () => {
    writeSpy.mockImplementation((_target: number, opts: any) => opts.scroller.scrollTop);
    const before = semantics(); const p = packet(); ingest(p); ingest(p);
    expect(writes()).toHaveLength(1); expect(semantics()).toEqual(before);
    expect(scroller.scrollTop).toBe(1950);
    expect(outcomes()).toContainEqual(expect.stringContaining('outcome=no_progress'));
  });
  test('writer-reported success without measured movement is no progress', () => {
    writeSpy.mockImplementation((target: number) => target);
    const before = semantics(); ingest(packet());
    expect(writes()).toHaveLength(1); expect(scroller.scrollTop).toBe(1950);
    expect(semantics()).toEqual(before);
    expect(outcomes()).toContainEqual(expect.stringContaining('outcome=no_progress'));
  });
  test('writer exception cannot be retried by packet replay', () => {
    writeSpy.mockImplementation(() => { throw new Error('blocked writer'); });
    const p = packet(); const before = semantics(); ingest(p); ingest(p);
    expect(writes()).toHaveLength(1); expect(semantics()).toEqual(before);
    expect(outcomes()).toContainEqual(expect.stringContaining('writer_rejected'));
  });
  test('synchronous context replacement after pixels prevents old bookkeeping', () => {
    const beforeMove = snapshot().lastMoveAt;
    writeSpy.mockImplementation((target: number, opts: any) => {
      opts.scroller.scrollTop = target;
      (window as any).__tpAsrRunGeneration = 2;
      return target;
    });
    ingest(packet()); expect(writes()).toHaveLength(1);
    expect(snapshot().lastMoveAt).toBe(beforeMove);
    expect(outcomes()).toContainEqual(expect.stringContaining('superseded_during_write'));
  });
});

describe('reanchor landing frame ownership', () => {
  let driver: DebugDriver;
  let scroller: HTMLElement;
  let callbacks: Map<number, FrameRequestCallback>;
  let pending: Set<number>;
  let nextFrame: number;
  let requestSeq: number;
  let focused: boolean;
  let writeSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  const snapshot = () => driver.__debugGetAuthoritySnapshot();
  const frameId = () => {
    const id = snapshot().reanchorLandingFrameId;
    expect(id).not.toBeNull();
    return id!;
  };
  // Intentionally retains cancelled and consumed callbacks for adversarial delivery.
  const invoke = (id: number) => {
    pending.delete(id);
    callbacks.get(id)!(performance.now());
  };
  const landingWrites = () => writeSpy.mock.calls.filter((call) => call[1]?.reason === 'reanchor-landing');
  const scheduledCount = () => infoSpy.mock.calls.filter((call) =>
    String(call[0]).includes('[ASR_REANCHOR_FRAME] outcome=scheduled')).length;
  const outcomeCount = (outcome: string) => infoSpy.mock.calls.filter((call) =>
    String(call[0]).includes(`[ASR_REANCHOR_FRAME] outcome=${outcome} `)).length;

  function packet(line: number, assembled = 5): void {
    requestSeq += 1;
    const text = line === 2 ? "This wasn't betrayal, it was math." : 'Then came the hurricanes.';
    driver.ingest(text, true, {
      currentIdx: driver.getLastLineIndex(), matchId: `landing-${requestSeq}`,
      source: 'openai-whisper-bridge', rawText: text,
      assembledText: assembled === line ? text : 'The houses kept marching inland anyway. Some growers called it progress.',
      sourceRequestSeqs: [requestSeq], supportingRawSeqs: [requestSeq],
      requestCaptureEvidence: [{ requestSeq, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatch: { bestIdx: line, bestSim: 0.98, topScores: [{ idx: line, score: 0.98 }] },
      rawMatchIndex: line, assembledMatchIndex: assembled,
      match: { bestIdx: assembled, bestSim: 0.96, topScores: [{ idx: assembled, score: 0.96 }] },
      runKey: 'landing-run', runGeneration: 1,
      transcriptReceivedAtMs: Date.now(), responseAgeMs: 0,
      lastSpeechAgeMs: 0, lastAudioChunkAgeMs: 0,
    } as any);
  }

  function confirm(): number {
    packet(2);
    expect(snapshot().reanchorPending).toBe(true);
    packet(2);
    expect(snapshot().reanchorLanding).toBe(true);
    return frameId();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = new Map(); pending = new Set(); nextFrame = 0; requestSeq = 100; focused = true;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrame; callbacks.set(id, callback); pending.add(id); return id;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { pending.delete(id); });
    jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    writeSpy = jest.spyOn(canonicalScroller, 'applyCanonicalScrollTop');
    window.history.replaceState({}, '', '/?dev=1');
    scroller = installScriptFixture([
      "Florida citrus didn't start small.", 'It started with porch crates and side roads.',
      "This wasn't betrayal, it was math.", 'Then came the hurricanes.',
      "Weather has always been Florida citrus's oldest enemy.",
      'The houses kept marching inland anyway.', 'Some growers called it progress.', 'Others called it surrender.',
    ]);
    (window as any).__tpStore = { get(key: string) {
      if (key === 'scrollMode') return 'asr';
      if (key === 'session.phase') return 'live';
      if (key === 'session.asrArmed') return true;
      return undefined;
    } };
    (window as any).__TP_MARKER_PCT = 0.4;
    (window as any).__tpAsrRunKey = 'landing-run';
    (window as any).__tpAsrRunGeneration = 1;
    driver = createAsrScrollDriver({ runKey: 'landing-run', runGeneration: 1 }) as DebugDriver;
    bootstrapLiveAsrRuntime();
    driver.setLastLineIndex(5);
    scroller.scrollTop = 3200;
  });

  afterEach(() => {
    driver.dispose();
    jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
    for (const key of ['__tpStore', '__TP_MARKER_PCT', '__tpAsrRuntimeStatus', '__tpAsrRunKey',
      '__tpAsrRunGeneration', '__TP_LAST_APPLIED_HASH', '__forgeCanonicalReadyScript', '__tpAnvilCaptureSessionId']) delete (window as any)[key];
    window.history.replaceState({}, '', '/');
  });

  test.each([[3, 0.2, 0], [3, 0.91, 1801], [7, 0.91, 0]])(
    'unqualified newer evidence (%s/%s/%s) does not veto a corroborated backward landing', (line, confidence, age) => {
      const id = confirm();
      const before = JSON.stringify((window as any).__tpCanonicalAsrAuthority);
      (driver as any).__debugBackwardVisual.seedAccepted(line, confidence, age);
      invoke(id);
      expect(landingWrites()).toHaveLength(1);
      expect(scroller.scrollTop).toBeLessThan(3200);
      expect(JSON.stringify((window as any).__tpCanonicalAsrAuthority)).toBe(before);
    });

  test('new qualified local authority in the same millisecond rejects old landing without semantic mutation', () => {
    const id = confirm();
    const before = JSON.stringify((window as any).__tpCanonicalAsrAuthority);
    const epoch = snapshot().semanticEpoch;
    // This candidate must satisfy the existing low-debt geometry too. A
    // distant/offscreen accepted index alone is deliberately insufficient.
    const line = document.querySelector<HTMLElement>('[data-line="3"]')!;
    const marker = scroller.clientHeight * 0.4;
    Object.defineProperty(line, 'offsetTop', { configurable: true, value: 3200 + marker });
    Object.defineProperty(line, 'getBoundingClientRect', { configurable: true,
      value: () => ({ top: marker, bottom: marker + 236, height: 236, left: 0, right: 800, width: 800 }) });
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: false } }));
    expect((driver as any).__debugBackwardVisual.seedAccepted(3, 0.91)).toBe(3);
    invoke(id);
    expect(landingWrites()).toHaveLength(0);
    expect(snapshot().semanticEpoch).toBe(epoch);
    expect(JSON.stringify((window as any).__tpCanonicalAsrAuthority)).toBe(before);
    expect(snapshot().reanchorLanding).toBe(false);
    expect(pending.size).toBe(0);
    invoke(id);
    expect(landingWrites()).toHaveLength(0);
  });

  test('expired backward landing evidence does not renew itself on a later frame', () => {
    const id = confirm();
    jest.setSystemTime(Date.now() + 1801);
    invoke(id);
    expect(landingWrites()).toHaveLength(0);
    expect(snapshot().reanchorLanding).toBe(false);
    expect(pending.size).toBe(0);
  });

  test('one request owns one bounded frame; same-target reinforcement and replay do not duplicate writes or semantic coverage', () => {
    const id = confirm();
    const revision = snapshot().reanchorLandingRevision;
    const semantic = JSON.stringify((window as any).__tpCanonicalAsrAuthority);
    expect(landingWrites()).toHaveLength(0);
    expect(scheduledCount()).toBe(1);
    packet(2, 2);
    expect(frameId()).toBe(id);
    expect(snapshot().reanchorLandingRevision).toBe(revision);
    expect(scheduledCount()).toBe(1);
    invoke(id);
    expect(landingWrites()).toHaveLength(1);
    expect(scroller.scrollTop).toBeLessThan(3200);
    expect(scroller.scrollTop).toBeGreaterThan(1134);
    const next = frameId(); const top = scroller.scrollTop;
    invoke(id);
    expect(landingWrites()).toHaveLength(1);
    expect(scroller.scrollTop).toBe(top);
    expect(frameId()).toBe(next);
    expect(driver.getLastLineIndex()).toBe(2);
    expect(JSON.stringify((window as any).__tpCanonicalAsrAuthority)).toBe(semantic);
  });

  test('changed target supersedes a cancelled frame without allowing it to consume its replacement', () => {
    const old = confirm();
    packet(3, 3);
    const replacement = frameId();
    expect(replacement).not.toBe(old);
    expect(pending.has(old)).toBe(false);
    invoke(old);
    expect(landingWrites()).toHaveLength(0);
    expect(frameId()).toBe(replacement);
    expect(pending.has(replacement)).toBe(true);
    invoke(replacement);
    expect(landingWrites()).toHaveLength(1);
    expect(snapshot().reanchorLandingTargetLineIdx).toBe(3);
  });

  test('old general pursuit callbacks only delegate and cannot create competing landing steps', () => {
    const graceDriver = driver as DebugDriver & {
      __debugEnterShortLinePreReanchorGrace(args: {
        currentLineIdx: number; visualTargetIdx: number; rawMatchIndex: number; assembledMatchIndex: number;
      }): boolean;
    };
    expect(graceDriver.__debugEnterShortLinePreReanchorGrace({
      currentLineIdx: 5, visualTargetIdx: 6, rawMatchIndex: 2, assembledMatchIndex: 5,
    })).toBe(true);
    const oldTick = [...callbacks.entries()].find(([, callback]) => callback.name === 'tickController')![0];
    expect(oldTick).toBeDefined();
    driver.setLastLineIndex(5);
    const landing = confirm();
    invoke(oldTick); invoke(oldTick);
    expect(frameId()).toBe(landing);
    expect(scheduledCount()).toBe(1);
    expect(landingWrites()).toHaveLength(0);
    invoke(landing);
    expect(landingWrites()).toHaveLength(1);
  });

  test('new confirmed epoch invalidates old frame and preserves the new epoch landing', () => {
    const old = confirm(); const epoch = snapshot().semanticEpoch;
    driver.setLastLineIndex(5);
    const replacement = confirm();
    expect(snapshot().semanticEpoch).toBeGreaterThan(epoch);
    invoke(old);
    expect(landingWrites()).toHaveLength(0);
    expect(frameId()).toBe(replacement);
    invoke(replacement);
    expect(landingWrites()).toHaveLength(1);
  });

  test.each(['run', 'active-generation', 'reset', 'dispose', 'response', 'script', 'script-root', 'scroller', 'target-element', 'ready-script', 'capture', 'mode', 'unarmed'])(
    '%s invalidation makes a retained old callback harmless', (reason) => {
      const id = confirm();
      if (reason === 'run') window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
        detail: { runKey: 'replacement-run', runGeneration: 2 },
      }));
      if (reason === 'active-generation') (window as any).__tpAsrRunGeneration = 2;
      if (reason === 'reset') window.dispatchEvent(new Event('tp:script:reset'));
      if (reason === 'dispose') driver.dispose();
      if (reason === 'response') driver.__debugEvaluateForwardCommitFreshness({
        currentLineIdx: 2, proposedLineIdx: 3, invalidateReason: 'landing-test',
      });
      if (reason === 'script') (window as any).__TP_LAST_APPLIED_HASH = 'replacement-script';
      if (reason === 'script-root') document.getElementById('script')!.replaceWith(document.createElement('div'));
      if (reason === 'scroller') scroller.replaceWith(scroller.cloneNode(true));
      if (reason === 'target-element') {
        const line = scroller.querySelector('[data-line="2"]')!;
        line.replaceWith(line.cloneNode(true));
      }
      if (reason === 'ready-script') (window as any).__forgeCanonicalReadyScript = { transitionId: 'new-transition' };
      if (reason === 'capture') (window as any).__tpAnvilCaptureSessionId = 'new-capture';
      if (reason === 'mode' || reason === 'unarmed') {
        const previous = (window as any).__tpStore.get;
        (window as any).__tpStore.get = (key: string) => {
          if (reason === 'mode' && key === 'scrollMode') return 'step';
          if (reason === 'unarmed' && key === 'session.asrArmed') return false;
          return previous(key);
        };
      }
      const count = scheduledCount();
      invoke(id); invoke(id);
      expect(landingWrites()).toHaveLength(0);
      expect(snapshot().reanchorLanding).toBe(false);
      expect(snapshot().reanchorLandingFrameId).toBeNull();
      expect(scheduledCount()).toBe(count);
    });

  test('focus loss cancels ownership and focus regain cannot resurrect it', () => {
    const id = confirm();
    focused = false; window.dispatchEvent(new Event('blur'));
    invoke(id);
    expect(landingWrites()).toHaveLength(0);
    focused = true; window.dispatchEvent(new Event('focus'));
    invoke(id);
    expect(snapshot().reanchorLanding).toBe(false);
    expect(snapshot().reanchorLandingFrameId).toBeNull();
    expect(landingWrites()).toHaveLength(0);
  });

  test('a rejected write at actual zero retains landing, records no-progress, and does not claim movement', () => {
    const id = confirm();
    scroller.scrollTop = 0;
    const movedAt = snapshot().lastMoveAt;
    writeSpy.mockImplementation(() => 999); // An actuator return value is not observed pixel truth.
    invoke(id);
    expect(scroller.scrollTop).toBe(0);
    expect(snapshot().lastMoveAt).toBe(movedAt);
    expect(snapshot().lastVisualWriteDirection).toBe('hold');
    expect(snapshot().reanchorLanding).toBe(true);
    expect(snapshot().reanchorLandingNoProgressFrames).toBe(1);
    expect(outcomeCount('actuator_no_progress')).toBe(1);
    expect(frameId()).not.toBe(id);
  });

  test('authority changed during geometry evaluation is checked again at the final actuator boundary', () => {
    const id = confirm();
    Object.defineProperty(scroller.querySelector('[data-line="2"]'), 'clientHeight', {
      configurable: true, get() {
        (window as any).__TP_LAST_APPLIED_HASH = 'changed-before-write';
        return 236;
      },
    });
    invoke(id);
    expect(landingWrites()).toHaveLength(0);
    expect(scroller.scrollTop).toBe(3200);
    expect(snapshot().reanchorLanding).toBe(false);
  });

  test('distant landing converges through bounded single-owner continuations without semantic commits', () => {
    confirm();
    const semantic = JSON.stringify((window as any).__tpCanonicalAsrAuthority);
    const epoch = snapshot().semanticEpoch;
    let steps = 0;
    while (snapshot().reanchorLanding && steps < 20) {
      const id = frameId(); const before = scroller.scrollTop;
      invoke(id);
      expect(Math.abs(scroller.scrollTop - before)).toBeLessThanOrEqual(236 * 2);
      const after = scroller.scrollTop;
      invoke(id);
      expect(scroller.scrollTop).toBe(after);
      steps += 1;
    }
    expect(steps).toBeGreaterThan(1);
    expect(steps).toBeLessThan(20);
    expect(snapshot().reanchorLanding).toBe(false);
    expect(landingWrites()).toHaveLength(steps);
    expect(driver.getLastLineIndex()).toBe(2);
    expect(snapshot().semanticEpoch).toBe(epoch);
    expect(JSON.stringify((window as any).__tpCanonicalAsrAuthority)).toBe(semantic);
  });

  test('document-limit zero movement settles once and replay cannot complete twice', () => {
    const id = confirm();
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 669 });
    scroller.scrollTop = 0;
    const movedAt = snapshot().lastMoveAt;
    invoke(id);
    expect(snapshot().reanchorLanding).toBe(false);
    expect(snapshot().lastMoveAt).toBe(movedAt);
    expect(outcomeCount('zero_movement')).toBe(1);
    expect(outcomeCount('superseded')).toBe(0);
    const writes = landingWrites().length;
    invoke(id);
    expect(landingWrites()).toHaveLength(writes);
    expect(outcomeCount('zero_movement')).toBe(1);
  });

  test('replacement created synchronously during writer dispatch is not completed by the old frame', () => {
    const id = confirm();
    // The spy wraps the real function initially; capture it through getMockImplementation.
    const apply = writeSpy.getMockImplementation()!;
    let replacement: number | null = null;
    writeSpy.mockImplementation((...args: any[]) => {
      const result = apply(...args);
      packet(3, 3);
      replacement = frameId();
      return result;
    });
    invoke(id);
    expect(replacement).not.toBeNull();
    expect(frameId()).toBe(replacement);
    expect(snapshot().reanchorLandingTargetLineIdx).toBe(3);
    expect(landingWrites()).toHaveLength(1);
  });
});

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
