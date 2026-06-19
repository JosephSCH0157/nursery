/** @jest-environment jsdom */

import { createAsrScrollDriver } from '../../src/features/asr/asr-scroll-driver';

type DebugAsrDriver = ReturnType<typeof createAsrScrollDriver> & {
  __debugEvaluateReaderIdleForwardHoldInteraction(args: {
    liveAsrFollowMode?: boolean;
    keepLivePocketMaintenanceActive?: boolean;
    currentScrollTop: number;
    rawTargetScrollTop: number;
    speechFresh: boolean;
    lastPartialAgeMs: number;
    lastFinalAgeMs: number;
    lastTranscriptAgeMs: number;
    readerIdleCurrentGenerationFinalPending?: boolean;
    readerIdleFreshAdjacentProofPending?: boolean;
    readerIdleForwardHoldActive?: boolean;
    readerIdleForwardHoldSettleUsed?: boolean;
    readerIdleReleaseReady?: boolean;
    lineHeightPx?: number;
    selectedAuthority?: string | null;
    movementSource?: string | null;
  }): {
    holdCandidate: boolean;
    bypassFreshDebt: boolean;
    holdApplied: boolean;
    rawTargetDebtPx: number;
    settleCapPx: number;
    realDebtThresholdPx: number;
    selectedAuthority: string;
    effectiveTargetScrollTop: number;
    targetCollapseReason: string | null;
    nextHoldActive: boolean;
    nextHoldSettleUsed: boolean;
    rawTargetSatisfied: boolean;
    effectiveTargetSatisfied: boolean;
    shouldEmitTargetSatisfied: boolean;
  };
};

describe('ASR reader idle forward hold interaction', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="viewer" class="viewer" style="overflow-y:auto">
        <div id="script">
          <div class="line" data-line="0" style="line-height:24px;">Line 0.</div>
          <div class="line" data-line="1" style="line-height:24px;">Line 1.</div>
          <div class="line" data-line="2" style="line-height:24px;">Line 2.</div>
        </div>
      </main>
    `;
  });

  test('fresh forward debt bypasses idle hold and preserves the forward target', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    expect(() => driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 8534,
      rawTargetScrollTop: 8602,
      speechFresh: true,
      lastPartialAgeMs: 77,
      lastFinalAgeMs: 77,
      lastTranscriptAgeMs: 77,
      lineHeightPx: 120,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reader_marker_correction',
      readerIdleForwardHoldActive: true,
    })).not.toThrow();

    const result = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 8534,
      rawTargetScrollTop: 8602,
      speechFresh: true,
      lastPartialAgeMs: 77,
      lastFinalAgeMs: 77,
      lastTranscriptAgeMs: 77,
      lineHeightPx: 120,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reader_marker_correction',
      readerIdleForwardHoldActive: true,
    });

    expect(result.holdCandidate).toBe(true);
    expect(result.bypassFreshDebt).toBe(true);
    expect(result.holdApplied).toBe(false);
    expect(result.effectiveTargetScrollTop).toBe(8602);
    expect(result.shouldEmitTargetSatisfied).toBe(false);
    expect(document.getElementById('viewer')).not.toBeNull();

    driver.dispose();
  });

  test('stale speech still allows idle hold to settle and then collapse', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const first = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 8534,
      rawTargetScrollTop: 8602,
      speechFresh: false,
      lastPartialAgeMs: 2400,
      lastFinalAgeMs: 2400,
      lastTranscriptAgeMs: 2400,
      lineHeightPx: 120,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reader_idle_forward_hold_candidate',
    });

    const second = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 8534,
      rawTargetScrollTop: 8602,
      speechFresh: false,
      lastPartialAgeMs: 2400,
      lastFinalAgeMs: 2400,
      lastTranscriptAgeMs: 2400,
      lineHeightPx: 120,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reader_idle_forward_hold_candidate',
      readerIdleForwardHoldActive: true,
      readerIdleForwardHoldSettleUsed: true,
    });

    expect(first.holdCandidate).toBe(true);
    expect(first.bypassFreshDebt).toBe(false);
    expect(first.holdApplied).toBe(true);
    expect(first.effectiveTargetScrollTop).toBe(8534 + first.settleCapPx);
    expect(first.targetCollapseReason).toBe('reader_idle_forward_hold_settle_cap');
    expect(second.holdApplied).toBe(true);
    expect(second.effectiveTargetScrollTop).toBe(8534);
    expect(second.targetCollapseReason).toBe('reader_idle_forward_hold');

    driver.dispose();
  });

  test('target-satisfied is not faked after an internal hold collapse', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 8534,
      rawTargetScrollTop: 8602,
      speechFresh: false,
      lastPartialAgeMs: 2400,
      lastFinalAgeMs: 2400,
      lastTranscriptAgeMs: 2400,
      lineHeightPx: 120,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reader_idle_forward_hold_candidate',
      readerIdleForwardHoldActive: true,
      readerIdleForwardHoldSettleUsed: true,
    });

    expect(result.rawTargetSatisfied).toBe(false);
    expect(result.effectiveTargetSatisfied).toBe(true);
    expect(result.shouldEmitTargetSatisfied).toBe(false);

    driver.dispose();
  });

  test('a latched idle hold becomes recoverable again when fresh forward debt returns', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 8534,
      rawTargetScrollTop: 8602,
      speechFresh: true,
      lastPartialAgeMs: 72,
      lastFinalAgeMs: 72,
      lastTranscriptAgeMs: 72,
      lineHeightPx: 120,
      selectedAuthority: 'preserved_forward_follow_target',
      movementSource: 'visual_debt_recovery',
      readerIdleForwardHoldActive: true,
      readerIdleForwardHoldSettleUsed: true,
    });

    expect(result.bypassFreshDebt).toBe(true);
    expect(result.nextHoldActive).toBe(false);
    expect(result.nextHoldSettleUsed).toBe(false);
    expect(result.effectiveTargetScrollTop).toBe(8602);
    expect(result.shouldEmitTargetSatisfied).toBe(false);

    driver.dispose();
  });
});
