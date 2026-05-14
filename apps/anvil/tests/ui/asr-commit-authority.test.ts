import {
  isRescueBudgetExhausted,
  shouldConstrainRecoveryForReaderLeash,
  shouldAllowBridgeTrapEscape,
  shouldAllowFreshAdjacentFastCommit,
  shouldAllowReaderLeashBypass,
  shouldHoldForVisualGovernor,
} from '../../src/features/asr/asr-commit-authority';

describe('ASR commit authority predicates', () => {
  test('rescue budget exhausted returns same result as current semantics', () => {
    expect(isRescueBudgetExhausted({
      gatePassCore: true,
      rescueBypassLike: true,
      directAdjacentLocalProof: false,
      recentBypassCount: 3,
      bypassBudgetMax: 3,
    })).toBe(true);
  });

  test('reader leash bypass allowed only under current conditions', () => {
    const denied = shouldAllowReaderLeashBypass({
      gatePassCore: true,
      rescueBypassLike: true,
      bypassedBlockersLower: 'asr_reader_leash_hold',
      directAdjacentLocalProof: false,
      freshLandingLexicalNoStale: false,
      lastBypassAgeMs: 100,
      minBypassDelayMs: 1400,
    });
    expect(denied.shouldCheck).toBe(true);
    expect(denied.shouldAllow).toBe(false);

    const allowed = shouldAllowReaderLeashBypass({
      gatePassCore: true,
      rescueBypassLike: true,
      bypassedBlockersLower: 'asr_reader_leash_hold',
      directAdjacentLocalProof: true,
      freshLandingLexicalNoStale: false,
      lastBypassAgeMs: 100,
      minBypassDelayMs: 1400,
    });
    expect(allowed.shouldAllow).toBe(true);
  });

  test('fresh adjacent fast commit eligible only under current adjacent rules', () => {
    const eligible = shouldAllowFreshAdjacentFastCommit({
      reducedTarget: 6,
      current: 5,
      speechFreshNow: true,
      finalPacketFresh: false,
      speechRunningActual: true,
      directAdjacentLocalProof: true,
      proofSourceLower: 'live_strict_local_proof_ok',
    });
    expect(eligible.eligible).toBe(true);

    const notEligible = shouldAllowFreshAdjacentFastCommit({
      reducedTarget: 7,
      current: 5,
      speechFreshNow: true,
      finalPacketFresh: false,
      speechRunningActual: true,
      directAdjacentLocalProof: true,
      proofSourceLower: 'live_strict_local_proof_ok',
    });
    expect(notEligible.eligible).toBe(false);
  });

  test('visual governor semantic hold blocks according to current semantics', () => {
    const held = shouldHoldForVisualGovernor({
      accepted: true,
      liveAsrVisualGovernorHardHold: true,
      reducedTarget: 10,
      current: 9,
      hardContradiction: false,
      requestedTarget: 10,
      liveSpeechFresh: false,
      finalPacketFresh: false,
      noCommitMs: 500,
      freshAdjUnlockNoCommitMs: 2100,
      msSinceLastCommit: 1000,
    });
    expect(held.shouldHold).toBe(true);
    expect(held.shouldUnlock).toBe(false);
  });

  test('visual governor allows fresh adjacent unlock after timeout under hard hold', () => {
    const unlocked = shouldHoldForVisualGovernor({
      accepted: true,
      liveAsrVisualGovernorHardHold: true,
      reducedTarget: 10,
      current: 9,
      hardContradiction: false,
      requestedTarget: 10,
      liveSpeechFresh: true,
      finalPacketFresh: true,
      noCommitMs: 2500,
      freshAdjUnlockNoCommitMs: 2100,
      msSinceLastCommit: 1200,
    });
    expect(unlocked.shouldUnlock).toBe(true);
    expect(unlocked.shouldHold).toBe(false);
  });

  test('visual governor keeps non-adjacent targets blocked under hard hold', () => {
    const held = shouldHoldForVisualGovernor({
      accepted: true,
      liveAsrVisualGovernorHardHold: true,
      reducedTarget: 12,
      current: 9,
      hardContradiction: false,
      requestedTarget: 12,
      liveSpeechFresh: true,
      finalPacketFresh: true,
      noCommitMs: 5000,
      freshAdjUnlockNoCommitMs: 2100,
      msSinceLastCommit: 1200,
    });
    expect(held.shouldUnlock).toBe(false);
    expect(held.shouldHold).toBe(true);
  });

  test('bridge trap escape allowed only when qualifying conditions hold', () => {
    const allowed = shouldAllowBridgeTrapEscape({
      bridgeTrapDetected: true,
      transcriptGrowing: true,
      contradictionActiveEffective: false,
      safeAdjacent: true,
    });
    expect(allowed.shouldAllow).toBe(true);
    expect(allowed.reason).toBe('bridge_trap_escape');
  });

  test('bridge trap escape blocked for explicit off-script/noMatch-like contradiction gate', () => {
    const blocked = shouldAllowBridgeTrapEscape({
      bridgeTrapDetected: true,
      transcriptGrowing: true,
      contradictionActiveEffective: true,
      safeAdjacent: true,
    });
    expect(blocked.shouldAllow).toBe(false);
  });

  test('helper behavior stable for normal non-rescue/non-bridge evidence', () => {
    expect(isRescueBudgetExhausted({
      gatePassCore: true,
      rescueBypassLike: false,
      directAdjacentLocalProof: false,
      recentBypassCount: 99,
      bypassBudgetMax: 3,
    })).toBe(false);
    const bypass = shouldAllowReaderLeashBypass({
      gatePassCore: false,
      rescueBypassLike: false,
      bypassedBlockersLower: 'none',
      directAdjacentLocalProof: false,
      freshLandingLexicalNoStale: false,
      lastBypassAgeMs: Number.POSITIVE_INFINITY,
      minBypassDelayMs: 1400,
    });
    expect(bypass.shouldCheck).toBe(false);
  });

  test('helpers do not mutate input objects', () => {
    const leashInput = {
      gatePassCore: true,
      rescueBypassLike: true,
      bypassedBlockersLower: 'asr_reader_leash_hold',
      directAdjacentLocalProof: false,
      freshLandingLexicalNoStale: false,
      lastBypassAgeMs: 2000,
      minBypassDelayMs: 1400,
    };
    const before = { ...leashInput };
    shouldAllowReaderLeashBypass(leashInput);
    expect(leashInput).toEqual(before);
  });

  test('recovery reader leash constraint engages for bridge-like recovery authority under active leash', () => {
    const decision = shouldConstrainRecoveryForReaderLeash({
      sourceBranch: 'movement_authority_reconcile',
      proofSource: 'starvation_forward_evidence',
      reason: 'stall_recovery_override',
      bypassedBlockers: 'asr_reader_leash_hold',
      readerLeashActive: true,
      current: 27,
      requestedTarget: 30,
      semanticTarget: 30,
      skippedIgnorableLinesCount: 2,
    });
    expect(decision.isRecoveryAuthority).toBe(true);
    expect(decision.isBridgeLike).toBe(true);
    expect(decision.shouldConstrain).toBe(true);
  });

  test('recovery reader leash constraint does not engage for adjacent recovery steps', () => {
    const decision = shouldConstrainRecoveryForReaderLeash({
      sourceBranch: 'movement_authority_reconcile',
      proofSource: 'starvation_forward_evidence',
      reason: 'stall_recovery_override',
      bypassedBlockers: 'asr_reader_leash_hold',
      readerLeashActive: true,
      current: 30,
      requestedTarget: 31,
      semanticTarget: 31,
      skippedIgnorableLinesCount: 0,
    });
    expect(decision.isRecoveryAuthority).toBe(true);
    expect(decision.isBridgeLike).toBe(false);
    expect(decision.shouldConstrain).toBe(false);
  });

  test('recovery reader leash constraint does not engage when leash is inactive', () => {
    const decision = shouldConstrainRecoveryForReaderLeash({
      sourceBranch: 'movement_authority_reconcile',
      proofSource: 'starvation_forward_evidence',
      reason: 'stall_recovery_override',
      bypassedBlockers: 'none',
      readerLeashActive: false,
      current: 27,
      requestedTarget: 30,
      semanticTarget: 30,
      skippedIgnorableLinesCount: 2,
    });
    expect(decision.isRecoveryAuthority).toBe(true);
    expect(decision.isBridgeLike).toBe(true);
    expect(decision.shouldConstrain).toBe(false);
  });
});
