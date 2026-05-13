import {
  classifyVisualLead,
  selectVisualFollowVelocity,
  shouldApplyNormalAdjacentCap,
  shouldHardHoldVisualFollow,
  shouldStopForVisualDeadband,
} from '../../src/features/asr/asr-visual-follow';

describe('ASR visual follow pure calculations', () => {
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

  test('normal adjacent target gets current minimum responsive pxps behavior', () => {
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
    expect(vel.maxVelForErr).toBe(8);
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
});
