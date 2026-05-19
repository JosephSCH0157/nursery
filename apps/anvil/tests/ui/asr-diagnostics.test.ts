import {
  ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
  ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
  buildAsrAlignmentEpisodeDumpPathProofDiagnostic,
  buildAsrHudNoTargetDetail,
  buildAsrAudioChunkStaleDiagnostic,
  buildAsrBridgeTrapDetectedDiagnostic,
  buildAsrBackendHeartbeatDiagnostic,
  buildAsrBackendRestartCompletedDiagnostic,
  buildAsrBackendRestartRequestedDiagnostic,
  buildAsrBottomLockGeometryDiagnostic,
  buildAsrDelayedSuppressionAutopsyDiagnostic,
  buildAsrDiagnosticBundleProofDiagnostic,
  buildAsrEarlyBridgeTrapReleasedDiagnostic,
  buildAsrMarkerErrorHoldBandRejectedDiagnostic,
  buildAsrMarkerErrorLowerRailRejectedDiagnostic,
  buildAsrOptionalDiagnosticErrorDiagnostic,
  buildAsrVisualGovernorDeadScreenAutopsyDiagnostic,
  buildAsrVisualGovernorDeadScreenEscapeBlockedDiagnostic,
  buildAsrVisualGovernorDeadScreenEscapeCommitDiagnostic,
  buildAsrAdjacentRecoveryCatchupAllowedDiagnostic,
  buildAsrAdjacentRecoveryCatchupBlockedDiagnostic,
  buildAsrVisualRecoveryBoostAppliedDiagnostic,
  buildAsrVisualRecoveryBoostBlockedDiagnostic,
  buildAsrScrollAuthorityConflictDiagnostic,
  buildAsrScrollAuthoritySelectedDiagnostic,
  buildAsrVisualMarkerErrorCorrectionDiagnostic,
  buildAsrBackendTranscriptStaleDiagnostic,
  buildProofOwnedPrimaryCommitGuardBaseParts,
  buildRecoverySkipNonAdjacentTargetGuardBaseParts,
} from '../../src/features/asr/asr-diagnostics';
import {
  decideAsrVisualGovernorDeadScreenEscape,
  decideAsrAdjacentRecoveryCatchup,
  decideAsrVisualRecoveryBoost,
  shouldEmitAsrVisualGovernorDeadScreenAutopsy,
} from '../../src/features/asr/asr-diagnostic-gates';

describe('ASR backend liveness diagnostics builders', () => {
  test('builds backend heartbeat diagnostic with expected tag and fields', () => {
    const line = buildAsrBackendHeartbeatDiagnostic({
      recognizerAttached: true,
      speechActive: false,
      activeReadMode: true,
      transcriptAgeMs: Number.NaN,
      audioAgeMs: 1234.7,
      backendRestartedInWindow: false,
    });
    expect(line).toContain('[ASR_BACKEND_HEARTBEAT]');
    expect(line).toContain('live=1');
    expect(line).toContain('asrArmed=1');
    expect(line).toContain('recognizerAttached=1');
    expect(line).toContain('speechActive=0');
    expect(line).toContain('activeReadMode=1');
    expect(line).toContain('transcriptAgeMs=-1');
    expect(line).toContain('audioAgeMs=1235');
    expect(line).toContain('restartedInWindow=0');
  });

  test('builds backend transcript stale diagnostic with expected tag and field order pattern', () => {
    const line = buildAsrBackendTranscriptStaleDiagnostic({
      ageMs: Number.POSITIVE_INFINITY,
      thresholdMs: 9000,
      recognizerAttached: true,
      speechActive: true,
      activeReadMode: true,
    });
    expect(line).toBe(
      '[ASR_BACKEND_TRANSCRIPT_STALE] ageMs=Infinity thresholdMs=9000 recognizerAttached=1 speechActive=1 activeReadMode=1',
    );
  });

  test('builds audio chunk stale diagnostic with expected tag and fields', () => {
    const line = buildAsrAudioChunkStaleDiagnostic({
      ageMs: 9001.2,
      thresholdMs: 7000,
      recognizerAttached: false,
      speechActive: true,
    });
    expect(line).toBe(
      '[ASR_AUDIO_CHUNK_STALE] ageMs=9001 thresholdMs=7000 recognizerAttached=0 speechActive=1',
    );
  });

  test('builds restart requested diagnostics for all current variants', () => {
    const alreadyRestarted = buildAsrBackendRestartRequestedDiagnostic({
      skipped: 1,
      reason: 'backend_transcript_starvation',
      skipReason: 'already_restarted_in_window',
      windowMs: 30000,
      transcriptAgeMs: Number.POSITIVE_INFINITY,
      audioAgeMs: 123.4,
    });
    expect(alreadyRestarted).toBe(
      '[ASR_BACKEND_RESTART_REQUESTED] skipped=1 reason=backend_transcript_starvation skipReason=already_restarted_in_window windowMs=30000 transcriptAgeMs=Infinity audioAgeMs=123',
    );

    const controlsUnavailable = buildAsrBackendRestartRequestedDiagnostic({
      skipped: 1,
      reason: 'backend_transcript_starvation',
      skipReason: 'recognizer_controls_unavailable',
      transcriptAgeMs: 9000.4,
      audioAgeMs: Number.POSITIVE_INFINITY,
    });
    expect(controlsUnavailable).toBe(
      '[ASR_BACKEND_RESTART_REQUESTED] skipped=1 reason=backend_transcript_starvation skipReason=recognizer_controls_unavailable transcriptAgeMs=9000 audioAgeMs=Infinity',
    );

    const requested = buildAsrBackendRestartRequestedDiagnostic({
      skipped: 0,
      reason: 'backend_transcript_starvation',
      transcriptAgeMs: 9000.4,
      audioAgeMs: 1000.5,
      current: 12,
    });
    expect(requested).toBe(
      '[ASR_BACKEND_RESTART_REQUESTED] skipped=0 reason=backend_transcript_starvation transcriptAgeMs=9000 audioAgeMs=1001 current=12',
    );
  });

  test('builds restart completed diagnostic with expected tag and fields', () => {
    const line = buildAsrBackendRestartCompletedDiagnostic({
      reason: 'backend_transcript_starvation',
      current: 7,
      commitIndex: 6,
      scrollTop: 432.8,
    });
    expect(line).toBe(
      '[ASR_BACKEND_RESTART_COMPLETED] reason=backend_transcript_starvation current=7 commitIndex=6 scrollTop=433',
    );
  });

  test('builds bridge trap detected diagnostic with expected tag and field pattern', () => {
    const line = buildAsrBridgeTrapDetectedDiagnostic({
      current: 11,
      bestIdx: 14,
      requestedTarget: 15,
      adjacentTarget: 12,
      skipped: '[cue,meta]',
      repeatedHoldCount: 4,
      noCommitMs: 3550.2,
      proofSource: 'strict_bridge_landing_lexical_tail',
      textPreview: 'preview text',
    });
    expect(line).toBe(
      '[ASR_BRIDGE_TRAP_DETECTED] current=11 bestIdx=14 requestedTarget=15 adjacentTarget=12 skipped=[cue,meta] repeatedHoldCount=4 noCommitMs=3550 blockerReason=bridge_or_non_adjacent_guard proofSource=strict_bridge_landing_lexical_tail textPreview="preview text"',
    );
  });

  test('builds proof-owned primary commit guard base parts with expected fields/order', () => {
    const parts = buildProofOwnedPrimaryCommitGuardBaseParts({
      current: 3,
      target: 5,
      bestIdx: 6,
      proofSource: 'live_strict_local_proof_ok',
      skippedIgnorableLines: ['cue', 'blank'],
    });
    expect(parts).toEqual([
      'current=3',
      'target=5',
      'bestIdx=6',
      'proofSource=live_strict_local_proof_ok',
      'skippedIgnorableLines=[cue,blank]',
    ]);
  });

  test('proof-owned primary guard base parts preserves empty skipped list behavior', () => {
    const parts = buildProofOwnedPrimaryCommitGuardBaseParts({
      current: 1,
      target: 2,
      bestIdx: 2,
      proofSource: 'short_fragment_adjacent_progression',
      skippedIgnorableLines: [],
    });
    expect(parts[4]).toBe('skippedIgnorableLines=[]');
  });

  test('proof-owned primary guard base parts builder is pure and does not mutate input', () => {
    const input = {
      current: 9,
      target: 10,
      bestIdx: 10,
      proofSource: 'strict_speakable_bridge_landing',
      skippedIgnorableLines: ['cue'],
    };
    const before = [...input.skippedIgnorableLines];
    const parts = buildProofOwnedPrimaryCommitGuardBaseParts(input);
    expect(input.skippedIgnorableLines).toEqual(before);
    expect(parts).not.toBe(input.skippedIgnorableLines);
  });

  test('builds recovery skip non-adjacent target guard base parts with expected fields/order', () => {
    const parts = buildRecoverySkipNonAdjacentTargetGuardBaseParts({
      current: 4,
      requested: 10,
      adjacentTarget: 5,
      sourceBranch: 'soft_runtime_rebase',
    });
    expect(parts).toEqual([
      'current=4',
      'requested=10',
      'adjacentTarget=5',
      'sourceBranch=soft_runtime_rebase',
    ]);
  });

  test('recovery skip non-adjacent target guard base parts preserves optional-like source values', () => {
    const parts = buildRecoverySkipNonAdjacentTargetGuardBaseParts({
      current: 7,
      requested: 9,
      adjacentTarget: 8,
      sourceBranch: 'unknown',
    });
    expect(parts[3]).toBe('sourceBranch=unknown');
  });

  test('recovery skip non-adjacent target builder is pure and does not mutate input', () => {
    const input = {
      current: 3,
      requested: 11,
      adjacentTarget: 4,
      sourceBranch: 'pending-cap-bypass-precap',
    };
    const before = { ...input };
    const parts = buildRecoverySkipNonAdjacentTargetGuardBaseParts(input);
    expect(input).toEqual(before);
    expect(parts).toEqual([
      'current=3',
      'requested=11',
      'adjacentTarget=4',
      'sourceBranch=pending-cap-bypass-precap',
    ]);
  });

  test('builds no_target HUD detail with expected fields and values', () => {
    const detail = buildAsrHudNoTargetDetail({
      line: 22,
      delta: 3,
      simRaw: 0.67891,
      reasons: 'dom_miss|clamp',
      domLines: 120,
      marker: 19,
      retry: 2,
      matchId: 'm-123',
    });
    expect(detail).toEqual({
      line: 22,
      delta: 3,
      sim: 0.679,
      reasons: 'dom_miss|clamp',
      domLines: 120,
      marker: 19,
      retry: 2,
      matchId: 'm-123',
    });
  });

  test('no_target HUD detail sim handling matches finite behavior', () => {
    const detail = buildAsrHudNoTargetDetail({
      line: 1,
      delta: 1,
      simRaw: 0.1 + 0.2,
      reasons: 'x',
      domLines: 1,
      marker: 1,
      retry: 0,
      matchId: 'id',
    });
    expect(detail.sim).toBe(0.3);
  });

  test('no_target HUD detail sim handling matches non-finite behavior', () => {
    const inf = buildAsrHudNoTargetDetail({
      line: 1,
      delta: 1,
      simRaw: Number.POSITIVE_INFINITY,
      reasons: 'x',
      domLines: 1,
      marker: 1,
      retry: 0,
      matchId: 'id',
    });
    expect(inf.sim).toBe(Number.POSITIVE_INFINITY);

    const nan = buildAsrHudNoTargetDetail({
      line: 1,
      delta: 1,
      simRaw: Number.NaN,
      reasons: 'x',
      domLines: 1,
      marker: 1,
      retry: 0,
      matchId: 'id',
    });
    expect(Number.isNaN(nan.sim)).toBe(true);
  });

  test('no_target HUD detail builder is pure and does not mutate input', () => {
    const input = {
      line: 3,
      delta: 2,
      simRaw: 0.5555,
      reasons: 'chain',
      domLines: 90,
      marker: 2,
      retry: 1,
      matchId: 'm',
    };
    const before = { ...input };
    const detail = buildAsrHudNoTargetDetail(input);
    expect(input).toEqual(before);
    expect(detail).toEqual({
      line: 3,
      delta: 2,
      sim: 0.555,
      reasons: 'chain',
      domLines: 90,
      marker: 2,
      retry: 1,
      matchId: 'm',
    });
  });

  test('builds bottom-lock geometry diagnostic with expected fields', () => {
    const line = buildAsrBottomLockGeometryDiagnostic({
      markerY: 390.4,
      currentLineY: 489.9,
      nextSpeakableLineY: 514.2,
      preferredBandTop: 300.2,
      preferredSettleBottom: 430.7,
      preferredBandBottom: 450.1,
      toleratedBandBottom: 490.9,
      currentScrollTop: 220.4,
      targetScrollTop: 260.1,
      scrollTopBefore: 200.2,
      scrollTopAfter: 220.4,
      pocketZone: 'bottom',
      lastAction: 'snap_suppressed',
      lastComfortReason: 'next_line_within_preferred_pocket',
      lastVisualTargetDeltaPx: -1,
      lastVisualVelocityPxps: -1,
      snapSuppressedInEpisode: true,
      reasonChain: 'live_target_follow_motor|snap_suppressed',
      deltaLinesSamples: '1.50|0.75',
    });
    expect(line).toBe(
      '[ASR_BOTTOM_LOCK_GEOMETRY_DIAG] markerY=390 currentLineY=490 nextSpeakableLineY=514 preferredBandTop=300 preferredSettleBottom=431 preferredBandBottom=450 toleratedBandBottom=491 currentScrollTop=220 targetScrollTop=260 scrollTopBefore=200 scrollTopAfter=220 pocketZone=bottom lastAction=snap_suppressed lastComfortReason=next_line_within_preferred_pocket lastVisualTargetDeltaPx=-1 lastVisualVelocityPxps=-1 snapSuppressedInEpisode=1 reasonChain=live_target_follow_motor|snap_suppressed deltaLinesSamples=1.50|0.75',
    );
  });

  test('builds bottom-lock geometry diagnostic with default sentinel mirrors', () => {
    const line = buildAsrBottomLockGeometryDiagnostic({
      markerY: -1,
      currentLineY: -1,
      nextSpeakableLineY: -1,
      preferredBandTop: -1,
      preferredSettleBottom: -1,
      preferredBandBottom: -1,
      toleratedBandBottom: -1,
      currentScrollTop: -1,
      targetScrollTop: -1,
      scrollTopBefore: -1,
      scrollTopAfter: -1,
      pocketZone: 'unknown',
      lastAction: 'none',
      lastComfortReason: 'none',
      lastVisualTargetDeltaPx: -1,
      lastVisualVelocityPxps: -1,
      snapSuppressedInEpisode: false,
      reasonChain: 'none',
      deltaLinesSamples: 'none',
    });
    expect(line).toContain('lastAction=none');
    expect(line).toContain('lastComfortReason=none');
    expect(line).toContain('lastVisualTargetDeltaPx=-1');
    expect(line).toContain('lastVisualVelocityPxps=-1');
    expect(line).toContain('snapSuppressedInEpisode=0');
  });

  test('builds marker error correction diagnostic with expected fields', () => {
    const line = buildAsrVisualMarkerErrorCorrectionDiagnostic({
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 9,
      markerY: 390.4,
      actualNextSpeakableLineY: 490.4,
      desiredLineY: 420.1,
      desiredReadAheadPx: 30.2,
      visualErrorPx: 70.3,
      tolerancePx: 8.1,
      currentScrollTop: 220.4,
      targetScrollTop: 290.7,
      action: 'pursue',
      reason: 'marker_error_line_too_low',
    });
    expect(line).toBe(
      '[ASR_VISUAL_MARKER_ERROR_CORRECTION] currentLineIdx=8 committedLineIdx=8 nextSpeakableLineIdx=9 markerY=390 actualNextSpeakableLineY=490 desiredLineY=420 desiredReadAheadPx=30 visualErrorPx=70 tolerancePx=8 currentScrollTop=220 targetScrollTop=291 action=pursue reason=marker_error_line_too_low',
    );
  });

  test('builds early bridge trap released diagnostic with expected fields', () => {
    const line = buildAsrEarlyBridgeTrapReleasedDiagnostic({
      current: 4,
      requestedTarget: 6,
      commitTarget: 6,
      skippedIgnorableLines: ['blank', 'cue'],
      repeatedHoldCount: 3,
      noCommitMs: 16993.4,
      runAgeMs: 24024.2,
      pendingBridgeAgeMs: 2200.8,
      proofSource: 'landing_lexical',
      finalPacketFresh: true,
      transcriptGrowing: true,
      targetViewportState: 'bottom',
      reason: 'pending_bridge_completion_overdue',
    });
    expect(line).toBe(
      '[ASR_EARLY_BRIDGE_TRAP_RELEASED] current=4 requestedTarget=6 commitTarget=6 skippedIgnorableLines=[blank,cue] repeatedHoldCount=3 noCommitMs=16993 runAgeMs=24024 pendingBridgeAgeMs=2201 proofSource=landing_lexical finalPacketFresh=1 transcriptGrowing=1 targetViewportState=bottom reason=pending_bridge_completion_overdue',
    );
  });

  test('builds lower rail rejected diagnostic with expected fields', () => {
    const line = buildAsrMarkerErrorLowerRailRejectedDiagnostic({
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 9,
      markerY: 390.4,
      actualNextSpeakableLineY: 486.8,
      desiredLineY: 467.2,
      visualErrorPx: 19.6,
      tolerancePx: 20.1,
      pocketZone: 'bottom',
      preferredBandTop: 424.3,
      preferredSettleBottom: 492.1,
      preferredBandBottom: 526.2,
      holdSafeBottomY: 487.0,
      currentScrollTop: 220.4,
      targetScrollTop: 239.6,
      snapSuppressedInEpisode: true,
      reason: 'within_tolerance_but_bottom_zone',
    });
    expect(line).toBe(
      '[ASR_MARKER_ERROR_LOWER_RAIL_REJECTED] currentLineIdx=8 committedLineIdx=8 nextSpeakableLineIdx=9 markerY=390 actualNextSpeakableLineY=487 desiredLineY=467 visualErrorPx=20 tolerancePx=20 pocketZone=bottom preferredBandTop=424 preferredSettleBottom=492 preferredBandBottom=526 holdSafeBottomY=487 currentScrollTop=220 targetScrollTop=240 snapSuppressedInEpisode=1 reason=within_tolerance_but_bottom_zone',
    );
  });

  test('builds hold band rejected diagnostic with expected fields', () => {
    const line = buildAsrMarkerErrorHoldBandRejectedDiagnostic({
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 9,
      markerY: 390.4,
      actualNextSpeakableLineY: 484.8,
      desiredLineY: 467.2,
      visualErrorPx: 17.4,
      tolerancePx: 20.1,
      holdTolerancePx: 12.0,
      pocketZone: 'pocket',
      currentScrollTop: 220.4,
      targetScrollTop: 237.6,
      reason: 'within_correction_tolerance_but_outside_hold_tolerance',
    });
    expect(line).toBe(
      '[ASR_MARKER_ERROR_HOLD_BAND_REJECTED] currentLineIdx=8 committedLineIdx=8 nextSpeakableLineIdx=9 markerY=390 actualNextSpeakableLineY=485 desiredLineY=467 visualErrorPx=17 tolerancePx=20 holdTolerancePx=12 pocketZone=pocket currentScrollTop=220 targetScrollTop=238 reason=within_correction_tolerance_but_outside_hold_tolerance',
    );
  });

  test('builds scroll authority selected diagnostic with expected fields', () => {
    const line = buildAsrScrollAuthoritySelectedDiagnostic({
      tickId: 42,
      currentLineIdx: 8,
      committedLineIdx: 8,
      nextSpeakableLineIdx: 9,
      selectedAuthority: 'comfort_nudge',
      candidateAuthorities: ['comfort_nudge'],
      beforeScrollTop: 220.4,
      targetScrollTop: 239.6,
      afterScrollTop: 226.2,
      reason: 'outside_preferred_within_tolerated',
    });
    expect(line).toBe(
      '[ASR_SCROLL_AUTHORITY_SELECTED] tickId=42 currentLineIdx=8 committedLineIdx=8 nextSpeakableLineIdx=9 selectedAuthority=comfort_nudge candidateAuthorities=[comfort_nudge] beforeScrollTop=220 targetScrollTop=240 afterScrollTop=226 reason=outside_preferred_within_tolerated',
    );
  });

  test('builds scroll authority conflict diagnostic with expected fields', () => {
    const line = buildAsrScrollAuthorityConflictDiagnostic({
      tickId: 42,
      authorities: ['preferred_lower_rail_release', 'comfort_nudge'],
      beforeScrollTop: 220.4,
      intermediateScrollTop: 239.6,
      finalScrollTop: 226.2,
      currentLineIdx: 8,
      nextSpeakableLineIdx: 9,
      reason: 'multiple_live_scroll_authorities_observed',
    });
    expect(line).toBe(
      '[ASR_SCROLL_AUTHORITY_CONFLICT] tickId=42 authorities=[preferred_lower_rail_release,comfort_nudge] beforeScrollTop=220 intermediateScrollTop=240 finalScrollTop=226 currentLineIdx=8 nextSpeakableLineIdx=9 reason=multiple_live_scroll_authorities_observed',
    );
  });

  test('builds delayed suppression autopsy diagnostic with expected fields', () => {
    const line = buildAsrDelayedSuppressionAutopsyDiagnostic({
      episodeId: 'ae-22',
      runKey: 'run-1',
      runGeneration: 7,
      currentLineIdx: 23,
      committedLineIdx: 23,
      requestedTargetIdx: 25,
      acceptedCommitTargetIdx: 24,
      nextSpeakableLineIdx: 25,
      visualOutcome: 'delayed_until_starvation',
      reasonChain: 'movement_authority_commit|asr_recovery_chain_blocked|live_asr_marker_lock_suppressed|superseded_by_new_commit',
      actions: 'snap_suppressed',
      stallDelayMs: 2065,
      settleMs: 2060,
      speechActive: true,
      transcriptAgeMs: 841,
      audioAgeMs: 634,
      finalPacketFresh: true,
      transcriptGrowing: false,
      lastGuardReason: 'asr_recovery_chain_blocked',
      lastHudGuardText: 'Hold: waiting for direct adjacent ASR match',
      lastSelectedAuthority: 'comfort_nudge',
      lastVisualAction: 'snap_suppressed',
      lastVisualErrorPx: 17,
      markerY: 390,
      actualNextSpeakableLineY: 482,
      desiredLineY: 467,
      tolerancePx: 20,
      holdTolerancePx: 12,
      currentScrollTop: 1702,
      targetScrollTop: 1791,
      deltaLinesSamples: 'none',
      snapSuppressedInEpisode: true,
      supersededByNewCommit: true,
      blockerCategory: 'recovery_chain_blocked',
    });
    expect(line).toBe(
      '[ASR_DELAYED_SUPPRESSION_AUTOPSY] episodeId=ae-22 runKey=run-1 runGeneration=7 currentLineIdx=23 committedLineIdx=23 requestedTargetIdx=25 acceptedCommitTargetIdx=24 nextSpeakableLineIdx=25 visualOutcome=delayed_until_starvation reasonChain=movement_authority_commit|asr_recovery_chain_blocked|live_asr_marker_lock_suppressed|superseded_by_new_commit actions=snap_suppressed stallDelayMs=2065 settleMs=2060 speechActive=1 transcriptAgeMs=841 audioAgeMs=634 finalPacketFresh=1 transcriptGrowing=0 lastGuardReason=asr_recovery_chain_blocked lastHudGuardText=Hold: waiting for direct adjacent ASR match lastSelectedAuthority=comfort_nudge lastVisualAction=snap_suppressed lastVisualErrorPx=17 markerY=390 actualNextSpeakableLineY=482 desiredLineY=467 tolerancePx=20 holdTolerancePx=12 currentScrollTop=1702 targetScrollTop=1791 deltaLinesSamples=none snapSuppressedInEpisode=1 supersededByNewCommit=1 blockerCategory=recovery_chain_blocked',
    );
  });

  test('builds visual governor dead-screen autopsy diagnostic with expected fields', () => {
    const line = buildAsrVisualGovernorDeadScreenAutopsyDiagnostic({
      currentLineIdx: 53,
      committedLineIdx: 53,
      requestedTargetIdx: 54,
      bestIdx: 54,
      acceptedCommitTargetIdx: 54,
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      currentScrollTop: 3655,
      targetScrollTop: 3875,
      moved: 0,
      deltaLines: 5.95,
      speakableLead: 6,
      renderedLead: 7,
      governorHoldAgeMs: 5147,
      noCommitMs: 5158,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      speechActive: true,
      transcriptAgeMs: 639,
      audioAgeMs: 639,
      lastSelectedAuthority: 'pocket_authority',
      lastGuardReason: 'movement_authority_resolved',
      lastHudGuardText: 'Hold: waiting for direct adjacent ASR match',
      lastVisualAction: 'pursue',
      lastVisualErrorPx: 143,
      finalCommitEligible: true,
      terminalCommitSuppressedByVisualGovernor: true,
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 12,
      hardHoldTickCountInWindow: 18,
      deadScreenRebaseCountInWindow: 2,
    });
    expect(line).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY] currentLineIdx=53 committedLineIdx=53 requestedTargetIdx=54 bestIdx=54 acceptedCommitTargetIdx=54 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof currentScrollTop=3655 targetScrollTop=3875 moved=0 deltaLines=5.95 speakableLead=6 renderedLead=7 governorHoldAgeMs=5147 noCommitMs=5158 speechFresh=1 finalPacketFresh=1 liveSpeechFresh=1 speechActive=1 transcriptAgeMs=639 audioAgeMs=639 lastSelectedAuthority=pocket_authority lastGuardReason=movement_authority_resolved lastHudGuardText=Hold: waiting for direct adjacent ASR match lastVisualAction=pursue lastVisualErrorPx=143 finalCommitEligible=1 terminalCommitSuppressedByVisualGovernor=1 freshAdjacentUnlockSeen=1 suppressedForwardProofCountInWindow=12 hardHoldTickCountInWindow=18 deadScreenRebaseCountInWindow=2',
    );
  });

  test('builds visual governor dead-screen escape commit diagnostic with expected fields', () => {
    const line = buildAsrVisualGovernorDeadScreenEscapeCommitDiagnostic({
      currentLineIdx: 109,
      committedLineIdx: 109,
      requestedTargetIdx: 110,
      acceptedCommitTargetIdx: 110,
      bestIdx: 111,
      proofSource: 'adjacent_rescue_proofed',
      sourceBranch: 'movement_authority_forced_reconcile_single_step',
      currentScrollTop: 7687,
      targetScrollTop: 7906,
      moved: 0,
      deltaLines: 3.12,
      governorHoldAgeMs: 5675,
      noCommitMs: 5687,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      freshAdjacentUnlockSeen: true,
      terminalCommitSuppressedByVisualGovernor: true,
      reason: 'bounded_adjacent_dead_screen_escape',
    });
    expect(line).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_ESCAPE_COMMIT] currentLineIdx=109 committedLineIdx=109 requestedTargetIdx=110 acceptedCommitTargetIdx=110 bestIdx=111 proofSource=adjacent_rescue_proofed sourceBranch=movement_authority_forced_reconcile_single_step currentScrollTop=7687 targetScrollTop=7906 moved=0 deltaLines=3.12 governorHoldAgeMs=5675 noCommitMs=5687 speechFresh=1 finalPacketFresh=1 liveSpeechFresh=1 freshAdjacentUnlockSeen=1 terminalCommitSuppressedByVisualGovernor=1 reason=bounded_adjacent_dead_screen_escape',
    );
  });

  test('builds visual governor dead-screen escape blocked diagnostic with expected fields', () => {
    const line = buildAsrVisualGovernorDeadScreenEscapeBlockedDiagnostic({
      currentLineIdx: 109,
      committedLineIdx: 109,
      requestedTargetIdx: 111,
      acceptedCommitTargetIdx: 111,
      bestIdx: 111,
      proofSource: 'adjacent_rescue_proofed',
      sourceBranch: 'movement_authority_forced_reconcile_single_step',
      currentScrollTop: 7687,
      targetScrollTop: 7906,
      moved: 0,
      deltaLines: 3.12,
      governorHoldAgeMs: 5675,
      noCommitMs: 5687,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      freshAdjacentUnlockSeen: true,
      terminalCommitSuppressedByVisualGovernor: false,
      reason: 'target_not_adjacent',
    });
    expect(line).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_ESCAPE_BLOCKED] currentLineIdx=109 committedLineIdx=109 requestedTargetIdx=111 acceptedCommitTargetIdx=111 bestIdx=111 proofSource=adjacent_rescue_proofed sourceBranch=movement_authority_forced_reconcile_single_step currentScrollTop=7687 targetScrollTop=7906 moved=0 deltaLines=3.12 governorHoldAgeMs=5675 noCommitMs=5687 speechFresh=1 finalPacketFresh=1 liveSpeechFresh=1 freshAdjacentUnlockSeen=1 terminalCommitSuppressedByVisualGovernor=0 reason=target_not_adjacent',
    );
  });

  test('builds adjacent recovery catchup allowed diagnostic with expected fields', () => {
    const line = buildAsrAdjacentRecoveryCatchupAllowedDiagnostic({
      currentLineIdx: 23,
      committedLineIdx: 23,
      requestedTargetIdx: 25,
      commitTargetIdx: 24,
      nextSpeakableLineIdx: 24,
      currentScrollTop: 1702.4,
      targetScrollTop: 1791.4,
      visualErrorPx: 11.2,
      boundedVisualTolerancePx: 12,
      pocketZone: 'pocket',
      nextSpeakableLineY: 478.1,
      preferredBandBottom: 467.2,
      finalPacketFresh: true,
      audioBackendFresh: true,
      reason: 'bounded_adjacent_recovery_catchup',
    });
    expect(line).toBe(
      '[ASR_ADJACENT_RECOVERY_CATCHUP_ALLOWED] currentLineIdx=23 committedLineIdx=23 requestedTargetIdx=25 commitTargetIdx=24 nextSpeakableLineIdx=24 currentScrollTop=1702 targetScrollTop=1791 visualErrorPx=11 boundedVisualTolerancePx=12 pocketZone=pocket nextSpeakableLineY=478 preferredBandBottom=467 finalPacketFresh=1 audioBackendFresh=1 reason=bounded_adjacent_recovery_catchup',
    );
  });

  test('builds adjacent recovery catchup blocked diagnostic with expected fields', () => {
    const line = buildAsrAdjacentRecoveryCatchupBlockedDiagnostic({
      currentLineIdx: 23,
      committedLineIdx: 23,
      requestedTargetIdx: 25,
      commitTargetIdx: 24,
      nextSpeakableLineIdx: 24,
      currentScrollTop: 1702.4,
      targetScrollTop: 1791.4,
      visualErrorPx: 17.2,
      boundedVisualTolerancePx: 12,
      pocketZone: 'pocket',
      nextSpeakableLineY: 462.1,
      preferredBandBottom: 467.2,
      finalPacketFresh: true,
      audioBackendFresh: true,
      reason: 'not_low_enough',
    });
    expect(line).toBe(
      '[ASR_ADJACENT_RECOVERY_CATCHUP_BLOCKED] currentLineIdx=23 committedLineIdx=23 requestedTargetIdx=25 commitTargetIdx=24 nextSpeakableLineIdx=24 currentScrollTop=1702 targetScrollTop=1791 visualErrorPx=17 boundedVisualTolerancePx=12 pocketZone=pocket nextSpeakableLineY=462 preferredBandBottom=467 finalPacketFresh=1 audioBackendFresh=1 reason=not_low_enough',
    );
  });

  test('builds visual recovery boost applied diagnostic with expected fields', () => {
    const line = buildAsrVisualRecoveryBoostAppliedDiagnostic({
      authority: 'bottom_lock_release',
      targetDebtPx: 332.2,
      appliedDeltaPx: 14.1,
      reason: 'below_tolerated_bottom',
    });
    expect(line).toBe(
      '[ASR_VISUAL_RECOVERY_BOOST_APPLIED] authority=bottom_lock_release targetDebtPx=332 appliedDeltaPx=14 reason=below_tolerated_bottom',
    );
  });

  test('builds visual recovery boost blocked diagnostic with expected fields', () => {
    const line = buildAsrVisualRecoveryBoostBlockedDiagnostic({
      authority: 'preferred_lower_rail_release',
      targetDebtPx: 98.4,
      appliedDeltaPx: 6.1,
      reason: 'target_debt_below_threshold',
    });
    expect(line).toBe(
      '[ASR_VISUAL_RECOVERY_BOOST_BLOCKED] authority=preferred_lower_rail_release targetDebtPx=98 appliedDeltaPx=6 reason=target_debt_below_threshold',
    );
  });

  test('builds diagnostic bundle proof with expected fields', () => {
    const line = buildAsrDiagnosticBundleProofDiagnostic({
      buildStamp: 'asr-scroll-2026-05-18T22:07:18.976Z',
      runKey: 'run-13',
      runGeneration: 4,
      hasDelayedSuppressionAutopsyBuilder: true,
      hasVisualGovernorDeadScreenAutopsyBuilder: true,
      delayedAutopsyVersion: ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
      deadScreenAutopsyVersion: ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
    });
    expect(line).toBe(
      `[ASR_DIAGNOSTIC_BUNDLE_PROOF] buildStamp=asr-scroll-2026-05-18T22:07:18.976Z runKey=run-13 runGeneration=4 hasDelayedSuppressionAutopsyBuilder=1 hasVisualGovernorDeadScreenAutopsyBuilder=1 delayedAutopsyVersion=${ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION} deadScreenAutopsyVersion=${ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION}`,
    );
  });

  test('builds dump-path proof with expected fields', () => {
    const line = buildAsrAlignmentEpisodeDumpPathProofDiagnostic({
      visualOutcome: 'delayed_until_starvation',
      reasonChain: 'asr_recovery_chain_blocked|live_asr_marker_lock_suppressed|superseded_by_new_commit',
      actions: 'pursued|snap_suppressed',
      markerY: 390.4,
      nextSpeakableLineY: 475.7,
      wouldQualifyDelayedSuppressionAutopsy: true,
      delayedAutopsyGateReason: 'reason_chain_live_asr_marker_lock_suppressed',
      wouldQualifyDeadScreenAutopsy: false,
      deadScreenAutopsyGateReason: 'not_evaluated_in_episode_dump_path',
    });
    expect(line).toBe(
      '[ASR_ALIGNMENT_EPISODE_DUMP_PATH_PROOF] visualOutcome=delayed_until_starvation reasonChain=asr_recovery_chain_blocked|live_asr_marker_lock_suppressed|superseded_by_new_commit actions=pursued|snap_suppressed markerY=390 nextSpeakableLineY=476 wouldQualifyDelayedSuppressionAutopsy=1 delayedAutopsyGateReason=reason_chain_live_asr_marker_lock_suppressed wouldQualifyDeadScreenAutopsy=0 deadScreenAutopsyGateReason=not_evaluated_in_episode_dump_path',
    );
  });

  test('builds optional diagnostic error with expected fields', () => {
    const line = buildAsrOptionalDiagnosticErrorDiagnostic({
      diagnosticTag: 'ASR_DELAYED_SUPPRESSION_AUTOPSY',
      errorMessage: 'boom "quoted"',
    });
    expect(line).toBe(
      `[ASR_OPTIONAL_DIAGNOSTIC_ERROR] diagnosticTag=ASR_DELAYED_SUPPRESSION_AUTOPSY errorMessage="boom 'quoted'"`,
    );
  });

  test('dead-screen autopsy gate emits for sustained hard hold with fresh adjacent proof', () => {
    expect(shouldEmitAsrVisualGovernorDeadScreenAutopsy({
      alreadyEmittedInWindow: false,
      liveAsrActive: true,
      visualGovernorHardHoldActive: true,
      currentScrollTop: 3655,
      targetScrollTop: 3875,
      movedPx: 0,
      noCommitMs: 5158,
      thresholdMs: 3000,
      freshAdjacentProofContinues: true,
      hardContradiction: false,
      offscriptNoMatch: false,
    })).toBe(true);
  });

  test('dead-screen autopsy gate does not spam once same window already emitted', () => {
    expect(shouldEmitAsrVisualGovernorDeadScreenAutopsy({
      alreadyEmittedInWindow: true,
      liveAsrActive: true,
      visualGovernorHardHoldActive: true,
      currentScrollTop: 3655,
      targetScrollTop: 3875,
      movedPx: 0,
      noCommitMs: 5158,
      thresholdMs: 3000,
      freshAdjacentProofContinues: true,
      hardContradiction: false,
      offscriptNoMatch: false,
    })).toBe(false);
  });

  test('dead-screen escape decision allows bounded adjacent terminal escape', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 110,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: true,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: true });
  });

  test('dead-screen escape decision allows one-shot fresh adjacent unlock escape without terminal suppression', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 54,
      acceptedCommitTargetIdx: 55,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'live_strict_local_proof_ok',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 24,
      terminalCommitSuppressedByVisualGovernor: false,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 56249,
      governorHoldAgeMs: 56234,
      thresholdMs: 3000,
      globalHold: false,
    })).toEqual({ allow: true });
  });

  test('dead-screen escape decision blocks non-adjacent target', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 111,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: true,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: false, reason: 'target_not_adjacent' });
  });

  test('dead-screen escape decision blocks offscript/no-match', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 110,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: true,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: true,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: false, reason: 'offscript_or_no_match' });
  });

  test('dead-screen escape decision blocks hard contradiction', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 110,
      targetSpeakable: true,
      hardContradiction: true,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: true,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: false, reason: 'hard_contradiction' });
  });

  test('dead-screen escape decision blocks without fresh live speech', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 110,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: false,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: true,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: false, reason: 'no_fresh_live_speech' });
  });

  test('dead-screen escape decision blocks without fresh final packet', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 110,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: false,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: true,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: false, reason: 'no_fresh_final_packet' });
  });

  test('dead-screen escape decision blocks without terminal suppression evidence or fresh strict unlock proof', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 109,
      acceptedCommitTargetIdx: 110,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'adjacent_rescue_proofed',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 15,
      terminalCommitSuppressedByVisualGovernor: false,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 5687,
      governorHoldAgeMs: 5675,
      thresholdMs: 3000,
      globalHold: true,
    })).toEqual({ allow: false, reason: 'no_terminal_suppression' });
  });

  test('dead-screen escape decision blocks stale audio/backend on fresh unlock path', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 54,
      acceptedCommitTargetIdx: 55,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: false,
      bridgeTrapActive: false,
      proofSource: 'live_strict_local_proof_ok',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 24,
      terminalCommitSuppressedByVisualGovernor: false,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 56249,
      governorHoldAgeMs: 56234,
      thresholdMs: 3000,
      globalHold: false,
    })).toEqual({ allow: false, reason: 'stale_audio_or_backend' });
  });

  test('dead-screen escape decision blocks bridge trap on fresh unlock path', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 54,
      acceptedCommitTargetIdx: 55,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: true,
      proofSource: 'live_strict_local_proof_ok',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 24,
      terminalCommitSuppressedByVisualGovernor: false,
      alreadyUsedInHoldEpisode: false,
      noCommitMs: 56249,
      governorHoldAgeMs: 56234,
      thresholdMs: 3000,
      globalHold: false,
    })).toEqual({ allow: false, reason: 'bridge_trap_active' });
  });

  test('dead-screen escape decision blocks repeat escape in same hold episode', () => {
    expect(decideAsrVisualGovernorDeadScreenEscape({
      movedPx: 0,
      currentLineIdx: 54,
      acceptedCommitTargetIdx: 55,
      targetSpeakable: true,
      hardContradiction: false,
      offscriptNoMatch: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      proofSource: 'live_strict_local_proof_ok',
      freshAdjacentUnlockSeen: true,
      suppressedForwardProofCountInWindow: 24,
      terminalCommitSuppressedByVisualGovernor: false,
      alreadyUsedInHoldEpisode: true,
      noCommitMs: 56249,
      governorHoldAgeMs: 56234,
      thresholdMs: 3000,
      globalHold: false,
    })).toEqual({ allow: false, reason: 'already_used_in_hold_episode' });
  });

  test('adjacent recovery catchup decision allows fresh low adjacent step', () => {
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: true });
  });

  test('adjacent recovery catchup decision blocks stale packet and stale backend', () => {
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: false,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'stale_final_packet' });
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: false,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'stale_audio_or_backend' });
  });

  test('adjacent recovery catchup decision blocks no-match/offscript and contradiction', () => {
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: true,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'no_match_or_offscript' });
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: true,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'no_match_or_offscript' });
  });

  test('adjacent recovery catchup decision blocks non-adjacent and bridge trap', () => {
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 27,
      currentLineIdx: 23,
      commitTargetLine: 25,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'non_adjacent_target' });
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: true,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'bridge_trap_active' });
  });

  test('adjacent recovery catchup decision blocks high error, not-low-enough, and repeat use', () => {
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: false,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'not_low_enough' });
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 17,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    })).toEqual({ allow: false, reason: 'visual_error_out_of_bounds' });
    expect(decideAsrAdjacentRecoveryCatchup({
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      requestedTargetLine: 25,
      currentLineIdx: 23,
      commitTargetLine: 24,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: true,
    })).toEqual({ allow: false, reason: 'already_used_in_episode' });
  });

  test('visual recovery boost decision allows bounded low-rail recovery with large debt', () => {
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_tolerated_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 332,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: true, minStepPx: 14, maxStepPx: 16 });
  });

  test('visual recovery boost decision allows preferred-lower-rail recovery only at large debt', () => {
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'preferred_lower_rail_release',
      reason: 'preferred_lower_rail_not_settled',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 280,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: true,
    })).toEqual({ allow: true, minStepPx: 14, maxStepPx: 16 });
  });

  test('visual recovery boost decision blocks stale speech, weak proof, and bridge hold', () => {
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_tolerated_bottom',
      speechFresh: false,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'speech_not_fresh' });
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_tolerated_bottom',
      speechFresh: true,
      proofHealthy: false,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'proof_not_healthy' });
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_tolerated_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: true,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'bridge_blocked' });
  });

  test('visual recovery boost decision blocks ineligible authority/reason and low debt', () => {
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'hold',
      reason: 'below_tolerated_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'authority_not_eligible' });
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'comfort_nudge',
      reason: 'outside_preferred_within_tolerated',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: true,
    })).toEqual({ allow: false, reason: 'reason_not_eligible' });
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_preferred_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 98,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'target_debt_below_threshold' });
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'preferred_lower_rail_release',
      reason: 'preferred_lower_rail_not_settled',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: true,
    })).toEqual({ allow: false, reason: 'target_debt_below_threshold' });
  });

  test('visual recovery boost decision blocks when already within settle/tolerated band', () => {
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_preferred_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: true,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'inside_preferred_settle_band' });
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_preferred_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 350,
      insidePreferredSettleBand: false,
      insideToleratedBand: true,
    })).toEqual({ allow: false, reason: 'inside_tolerated_band' });
  });

  test('visual recovery boost decision blocks until low state matures', () => {
    expect(decideAsrVisualRecoveryBoost({
      liveAsrActive: true,
      authority: 'bottom_lock_release',
      reason: 'below_tolerated_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 180,
      lowStateAgeMs: 120,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    })).toEqual({ allow: false, reason: 'low_state_not_mature' });
  });
});
