import {
  ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION,
  ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION,
  buildAsrAlignmentEpisodeDumpPathProofDiagnostic,
  buildAsrHudNoTargetDetail,
  buildAsrAudioChunkStaleDiagnostic,
  buildAsrFocusLossTranscriptAcceptedDiagnostic,
  buildAsrFocusLossTranscriptQuarantinedDiagnostic,
  buildAsr4RecoveryBudgetAuthorityAppliedDiagnostic,
  buildAsr4PocketDriftAuthorityAppliedDiagnostic,
  buildAsr4PocketDriftStateDiagnostic,
  buildAsrLowPocketDeadbandBlockedDiagnostic,
  buildAsrLowPocketDeadbandReconciledDiagnostic,
  buildAsrLowPocketFreezeFarTargetBlockedDiagnostic,
  buildAsrLowPocketFreezeFarTargetReconciledDiagnostic,
  buildAsrReaderOverrunHoldDiagnostic,
  buildAsrApprovedVisualSmoothingBypassedDiagnostic,
  buildAsrApprovedVisualSmoothingRebasedDiagnostic,
  buildAsrAcceptedLocalLagReconciledDiagnostic,
  buildAsrAcceptedLocalLagBlockedDiagnostic,
  buildAsrReaderZoneSummaryDiagnostic,
  buildAsr4VisualRecoveryAuthorityAppliedDiagnostic,
  buildAsr4VisualRecoveryStateDiagnostic,
  buildAsr4FreshTailVetoDiagnostic,
  buildAsr4RecoveryBudgetStateDiagnostic,
  buildAsr4RecoveryBudgetViolationDiagnostic,
  buildAsr4ShadowMismatchDiagnostic,
  buildAsrBridgeTrapDetectedDiagnostic,
  buildAsrBackendHeartbeatDiagnostic,
  buildAsrBackendRestartCompletedDiagnostic,
  buildAsrBackendRestartRequestedDiagnostic,
  buildAsrBridgeReducedVisualCashInEvaluatedDiagnostic,
  buildAsrBridgeReducedVisualCashInAppliedDiagnostic,
  buildAsrBridgeReducedVisualCashInBlockedDiagnostic,
  buildAsrBottomLockGeometryDiagnostic,
  buildAsrDelayedSuppressionAutopsyDiagnostic,
  buildAsrDiagnosticBundleProofDiagnostic,
  buildAsrEarlyBridgeTrapReleasedDiagnostic,
  buildAsrMarkerErrorHoldBandRejectedDiagnostic,
  buildAsrMarkerErrorLowerRailRejectedDiagnostic,
  buildAsrOptionalDiagnosticErrorDiagnostic,
  buildAsrVisualGovernorDeadScreenAutopsyDiagnostic,
  buildAsrVisualGovernorDeadScreenUnlockAllowedDiagnostic,
  buildAsrVisualGovernorDeadScreenUnlockAppliedDiagnostic,
  buildAsrVisualGovernorDeadScreenUnlockDeniedDiagnostic,
  buildAsrVisualGovernorDeadScreenUnlockEvaluatedDiagnostic,
  buildAsrVisualGovernorDeadScreenEscapeBlockedDiagnostic,
  buildAsrVisualGovernorDeadScreenEscapeCommitDiagnostic,
  buildAsrAdjacentRecoveryCatchupAllowedDiagnostic,
  buildAsrAdjacentRecoveryCatchupBlockedDiagnostic,
  buildAsrAdjacentRecoveryCatchupBypassedDiagnostic,
  buildAsrAdjacentRecoveryCatchupPathProofDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryAppliedDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryBypassedDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryBlockedDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryOpenBlockedDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryOpenedDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryPathProofDiagnostic,
  buildAsrPostAdjacentCommitVisualRecoveryWindowClearedDiagnostic,
  buildAsrRecoveryGearSelectedDiagnostic,
  buildAsrAccumulationSnapshotDiagnostic,
  buildAsrLiveScrollStalledDiagnostic,
  buildAsrScrollAuthorityResolvedDiagnostic,
  buildAsrScrollChairpersonArbitrationDiagnostic,
  buildAsrVisualRecoveryBoostAppliedDiagnostic,
  buildAsrVisualRecoveryBoostBypassedDiagnostic,
  buildAsrVisualRecoveryBoostBlockedDiagnostic,
  buildAsrVisualRecoveryBoostPathProofDiagnostic,
  buildAsrScrollAuthorityConflictDiagnostic,
  buildAsrScrollAuthoritySelectedDiagnostic,
  buildAsrChairpersonFlagProofDiagnostic,
  buildAsrVisualControlDecisionDiagnostic,
  buildAsrVisualControlRuntimeProofDiagnostic,
  buildAsrRecoveryEpisodeStartedDiagnostic,
  buildAsrRecoveryEpisodeExtendedDiagnostic,
  buildAsrRecoveryEpisodeEndedDiagnostic,
  buildAsrBackwardTargetRejectedDiagnostic,
  buildAsrRecoveryStepAppliedDiagnostic,
  buildAsrSettleCompleteDiagnostic,
  buildAsrStaleLandingRelaxedForFreshForwardAnchorDiagnostic,
  buildAsrStaleRecoveryTargetExpiredDiagnostic,
  buildAsrVisualMarkerErrorCorrectionDiagnostic,
  buildAsrVisualDebtCatchupAllowedDiagnostic,
  buildAsrVisualDebtCatchupEvaluationSeenDiagnostic,
  buildAsrVisualDebtCatchupBlockedDiagnostic,
  buildAsrLocalRescueAllowedButUnrealizedDiagnostic,
  buildAsrLocalRescueSupersededByPostCommitRecoveryDiagnostic,
  buildAsrBackendTranscriptStaleDiagnostic,
  buildProofOwnedPrimaryCommitGuardBaseParts,
  buildRecoverySkipNonAdjacentTargetGuardBaseParts,
} from '../../src/features/asr/asr-diagnostics';
import {
  decideAsrVisualGovernorDeadScreenEscape,
  decideAsrAdjacentRecoveryCatchup,
  decideAsrActuatorRecoveryGear,
  decideAsrPostAdjacentCommitVisualRecovery,
  decideAsrVisualRecoveryBoost,
  shouldEmitAsrVisualGovernorDeadScreenAutopsy,
} from '../../src/features/asr/asr-diagnostic-gates';
import {
  type ResolveAsrScrollAuthorityInput,
  resolveAsrScrollAuthority,
} from '../../src/features/asr/asr-authority-resolver';

describe('ASR backend liveness diagnostics builders', () => {
  test('builds visual chairperson diagnostics', () => {
    expect(
      buildAsrVisualControlRuntimeProofDiagnostic({
        chairpersonRuntime: true,
        contractVersion: 'asr-visual-chairperson-v1|asr-live-follow-control-v1',
        shadowMode: true,
        liveTargetOwnership: false,
        moduleLoaded: true,
        buildStamp: 'asr-scroll-2026-06-03T17:55:00.000Z',
        emittedFrom: 'createAsrScrollDriver:init',
        computeAsrVisualDecisionAvailable: true,
        diagnosticsSinkAvailable: true,
        diagnosticsExportPathAvailable: true,
      }),
    ).toBe(
      '[ASR_VISUAL_CONTROL_RUNTIME_PROOF] chairpersonRuntime=1 contractVersion=asr-visual-chairperson-v1|asr-live-follow-control-v1 shadowMode=1 liveTargetOwnership=0 moduleLoaded=1 buildStamp=asr-scroll-2026-06-03T17:55:00.000Z emittedFrom=createAsrScrollDriver:init computeAsrVisualDecisionAvailable=1 diagnosticsSinkAvailable=1 diagnosticsExportPathAvailable=1',
    );

    expect(
      buildAsrChairpersonFlagProofDiagnostic({
        rawHref: 'http://localhost:5173/?dev=1&asr_visual_chairperson=true',
        rawSearch: '?dev=1&asr_visual_chairperson=true',
        parsedQueryParams: '["dev:1","asr_visual_chairperson:true"]',
        rawChairpersonValue: 'true',
        rawOwnerValue: '',
        resolvedShadowEnabled: true,
        resolvedOwnerEnabled: true,
        ownerFlagSource: 'url:asr_visual_chairperson=true',
        ownerDisabledReason: 'none',
        devFlagReaderAvailable: true,
        flagEvaluationLocation: 'app_boot',
        driverCreationTimeFlagState: 'not_created',
        liveTickFlagState: 'shadow=1|owner=1|source=url:asr_visual_chairperson=true|disabled=none',
        importMetaDev: 'true',
        importMetaMode: 'development',
        ownerFlagReadFrom: 'url',
      }),
    ).toBe(
      '[ASR_CHAIRPERSON_FLAG_PROOF] rawHref=http://localhost:5173/?dev=1&asr_visual_chairperson=true rawSearch=?dev=1&asr_visual_chairperson=true parsedQueryParams=["dev:1","asr_visual_chairperson:true"] asrVisualChairpersonRaw=true asrVisualChairpersonOwnerRaw=none resolvedShadowEnabled=1 resolvedOwnerEnabled=1 ownerFlagSource=url:asr_visual_chairperson=true ownerDisabledReason=none devFlagReaderAvailable=1 flagEvaluationLocation=app_boot driverCreationTimeFlagState=not_created liveTickFlagState=shadow=1|owner=1|source=url:asr_visual_chairperson=true|disabled=none importMetaDev=true importMetaMode=development ownerFlagReadFrom=url',
    );

    expect(
      buildAsrVisualControlDecisionDiagnostic({
        mode: 'recover',
        controlIntent: 'recover',
        recoveryKind: 'visual_debt',
        isTrueVisualRecovery: true,
        isForwardProtection: false,
        semanticCursorLineIdx: 8,
        visualAnchorLineIdx: 7,
        anchorKind: 'confirmed_spoken',
        markerY: 390,
        anchorViewportY: 612,
        anchorGapPx: 222,
        pocketBand: 'recovery',
        targetScrollTop: 512,
        previousTargetScrollTop: 430,
        backwardAllowed: false,
        recoveryEpisodeActive: true,
        protectedTargetScrollTop: 512,
        maxVelocityPxps: 220,
        actuatorAppliedDeltaPx: 42,
        reason: 'visual_debt',
        legacySelectedAuthority: 'comfort_nudge',
        legacySelectedTargetScrollTop: 376,
        shadowDiffPx: 136,
        backwardTargetRejected: true,
        safeForwardTargetSuppressed: true,
        ownershipActive: false,
      }),
    ).toBe(
      '[ASR_VISUAL_CONTROL_DECISION] mode=recover controlIntent=recover recoveryKind=visual_debt isTrueVisualRecovery=1 isForwardProtection=0 semanticCursorLineIdx=8 visualAnchorLineIdx=7 anchorKind=confirmed_spoken markerY=390 anchorViewportY=612 anchorGapPx=222 pocketBand=recovery targetScrollTop=512 previousTargetScrollTop=430 backwardAllowed=0 recoveryEpisodeActive=1 protectedTargetScrollTop=512 maxVelocityPxps=220 actuatorAppliedDeltaPx=42 reason=visual_debt legacySelectedAuthority=comfort_nudge legacySelectedTargetScrollTop=376 shadowDiffPx=136 backwardTargetRejected=1 safeForwardTargetSuppressed=1 ownershipActive=0',
    );

    expect(
      buildAsrRecoveryEpisodeStartedDiagnostic({
        reason: 'visual_debt',
        controlIntent: 'recover',
        recoveryKind: 'visual_debt',
        isTrueVisualRecovery: true,
        isForwardProtection: false,
        protectedLineIdx: 8,
        protectedTargetScrollTop: 512,
        expiresInMs: 700,
      }),
    ).toBe(
      '[ASR_RECOVERY_EPISODE_STARTED] reason=visual_debt controlIntent=recover recoveryKind=visual_debt isTrueVisualRecovery=1 isForwardProtection=0 protectedLineIdx=8 protectedTargetScrollTop=512 expiresInMs=700',
    );

    expect(
      buildAsrRecoveryEpisodeExtendedDiagnostic({
        reason: 'semantic_ahead',
        controlIntent: 'forward_protect',
        recoveryKind: 'semantic_ahead',
        isTrueVisualRecovery: false,
        isForwardProtection: true,
        protectedLineIdx: 9,
        protectedTargetScrollTop: 648,
        expiresInMs: 540,
      }),
    ).toBe(
      '[ASR_RECOVERY_EPISODE_EXTENDED] reason=semantic_ahead controlIntent=forward_protect recoveryKind=semantic_ahead isTrueVisualRecovery=0 isForwardProtection=1 protectedLineIdx=9 protectedTargetScrollTop=648 expiresInMs=540',
    );

    expect(
      buildAsrRecoveryEpisodeEndedDiagnostic({
        reason: 'post_floor_cleared',
        controlIntent: 'none',
        recoveryKind: 'none',
        isTrueVisualRecovery: false,
        isForwardProtection: false,
        protectedLineIdx: 8,
        protectedTargetScrollTop: 512,
      }),
    ).toBe(
      '[ASR_RECOVERY_EPISODE_ENDED] reason=post_floor_cleared controlIntent=none recoveryKind=none isTrueVisualRecovery=0 isForwardProtection=0 protectedLineIdx=8 protectedTargetScrollTop=512',
    );

    expect(
      buildAsrBackwardTargetRejectedDiagnostic({
        mode: 'recover',
        legacyAuthority: 'comfort_nudge',
        legacyTargetScrollTop: 376,
        correctedTargetScrollTop: 430,
        currentScrollTop: 430,
        reason: 'visual_debt',
      }),
    ).toBe(
      '[ASR_BACKWARD_TARGET_REJECTED] mode=recover legacyAuthority=comfort_nudge legacyTargetScrollTop=376 correctedTargetScrollTop=430 currentScrollTop=430 reason=visual_debt',
    );

    expect(
      buildAsrRecoveryStepAppliedDiagnostic({
        mode: 'recover',
        authority: 'recover_visual_debt',
        controlIntent: 'recover',
        recoveryKind: 'visual_debt',
        isTrueVisualRecovery: true,
        isForwardProtection: false,
        currentScrollTop: 430,
        targetScrollTop: 512,
        appliedDeltaPx: 42,
        minForwardStepPx: 28,
        reason: 'visual_debt',
      }),
    ).toBe(
      '[ASR_RECOVERY_STEP_APPLIED] mode=recover authority=recover_visual_debt controlIntent=recover recoveryKind=visual_debt isTrueVisualRecovery=1 isForwardProtection=0 currentScrollTop=430 targetScrollTop=512 appliedDeltaPx=42 minForwardStepPx=28 reason=visual_debt',
    );

    expect(
      buildAsrSettleCompleteDiagnostic({
        previousMode: 'recover',
        nextMode: 'track',
        anchorLineIdx: 8,
        targetScrollTop: 512,
        reason: 'recovery_episode_settle',
      }),
    ).toBe(
      '[ASR_SETTLE_COMPLETE] previousMode=recover nextMode=track anchorLineIdx=8 targetScrollTop=512 reason=recovery_episode_settle',
    );
  });

  test('builds stale-landing relaxation diagnostic with bounded forward context', () => {
    const line = buildAsrStaleLandingRelaxedForFreshForwardAnchorDiagnostic({
      currentLine: 13,
      candidateLine: 15,
      deltaLines: 2,
      whisperFresh: true,
      matcherStable: true,
      priorHoldReason: 'live_strict_bridge_stale_landing_hold',
    });
    expect(line).toBe(
      '[ASR_STALE_LANDING_RELAXED_FOR_FRESH_FORWARD_ANCHOR] currentLine=13 candidateLine=15 deltaLines=2 whisperFresh=1 matcherStable=1 priorHoldReason=live_strict_bridge_stale_landing_hold',
    );
  });

  test('builds visual debt catch-up diagnostics with proposed and actual move data', () => {
    const allowed = buildAsrVisualDebtCatchupAllowedDiagnostic({
      debtPx: 148,
      lineHeightPx: 56,
      proposedMovePx: 56,
      actualMovePx: 42,
      decisionReason: 'visual_only_recent_safe_commit_allowed',
      clampReason: 'visual_debt_catchup',
      currentScrollTop: 205,
      targetScrollTop: 261,
      consecutiveDebtObservations: 3,
    });
    expect(allowed).toBe(
      '[ASR_VISUAL_DEBT_CATCHUP_ALLOWED] debtPx=148 lineHeightPx=56 proposedMovePx=56 actualMovePx=42 decisionReason=visual_only_recent_safe_commit_allowed clampReason=visual_debt_catchup currentScrollTop=205 targetScrollTop=261 consecutiveDebtObservations=3',
    );

    const blocked = buildAsrVisualDebtCatchupBlockedDiagnostic({
      debtPx: 148,
      lineHeightPx: 56,
      proposedMovePx: 56,
      blockedReason: 'cooldown',
      postCommitGapMs: 84,
      requiredGapMs: 140,
      reducedGapEligible: true,
      recentSafeCommitAgeMs: 84,
      consecutiveDebtObservations: 3,
      currentLineIdx: 40,
      committedLineIdx: 41,
      targetLineIdx: 41,
      decisionReason: 'none',
    });
    expect(blocked).toBe(
      '[ASR_VISUAL_DEBT_CATCHUP_BLOCKED] debtPx=148 lineHeightPx=56 proposedMovePx=56 blockedReason=cooldown postCommitGapMs=84 requiredGapMs=140 reducedGapEligible=1 recentSafeCommitAgeMs=84 consecutiveDebtObservations=3 currentLineIdx=40 committedLineIdx=41 targetLineIdx=41 decisionReason=none',
    );

    const unrealized = buildAsrLocalRescueAllowedButUnrealizedDiagnostic({
      allowedReason: 'persistent_local_rescue_override',
      intendedMovePx: 28,
      actualMovePx: 0,
      actuatorBlockReason: 'actuator_rate_limited',
      finalZeroingReason: 'writer_no_progress',
      hardBlocker: 'none',
      cooldownState: 'cooldown_clear',
      targetDebtPx: 136,
      targetScrollTop: 308,
      currentScrollTop: 172,
    });
    expect(unrealized).toBe(
      '[ASR_LOCAL_RESCUE_ALLOWED_BUT_UNREALIZED] allowedReason=persistent_local_rescue_override intendedMovePx=28 actualMovePx=0 actuatorBlockReason=actuator_rate_limited finalZeroingReason=writer_no_progress hardBlocker=none cooldownState=cooldown_clear targetDebtPx=136 targetScrollTop=308 currentScrollTop=172',
    );

    const superseded = buildAsrLocalRescueSupersededByPostCommitRecoveryDiagnostic({
      previousTargetScrollTop: 6976,
      newTargetScrollTop: 7107,
      snapSuppressed: true,
      freezeReason: 'far_visual_target',
      actualMovePx: 0,
      hardBlockerState: 'none',
    });
    expect(superseded).toBe(
      '[ASR_LOCAL_RESCUE_SUPERSEDED_BY_POST_COMMIT_RECOVERY] previousTargetScrollTop=6976 newTargetScrollTop=7107 snapSuppressed=1 freezeReason=far_visual_target actualMovePx=0 hardBlockerState=none',
    );
  });

  test('builds visual debt catch-up evaluation diagnostics with decision context', () => {
    const line = buildAsrVisualDebtCatchupEvaluationSeenDiagnostic({
      debtPx: 148,
      lineHeightPx: 56,
      debtDirection: 'forward',
      consecutiveDebtObservations: 3,
      targetLine: 42,
      currentLine: 40,
      committedLine: 41,
      targetForward: true,
      targetSafe: true,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      markerLockActive: true,
      terminalClampActive: false,
      cooldownActive: false,
      postCommitGapMs: 84,
      requiredGapMs: 140,
      reducedGapEligible: true,
      recentSafeCommitAgeMs: 84,
      finalDecision: 'blocked',
      decisionReason: 'none',
      blockedReason: 'awaiting_commit_gap_window',
    });
    expect(line).toBe(
      '[ASR_VISUAL_DEBT_CATCHUP_EVALUATION_SEEN] debtPx=148 lineHeightPx=56 debtDirection=forward consecutiveDebtObservations=3 targetLine=42 currentLine=40 committedLine=41 targetForward=1 targetSafe=1 directWriteBlocked=1 targetPreservedForEasing=1 markerLockActive=1 terminalClampActive=0 cooldownActive=0 postCommitGapMs=84 requiredGapMs=140 reducedGapEligible=1 recentSafeCommitAgeMs=84 finalDecision=blocked decisionReason=none blockedReason=awaiting_commit_gap_window',
    );
  });

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

  test('builds focus-loss transcript diagnostics with expected fields', () => {
    const quarantined = buildAsrFocusLossTranscriptQuarantinedDiagnostic({
      focusState: 'lost',
      generation: 4,
      runGeneration: 7,
      runKey: 'focus-safe-run',
      sessionPhase: 'live',
      asrArmed: true,
      speechActive: true,
      recognizerAttached: true,
      activeReadMode: true,
      final: true,
      noMatch: false,
      matchBestIdx: 2,
      currentIdx: 1,
      clue: 'The seats remember every early shift.',
    });
    expect(quarantined).toBe(
      '[ASR_FOCUS_LOSS_TRANSCRIPT_QUARANTINED] focusState=lost generation=4 runGeneration=7 runKey=focus-safe-run sessionPhase=live asrArmed=1 speechActive=1 recognizerAttached=1 activeReadMode=1 final=1 noMatch=0 matchBestIdx=2 currentIdx=1 clue="The seats remember every early shift."',
    );

    const accepted = buildAsrFocusLossTranscriptAcceptedDiagnostic({
      reason: 'active_current_generation_final',
      focusState: 'lost',
      generation: 4,
      runGeneration: 7,
      runKey: 'focus-safe-run',
      sessionPhase: 'live',
      asrArmed: true,
      speechActive: true,
      recognizerAttached: true,
      activeReadMode: true,
      final: true,
      noMatch: false,
      matchBestIdx: 2,
      currentIdx: 1,
      clue: 'The seats remember every early shift.',
    });
    expect(accepted).toBe(
      '[ASR_FOCUS_LOSS_TRANSCRIPT_ACCEPTED] reason=active_current_generation_final focusState=lost generation=4 runGeneration=7 runKey=focus-safe-run sessionPhase=live asrArmed=1 speechActive=1 recognizerAttached=1 activeReadMode=1 final=1 noMatch=0 matchBestIdx=2 currentIdx=1 clue="The seats remember every early shift."',
    );
  });

  test('builds ASR4 fresh-tail veto diagnostic with expected fields', () => {
    const line = buildAsr4FreshTailVetoDiagnostic({
      currentLine: 12,
      candidateTargetLine: 13,
      transcriptSource: 'openai-whisper-bridge',
      wouldFreeze: true,
      rollingContextMatchesScript: true,
      previousLineMatched: true,
      currentLineMatched: false,
      forwardLineMatched: false,
      selectedNearbyWindow: 'previous',
      packetMatchAnchorLine: 11,
      packetMatchAnchorMatched: true,
      packetMatchAnchorSim: 0.912,
      selectedAnchorSource: 'packet_match_local',
      legacyMoved: false,
      reason: 'fresh_tail_offscript_overrides_old_context',
      freshTailPreview: 'buy my toaster',
      nearbyScriptPreview: 'welcome back to the show',
    });
    expect(line).toBe(
      '[ASR4_FRESH_TAIL_VETO] currentLine=12 candidateTargetLine=13 transcriptSource=openai-whisper-bridge wouldFreeze=1 rollingContextMatchesScript=1 previousLineMatched=1 currentLineMatched=0 forwardLineMatched=0 selectedNearbyWindow=previous packetMatchAnchorLine=11 packetMatchAnchorMatched=1 packetMatchAnchorSim=0.912 selectedAnchorSource=packet_match_local legacyMoved=0 reason=fresh_tail_offscript_overrides_old_context freshTailPreview="buy my toaster" nearbyScriptPreview="welcome back to the show"',
    );
  });

  test('builds ASR4 shadow mismatch diagnostic with expected fields', () => {
    const line = buildAsr4ShadowMismatchDiagnostic({
      currentLine: 12,
      legacyTargetLine: 13,
      transcriptSource: 'openai-whisper-bridge',
      reason: 'fresh_tail_offscript_overrides_old_context',
      freshTailPreview: 'buy my toaster',
      nearbyScriptPreview: 'welcome back to the show',
      rollingContextMatchesScript: true,
      previousLineMatched: true,
      currentLineMatched: false,
      forwardLineMatched: false,
      selectedNearbyWindow: 'previous',
      packetMatchAnchorLine: 11,
      packetMatchAnchorMatched: true,
      packetMatchAnchorSim: 0.912,
      selectedAnchorSource: 'packet_match_local',
    });
    expect(line).toBe(
      '[ASR4_SHADOW_MISMATCH] currentLine=12 legacyTargetLine=13 transcriptSource=openai-whisper-bridge asr4WouldFreeze=1 rollingContextMatchesScript=1 previousLineMatched=1 currentLineMatched=0 forwardLineMatched=0 selectedNearbyWindow=previous packetMatchAnchorLine=11 packetMatchAnchorMatched=1 packetMatchAnchorSim=0.912 selectedAnchorSource=packet_match_local reason=fresh_tail_offscript_overrides_old_context freshTailPreview="buy my toaster" nearbyScriptPreview="welcome back to the show"',
    );
  });

  test('builds ASR4 recovery budget state diagnostic with expected fields', () => {
    const line = buildAsr4RecoveryBudgetStateDiagnostic({
      currentLine: 4,
      targetLine: 6,
      pendingBridgeAgeMs: 1499.8,
      sinceOnResultMs: 1401.4,
      sinceIngestMs: 1388.2,
      sinceCommitMs: 1737.1,
      commitCount: 3,
      holdReason: 'await_fresh_direct_landing_proof',
      sourceBranch: 'pending_speakable_bridge_complete',
      recoveryState: 'recovering',
      wouldFreeze: false,
      targetRecoveryMs: 1500,
      freezeCeilingMs: 2000,
      waitingForFreshLocalProof: false,
      movementAllowed: true,
      reason: 'recovery_in_budget',
    });
    expect(line).toBe(
      '[ASR4_RECOVERY_BUDGET_STATE] currentLine=4 targetLine=6 pendingBridgeAgeMs=1500 sinceOnResultMs=1401 sinceIngestMs=1388 sinceCommitMs=1737 commitCount=3 holdReason=await_fresh_direct_landing_proof sourceBranch=pending_speakable_bridge_complete recoveryState=recovering wouldFreeze=0 movementAllowed=1 targetRecoveryMs=1500 freezeCeilingMs=2000 waitingForFreshLocalProof=0 reason=recovery_in_budget',
    );
  });

  test('builds ASR4 recovery budget violation diagnostic with expected fields', () => {
    const line = buildAsr4RecoveryBudgetViolationDiagnostic({
      currentLine: 4,
      targetLine: 6,
      pendingBridgeAgeMs: 6356.2,
      sinceOnResultMs: 6383.4,
      sinceIngestMs: 6360.1,
      sinceCommitMs: 8737.3,
      commitCount: 3,
      holdReason: 'pending_bridge_completion_ready',
      sourceBranch: 'pending_speakable_bridge_complete',
      recoveryState: 'freeze',
      wouldFreeze: true,
      targetRecoveryMs: 1500,
      freezeCeilingMs: 2000,
      waitingForFreshLocalProof: true,
      movementAllowed: false,
      reason: 'recovery_budget_exhausted_waiting_for_fresh_local_proof',
    });
    expect(line).toBe(
      '[ASR4_RECOVERY_BUDGET_VIOLATION] currentLine=4 targetLine=6 pendingBridgeAgeMs=6356 sinceOnResultMs=6383 sinceIngestMs=6360 sinceCommitMs=8737 commitCount=3 holdReason=pending_bridge_completion_ready sourceBranch=pending_speakable_bridge_complete recoveryState=freeze wouldFreeze=1 movementAllowed=0 targetRecoveryMs=1500 freezeCeilingMs=2000 waitingForFreshLocalProof=1 reason=recovery_budget_exhausted_waiting_for_fresh_local_proof',
    );
  });

  test('builds ASR4 recovery budget authority applied diagnostic with expected fields', () => {
    const line = buildAsr4RecoveryBudgetAuthorityAppliedDiagnostic({
      currentLine: 28,
      targetLine: 30,
      pendingBridgeAgeMs: 2489.2,
      holdReason: 'pending_bridge_completion_ready',
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
      previousLegacyAction: 'pending_bridge_completion_ready',
      authorityAction: 'expired_stale_pending_bridge',
      movementAllowed: false,
      staleBridgeCleared: true,
      waitingForFreshLocalProof: true,
      reason: 'recovery_budget_expired_pending_bridge_completion',
    });
    expect(line).toBe(
      '[ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED] currentLine=28 targetLine=30 pendingBridgeAgeMs=2489 holdReason=pending_bridge_completion_ready sourceBranch=live_strict_bridge_stale_landing_hold previousLegacyAction=pending_bridge_completion_ready authorityAction=expired_stale_pending_bridge movementAllowed=0 staleBridgeCleared=1 waitingForFreshLocalProof=1 reason=recovery_budget_expired_pending_bridge_completion',
    );
  });

  test('builds ASR4 visual recovery state diagnostic with expected fields', () => {
    const line = buildAsr4VisualRecoveryStateDiagnostic({
      currentLine: 32,
      committedLine: 33,
      targetLine: 33,
      beforeScrollTop: 1812,
      afterScrollTop: 1812,
      movedPx: 0,
      consecutiveNoMoveCommits: 1,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
      liveScrollStalled: false,
      authorityAction: 'observe_only',
      movementAllowed: true,
      suppressedReason: 'none',
      reason: 'accepted_commit_visible_scroll_stalled',
    });
    expect(line).toBe(
      '[ASR4_VISUAL_RECOVERY_STATE] currentLine=32 committedLine=33 targetLine=33 beforeScrollTop=1812 afterScrollTop=1812 movedPx=0 consecutiveNoMoveCommits=1 directWriteBlocked=1 targetPreservedForEasing=1 visualSnapSuppressed=1 liveScrollStalled=0 authorityAction=observe_only movementAllowed=1 suppressedReason=none reason=accepted_commit_visible_scroll_stalled',
    );
  });

  test('builds ASR4 visual recovery authority applied diagnostic with expected fields', () => {
    const line = buildAsr4VisualRecoveryAuthorityAppliedDiagnostic({
      currentLine: 32,
      committedLine: 33,
      targetLine: 33,
      beforeScrollTop: 1812,
      afterScrollTop: 2036,
      movedPx: 224,
      consecutiveNoMoveCommits: 2,
      directWriteBlocked: true,
      targetPreservedForEasing: true,
      visualSnapSuppressed: true,
      liveScrollStalled: true,
      authorityAction: 'force_marker_lock_correction',
      movementAllowed: true,
      reason: 'accepted_commit_visible_scroll_stalled',
    });
    expect(line).toBe(
      '[ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED] currentLine=32 committedLine=33 targetLine=33 beforeScrollTop=1812 afterScrollTop=2036 movedPx=224 consecutiveNoMoveCommits=2 directWriteBlocked=1 targetPreservedForEasing=1 visualSnapSuppressed=1 liveScrollStalled=1 authorityAction=force_marker_lock_correction movementAllowed=1 reason=accepted_commit_visible_scroll_stalled',
    );
  });

  test('builds ASR4 pocket drift state diagnostic with expected fields', () => {
    const line = buildAsr4PocketDriftStateDiagnostic({
      currentLine: 20,
      committedLine: 21,
      targetLine: 21,
      currentScrollTop: 900,
      targetScrollTop: 1020,
      markerTopPx: 268,
      activeLineTopPx: 540,
      activeLineDistanceFromMarkerPx: 390,
      activeLineViewportRatio: 0.874,
      lineHeightPx: 120,
      pocketTolerancePx: 36,
      belowPocketPx: 354,
      abovePocketPx: 0,
      visualDebtPx: 120,
      movedPx: 14,
      targetPreservedForEasing: true,
      directWriteBlocked: false,
      visualSnapSuppressed: false,
      terminalClampActive: false,
      asr4VisualRecoveryRecentlyApplied: true,
      scrollReason: 'comfort_nudge_follow',
      followMode: 'live_asr_follow',
      pocketHealth: 'bottomReading',
      suppressedReason: 'visual_recovery_cooldown',
      reason: 'live_follow_pocket_observation',
    });
    expect(line).toBe(
      '[ASR4_POCKET_DRIFT_STATE] currentLine=20 committedLine=21 targetLine=21 currentScrollTop=900 targetScrollTop=1020 markerTopPx=268 activeLineTopPx=540 activeLineDistanceFromMarkerPx=390 activeLineViewportRatio=0.874 lineHeightPx=120 pocketTolerancePx=36 belowPocketPx=354 abovePocketPx=0 visualDebtPx=120 movedPx=14 targetPreservedForEasing=1 directWriteBlocked=0 visualSnapSuppressed=0 terminalClampActive=0 asr4VisualRecoveryRecentlyApplied=1 pocketHealth=bottomReading suppressedReason=visual_recovery_cooldown scrollReason=comfort_nudge_follow followMode=live_asr_follow reason=live_follow_pocket_observation',
    );
  });

  test('builds ASR4 pocket drift authority applied diagnostic with expected fields', () => {
    const line = buildAsr4PocketDriftAuthorityAppliedDiagnostic({
      currentLine: 20,
      committedLine: 21,
      targetLine: 21,
      currentScrollTop: 900,
      targetScrollTop: 1020,
      markerTopPx: 268,
      activeLineTopPx: 540,
      activeLineDistanceFromMarkerPx: 390,
      belowPocketPx: 354,
      lineHeightPx: 120,
      consecutiveBelowPocketCount: 2,
      cooldownActive: false,
      terminalClampActive: false,
      authorityAction: 'force_marker_lock_to_pocket',
      movementAllowed: true,
      reason: 'pocket_drift_below_marker',
    });
    expect(line).toBe(
      '[ASR4_POCKET_DRIFT_AUTHORITY_APPLIED] currentLine=20 committedLine=21 targetLine=21 currentScrollTop=900 targetScrollTop=1020 markerTopPx=268 activeLineTopPx=540 activeLineDistanceFromMarkerPx=390 belowPocketPx=354 lineHeightPx=120 consecutiveBelowPocketCount=2 cooldownActive=0 terminalClampActive=0 authorityAction=force_marker_lock_to_pocket movementAllowed=1 reason=pocket_drift_below_marker',
    );
  });

  test('builds low-pocket deadband reconciled diagnostic with expected fields', () => {
    const line = buildAsrLowPocketDeadbandReconciledDiagnostic({
      currentLineIdx: 155,
      committedLineIdx: 157,
      currentScrollTop: 11046,
      targetScrollTop: 11046,
      belowPocketPx: 89,
      activeLineDistanceFromMarkerPx: 106,
      previousHoldReason: 'existing_target_within_deadband',
      correctionPx: 84,
      observations: 3,
    });
    expect(line).toBe(
      '[ASR_LOW_POCKET_DEADBAND_RECONCILED] currentLineIdx=155 committedLineIdx=157 currentScrollTop=11046 targetScrollTop=11046 belowPocketPx=89 activeLineDistanceFromMarkerPx=106 previousHoldReason=existing_target_within_deadband correctionPx=84 observations=3',
    );
  });

  test('builds reader overrun hold diagnostic with expected fields', () => {
    const line = buildAsrReaderOverrunHoldDiagnostic({
      lane: 'ASR1_CURRENT',
      authority: 'asr4-pocket-drift-authority',
      currentLine: 155,
      committedLine: 156,
      targetLine: 156,
      currentScrollTop: 11046,
      markerTopPx: 268,
      currentLineCenterPx: 180,
      currentLineDistanceFromMarkerPx: -88,
      aboveMarkerLines: 1.25,
      holdBufferLines: 3,
      semanticWindowLocal: true,
      holdActive: true,
      reason: 'current_line_within_reader_overrun_buffer',
    });
    expect(line).toBe(
      '[ASR_READER_OVERRUN_HOLD] lane=ASR1_CURRENT authority=asr4-pocket-drift-authority currentLine=155 committedLine=156 targetLine=156 currentScrollTop=11046 markerTopPx=268 currentLineCenterPx=180 currentLineDistanceFromMarkerPx=-88 aboveMarkerLines=1.25 holdBufferLines=3.00 semanticWindowLocal=1 holdActive=1 reason=current_line_within_reader_overrun_buffer',
    );
  });

  test('builds low-pocket deadband blocked diagnostic with expected fields', () => {
    const line = buildAsrLowPocketDeadbandBlockedDiagnostic({
      currentLineIdx: 155,
      committedLineIdx: 157,
      currentScrollTop: 11046,
      targetScrollTop: 11046,
      belowPocketPx: 89,
      activeLineDistanceFromMarkerPx: 106,
      previousHoldReason: 'existing_target_within_deadband',
      correctionPx: 84,
      observations: 2,
      reason: 'unsafe_target',
    });
    expect(line).toBe(
      '[ASR_LOW_POCKET_DEADBAND_BLOCKED] currentLineIdx=155 committedLineIdx=157 currentScrollTop=11046 targetScrollTop=11046 belowPocketPx=89 activeLineDistanceFromMarkerPx=106 previousHoldReason=existing_target_within_deadband correctionPx=84 observations=2 reason=unsafe_target',
    );
  });

  test('builds low-pocket freeze-far-target reconciled diagnostic with expected fields', () => {
    const line = buildAsrLowPocketFreezeFarTargetReconciledDiagnostic({
      currentLineIdx: 155,
      committedLineIdx: 157,
      nextSpeakableLineIdx: 157,
      currentScrollTop: 11046,
      targetScrollTop: 11046,
      proposedScrollTop: 11102,
      belowPocketPx: 89,
      activeLineDistanceFromMarkerPx: 106,
      holdReason: 'existing_target_within_deadband',
      authorityAction: 'freeze_far_target',
      farReason: 'committed_line_far',
      semanticDistance: 1,
      visualDistancePx: 0,
      movementAllowed: true,
      correctionPx: 56,
    });
    expect(line).toBe(
      '[ASR_LOW_POCKET_FREEZE_FAR_TARGET_RECONCILED] currentLineIdx=155 committedLineIdx=157 nextSpeakableLineIdx=157 currentScrollTop=11046 targetScrollTop=11046 proposedScrollTop=11102 belowPocketPx=89 activeLineDistanceFromMarkerPx=106 holdReason=existing_target_within_deadband authorityAction=freeze_far_target farReason=committed_line_far semanticDistance=1 visualDistancePx=0 movementAllowed=1 correctionPx=56',
    );
  });

  test('builds low-pocket freeze-far-target blocked diagnostic with expected fields', () => {
    const line = buildAsrLowPocketFreezeFarTargetBlockedDiagnostic({
      currentLineIdx: 155,
      committedLineIdx: 160,
      nextSpeakableLineIdx: 160,
      currentScrollTop: 11046,
      targetScrollTop: 11046,
      proposedScrollTop: 11102,
      belowPocketPx: 89,
      activeLineDistanceFromMarkerPx: 106,
      holdReason: 'existing_target_within_deadband',
      authorityAction: 'freeze_far_target',
      farReason: 'target_line_far',
      semanticDistance: 5,
      visualDistancePx: 0,
      movementAllowed: false,
      correctionPx: 56,
      blockedReason: 'semantic_distance_unsafe',
    });
    expect(line).toBe(
      '[ASR_LOW_POCKET_FREEZE_FAR_TARGET_BLOCKED] currentLineIdx=155 committedLineIdx=160 nextSpeakableLineIdx=160 currentScrollTop=11046 targetScrollTop=11046 proposedScrollTop=11102 belowPocketPx=89 activeLineDistanceFromMarkerPx=106 holdReason=existing_target_within_deadband authorityAction=freeze_far_target farReason=target_line_far semanticDistance=5 visualDistancePx=0 movementAllowed=0 correctionPx=56 blockedReason=semantic_distance_unsafe',
    );
  });

  test('builds approved visual smoothing bypassed diagnostic with expected fields', () => {
    const line = buildAsrApprovedVisualSmoothingBypassedDiagnostic({
      authority: 'low_pocket_deadband_reconcile',
      currentLineIdx: 155,
      committedLineIdx: 157,
      nextSpeakableLineIdx: 157,
      currentScrollTop: 11046,
      approvedTargetScrollTop: 11102,
      correctionPx: 56,
      visualErrorPx: 106,
      smoothingReason: 'asr-low-pocket-deadband-reconcile',
      bypassReason: 'severe_rescue',
    });
    expect(line).toBe(
      '[ASR_APPROVED_VISUAL_SMOOTHING_BYPASSED] authority=low_pocket_deadband_reconcile currentLineIdx=155 committedLineIdx=157 nextSpeakableLineIdx=157 currentScrollTop=11046 approvedTargetScrollTop=11102 correctionPx=56 visualErrorPx=106 smoothingReason=asr-low-pocket-deadband-reconcile bypassReason=severe_rescue',
    );
  });

  test('builds approved visual smoothing rebased diagnostic with expected fields', () => {
    const line = buildAsrApprovedVisualSmoothingRebasedDiagnostic({
      authority: 'safe_live_pocket_correction',
      currentLineIdx: 155,
      committedLineIdx: 157,
      nextSpeakableLineIdx: 157,
      currentScrollTop: 11046,
      previousTargetScrollTop: 11102,
      approvedTargetScrollTop: 11148,
      correctionPx: 102,
      previousReason: 'safe-live-pocket-correction',
      smoothingReason: 'asr-low-pocket-freeze-far-target-reconcile',
      rebaseReason: 'newer_approved_target',
    });
    expect(line).toBe(
      '[ASR_APPROVED_VISUAL_SMOOTHING_REBASED] authority=safe_live_pocket_correction currentLineIdx=155 committedLineIdx=157 nextSpeakableLineIdx=157 currentScrollTop=11046 previousTargetScrollTop=11102 approvedTargetScrollTop=11148 correctionPx=102 previousReason=safe-live-pocket-correction smoothingReason=asr-low-pocket-freeze-far-target-reconcile rebaseReason=newer_approved_target',
    );
  });

  test('builds accepted local lag reconciled diagnostic with expected fields', () => {
    const line = buildAsrAcceptedLocalLagReconciledDiagnostic({
      currentLineIdx: 185,
      committedLineIdx: 187,
      acceptedLineIdx: 186,
      targetLineIdx: 186,
      nextSpeakableLineIdx: 186,
      currentScrollTop: 13082,
      targetScrollTop: 13177,
      proposedScrollTop: 13138,
      actualMovedPx: 0,
      lineDeltaCurrentToCommitted: 2,
      lineDeltaCurrentToTarget: 1,
      lineDeltaCommittedToTarget: -1,
      lineDeltaCommittedToAccepted: -1,
      lineDeltaToNextSpeakable: 1,
      blockedReason: 'incoherent_current_commit_lines',
      coherenceReason: 'current_to_committed=2,current_to_target=1,committed_to_target=-1,committed_to_accepted=-1,to_next_speakable=1,max_semantic_distance=2',
      speechFresh: true,
      terminalClampActive: false,
      correctionPx: 56,
      movementAllowed: true,
      authoritySource: 'live_follow',
    });
    expect(line).toBe(
      '[ASR_ACCEPTED_LOCAL_LAG_RECONCILED] currentLineIdx=185 committedLineIdx=187 acceptedLineIdx=186 targetLineIdx=186 nextSpeakableLineIdx=186 currentScrollTop=13082 targetScrollTop=13177 proposedScrollTop=13138 actualMovedPx=0 lineDeltaCurrentToCommitted=2 lineDeltaCurrentToTarget=1 lineDeltaCommittedToTarget=-1 lineDeltaCommittedToAccepted=-1 lineDeltaToNextSpeakable=1 blockedReason=incoherent_current_commit_lines coherenceReason=current_to_committed=2,current_to_target=1,committed_to_target=-1,committed_to_accepted=-1,to_next_speakable=1,max_semantic_distance=2 speechFresh=1 terminalClampActive=0 correctionPx=56 movementAllowed=1 authoritySource=live_follow',
    );
  });

  test('builds accepted local lag blocked diagnostic with expected fields', () => {
    const line = buildAsrAcceptedLocalLagBlockedDiagnostic({
      currentLineIdx: 185,
      committedLineIdx: 187,
      acceptedLineIdx: 188,
      targetLineIdx: 186,
      nextSpeakableLineIdx: 188,
      currentScrollTop: 13082,
      targetScrollTop: 13177,
      proposedScrollTop: 13138,
      actualMovedPx: 0,
      lineDeltaCurrentToCommitted: 2,
      lineDeltaCurrentToTarget: 1,
      lineDeltaCommittedToTarget: -1,
      lineDeltaCommittedToAccepted: 1,
      lineDeltaToNextSpeakable: 3,
      blockedReason: 'incoherent_current_commit_lines',
      coherenceReason: 'current_to_committed=2,current_to_target=1,committed_to_target=-1,committed_to_accepted=1,to_next_speakable=3,max_semantic_distance=3',
      speechFresh: true,
      terminalClampActive: false,
      correctionPx: 56,
      movementAllowed: true,
      authoritySource: 'live_follow',
    });
    expect(line).toBe(
      '[ASR_ACCEPTED_LOCAL_LAG_BLOCKED] currentLineIdx=185 committedLineIdx=187 acceptedLineIdx=188 targetLineIdx=186 nextSpeakableLineIdx=188 currentScrollTop=13082 targetScrollTop=13177 proposedScrollTop=13138 actualMovedPx=0 lineDeltaCurrentToCommitted=2 lineDeltaCurrentToTarget=1 lineDeltaCommittedToTarget=-1 lineDeltaCommittedToAccepted=1 lineDeltaToNextSpeakable=3 blockedReason=incoherent_current_commit_lines coherenceReason=current_to_committed=2,current_to_target=1,committed_to_target=-1,committed_to_accepted=1,to_next_speakable=3,max_semantic_distance=3 speechFresh=1 terminalClampActive=0 correctionPx=56 movementAllowed=1 authoritySource=live_follow',
    );
  });

  test('builds reader zone summary diagnostic with expected fields', () => {
    const line = buildAsrReaderZoneSummaryDiagnostic({
      bucketStartLineIdx: 150,
      bucketEndLineIdx: 174,
      timeInPocketMs: 2200,
      timeBelowPocketMs: 4800,
      maxBelowPocketPx: 103,
      readerWaitTimeMs: 3100,
      negativeErrorZeroVelocityMs: 450,
      visualCorrectionCount: 12,
      blockedCorrectionCount: 5,
      recoveryCount: 4,
      terminalClampCount: 1,
      dominantBlockedReason: 'incoherent_current_commit_lines',
      dominantAuthoritySource: 'stall_recovery',
    });
    expect(line).toBe(
      '[ASR_READER_ZONE_SUMMARY] bucketStartLineIdx=150 bucketEndLineIdx=174 timeInPocketMs=2200 timeBelowPocketMs=4800 maxBelowPocketPx=103 readerWaitTimeMs=3100 negativeErrorZeroVelocityMs=450 visualCorrectionCount=12 blockedCorrectionCount=5 recoveryCount=4 terminalClampCount=1 dominantBlockedReason=incoherent_current_commit_lines dominantAuthoritySource=stall_recovery',
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

  test('builds stale recovery target expired diagnostic with expected fields', () => {
    const line = buildAsrStaleRecoveryTargetExpiredDiagnostic({
      sourcePath: 'asr-marker-lock-pocket-recovery',
      reason: 'pocket_authority_contradicts_preserved_recovery_target',
      previousTargetScrollTop: 240.4,
      preservedTargetScrollTop: 240.4,
      pocketTargetScrollTop: 163.1,
      currentScrollTop: 205.2,
      currentLineIdx: 3,
      committedLineIdx: 3,
      nextSpeakableLineIdx: 3,
      visualErrorPx: -42.3,
      tolerancePx: 17.4,
      deltaPxToPreservedTarget: 35.2,
      deltaPxToPocketTarget: -42.1,
    });
    expect(line).toBe(
      '[ASR_STALE_RECOVERY_TARGET_EXPIRED] sourcePath=asr-marker-lock-pocket-recovery reason=pocket_authority_contradicts_preserved_recovery_target previousTargetScrollTop=240 preservedTargetScrollTop=240 pocketTargetScrollTop=163 currentScrollTop=205 currentLineIdx=3 committedLineIdx=3 nextSpeakableLineIdx=3 visualErrorPx=-42 tolerancePx=17 deltaPxToPreservedTarget=35 deltaPxToPocketTarget=-42',
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

  test('builds bridge-reduced visual cash-in diagnostics with expected fields', () => {
    const evaluated = buildAsrBridgeReducedVisualCashInEvaluatedDiagnostic({
      currentLineIdx: 157,
      committedLineIdx: 158,
      requestedTargetIdx: 160,
      semanticTargetIdx: 160,
      visualReducedTargetIdx: 158,
      acceptedCommitTargetIdx: 158,
      nextSpeakableLineIdx: 160,
      bridgeCarry: 3,
      bridgeClamp: 2,
      sourceBranch: 'live_strict_bridge_stale_landing_hold',
      proofSource: 'landing_lexical',
      blockerCategory: 'recovery_chain_blocked',
      recoveryChainBlocked: true,
      noAdjacentMatchHold: false,
      markerLockSuppressed: true,
      lastGuardReason: 'live_strict_proof_owned_commit',
      lastSelectedAuthority: 'hold',
      lastVisualAction: 'hold',
      visualErrorPx: 44,
      belowPocketPx: 31,
      currentScrollTop: 11341,
      targetScrollTop: 11417,
      reason: 'bridge_reduced_blocked_local_candidate',
    });
    expect(evaluated).toBe(
      '[ASR_BRIDGE_REDUCED_VISUAL_CASH_IN_EVALUATED] currentLineIdx=157 committedLineIdx=158 requestedTargetIdx=160 semanticTargetIdx=160 visualReducedTargetIdx=158 acceptedCommitTargetIdx=158 nextSpeakableLineIdx=160 bridgeCarry=3 bridgeClamp=2 sourceBranch=live_strict_bridge_stale_landing_hold proofSource=landing_lexical blockerCategory=recovery_chain_blocked recoveryChainBlocked=1 noAdjacentMatchHold=0 markerLockSuppressed=1 lastGuardReason=live_strict_proof_owned_commit lastSelectedAuthority=hold lastVisualAction=hold visualErrorPx=44 belowPocketPx=31 currentScrollTop=11341 targetScrollTop=11417 reason=bridge_reduced_blocked_local_candidate',
    );

    const applied = buildAsrBridgeReducedVisualCashInAppliedDiagnostic({
      currentLineIdx: 157,
      requestedTargetIdx: 160,
      reducedTargetIdx: 158,
      acceptedCommitTargetIdx: 158,
      previousAcceptedCommitTargetIdx: 157,
      bridgeCarry: 3,
      bridgeClamp: 2,
      blockerCategory: 'recovery_chain_blocked',
      recoveryChainBlocked: true,
      noAdjacentMatchHold: false,
      markerLockSuppressed: true,
      repeatedObservationCount: 3,
      stallDelayMs: 3386,
      visualDebtPx: 52,
      belowPocketPx: 31,
      actualMovedPx: 22,
      reason: 'bridge_reduced_adjacent_recovery_chain_cash_in',
    });
    expect(applied).toBe(
      '[ASR_BRIDGE_REDUCED_VISUAL_CASH_IN_APPLIED] currentLineIdx=157 requestedTargetIdx=160 reducedTargetIdx=158 acceptedCommitTargetIdx=158 previousAcceptedCommitTargetIdx=157 bridgeCarry=3 bridgeClamp=2 blockerCategory=recovery_chain_blocked recoveryChainBlocked=1 noAdjacentMatchHold=0 markerLockSuppressed=1 repeatedObservationCount=3 stallDelayMs=3386 visualDebtPx=52 belowPocketPx=31 actualMovedPx=22 reason=bridge_reduced_adjacent_recovery_chain_cash_in',
    );

    const blocked = buildAsrBridgeReducedVisualCashInBlockedDiagnostic({
      currentLineIdx: 169,
      requestedTargetIdx: 171,
      reducedTargetIdx: 170,
      acceptedCommitTargetIdx: 170,
      previousAcceptedCommitTargetIdx: 169,
      bridgeCarry: 2,
      bridgeClamp: 1,
      blockerCategory: 'no_adjacent_match_hold',
      recoveryChainBlocked: false,
      noAdjacentMatchHold: true,
      markerLockSuppressed: false,
      repeatedObservationCount: 1,
      stallDelayMs: 210,
      visualDebtPx: 28,
      belowPocketPx: 12,
      actualMovedPx: 0,
      reason: 'awaiting_repeat_or_short_delay',
    });
    expect(blocked).toBe(
      '[ASR_BRIDGE_REDUCED_VISUAL_CASH_IN_BLOCKED] currentLineIdx=169 requestedTargetIdx=171 reducedTargetIdx=170 acceptedCommitTargetIdx=170 previousAcceptedCommitTargetIdx=169 bridgeCarry=2 bridgeClamp=1 blockerCategory=no_adjacent_match_hold recoveryChainBlocked=0 noAdjacentMatchHold=1 markerLockSuppressed=0 repeatedObservationCount=1 stallDelayMs=210 visualDebtPx=28 belowPocketPx=12 actualMovedPx=0 reason=awaiting_repeat_or_short_delay',
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

  test('builds visual governor dead-screen unlock evaluated diagnostic with expected fields', () => {
    const line = buildAsrVisualGovernorDeadScreenUnlockEvaluatedDiagnostic({
      currentLineIdx: 53,
      requestedTargetIdx: 54,
      acceptedCommitTargetIdx: 54,
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      governorHoldAgeMs: 5147,
      noCommitMs: 5158,
      transcriptFresh: true,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      freshAdjacentUnlockSeen: true,
      terminalCommitSuppressedByVisualGovernor: true,
      targetCueOnly: false,
      offscriptNoMatch: false,
      hardContradiction: false,
      bridgeTrapActive: false,
      globalHold: true,
      unlockProofEligible: true,
      releaseEligible: true,
    });
    expect(line).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_UNLOCK_EVALUATED] currentLineIdx=53 requestedTargetIdx=54 acceptedCommitTargetIdx=54 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof governorHoldAgeMs=5147 noCommitMs=5158 transcriptFresh=1 speechFresh=1 finalPacketFresh=1 liveSpeechFresh=1 audioBackendFresh=1 freshAdjacentUnlockSeen=1 terminalCommitSuppressedByVisualGovernor=1 targetCueOnly=0 offscriptNoMatch=0 hardContradiction=0 bridgeTrapActive=0 globalHold=1 unlockProofEligible=1 releaseEligible=1',
    );
  });

  test('builds visual governor dead-screen unlock allowed denied and applied diagnostics with expected fields', () => {
    expect(buildAsrVisualGovernorDeadScreenUnlockAllowedDiagnostic({
      currentLineIdx: 53,
      requestedTargetIdx: 54,
      acceptedCommitTargetIdx: 54,
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      freshAdjacentUnlockSeen: true,
      terminalCommitSuppressedByVisualGovernor: true,
      reason: 'adjacent_safe_release',
    })).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_UNLOCK_ALLOWED] currentLineIdx=53 requestedTargetIdx=54 acceptedCommitTargetIdx=54 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof freshAdjacentUnlockSeen=1 terminalCommitSuppressedByVisualGovernor=1 reason=adjacent_safe_release',
    );
    expect(buildAsrVisualGovernorDeadScreenUnlockDeniedDiagnostic({
      currentLineIdx: 53,
      requestedTargetIdx: 54,
      acceptedCommitTargetIdx: 54,
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      freshAdjacentUnlockSeen: true,
      terminalCommitSuppressedByVisualGovernor: true,
      reason: 'release_not_eligible',
    })).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_UNLOCK_DENIED] currentLineIdx=53 requestedTargetIdx=54 acceptedCommitTargetIdx=54 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof freshAdjacentUnlockSeen=1 terminalCommitSuppressedByVisualGovernor=1 reason=release_not_eligible',
    );
    expect(buildAsrVisualGovernorDeadScreenUnlockAppliedDiagnostic({
      currentLineIdx: 53,
      requestedTargetIdx: 54,
      acceptedCommitTargetIdx: 54,
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      freshAdjacentUnlockSeen: true,
      terminalCommitSuppressedByVisualGovernor: true,
      reason: 'adjacent_safe_release',
    })).toBe(
      '[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_UNLOCK_APPLIED] currentLineIdx=53 requestedTargetIdx=54 acceptedCommitTargetIdx=54 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof freshAdjacentUnlockSeen=1 terminalCommitSuppressedByVisualGovernor=1 reason=adjacent_safe_release',
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

  test('builds adjacent recovery catchup path proof diagnostic with expected fields', () => {
    const line = buildAsrAdjacentRecoveryCatchupPathProofDiagnostic({
      currentLineIdx: 23,
      requestedTargetIdx: 25,
      commitTargetIdx: 24,
      proofSource: 'live_strict_local_proof_ok',
      sourceBranch: 'movement_authority_proof',
      finalPacketFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      targetSpeakable: true,
      lowEnough: true,
      visualErrorPx: 11.2,
      boundedVisualTolerancePx: 12,
      bridgeTrapActive: false,
      terminalDeadScreenBlockActive: false,
      alreadyUsedInEpisode: false,
    });
    expect(line).toBe(
      '[ASR_ADJACENT_RECOVERY_CATCHUP_PATH_PROOF] currentLineIdx=23 requestedTargetIdx=25 commitTargetIdx=24 proofSource=live_strict_local_proof_ok sourceBranch=movement_authority_proof finalPacketFresh=1 audioBackendFresh=1 noMatchOrOffscript=0 hardContradiction=0 targetSpeakable=1 lowEnough=1 visualErrorPx=11 boundedVisualTolerancePx=12 bridgeTrapActive=0 terminalDeadScreenBlockActive=0 alreadyUsedInEpisode=0',
    );
  });

  test('builds adjacent recovery catchup bypassed diagnostic with expected fields', () => {
    const line = buildAsrAdjacentRecoveryCatchupBypassedDiagnostic({
      currentLineIdx: 23,
      requestedTargetIdx: 25,
      commitTargetIdx: 24,
      proofSource: 'adjacent_rescue_proofed',
      sourceBranch: 'movement_authority_reconcile',
      reason: 'bridge_branch_owned',
    });
    expect(line).toBe(
      '[ASR_ADJACENT_RECOVERY_CATCHUP_BYPASSED] currentLineIdx=23 requestedTargetIdx=25 commitTargetIdx=24 proofSource=adjacent_rescue_proofed sourceBranch=movement_authority_reconcile reason=bridge_branch_owned',
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

  test('builds visual recovery boost path proof diagnostic with expected fields', () => {
    const line = buildAsrVisualRecoveryBoostPathProofDiagnostic({
      authority: 'bottom_lock_release',
      reason: 'below_tolerated_bottom',
      speechFresh: true,
      proofHealthy: true,
      bridgeBlocked: false,
      targetDebtPx: 332.2,
      lowStateAgeMs: 812.4,
      insidePreferredSettleBand: false,
      insideToleratedBand: false,
    });
    expect(line).toBe(
      '[ASR_VISUAL_RECOVERY_BOOST_PATH_PROOF] authority=bottom_lock_release reason=below_tolerated_bottom speechFresh=1 proofHealthy=1 bridgeBlocked=0 targetDebtPx=332 lowStateAgeMs=812 insidePreferredSettleBand=0 insideToleratedBand=0',
    );
  });

  test('builds visual recovery boost bypassed diagnostic with expected fields', () => {
    const line = buildAsrVisualRecoveryBoostBypassedDiagnostic({
      authority: 'comfort_nudge',
      reason: 'outside_preferred_within_tolerated',
      targetDebtPx: 43.8,
      lowStateAgeMs: 0,
      bypassReason: 'path_not_reached',
    });
    expect(line).toBe(
      '[ASR_VISUAL_RECOVERY_BOOST_BYPASSED] authority=comfort_nudge reason=outside_preferred_within_tolerated targetDebtPx=44 lowStateAgeMs=0 bypassReason=path_not_reached',
    );
  });

  test('builds post adjacent commit visual recovery opened diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryOpenedDiagnostic({
      currentLineIdx: 83,
      committedLineIdx: 84,
      proofSource: 'live_strict_local_proof_ok',
      snapSuppressed: true,
      moved: 0,
      nextSpeakableLineY: 475.4,
      markerY: 390.2,
      targetDebtPx: 212.1,
      visualErrorPx: 8.3,
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_OPENED] currentLineIdx=83 committedLineIdx=84 proofSource=live_strict_local_proof_ok snapSuppressed=1 moved=0 nextSpeakableLineY=475 markerY=390 targetDebtPx=212 visualErrorPx=8',
    );
  });

  test('builds post adjacent commit visual recovery path proof diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryPathProofDiagnostic({
      currentLineIdx: 87,
      committedLineIdx: 88,
      requestedTargetIdx: 88,
      acceptedCommitTargetIdx: 88,
      proofSource: 'rescue_hold_adjacent_release',
      sourceBranch: 'live_strict_rescue_hold_no_local_proof',
      adjacentCommit: true,
      snapSuppressed: true,
      movedPx: 0,
      scrollTopBefore: 6212,
      scrollTopAfter: 6212,
      nextSpeakableLineY: 477.4,
      markerY: 390.2,
      visualErrorPx: 8.1,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      bridgeTrapActive: false,
      deadScreenActive: false,
      noMatchOrOffscript: false,
      hardContradiction: false,
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_PATH_PROOF] currentLineIdx=87 committedLineIdx=88 requestedTargetIdx=88 acceptedCommitTargetIdx=88 proofSource=rescue_hold_adjacent_release sourceBranch=live_strict_rescue_hold_no_local_proof adjacentCommit=1 snapSuppressed=1 movedPx=0 scrollTopBefore=6212 scrollTopAfter=6212 nextSpeakableLineY=477 markerY=390 visualErrorPx=8 speechFresh=1 finalPacketFresh=1 liveSpeechFresh=1 audioBackendFresh=1 bridgeTrapActive=0 deadScreenActive=0 noMatchOrOffscript=0 hardContradiction=0',
    );
  });

  test('builds post adjacent commit visual recovery bypassed diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryBypassedDiagnostic({
      currentLineIdx: 87,
      committedLineIdx: 88,
      requestedTargetIdx: 88,
      acceptedCommitTargetIdx: 88,
      proofSource: 'rescue_hold_adjacent_release',
      sourceBranch: 'live_strict_rescue_hold_no_local_proof',
      reason: 'bridge_owned_branch',
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_BYPASSED] currentLineIdx=87 committedLineIdx=88 requestedTargetIdx=88 acceptedCommitTargetIdx=88 proofSource=rescue_hold_adjacent_release sourceBranch=live_strict_rescue_hold_no_local_proof reason=bridge_owned_branch',
    );
  });

  test('builds post adjacent commit visual recovery applied diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryAppliedDiagnostic({
      authority: 'comfort_nudge',
      targetDebtPx: 212.1,
      appliedDeltaPx: 14.2,
      reason: 'fresh_adjacent_commit_sticky_landing',
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_APPLIED] authority=comfort_nudge targetDebtPx=212 appliedDeltaPx=14 reason=fresh_adjacent_commit_sticky_landing',
    );
  });

  test('builds post adjacent commit visual recovery blocked diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryBlockedDiagnostic({
      reason: 'bridge_trap_active',
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_BLOCKED] reason=bridge_trap_active',
    );
  });

  test('builds post adjacent commit visual recovery open blocked diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryOpenBlockedDiagnostic({
      reason: 'stale_final_packet',
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_OPEN_BLOCKED] reason=stale_final_packet',
    );
  });

  test('builds post adjacent commit visual recovery window cleared diagnostic with expected fields', () => {
    const line = buildAsrPostAdjacentCommitVisualRecoveryWindowClearedDiagnostic({
      currentLineIdx: 87,
      committedLineIdx: 88,
      reason: 'new_commit_superseded',
      elapsedMs: 701.9,
      nextSpeakableLineY: 475.4,
      markerY: 390.2,
    });
    expect(line).toBe(
      '[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_WINDOW_CLEARED] currentLineIdx=87 committedLineIdx=88 reason=new_commit_superseded elapsedMs=702 nextSpeakableLineY=475 markerY=390',
    );
  });

  test('builds scroll chairperson arbitration diagnostic with expected fields', () => {
    const line = buildAsrScrollChairpersonArbitrationDiagnostic({
      chair: 'visual_recovery',
      reason: 'bottom_lock_release',
      semanticTargetIdx: 91,
      acceptedCommitTargetIdx: 84,
      distanceCapTargetIdx: 83,
      currentLineIdx: 82,
      requestedTargetIdx: 84,
      bridgeOwner: 'live_strict_rescue_hold_no_local_proof',
      cueOwner: 'none',
      markerLockState: 'within_hold_tolerance',
      comfortState: 'comfort_nudge_large_debt',
      visualRecoveryState: 'bottom_lock_release',
      hardSafetyState: 'distance_restrict_only',
      safetyCapState: 'bridge_or_cue_context_active',
      postAdjacentRecoveryState: 'blocked:bridge_trap_active',
      targetDebtPx: 212.1,
      appliedDeltaPx: 6.0,
      clampReason: 'min_step_floor',
      gear: 'normal_floor',
      floorFallbackReason: 'marker_lock_suppressed_recovery',
      overruled: 'target_distance_cap|marker_lock_smoothing|comfort_advisory',
    });
    expect(line).toBe(
      '[ASR_SCROLL_CHAIRPERSON_ARBITRATION] chair=visual_recovery reason=bottom_lock_release semanticTargetIdx=91 acceptedCommitTargetIdx=84 distanceCapTargetIdx=83 currentLineIdx=82 requestedTargetIdx=84 bridgeOwner=live_strict_rescue_hold_no_local_proof cueOwner=none markerLockState=within_hold_tolerance comfortState=comfort_nudge_large_debt visualRecoveryState=bottom_lock_release hardSafetyState=distance_restrict_only safetyCapState=bridge_or_cue_context_active postAdjacentRecoveryState=blocked:bridge_trap_active targetDebtPx=212 appliedDeltaPx=6 clampReason=min_step_floor gear=normal_floor floorFallbackReason=marker_lock_suppressed_recovery overruled=target_distance_cap|marker_lock_smoothing|comfort_advisory',
    );
  });

  test('builds recovery gear selected diagnostic with expected fields', () => {
    const line = buildAsrRecoveryGearSelectedDiagnostic({
      currentLineIdx: 82,
      targetLineIdx: 83,
      acceptedCommitTargetIdx: 84,
      cappedTargetIdx: 83,
      targetDebtPx: 212.4,
      appliedDeltaPx: 12.1,
      selectedGear: 'urgent_recovery',
      previousGear: 'normal_floor',
      reason: 'bottom_lock_release',
      hardSafetyClear: true,
      speechFresh: true,
      backendFresh: true,
      nextSpeakableLineY: 476.2,
      overruledControllers: 'target_distance_cap|marker_lock_smoothing|comfort_advisory',
      clampReasonBefore: 'none',
      clampReasonAfter: 'min_step_floor',
      safetyClass: 'distance_restrict_only',
      distanceRestrictionReason: 'bridge_or_cue_context_active',
      absoluteHoldReason: 'none',
      cappedTargetSafe: true,
      urgentRecoveryEligible: true,
      urgentRecoveryBlockedReason: 'none',
    });
    expect(line).toBe(
      '[ASR_RECOVERY_GEAR_SELECTED] currentLineIdx=82 targetLineIdx=83 acceptedCommitTargetIdx=84 cappedTargetIdx=83 targetDebtPx=212 appliedDeltaPx=12 selectedGear=urgent_recovery previousGear=normal_floor reason=bottom_lock_release hardSafetyClear=1 speechFresh=1 backendFresh=1 nextSpeakableLineY=476 overruledControllers=target_distance_cap|marker_lock_smoothing|comfort_advisory clampReasonBefore=none clampReasonAfter=min_step_floor safetyClass=distance_restrict_only distanceRestrictionReason=bridge_or_cue_context_active absoluteHoldReason=none cappedTargetSafe=1 urgentRecoveryEligible=1 urgentRecoveryBlockedReason=none',
    );
  });

  test('large debt plus safe capped target and fresh speech selects urgent recovery gear', () => {
    const decision = decideAsrActuatorRecoveryGear({
      liveAsrActive: true,
      currentLineIdx: 82,
      acceptedCommitTargetIdx: 84,
      cappedTargetIdx: 83,
      authority: 'bottom_lock_release',
      visualRecoveryState: 'bottom_lock_release',
      reason: 'bottom_lock_release',
      targetDebtPx: 212,
      nextSpeakableLineY: 476,
      preferredBandBottom: 450,
      hardSafetyState: 'distance_restrict_only',
      safetyCapState: 'bridge_or_cue_context_active',
      speechFresh: true,
      backendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: false,
      recoveryActive: true,
      recoveryMinStepPx: 12,
      recoveryMaxStepPx: 16,
    });
    expect(decision.selectedGear).toBe('urgent_recovery');
    expect(decision.minStepPx).toBeGreaterThan(6);
    expect(decision.safetyClass).toBe('distance_restrict_only');
    expect(decision.cappedTargetSafe).toBe(true);
  });

  test('hard safety veto prevents urgent recovery gear', () => {
    const decision = decideAsrActuatorRecoveryGear({
      liveAsrActive: true,
      currentLineIdx: 82,
      acceptedCommitTargetIdx: 83,
      cappedTargetIdx: 83,
      authority: 'bottom_lock_release',
      visualRecoveryState: 'bottom_lock_release',
      reason: 'bottom_lock_release',
      targetDebtPx: 212,
      nextSpeakableLineY: 476,
      preferredBandBottom: 450,
      hardSafetyState: 'absolute_hold',
      safetyCapState: 'none',
      speechFresh: true,
      backendFresh: false,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: false,
      recoveryActive: true,
      recoveryMinStepPx: 12,
      recoveryMaxStepPx: 16,
    });
    expect(decision.selectedGear).toBe('normal_floor');
    expect(decision.safetyClass).toBe('absolute_hold');
    expect(decision.urgentRecoveryBlockedReason).toBe('backend_stale');
  });

  test('offscript no-match contradiction conditions prevent urgent recovery gear', () => {
    const decision = decideAsrActuatorRecoveryGear({
      liveAsrActive: true,
      currentLineIdx: 82,
      acceptedCommitTargetIdx: 83,
      cappedTargetIdx: 83,
      authority: 'preferred_lower_rail_release',
      visualRecoveryState: 'preferred_lower_rail_release',
      reason: 'preferred_lower_rail_release',
      targetDebtPx: 260,
      nextSpeakableLineY: 500,
      preferredBandBottom: 450,
      hardSafetyState: 'clear',
      safetyCapState: 'none',
      speechFresh: true,
      backendFresh: true,
      noMatchOrOffscript: true,
      hardContradiction: true,
      terminalClampActive: false,
      recoveryActive: true,
      recoveryMinStepPx: 14,
      recoveryMaxStepPx: 18,
    });
    expect(decision.selectedGear).toBe('normal_floor');
    expect(decision.urgentRecoveryBlockedReason).toBe('no_match_or_offscript');
  });

  test('small debt keeps normal floor gear', () => {
    const decision = decideAsrActuatorRecoveryGear({
      liveAsrActive: true,
      currentLineIdx: 82,
      acceptedCommitTargetIdx: 83,
      cappedTargetIdx: 83,
      authority: 'bottom_lock_release',
      visualRecoveryState: 'bottom_lock_release',
      reason: 'bottom_lock_release',
      targetDebtPx: 60,
      nextSpeakableLineY: 476,
      preferredBandBottom: 450,
      hardSafetyState: 'clear',
      safetyCapState: 'none',
      speechFresh: true,
      backendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: false,
      recoveryActive: false,
      recoveryMinStepPx: 0,
      recoveryMaxStepPx: 0,
    });
    expect(decision.selectedGear).toBe('normal_floor');
  });

  test('distance cap can restrict target without forcing six-pixel gear when capped target is safe', () => {
    const decision = decideAsrActuatorRecoveryGear({
      liveAsrActive: true,
      currentLineIdx: 40,
      acceptedCommitTargetIdx: 43,
      cappedTargetIdx: 41,
      authority: 'preferred_lower_rail_release',
      visualRecoveryState: 'preferred_lower_rail_release',
      reason: 'preferred_lower_rail_release',
      targetDebtPx: 260,
      nextSpeakableLineY: 500,
      preferredBandBottom: 450,
      hardSafetyState: 'distance_restrict_only',
      safetyCapState: 'bridge_or_cue_context_active',
      speechFresh: true,
      backendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: false,
      recoveryActive: true,
      recoveryMinStepPx: 14,
      recoveryMaxStepPx: 18,
    });
    expect(decision.selectedGear).toBe('urgent_recovery');
    expect(decision.minStepPx).toBeGreaterThan(6);
    expect(decision.safetyClass).toBe('distance_restrict_only');
  });

  test('true terminal clamp blocks urgent recovery gear', () => {
    const decision = decideAsrActuatorRecoveryGear({
      liveAsrActive: true,
      currentLineIdx: 98,
      acceptedCommitTargetIdx: 99,
      cappedTargetIdx: 99,
      authority: 'bottom_lock_release',
      visualRecoveryState: 'bottom_lock_release',
      reason: 'bottom_lock_release',
      targetDebtPx: 220,
      nextSpeakableLineY: 480,
      preferredBandBottom: 450,
      hardSafetyState: 'clear',
      safetyCapState: 'none',
      speechFresh: true,
      backendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      terminalClampActive: true,
      recoveryActive: true,
      recoveryMinStepPx: 12,
      recoveryMaxStepPx: 16,
    });
    expect(decision.selectedGear).toBe('normal_floor');
    expect(decision.safetyClass).toBe('absolute_hold');
    expect(decision.urgentRecoveryBlockedReason).toBe('terminal_max_scroll_clamp');
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

  test('post adjacent commit visual recovery decision allows fresh low sticky landing', () => {
    expect(decideAsrPostAdjacentCommitVisualRecovery({
      windowActive: true,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      bridgeTrapActive: false,
      deadScreenActive: false,
      alreadyInBand: false,
      targetDebtPx: 212,
    })).toEqual({ allow: true, minStepPx: 12, maxStepPx: 16 });
  });

  test('post adjacent commit visual recovery decision blocks safety and stale cases', () => {
    expect(decideAsrPostAdjacentCommitVisualRecovery({
      windowActive: true,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      bridgeTrapActive: true,
      deadScreenActive: false,
      alreadyInBand: false,
      targetDebtPx: 212,
    })).toEqual({ allow: false, reason: 'bridge_trap_active' });
    expect(decideAsrPostAdjacentCommitVisualRecovery({
      windowActive: true,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: true,
      bridgeTrapActive: false,
      deadScreenActive: false,
      alreadyInBand: false,
      targetDebtPx: 212,
    })).toEqual({ allow: false, reason: 'no_match_or_offscript' });
    expect(decideAsrPostAdjacentCommitVisualRecovery({
      windowActive: true,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      bridgeTrapActive: false,
      deadScreenActive: true,
      alreadyInBand: false,
      targetDebtPx: 212,
    })).toEqual({ allow: false, reason: 'dead_screen_active' });
    expect(decideAsrPostAdjacentCommitVisualRecovery({
      windowActive: true,
      speechFresh: false,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      bridgeTrapActive: false,
      deadScreenActive: false,
      alreadyInBand: false,
      targetDebtPx: 212,
    })).toEqual({ allow: false, reason: 'stale_speech' });
    expect(decideAsrPostAdjacentCommitVisualRecovery({
      windowActive: false,
      speechFresh: true,
      finalPacketFresh: true,
      liveSpeechFresh: true,
      audioBackendFresh: true,
      noMatchOrOffscript: false,
      bridgeTrapActive: false,
      deadScreenActive: false,
      alreadyInBand: false,
      targetDebtPx: 212,
    })).toEqual({ allow: false, reason: 'window_expired' });
  });
});

describe('ASR scroll authority resolver', () => {
  function makeAuthorityInput(
    overrides: Partial<ResolveAsrScrollAuthorityInput> = {},
  ): ResolveAsrScrollAuthorityInput {
    return {
      currentLineIdx: 10,
      requestedTargetIdx: 15,
      semanticTargetIdx: 15,
      acceptedCommitTargetIdx: 14,
      distanceCapTargetIdx: 14,
      bridgeOwner: 'bridge_cap',
      cueOwner: 'none',
      markerLockState: 'marker_lock_suppressed',
      comfortState: 'comfort_nudge_large_debt',
      visualRecoveryState: 'bottom_lock_release',
      hardSafetyState: 'clear',
      safetyCapState: 'bridge_or_cue_context_active',
      visualGovernorState: 'follow',
      postAdjacentRecoveryState: 'inactive',
      targetDebtPx: 168,
      markerY: 320,
      nextSpeakableLineY: 840,
      preferredBandTop: 250,
      preferredSettleBottom: 360,
      preferredBandBottom: 410,
      toleratedBandBottom: 430,
      lineHeightPx: 56,
      terminalClampActive: false,
      speechFresh: true,
      backendFresh: true,
      noMatchOrOffscript: false,
      hardContradiction: false,
      ...overrides,
    };
  }

  test('absolute safety veto beats all lower authorities', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        terminalClampActive: true,
      }),
    );
    expect(resolved.movementAllowed).toBe(false);
    expect(resolved.vetoAuthority).toBe('absolute_safety');
    expect(resolved.finalGear).toBe('hold');
    expect(resolved.reason).toBe('terminal_max_scroll_clamp');
  });

  test('semantic target plus bridge cap yields capped allowed target', () => {
    const resolved = resolveAsrScrollAuthority(makeAuthorityInput());
    expect(resolved.semanticTargetIdx).toBe(15);
    expect(resolved.allowedTargetIdx).toBe(14);
    expect(resolved.bridgeCueCapApplied).toBe(true);
    expect(resolved.cappedTargetSafe).toBe(true);
  });

  test('fresh final packet prevents false stale backend veto', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        speechFresh: true,
        backendFresh: false,
        finalPacketFresh: true,
        audioPacketFresh: false,
      }),
    );
    expect(resolved.movementAllowed).toBe(true);
    expect(resolved.vetoAuthority).toBeNull();
    expect(resolved.finalGear).toBe('recovery');
  });

  test('fresh audio packet plus fresh speech prevents false stale backend veto', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        speechFresh: true,
        backendFresh: false,
        finalPacketFresh: false,
        audioPacketFresh: true,
      }),
    );
    expect(resolved.movementAllowed).toBe(true);
    expect(resolved.vetoAuthority).toBeNull();
  });

  test('safe capped target plus large debt resolves recovery with pocket envelope authority', () => {
    const resolved = resolveAsrScrollAuthority(makeAuthorityInput());
    expect(resolved.finalGear).toBe('recovery');
    expect(resolved.movementEnvelopeAuthority).toBe('reader_pocket_envelope');
    expect(resolved.motionAuthority).toBe('visual_recovery');
    expect(resolved.pocketState).toBe('bottom_locked');
    expect(resolved.markerViewportLine).toBe(6);
    expect(resolved.readViewportLine).toBe(15);
    expect(resolved.distanceFromMarkerLines).toBe(9);
  });

  test('target distance cap may coexist with recovery gear', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        bridgeOwner: 'distance_cap',
        safetyCapState: 'lead_aware_distance_cap',
        visualRecoveryState: 'preferred_lower_rail_release',
        comfortState: 'inactive',
        nextSpeakableLineY: 728,
      }),
    );
    expect(resolved.bridgeCueCapApplied).toBe(true);
    expect(resolved.allowedTargetIdx).toBe(14);
    expect(resolved.finalGear).toBe('recovery');
  });

  test.each([
    ['below_preferred_pocket', { nextSpeakableLineY: 616, visualRecoveryState: 'inactive', comfortState: 'inactive' }],
    ['near_lower_rail', { nextSpeakableLineY: 728, visualRecoveryState: 'preferred_lower_rail_release', comfortState: 'inactive' }],
    ['bottom_locked', { nextSpeakableLineY: 840, visualRecoveryState: 'bottom_lock_release', comfortState: 'comfort_nudge_large_debt' }],
  ] as const)('pocket state %s resolves recovery when no veto is active', (_name, overrides) => {
    const resolved = resolveAsrScrollAuthority(makeAuthorityInput(overrides));
    expect(resolved.pocketState).toBe(_name);
    expect(resolved.finalGear).toBe('recovery');
  });

  test('marker lock cannot demote recovery to normal floor', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        markerLockState: 'live_asr_marker_lock_suppressed',
      }),
    );
    expect(resolved.smoothingAuthority).toBe('marker_lock_smoothing');
    expect(resolved.finalGear).toBe('recovery');
  });

  test('reader comfort cannot silently veto recovery', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        comfortState: 'comfort_hold_preferred_pocket',
        visualRecoveryState: 'preferred_lower_rail_release',
        nextSpeakableLineY: 728,
      }),
    );
    expect(resolved.movementAllowed).toBe(true);
    expect(resolved.finalGear).toBe('recovery');
  });

  test('small debt stays in normal gear', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        targetDebtPx: 48,
        visualRecoveryState: 'inactive',
        comfortState: 'inactive',
        nextSpeakableLineY: 616,
      }),
    );
    expect(resolved.finalGear).toBe('normal_floor');
    expect(resolved.reason).toBe('recovery_not_selected');
  });

  test('big debt normal floor resolution carries an explicit reason', () => {
    const resolved = resolveAsrScrollAuthority(
      makeAuthorityInput({
        targetDebtPx: 160,
        speechFresh: false,
        backendFresh: true,
        visualRecoveryState: 'preferred_lower_rail_release',
        comfortState: 'inactive',
        nextSpeakableLineY: 728,
      }),
    );
    expect(resolved.finalGear).toBe('normal_floor');
    expect(resolved.reason).toBe('recovery_not_selected');
  });

  test('builds resolved authority diagnostic with comparison fields', () => {
    const line = buildAsrScrollAuthorityResolvedDiagnostic({
      currentLineIdx: 10,
      requestedTargetIdx: 15,
      semanticTargetIdx: 15,
      allowedTargetIdx: 14,
      movementAllowed: true,
      vetoAuthority: null,
      targetAuthority: 'semantic_target',
      movementEnvelopeAuthority: 'reader_pocket_envelope',
      motionAuthority: 'visual_recovery',
      smoothingAuthority: 'marker_lock_smoothing',
      finalGear: 'recovery',
      finalMinStepPx: 12,
      targetDebtPx: 168,
      appliedDeltaPx: 6,
      clampReason: 'min_step_floor',
      pocketState: 'bottom_locked',
      oldPocketState: 'bottom_locked',
      markerCenteredPocketState: 'bottom_locked',
      markerViewportLine: 6,
      readViewportLine: 15,
      distanceFromMarkerLines: 9,
      preferredTopLine: 2,
      preferredBottomLine: 10,
      movementEnvelopePx: 60,
      movementEnvelopeReason: 'bottom_lock_release',
      bridgeCueCapApplied: true,
      cappedTargetSafe: true,
      overruledAuthorities: ['reader_comfort'],
      reason: 'bottom_lock_release',
      chairpersonChair: 'target_distance_cap',
      chairpersonGear: 'normal_floor',
      chairpersonFloorFallbackReason: 'distance_cap_normal_gear',
      actualAppliedDeltaPx: 6,
      actualClampReason: 'min_step_floor',
    });
    expect(line).toContain('[ASR_SCROLL_AUTHORITY_RESOLVED]');
    expect(line).toContain('movementEnvelopeAuthority=reader_pocket_envelope');
    expect(line).toContain('pocketState=bottom_locked');
    expect(line).toContain('markerViewportLine=6');
    expect(line).toContain('readViewportLine=15');
    expect(line).toContain('distanceFromMarkerLines=9');
    expect(line).toContain('chairpersonChair=target_distance_cap');
    expect(line).toContain('actualAppliedDeltaPx=6');
  });

  test('builds accumulation snapshot diagnostic with expected counters', () => {
    const line = buildAsrAccumulationSnapshotDiagnostic({
      commitCount: 27,
      eventsSinceCommit: 4,
      finalsSinceCommit: 2,
      alignmentEpisodeCount: 11,
      activeEpisodeActions: 19,
      activeEpisodeDeltaSamples: 19,
      activeEpisodeReasonChain: 7,
      guardEventsCount: 23,
      strongHitsCount: 2,
      evidenceEntriesCount: 3,
      consistencyEntriesCount: 5,
      bridgeBlockMapSize: 6,
      bridgeTrapMapSize: 2,
      logBufferEntryCount: 1800,
      logBufferDroppedCount: 0,
      visualGovernorHoldAgeMs: 3200,
      noProgressStreak: 4,
      lostForwardWallStreak: 1,
      targetDebtPx: 212,
      distanceToMaxScrollTop: 1440,
      currentLineIdx: 82,
      requestedTargetIdx: 84,
    });
    expect(line).toContain('[ASR_ACCUMULATION_SNAPSHOT]');
    expect(line).toContain('alignmentEpisodeCount=11');
    expect(line).toContain('guardEventsCount=23');
    expect(line).toContain('logBufferEntryCount=1800');
    expect(line).toContain('distanceToMaxScrollTop=1440');
  });

  test('builds live scroll stalled diagnostic with recovery and restart actions', () => {
    const line = buildAsrLiveScrollStalledDiagnostic({
      currentLineIdx: 82,
      requestedTargetIdx: 84,
      semanticTargetIdx: 84,
      allowedTargetIdx: 83,
      acceptedCommitTargetIdx: 84,
      recoveryTargetIdx: 83,
      movementAllowed: true,
      finalGear: 'recovery',
      pocketState: 'bottom_locked',
      cappedTargetSafe: true,
      targetDebtPx: 212,
      noVisualProgressMs: 2400,
      noCommitMs: 2600,
      speechFresh: true,
      audioFresh: true,
      backendFresh: false,
      transcriptAgeMs: 9600,
      audioAgeMs: 420,
      backendTranscriptStale: true,
      forwardEvidenceExists: true,
      visualGovernorHoldActive: true,
      restartAction: 'restart_cooldown_blocked',
      recoveryAction: 'safe_capped_recovery',
      reason: 'stale_backend_safe_capped_target',
    });
    expect(line).toContain('[ASR_LIVE_SCROLL_STALLED]');
    expect(line).toContain('recoveryTargetIdx=83');
    expect(line).toContain('movementAllowed=1');
    expect(line).toContain('restartAction=restart_cooldown_blocked');
    expect(line).toContain('recoveryAction=safe_capped_recovery');
  });
});
