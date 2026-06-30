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
    liveEvidenceActive?: boolean;
    liveEvidenceBasis?: string | null;
    maturedPreservedMarkerMaintenance?: boolean;
    preservedMarkerSameTarget?: boolean;
    preservedMarkerSameEpoch?: boolean;
    preservedMarkerOriginalOwner?: string | null;
    stableTargetInWindow?: boolean;
    sameCommitWindow?: boolean;
    localAuthorizedTarget?: boolean;
    physicallyReachable?: boolean;
    terminalClampActive?: boolean;
    pendingBridgeActive?: boolean;
    unsafeTargetActive?: boolean;
    backwardCandidate?: boolean;
    authorityConflictActive?: boolean;
    reanchorOrRescueActive?: boolean;
  }): {
    holdCandidate: boolean;
    bypassFreshDebt: boolean;
    holdApplied: boolean;
    rawTargetDebtPx: number;
    settleCapPx: number;
    realDebtThresholdPx: number;
    selectedAuthority: string;
    originalOwner: string;
    effectiveTargetScrollTop: number;
    targetCollapseReason: string | null;
    nextHoldActive: boolean;
    nextHoldSettleUsed: boolean;
    rawTargetSatisfied: boolean;
    effectiveTargetSatisfied: boolean;
    shouldEmitTargetSatisfied: boolean;
    settleReleaseEligible: boolean;
    settleReleased: boolean;
    settleReleaseBlockedReason: string | null;
    selectedAuthorityFromLatchedSnapshot: boolean;
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

    expect(result.holdCandidate).toBe(false);
    expect(result.bypassFreshDebt).toBe(true);
    expect(result.holdApplied).toBe(false);
    expect(result.effectiveTargetScrollTop).toBe(8602);
    expect(result.shouldEmitTargetSatisfied).toBe(false);
    expect(document.getElementById('viewer')).not.toBeNull();

    driver.dispose();
  });

  test('stale speech latches hold first, then releases one bounded settle step on a stable safe target', () => {
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
      stableTargetInWindow: true,
      sameCommitWindow: true,
      localAuthorizedTarget: true,
      physicallyReachable: true,
    });

    const third = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
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
      stableTargetInWindow: true,
      sameCommitWindow: true,
      localAuthorizedTarget: true,
      physicallyReachable: true,
    });

    expect(first.holdCandidate).toBe(true);
    expect(first.bypassFreshDebt).toBe(false);
    expect(first.holdApplied).toBe(true);
    expect(first.effectiveTargetScrollTop).toBe(8534);
    expect(first.targetCollapseReason).toBe('reader_idle_forward_hold');
    expect(first.settleReleased).toBe(false);
    expect(second.holdApplied).toBe(true);
    expect(second.effectiveTargetScrollTop).toBe(8534 + second.settleCapPx);
    expect(second.settleReleaseEligible).toBe(true);
    expect(second.settleReleased).toBe(true);
    expect(second.targetCollapseReason).toBe('reader_idle_forward_hold_settle_cap');
    expect(third.holdApplied).toBe(true);
    expect(third.effectiveTargetScrollTop).toBe(8534);
    expect(third.settleReleased).toBe(false);
    expect(third.settleReleaseBlockedReason).toBe('settle_release_already_used');
    expect(third.targetCollapseReason).toBe('reader_idle_forward_hold');

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

  test('stale safe residual can settle once using the latched original authority even when live arbitration collapses to hold', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const result = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 9125,
      rawTargetScrollTop: 9146,
      speechFresh: false,
      lastPartialAgeMs: 2400,
      lastFinalAgeMs: 2400,
      lastTranscriptAgeMs: 2400,
      lineHeightPx: 68,
      selectedAuthority: 'hold',
      movementSource: 'reader_marker_correction',
      readerIdleForwardHoldActive: true,
      stableTargetInWindow: true,
      sameCommitWindow: true,
      localAuthorizedTarget: true,
      physicallyReachable: true,
      preservedMarkerOriginalOwner: 'reader_marker_correction',
    });

    expect(result.settleReleaseEligible).toBe(true);
    expect(result.settleReleased).toBe(true);
    expect(result.selectedAuthority).toBe('reader_marker_correction');
    expect(result.originalOwner).toBe('reader_marker_correction');
    expect(result.selectedAuthorityFromLatchedSnapshot).toBe(true);
    expect(result.effectiveTargetScrollTop).toBe(9146);

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

  test('settle release is denied during terminal clamp and for unsafe rescue-like candidates', () => {
    const driver = createAsrScrollDriver() as DebugAsrDriver;

    const terminalClamp = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 3040,
      rawTargetScrollTop: 3058,
      speechFresh: false,
      lastPartialAgeMs: 2400,
      lastFinalAgeMs: 2400,
      lastTranscriptAgeMs: 2400,
      lineHeightPx: 48,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reader_idle_forward_hold_candidate',
      readerIdleForwardHoldActive: true,
      stableTargetInWindow: true,
      sameCommitWindow: true,
      localAuthorizedTarget: true,
      physicallyReachable: true,
      terminalClampActive: true,
    });
    expect(terminalClamp.effectiveTargetScrollTop).toBe(3040);
    expect(terminalClamp.settleReleased).toBe(false);
    expect(terminalClamp.settleReleaseBlockedReason).toBe('terminal_clamp_active');

    const unsafeRescue = driver.__debugEvaluateReaderIdleForwardHoldInteraction({
      currentScrollTop: 3040,
      rawTargetScrollTop: 3058,
      speechFresh: false,
      lastPartialAgeMs: 2400,
      lastFinalAgeMs: 2400,
      lastTranscriptAgeMs: 2400,
      lineHeightPx: 48,
      selectedAuthority: 'reader_marker_correction',
      movementSource: 'reanchor_rescue_candidate',
      readerIdleForwardHoldActive: true,
      stableTargetInWindow: true,
      sameCommitWindow: true,
      localAuthorizedTarget: false,
      physicallyReachable: true,
      unsafeTargetActive: true,
      reanchorOrRescueActive: true,
    });
    expect(unsafeRescue.effectiveTargetScrollTop).toBe(3040);
    expect(unsafeRescue.settleReleased).toBe(false);
    expect(unsafeRescue.settleReleaseBlockedReason).toBe('target_not_local_authorized');

    driver.dispose();
  });
});
