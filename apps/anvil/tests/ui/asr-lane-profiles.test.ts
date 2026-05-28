/** @jest-environment jsdom */

import { ASR_LANE_ASR1, ASR_LANE_ASR2 } from '../../src/dev/dev-state';
import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

describe('ASR lane-specific controller profiles', () => {
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
          <div class="line" data-line="4" style="line-height:24px;">Four.</div>
          <div class="line" data-line="5" style="line-height:24px;">Five.</div>
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
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: ASR_LANE_ASR1 };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    delete (window as any).__tpStore;
    delete (window as any).__TP_MARKER_PCT;
    delete (window as any).__tpAsrRuntimeStatus;
    window.history.replaceState({}, '', '/');
  });

  test('Standard blocks unconfirmed >+1 jump', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateProfileForwardGuard(args: any): any;
    };

    const result = driver.__debugEvaluateProfileForwardGuard({
      lane: ASR_LANE_ASR1,
      currentLineIdx: 10,
      proposedLineIdx: 13,
      bestIdx: 13,
      proofSource: 'movement_authority_proof',
      sourceBranch: 'movement_authority_proof',
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('standard_large_jump_confirmation_pending');

    driver.dispose();
  });

  test('Standard waits after backward best-index movement', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateProfileForwardGuard(args: any): any;
    };

    const backtrack = driver.__debugEvaluateProfileForwardGuard({
      lane: ASR_LANE_ASR1,
      currentLineIdx: 10,
      proposedLineIdx: 9,
      bestIdx: 9,
      previousBestIdx: 12,
    });
    expect(backtrack.allow).toBe(true);

    const result = driver.__debugEvaluateProfileForwardGuard({
      lane: ASR_LANE_ASR1,
      currentLineIdx: 10,
      proposedLineIdx: 12,
      bestIdx: 12,
      proofSource: 'rescue_candidate',
      sourceBranch: 'rescue_candidate',
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('standard_backtrack_instability_hold');

    driver.dispose();
  });

  test('Standard blocks stale-tail forward commit', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugEvaluateForwardCommitFreshness(args: any): any;
    };

    const result = driver.__debugEvaluateForwardCommitFreshness({
      currentLineIdx: 42,
      committedLineIdx: 42,
      proposedLineIdx: 43,
      transcriptSeq: 83,
      transcriptResponseAgeMs: 1000,
      transcriptSpeechAgeMs: 950,
      transcriptAudioAgeMs: 950,
      transcriptSpeechFresh: true,
      transcriptSpeechActive: true,
      transcriptAuthorityEpoch: 1,
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('response_stale');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_STANDARD_STALE_COMMIT_BLOCKED'))).toBe(true);

    driver.dispose();
  });

  test('Standard allows fresh adjacent commit', () => {
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

    driver.dispose();
  });

  test('Standard suppresses post-commit visual release without fresh proof', () => {
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
    };

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1709,
      proposedTop: 1727,
      targetScrollTop: 1727,
      currentLineIdx: 26,
      committedLineIdx: 26,
      nextSpeakableLineIdx: 26,
      allowedTargetIdx: 26,
      selectedAuthority: 'preferred_lower_rail_release',
      authorityReason: 'preferred_lower_rail_not_settled',
      lastVerifiedCommitLineIdx: 26,
      lastVerifiedCommitAgeMs: 500,
    });

    expect(result.appliedTop).toBe(1709);
    expect(result.reason).toBe('standard_visual_release_suppressed');
    expect(consoleWarnSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_STANDARD_VISUAL_RELEASE_SUPPRESSED'))).toBe(true);

    driver.dispose();
  });

  test('High Accuracy preserves existing allowed smooth progression', () => {
    (window as any).__tpAsrRuntimeStatus = { activeAsrLane: ASR_LANE_ASR2 };
    const driver = createAsrScrollDriver() as ReturnType<typeof createAsrScrollDriver> & {
      __debugApplyScrollWithHybridGuard(args: any): any;
      __debugEvaluateProfileForwardGuard(args: any): any;
    };

    const profileResult = driver.__debugEvaluateProfileForwardGuard({
      lane: ASR_LANE_ASR2,
      currentLineIdx: 10,
      proposedLineIdx: 13,
      bestIdx: 13,
      proofSource: 'movement_authority_proof',
      sourceBranch: 'movement_authority_proof',
    });

    expect(profileResult.allow).toBe(true);
    expect(profileResult.reason).toBe('high_accuracy_profile_ok');

    const result = driver.__debugApplyScrollWithHybridGuard({
      beforeScrollTop: 1512,
      proposedTop: 1544,
      targetScrollTop: 1540,
      currentLineIdx: 23,
      committedLineIdx: 23,
      nextSpeakableLineIdx: 24,
      allowedTargetIdx: 24,
      selectedAuthority: 'pocket_authority',
      authorityReason: 'fresh_adjacent_under_hold',
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      lastVerifiedCommitLineIdx: 23,
      lastVerifiedCommitAgeMs: 120,
    });

    expect(result.hasFreshVerifiedForwardCommit).toBe(true);
    expect(result.appliedTop).toBeGreaterThan(1512);
    expect(consoleInfoSpy.mock.calls.some((call) => String(call[0] || '').includes('ASR_HIGH_ACCURACY_PROFILE_ACTIVE'))).toBe(true);

    driver.dispose();
  });
});
