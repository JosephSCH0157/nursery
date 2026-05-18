import {
  buildAsrHudNoTargetDetail,
  buildAsrAudioChunkStaleDiagnostic,
  buildAsrBridgeTrapDetectedDiagnostic,
  buildAsrBackendHeartbeatDiagnostic,
  buildAsrBackendRestartCompletedDiagnostic,
  buildAsrBackendRestartRequestedDiagnostic,
  buildAsrBottomLockGeometryDiagnostic,
  buildAsrEarlyBridgeTrapReleasedDiagnostic,
  buildAsrMarkerErrorLowerRailRejectedDiagnostic,
  buildAsrScrollAuthorityConflictDiagnostic,
  buildAsrScrollAuthoritySelectedDiagnostic,
  buildAsrVisualMarkerErrorCorrectionDiagnostic,
  buildAsrBackendTranscriptStaleDiagnostic,
  buildProofOwnedPrimaryCommitGuardBaseParts,
  buildRecoverySkipNonAdjacentTargetGuardBaseParts,
} from '../../src/features/asr/asr-diagnostics';

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
});
