import {
  classifyVisualLead,
  selectLeadAwarePursuitCap,
  shouldHoldBridgeCommitForVisualRecovery,
  selectBridgeVisualComfortCap,
  selectVisualFollowVelocity,
  shouldApplyNormalAdjacentCap,
  shouldHardHoldVisualFollow,
  shouldStopForVisualDeadband,
} from '../../src/features/asr/asr-visual-follow';
import type { DecideStaleRecoveryTargetExpiryInput } from '../../src/features/asr/asr-visual-target-arbitration';
import { decideStaleRecoveryTargetExpiry } from '../../src/features/asr/asr-visual-target-arbitration';

describe('ASR visual follow pure calculations', () => {
  const makeStaleRecoveryInput = (
    overrides: Partial<DecideStaleRecoveryTargetExpiryInput> = {},
  ): DecideStaleRecoveryTargetExpiryInput => ({
    preservedTargetScrollTop: 240,
    preservedTargetSourcePath: 'asr-marker-lock-pocket-recovery',
    previousTargetScrollTop: 240,
    pocketTargetScrollTop: 163,
    currentScrollTop: 205,
    currentLineIdx: 3,
    committedLineIdx: 3,
    nextSpeakableLineIdx: 3,
    visualErrorPx: -42,
    tolerancePx: 17,
    lineHeightPx: 56,
    authorityAction: 'pursue',
    terminalClampActive: false,
    noMatchOrOffscript: false,
    hardContradiction: false,
    stopDeadbandPx: 8,
    ...overrides,
  });

  test('lead within soft threshold allows follow according to current semantics', () => {
    const lead = classifyVisualLead({
      speakableLead: 1,
      renderedLead: 0,
      softLeadStart: 4,
      hardLeadStart: 6,
    });
    expect(lead.ahead).toBe(true);
    expect(lead.leadState).toBe('ahead');
    const hold = shouldHardHoldVisualFollow({
      leadState: lead.leadState,
      markerLeadLines: 1,
      readerDrivingNow: true,
      noSpeechMs: 0,
      noSpeechHoldMs: 2600,
      maxMarkerLeadLines: 6,
      hasRecentFinalTranscript: false,
    });
    expect(hold.shouldHold).toBe(false);
  });

  test('far-ahead visual lead produces hard hold / zero movement cap', () => {
    const lead = classifyVisualLead({
      speakableLead: 6,
      renderedLead: 6,
      softLeadStart: 4,
      hardLeadStart: 6,
    });
    const hold = shouldHardHoldVisualFollow({
      leadState: lead.leadState,
      markerLeadLines: 0,
      readerDrivingNow: true,
      noSpeechMs: 0,
      noSpeechHoldMs: 2600,
      maxMarkerLeadLines: 6,
      hasRecentFinalTranscript: false,
    });
    expect(hold.shouldHold).toBe(true);
    const vel = selectVisualFollowVelocity({
      baseMaxVelForErr: 200,
      liveHardHold: hold.shouldHold,
      ahead: lead.ahead,
      errPx: 300,
      maxPxps: 80,
      comfortablePxps: 35,
      minPxps: 8,
      hardCatchupPx: 220,
      slowZonePx: 80,
      unlockSlowFollowActive: false,
      unlockSlowFollowPxps: 14,
    });
    expect(vel.maxVelForErr).toBe(0);
  });

  test('stop deadband returns no movement when inside existing deadband', () => {
    expect(shouldStopForVisualDeadband({
      errPx: 7,
      liveAsrFollowMode: true,
      stopDeadbandPx: 8,
      deadbandPx: 32,
      allowCreep: false,
    })).toBe(true);
  });

  test('normal adjacent target uses smooth ramp inside slow zone', () => {
    const vel = selectVisualFollowVelocity({
      baseMaxVelForErr: 470,
      liveHardHold: false,
      ahead: false,
      errPx: 20,
      maxPxps: 80,
      comfortablePxps: 35,
      minPxps: 8,
      hardCatchupPx: 220,
      slowZonePx: 80,
      unlockSlowFollowActive: false,
      unlockSlowFollowPxps: 14,
    });
    expect(vel.maxVelForErr).toBeGreaterThan(8);
    expect(vel.maxVelForErr).toBeLessThan(35);
    expect(vel.maxVelForErr).toBeLessThanOrEqual(470);
  });

  test('slow-zone velocity ramps up monotonically with larger error', () => {
    const low = selectVisualFollowVelocity({
      baseMaxVelForErr: 470,
      liveHardHold: false,
      ahead: false,
      errPx: 10,
      maxPxps: 80,
      comfortablePxps: 35,
      minPxps: 8,
      hardCatchupPx: 220,
      slowZonePx: 80,
      unlockSlowFollowActive: false,
      unlockSlowFollowPxps: 14,
    });
    const mid = selectVisualFollowVelocity({
      baseMaxVelForErr: 470,
      liveHardHold: false,
      ahead: false,
      errPx: 40,
      maxPxps: 80,
      comfortablePxps: 35,
      minPxps: 8,
      hardCatchupPx: 220,
      slowZonePx: 80,
      unlockSlowFollowActive: false,
      unlockSlowFollowPxps: 14,
    });
    const high = selectVisualFollowVelocity({
      baseMaxVelForErr: 470,
      liveHardHold: false,
      ahead: false,
      errPx: 70,
      maxPxps: 80,
      comfortablePxps: 35,
      minPxps: 8,
      hardCatchupPx: 220,
      slowZonePx: 80,
      unlockSlowFollowActive: false,
      unlockSlowFollowPxps: 14,
    });
    expect(low.maxVelForErr).toBeGreaterThanOrEqual(8);
    expect(mid.maxVelForErr).toBeGreaterThan(low.maxVelForErr);
    expect(high.maxVelForErr).toBeGreaterThan(mid.maxVelForErr);
    expect(high.maxVelForErr).toBeLessThanOrEqual(35);
  });

  test('adjacent cap decision matches current behavior', () => {
    const decision = shouldApplyNormalAdjacentCap({
      now: 2000,
      boostUntilMs: 3000,
      liveHardHold: false,
      leadState: 'aligned_or_behind',
      errPx: 36,
      minErrPx: 24 * 1.5,
    });
    expect(decision.shouldApply).toBe(true);
  });

  test('hard-hold decision preserves existing reason/payload fields', () => {
    const decision = shouldHardHoldVisualFollow({
      leadState: 'ahead',
      markerLeadLines: 6,
      readerDrivingNow: false,
      noSpeechMs: 3000,
      noSpeechHoldMs: 2600,
      maxMarkerLeadLines: 6,
      hasRecentFinalTranscript: false,
    });
    expect(decision.shouldHold).toBe(true);
    expect(decision.readerPaceHold).toBe(true);
    expect(decision.reason).toBe('reader_pace_hold');
  });

  test('helper behavior is stable for negative/zero defensive inputs', () => {
    const lead = classifyVisualLead({
      speakableLead: -1,
      renderedLead: 0,
      softLeadStart: 4,
      hardLeadStart: 6,
    });
    expect(lead.leadState).toBe('aligned_or_behind');
    expect(shouldStopForVisualDeadband({
      errPx: 0,
      liveAsrFollowMode: false,
      stopDeadbandPx: 8,
      deadbandPx: 32,
      allowCreep: true,
    })).toBe(true);
  });

  test('bridge comfort cap activates only during active comfort window and large delta', () => {
    const capped = selectBridgeVisualComfortCap({
      liveAsrFollowMode: true,
      now: 1000,
      comfortUntilMs: 2000,
      deltaLines: 7.2,
      basePxps: 35,
      maxComfortDeltaLines: 3,
      bridgeComfortPxps: 16,
    });
    expect(capped.shouldApply).toBe(true);
    expect(capped.cappedPxps).toBe(16);

    const noCapAdjacent = selectBridgeVisualComfortCap({
      liveAsrFollowMode: true,
      now: 1000,
      comfortUntilMs: 2000,
      deltaLines: 1.2,
      basePxps: 35,
      maxComfortDeltaLines: 3,
      bridgeComfortPxps: 16,
    });
    expect(noCapAdjacent.shouldApply).toBe(false);
    expect(noCapAdjacent.cappedPxps).toBe(35);

    const noCapOutsideWindow = selectBridgeVisualComfortCap({
      liveAsrFollowMode: true,
      now: 2200,
      comfortUntilMs: 2000,
      deltaLines: 7.2,
      basePxps: 35,
      maxComfortDeltaLines: 3,
      bridgeComfortPxps: 16,
    });
    expect(noCapOutsideWindow.shouldApply).toBe(false);
    expect(noCapOutsideWindow.cappedPxps).toBe(35);
  });

  test('bridge commit comfort leash holds only bridge-like non-adjacent commits during active recovery window', () => {
    const held = shouldHoldBridgeCommitForVisualRecovery({
      liveAsrFollowMode: true,
      now: 1000,
      comfortUntilMs: 2000,
      deltaLines: 8.0,
      safeDeltaLines: 4.0,
      bridgeLikeCommit: true,
      adjacentCommit: false,
      speechFresh: true,
    });
    expect(held.shouldHold).toBe(true);

    const allowAdjacent = shouldHoldBridgeCommitForVisualRecovery({
      liveAsrFollowMode: true,
      now: 1000,
      comfortUntilMs: 2000,
      deltaLines: 8.0,
      safeDeltaLines: 4.0,
      bridgeLikeCommit: true,
      adjacentCommit: true,
      speechFresh: true,
    });
    expect(allowAdjacent.shouldHold).toBe(false);

    const allowInsideBand = shouldHoldBridgeCommitForVisualRecovery({
      liveAsrFollowMode: true,
      now: 1000,
      comfortUntilMs: 2000,
      deltaLines: 2.5,
      safeDeltaLines: 4.0,
      bridgeLikeCommit: true,
      adjacentCommit: false,
      speechFresh: true,
    });
    expect(allowInsideBand.shouldHold).toBe(false);
  });

  test('lead-aware pursuit cap calms aggressive velocity when reader is ahead and speech is fresh', () => {
    const capped = selectLeadAwarePursuitCap({
      leadState: 'ahead',
      speakableLead: 1,
      renderedLead: 1,
      speechFresh: true,
      basePxps: 35,
      aheadCapPxps: 12,
    });
    expect(capped.shouldApply).toBe(true);
    expect(capped.cappedPxps).toBeLessThanOrEqual(12);
    expect(capped.reason).toBe('reader_ahead_visual_pressure_reduced');
  });

  test('lead-aware pursuit cap does not activate when aligned_or_behind with no lead', () => {
    const uncapped = selectLeadAwarePursuitCap({
      leadState: 'aligned_or_behind',
      speakableLead: 0,
      renderedLead: 0,
      speechFresh: true,
      basePxps: 35,
      aheadCapPxps: 12,
    });
    expect(uncapped.shouldApply).toBe(false);
    expect(uncapped.cappedPxps).toBe(35);
  });

  test('lead-aware pursuit stays calm for tiny deltas while ahead', () => {
    const calm = selectLeadAwarePursuitCap({
      leadState: 'ahead',
      speakableLead: 1,
      renderedLead: 0,
      speechFresh: true,
      basePxps: 20,
      aheadCapPxps: 12,
    });
    expect(calm.shouldApply).toBe(true);
    expect(calm.cappedPxps).toBe(12);
  });

  test('expires stale marker-lock recovery target when pocket authority contradicts it', () => {
    const decision = decideStaleRecoveryTargetExpiry(makeStaleRecoveryInput());
    expect(decision.expire).toBe(true);
    expect(decision.reason).toBe('pocket_authority_contradicts_preserved_recovery_target');
    expect(decision.deltaPxToPreservedTarget).toBe(35);
    expect(decision.deltaPxToPocketTarget).toBe(-42);
    expect(decision.contradictionTolerancePx).toBe(28);
  });

  test('does not expire preserved recovery target when pocket authority target agrees with it', () => {
    const decision = decideStaleRecoveryTargetExpiry(makeStaleRecoveryInput({
      pocketTargetScrollTop: 228,
      visualErrorPx: 23,
    }));
    expect(decision.expire).toBe(false);
    expect(decision.reason).toBeNull();
  });

  test('does not expire preserved target during noMatch offscript or contradiction safety holds', () => {
    expect(decideStaleRecoveryTargetExpiry(makeStaleRecoveryInput({
      noMatchOrOffscript: true,
    })).expire).toBe(false);
    expect(decideStaleRecoveryTargetExpiry(makeStaleRecoveryInput({
      hardContradiction: true,
    })).expire).toBe(false);
  });
});
