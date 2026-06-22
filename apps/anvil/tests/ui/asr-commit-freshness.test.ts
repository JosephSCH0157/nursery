/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR commit freshness gate', () => {
  let consoleInfoSpy: jest.SpyInstance<void, any[]>;
  let consoleWarnSpy: jest.SpyInstance<void, any[]>;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    window.history.replaceState({}, '', '/?dev=1');
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0" style="line-height:24px;">Zero.</div>
          <div class="line" data-line="1" style="line-height:24px;">One.</div>
          <div class="line" data-line="2" style="line-height:24px;">Two.</div>
          <div class="line" data-line="3" style="line-height:24px;">Three.</div>
        </div>
      </main>
    `;
    const scroller = document.getElementById('viewer') as HTMLElement;
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 669 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 4000 });
    Object.defineProperty(scroller, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 800, bottom: 669, width: 800, height: 669 }),
    });
    scroller.scrollTop = 0;
    Array.from(document.querySelectorAll<HTMLElement>('.line')).forEach((lineEl, idx) => {
      Object.defineProperty(lineEl, 'offsetTop', { configurable: true, value: idx * 567 });
      Object.defineProperty(lineEl, 'offsetHeight', { configurable: true, value: 236 });
      Object.defineProperty(lineEl, 'clientHeight', { configurable: true, value: 236 });
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
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    window.history.replaceState({}, '', '/');
  });

  test('late Whisper final after silence cannot forward commit', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateForwardCommitFreshness(args: any): any;
    };

    const result = driver.__debugEvaluateForwardCommitFreshness({
      currentLineIdx: 42,
      committedLineIdx: 42,
      proposedLineIdx: 59,
      transcriptSeq: 83,
      transcriptResponseAgeMs: 120,
      transcriptSpeechAgeMs: 9000,
      transcriptAudioAgeMs: 7000,
      transcriptSpeechFresh: false,
      transcriptSpeechActive: false,
      transcriptAuthorityEpoch: 1,
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('reader_silence_commit_blocked');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_SILENCE_COMMIT_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('stale response after recognizer restart cannot forward commit', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateForwardCommitFreshness(args: any): any;
    };

    driver.__debugEvaluateForwardCommitFreshness({
      currentLineIdx: 10,
      proposedLineIdx: 10,
      invalidateReason: 'recognizer_restart',
    });

    const result = driver.__debugEvaluateForwardCommitFreshness({
      currentLineIdx: 10,
      committedLineIdx: 10,
      proposedLineIdx: 11,
      transcriptSeq: 24,
      transcriptResponseAgeMs: 90,
      transcriptSpeechAgeMs: 120,
      transcriptAudioAgeMs: 110,
      transcriptSpeechFresh: true,
      transcriptSpeechActive: true,
      transcriptAuthorityEpoch: 1,
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('stale_response_invalidated');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_PENDING_RESPONSE_INVALIDATED'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_STALE_TRANSCRIPT_COMMIT_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('fresh speech and fresh transcript can commit', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateForwardCommitFreshness(args: any): any;
    };

    const result = driver.__debugEvaluateForwardCommitFreshness({
      currentLineIdx: 12,
      committedLineIdx: 12,
      proposedLineIdx: 13,
      transcriptSeq: 25,
      transcriptResponseAgeMs: 100,
      transcriptSpeechAgeMs: 140,
      transcriptAudioAgeMs: 100,
      transcriptSpeechFresh: true,
      transcriptSpeechActive: true,
      transcriptAuthorityEpoch: 1,
    });

    expect(result.allow).toBe(true);
    expect(result.reason).toBe('fresh_forward_commit');
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_COMMIT_FRESHNESS_EVALUATED'))).toBe(true);

    driver.dispose();
  });

  test('backward or relock behavior remains allowed', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateForwardCommitFreshness(args: any): any;
    };

    const result = driver.__debugEvaluateForwardCommitFreshness({
      currentLineIdx: 13,
      committedLineIdx: 13,
      proposedLineIdx: 12,
      transcriptSeq: 26,
      transcriptResponseAgeMs: 100,
      transcriptSpeechAgeMs: 140,
      transcriptAudioAgeMs: 100,
      transcriptSpeechFresh: true,
      transcriptSpeechActive: true,
      transcriptAuthorityEpoch: 1,
    });

    expect(result.allow).toBe(true);
    expect(result.reason).toBe('non_forward_commit');

    driver.dispose();
  });

  test('assembled-only forward match is blocked at semantic admission', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'assembled-only-forward',
      source: 'openai-whisper-bridge',
      rawText: 'One.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [8],
      supportingRawSeqs: [8],
      requestCaptureEvidence: [{ requestSeq: 8, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatchIndex: 1,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: true,
      match: { bestIdx: 2, bestSim: 0.95, topScores: [{ idx: 2, score: 0.95 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(120);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(detail.semanticAdmissionVerdict).toBe('assembled_only_forward_match');

    driver.dispose();
  });

  test('raw provider forward text during verified silence is blocked', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: false, rmsDbfs: -62 } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: true, ts: Date.now() } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'raw-forward-silence',
      source: 'openai-whisper-bridge',
      rawText: 'One. Two.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [9],
      supportingRawSeqs: [9],
      requestCaptureEvidence: [{ requestSeq: 9, verdict: 'silence_detected', rmsDbfs: -62 }],
      rawMatchIndex: 2,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(120);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(detail.semanticAdmissionVerdict).toBe('raw_provider_text_during_verified_silence');

    driver.dispose();
  });

  test('legitimate multi-chunk lineage can still advance when no single raw chunk fully supports the target', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'multi-chunk-forward',
      source: 'openai-whisper-bridge',
      rawText: 'wo.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [10, 11, 12],
      supportingRawSeqs: [10, 11, 12],
      forwardSupportRequestSeqs: [12],
      requestCaptureEvidence: [
        { requestSeq: 10, verdict: 'voice_detected', rmsDbfs: -18 },
        { requestSeq: 11, verdict: 'voice_detected', rmsDbfs: -18 },
        { requestSeq: 12, verdict: 'voice_detected', rmsDbfs: -18 },
      ],
      rawMatchIndex: 1,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.97, topScores: [{ idx: 2, score: 0.97 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);
    expect(detail.semanticAdmissionVerdict ?? null).toBeNull();

    driver.dispose();
  });

  test('missing old request evidence does not block a current voiced forward-supporting request', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'forward-support-current-voice',
      source: 'openai-whisper-bridge',
      rawText: 'Two.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [20, 21],
      supportingRawSeqs: [20, 21],
      forwardSupportRequestSeqs: [21],
      appendedBySeq: [21],
      requestCaptureVerdict: 'voice_detected',
      requestCaptureEvidence: [
        { requestSeq: 21, verdict: 'voice_detected', rmsDbfs: -18 },
      ],
      rawMatchIndex: 1,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.97, topScores: [{ idx: 2, score: 0.97 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(2);
    expect(detail.semanticAdmissionVerdict ?? null).toBeNull();
    expect(detail.captureActivityEvidence?.forwardSupportRequestSeqs).toEqual([21]);
    expect(detail.captureActivityEvidence?.missingEvidenceRequestSeqs).toEqual([]);

    driver.dispose();
  });

  test('unknown current forward-supporting request evidence blocks even when older voiced evidence exists', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'forward-support-current-unknown',
      source: 'openai-whisper-bridge',
      rawText: 'Two.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [30, 31],
      supportingRawSeqs: [30, 31],
      forwardSupportRequestSeqs: [31],
      appendedBySeq: [31],
      requestCaptureVerdict: 'unknown',
      requestCaptureEvidence: [
        { requestSeq: 30, verdict: 'voice_detected', rmsDbfs: -18 },
        { requestSeq: 31, verdict: 'unknown', rmsDbfs: null },
      ],
      rawMatchIndex: 1,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.97, topScores: [{ idx: 2, score: 0.97 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(200);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(detail.semanticAdmissionVerdict).toBe('capture_activity_unavailable');
    expect(detail.captureActivityEvidence?.forwardSupportRequestSeqs).toEqual([31]);
    expect(detail.captureActivityEvidence?.voiceEvidenceRequestSeqs).toEqual([30]);
    expect(detail.captureActivityEvidence?.missingEvidenceRequestSeqs).toEqual([]);

    driver.dispose();
  });

  test('voice-detected in-flight tail can still advance after silence begins', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:asr:runtime-status', {
      detail: { speechRunningActual: true, recognizerAttached: true, activeReadMode: true },
    }));
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));
    await jest.advanceTimersByTimeAsync(30);
    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: false, rmsDbfs: -62 } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: true, ts: Date.now() } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'voice-tail-forward',
      source: 'openai-whisper-bridge',
      rawText: 'One. Two.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [13],
      supportingRawSeqs: [13],
      requestCaptureEvidence: [{ requestSeq: 13, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatchIndex: 2,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(120);

    expect(driver.getLastLineIndex()).toBe(2);
    expect(detail.semanticAdmissionVerdict ?? null).toBeNull();

    driver.dispose();
  });

  test('unknown capture evidence cannot re-arm forward admission once silence is asserted', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: false, rmsDbfs: -62 } }));
    window.dispatchEvent(new CustomEvent('tp:asr:silence', { detail: { silent: true, ts: Date.now() } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'unknown-capture-forward',
      source: 'openai-whisper-bridge',
      rawText: 'One. Two.',
      assembledText: 'One. Two.',
      sourceRequestSeqs: [14],
      supportingRawSeqs: [14],
      requestCaptureEvidence: [{ requestSeq: 14, verdict: 'unknown', rmsDbfs: null }],
      rawMatchIndex: 2,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.96, topScores: [{ idx: 2, score: 0.96 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(120);
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(120);
    await jest.advanceTimersByTimeAsync(2600);

    expect(driver.getLastLineIndex()).toBe(1);
    expect(detail.semanticAdmissionVerdict).toBe('capture_activity_unavailable');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_CAPTURE_PROOF_INTEGRATION_FAULT'))).toBe(true);
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_BACKEND_RESTART_REQUESTED'))).toBe(false);

    driver.dispose();
  });

  test('raw and assembled equivalent text is never treated as assembled-only', async () => {
    const driver = createAsrScrollDriver();
    driver.setLastLineIndex(1);

    window.dispatchEvent(new CustomEvent('tp:vad', { detail: { speaking: true, rmsDbfs: -18 } }));

    const detail: any = {
      currentIdx: 1,
      matchId: 'raw-assembled-equivalent',
      source: 'openai-whisper-bridge',
      rawText: 'One. Two.',
      assembledText: 'One. Two.',
      rawTextHash: 'fnv1a:samehash',
      assembledTextHash: 'fnv1a:samehash',
      sourceRequestSeqs: [15],
      supportingRawSeqs: [15],
      requestCaptureEvidence: [{ requestSeq: 15, verdict: 'voice_detected', rmsDbfs: -18 }],
      rawMatchIndex: 2,
      assembledMatchIndex: 2,
      forwardMatchCreatedByAssembly: false,
      match: { bestIdx: 2, bestSim: 0.98, topScores: [{ idx: 2, score: 0.98 }] } as any,
    };
    driver.ingest('One. Two.', true, detail);
    await jest.advanceTimersByTimeAsync(120);

    expect(detail.semanticAdmissionVerdict ?? null).toBeNull();
    expect(driver.getLastLineIndex()).toBe(2);

    driver.dispose();
  });

  test('visual correction without fresh commit cannot advance same line', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 3950,
      proposedTop: 3991,
      targetScrollTop: 3950,
      currentLineIdx: 59,
      committedLineIdx: 59,
      nextSpeakableLineIdx: 59,
      allowedTargetIdx: 59,
      selectedAuthority: 'pocket_authority',
      authorityReason: 'within_tolerance_but_bottom_zone',
      lastVerifiedCommitLineIdx: 59,
      lastVerifiedCommitAgeMs: 250,
    });

    expect(result.appliedTop).toBeLessThanOrEqual(3950 + result.tolerancePx);

    driver.dispose();
  });
});
