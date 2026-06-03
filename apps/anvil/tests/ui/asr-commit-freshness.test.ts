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
