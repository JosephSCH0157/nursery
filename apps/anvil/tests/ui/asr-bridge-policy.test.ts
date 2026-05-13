import {
  shouldAllowPendingBridgeCompletion,
  shouldReduceBridgeToAdjacentRenderedRow,
  shouldBlockEquivalentBridgeCommit,
  shouldStageVisualOnlyBridge,
} from '../../src/features/asr/asr-bridge-policy';

describe('ASR bridge policy (read-only staging decision)', () => {
  test('multi-line bridge over non-speakable reduced row stages visual-only', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 10,
      targetIndex: 14,
      visibleStepTarget: 11,
      reducedLineSpeakable: false,
      asrRuntimeSpeechRunningActual: false,
      movementAuthority: 'match',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(true);
    expect(decision.reason).toBe('non_speakable_visual_cap');
    expect(decision.targetIndex).toBe(11);
    expect(decision.skippedRows).toBe(3);
  });

  test('direct adjacent speakable line does not stage as multi-line bridge', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 10,
      targetIndex: 11,
      visibleStepTarget: 11,
      reducedLineSpeakable: true,
      asrRuntimeSpeechRunningActual: false,
      movementAuthority: 'match',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(false);
  });

  test('non-speakable skipped rows are preserved in decision payload', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 3,
      targetIndex: 9,
      visibleStepTarget: 5,
      reducedLineSpeakable: false,
      asrRuntimeSpeechRunningActual: false,
      movementAuthority: 'match',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(true);
    expect(decision.skippedRows).toBe(4);
  });

  test('no stage when live/direct proof bypass condition is present', () => {
    const decision = shouldStageVisualOnlyBridge({
      liveStrictFollow: true,
      pendingSpeakableBridgeCompletion: false,
      currentIndex: 2,
      targetIndex: 6,
      visibleStepTarget: 3,
      reducedLineSpeakable: false,
      asrRuntimeSpeechRunningActual: true,
      movementAuthority: 'proof',
      liveUnleashedEnabled: false,
    });
    expect(decision.shouldStage).toBe(false);
    expect(decision.shouldBypassPendingVisualCap).toBe(true);
  });

  test('equivalent bridge commit is blocked according to current semantics', () => {
    const decision = shouldBlockEquivalentBridgeCommit({
      current: 5,
      requestedTarget: 8,
      semanticTarget: 7,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'movement_authority_forced_reconcile_single_step',
      reason: 'final_live_safe_step',
    });
    expect(decision.shouldBlock).toBe(true);
    expect(decision.reason).toBe('equivalent_bridge_target_blocked');
    expect(decision.equivalentTarget).toBe(8);
  });

  test('downstream bridge commit is blocked according to current semantics', () => {
    const decision = shouldBlockEquivalentBridgeCommit({
      current: 3,
      requestedTarget: 4,
      semanticTarget: 9,
      commitTs: 1200,
      bridgeBlockUntil: 2000,
      sourceBranch: 'reader_leash',
      reason: 'final_live_safe_step',
    });
    expect(decision.shouldBlock).toBe(true);
    expect(decision.equivalentTarget).toBe(9);
  });

  test('non-equivalent or adjacent candidate is not blocked', () => {
    const decision = shouldBlockEquivalentBridgeCommit({
      current: 10,
      requestedTarget: 11,
      semanticTarget: 11,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'normal',
      reason: 'final_live_safe_step',
    });
    expect(decision.shouldBlock).toBe(false);
  });

  test('existing bypass/allowed path remains allowed when completion or trap-escape semantics apply', () => {
    const completion = shouldBlockEquivalentBridgeCommit({
      current: 1,
      requestedTarget: 5,
      semanticTarget: 5,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'pending_speakable_bridge_complete',
      reason: 'final_live_safe_step',
    });
    expect(completion.shouldBlock).toBe(false);
    expect(completion.bridgeCompletionPath).toBe(true);

    const trapEscape = shouldBlockEquivalentBridgeCommit({
      current: 1,
      requestedTarget: 5,
      semanticTarget: 5,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'normal',
      reason: 'bridge_trap_escape',
    });
    expect(trapEscape.shouldBlock).toBe(false);
    expect(trapEscape.bridgeTrapEscapePath).toBe(true);
  });

  test('pending bridge completion allowed when current semantics allow it', () => {
    const decision = shouldAllowPendingBridgeCompletion({
      currentLine: 5,
      pendingSemanticFrom: 5,
      pendingSemanticTarget: 8,
      pendingBridgeAgeMs: 950,
      speechRunningActual: true,
      runtimeSpeechFresh: true,
      lastFinalTranscriptFresh: false,
      bridgeLandingProofOk: false,
      bridgeLandingProofFromStaleTranscriptOnly: false,
      sourceBranch: 'pending_speakable_bridge',
    });
    expect(decision.shouldAllow).toBe(true);
    expect(decision.reason).toBe('pending_speakable_bridge_complete');
    expect(decision.targetIndex).toBe(8);
  });

  test('completion blocked when direct proof is stale or missing', () => {
    const staleOrMissing = shouldAllowPendingBridgeCompletion({
      currentLine: 5,
      pendingSemanticFrom: 5,
      pendingSemanticTarget: 8,
      pendingBridgeAgeMs: 300,
      speechRunningActual: true,
      runtimeSpeechFresh: true,
      lastFinalTranscriptFresh: false,
      bridgeLandingProofOk: false,
      bridgeLandingProofFromStaleTranscriptOnly: true,
      sourceBranch: 'pending_speakable_bridge',
    });
    expect(staleOrMissing.shouldAllow).toBe(false);
    expect(staleOrMissing.reason).toBe('await_fresh_direct_landing_proof');
  });

  test('completion blocked when target/source does not match pending bridge cursor semantics', () => {
    const cursorShifted = shouldAllowPendingBridgeCompletion({
      currentLine: 6,
      pendingSemanticFrom: 5,
      pendingSemanticTarget: 8,
      pendingBridgeAgeMs: 1200,
      speechRunningActual: true,
      runtimeSpeechFresh: true,
      lastFinalTranscriptFresh: true,
      bridgeLandingProofOk: true,
      bridgeLandingProofFromStaleTranscriptOnly: false,
      sourceBranch: 'pending_speakable_bridge',
    });
    expect(cursorShifted.shouldAllow).toBe(false);
    expect(cursorShifted.reason).toBe('cursor_shifted');
  });

  test('completion path preserves expected reason and proof payload fields', () => {
    const decision = shouldAllowPendingBridgeCompletion({
      currentLine: 2,
      pendingSemanticFrom: 2,
      pendingSemanticTarget: 4,
      pendingBridgeAgeMs: 100,
      speechRunningActual: true,
      runtimeSpeechFresh: true,
      lastFinalTranscriptFresh: true,
      bridgeLandingProofOk: true,
      bridgeLandingProofFromStaleTranscriptOnly: false,
      sourceBranch: 'pending_speakable_bridge',
    });
    expect(decision.shouldAllow).toBe(true);
    expect(decision.reason).toBe('pending_speakable_bridge_complete');
    expect(decision.bridgeFinalFresh).toBe(true);
    expect(decision.bridgeDirectFreshProof).toBe(true);
  });

  test('bridge-trap escape path remains separate and unaffected', () => {
    const blockDecision = shouldBlockEquivalentBridgeCommit({
      current: 1,
      requestedTarget: 5,
      semanticTarget: 5,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'any',
      reason: 'bridge_trap_escape',
    });
    expect(blockDecision.shouldBlock).toBe(false);
    expect(blockDecision.bridgeTrapEscapePath).toBe(true);
  });

  test('multi-row bridge over cue/blank can reduce to adjacent rendered row according to current semantics', () => {
    const decision = shouldReduceBridgeToAdjacentRenderedRow({
      bridgeReducedTarget: 11,
      currentIndex: 10,
      originalTargetIndex: 15,
      skippedRows: ['12', '13', '14'],
    });
    expect(decision.shouldReduce).toBe(true);
    expect(decision.reason).toBe('live_bridge_single_step_policy');
    expect(decision.reducedTargetIndex).toBe(11);
  });

  test('direct adjacent target does not require reduction', () => {
    const decision = shouldReduceBridgeToAdjacentRenderedRow({
      bridgeReducedTarget: 10,
      currentIndex: 10,
      originalTargetIndex: 11,
      skippedRows: [],
    });
    expect(decision.shouldReduce).toBe(false);
  });

  test('non-speakable skipped rows are preserved in decision payload', () => {
    const skippedRows = ['8', '9'];
    const decision = shouldReduceBridgeToAdjacentRenderedRow({
      bridgeReducedTarget: 7,
      currentIndex: 6,
      originalTargetIndex: 10,
      skippedRows,
    });
    expect(decision.shouldReduce).toBe(true);
    expect(decision.skippedRows).toEqual(skippedRows);
    expect(decision.renderedDelta).toBe(4);
  });

  test('no reduction when current semantics require full bridge staging or blocking', () => {
    const decision = shouldReduceBridgeToAdjacentRenderedRow({
      bridgeReducedTarget: 14,
      currentIndex: 10,
      originalTargetIndex: 15,
      skippedRows: ['11', '12', '13'],
    });
    expect(decision.shouldReduce).toBe(false);
    expect(decision.reducedTargetIndex).toBeUndefined();
  });

  test('bridge-trap escape path remains separate and unaffected for adjacent reduction helper', () => {
    const decision = shouldReduceBridgeToAdjacentRenderedRow({
      bridgeReducedTarget: 11,
      currentIndex: 10,
      originalTargetIndex: 15,
      skippedRows: ['12'],
    });
    expect(decision.shouldReduce).toBe(true);

    const trapEscape = shouldBlockEquivalentBridgeCommit({
      current: 10,
      requestedTarget: 15,
      semanticTarget: 15,
      commitTs: 1000,
      bridgeBlockUntil: 2000,
      sourceBranch: 'normal',
      reason: 'bridge_trap_escape',
    });
    expect(trapEscape.shouldBlock).toBe(false);
    expect(trapEscape.bridgeTrapEscapePath).toBe(true);
  });
});
