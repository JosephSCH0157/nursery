import {
  decideAsrVisualDebtCatchup,
  evaluateAcceptedLocalLagWindow,
} from '../../src/features/asr/asr-visual-debt-catchup';

describe('ASR visual debt catch-up gate', () => {
  const makeInput = (overrides: Partial<Parameters<typeof decideAsrVisualDebtCatchup>[0]> = {}) => ({
    significantVisualDebtActive: true,
    consecutiveDebtObservations: 2,
    targetLine: 2,
    currentLine: 1,
    committedLine: 1,
    movementAllowed: true,
    targetSafe: true,
    localRescueCandidate: false,
    noMatchOrOffscript: false,
    hardContradiction: false,
    terminalClampActive: false,
    cooldownActive: false,
    markerLockActive: false,
    directWriteBlocked: false,
    targetPreservedForEasing: false,
    errPx: 156,
    existingMoveSufficient: false,
    commitCount: 2,
    postCommitGapMs: 180,
    standardGapMs: 700,
    reducedGapMs: 140,
    ...overrides,
  });

  test('allows visual-only catch-up before the standard 700ms gap for recent local safe debt', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      postCommitGapMs: 180,
      targetLine: 1,
      currentLine: 1,
      committedLine: 1,
    }));

    expect(decision.allowed).toBe(true);
    expect(decision.decisionReason).toBe('visual_only_recent_safe_commit_allowed');
    expect(decision.requiredGapMs).toBe(140);
    expect(decision.reducedGapEligible).toBe(true);
  });

  test('still blocks during the reduced gap window when the recent-safe proof is too fresh', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      postCommitGapMs: 96,
      targetLine: 1,
      currentLine: 1,
      committedLine: 1,
    }));

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe('awaiting_commit_gap_window');
    expect(decision.requiredGapMs).toBe(140);
    expect(decision.reducedGapEligible).toBe(true);
  });

  test('allows persistent locally safe debt to break out of the post-commit gap hold', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      consecutiveDebtObservations: 5,
      postCommitGapMs: 7,
      targetLine: 1,
      currentLine: 1,
      committedLine: 1,
    }));

    expect(decision.allowed).toBe(true);
    expect(decision.decisionReason).toBe('persistent_safe_visual_debt_override');
    expect(decision.requiredGapMs).toBe(140);
    expect(decision.reducedGapEligible).toBe(true);
  });

  test('still blocks no-match or off-script cases', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      noMatchOrOffscript: true,
      postCommitGapMs: 250,
    }));

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe('no_match_or_offscript');
  });

  test('still blocks far target movement', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      targetLine: 4,
      currentLine: 1,
      committedLine: 1,
      postCommitGapMs: 250,
    }));

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe('far_target');
  });

  test('still blocks terminal clamp cases', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      terminalClampActive: true,
      postCommitGapMs: 250,
    }));

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe('terminal_clamp');
  });

  test('current-line bounded catch-up stays recent-safe eligible for the lease-style unsafe-target failure shape', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      currentLine: 30,
      committedLine: 30,
      targetLine: 30,
      consecutiveDebtObservations: 4,
      postCommitGapMs: 180,
    }));

    expect(decision.allowed).toBe(true);
    expect(decision.decisionReason).toBe('visual_only_recent_safe_commit_allowed');
    expect(decision.reducedGapEligible).toBe(true);
  });

  test('current-line bounded catch-up still blocks when canonical target safety is false', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      currentLine: 30,
      committedLine: 30,
      targetLine: 30,
      consecutiveDebtObservations: 4,
      postCommitGapMs: 180,
      targetSafe: false,
    }));

    expect(decision.allowed).toBe(false);
    expect(decision.reducedGapEligible).toBe(false);
    expect(decision.blockedReason).toBe('unsafe_target');
  });

  test('owner-active low-pocket debt reports awaiting_local_rescue before falling back to generic unsafe_target', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      currentLine: 4,
      committedLine: 4,
      targetLine: 4,
      targetSafe: false,
      localRescueCandidate: true,
      consecutiveDebtObservations: 2,
      postCommitGapMs: 1721,
      errPx: 192,
    }));

    expect(decision.allowed).toBe(false);
    expect(decision.blockedReason).toBe('awaiting_local_rescue');
  });

  test('owner-active local rescue can break starvation-shaped cooldown once debt is persistent', () => {
    const decision = decideAsrVisualDebtCatchup(makeInput({
      currentLine: 6,
      committedLine: 6,
      targetLine: 6,
      targetSafe: true,
      localRescueCandidate: true,
      cooldownActive: true,
      consecutiveDebtObservations: 5,
      postCommitGapMs: 597,
      errPx: 160,
    }));

    expect(decision.allowed).toBe(true);
    expect(decision.decisionReason).toBe('persistent_local_rescue_override');
  });

  test('accepted local lag window treats FO-style local ordering drift as coherent enough', () => {
    const result = evaluateAcceptedLocalLagWindow({
      currentLine: 155,
      committedLine: 157,
      acceptedLine: 156,
      targetLine: 156,
      nextSpeakableLine: 157,
      localWindowLines: 3,
    });

    expect(result.withinLocalWindow).toBe(true);
    expect(result.lineDeltaCurrentToCommitted).toBe(2);
    expect(result.lineDeltaCurrentToTarget).toBe(1);
    expect(result.lineDeltaCommittedToTarget).toBe(-1);
    expect(result.maxSemanticDistance).toBe(2);
  });

  test('accepted local lag window still rejects true far semantic jumps', () => {
    const result = evaluateAcceptedLocalLagWindow({
      currentLine: 155,
      committedLine: 157,
      acceptedLine: 160,
      targetLine: 160,
      nextSpeakableLine: 160,
      localWindowLines: 3,
    });

    expect(result.withinLocalWindow).toBe(false);
    expect(result.maxSemanticDistance).toBe(5);
  });
});
