import {
  buildAsr4MotionDiagnostic,
  buildAsr4MotionRenderRequest,
} from '../../src/features/asr/asr4-motion-contract';
import { decideAsr4AuthorityPipeline } from '../../src/features/asr/asr4-authority-pipeline';
import { evaluateAsr4FreshTailVeto } from '../../src/features/asr/asr4-fresh-tail-veto';
import {
  buildAsr4LocalAuthorityDiagnostic,
  decideAsr4LocalAuthority,
} from '../../src/features/asr/asr4-local-authority';
import {
  buildAsr4MarkerPocketDiagnostic,
  evaluateAsr4MarkerPocket,
} from '../../src/features/asr/asr4-marker-pocket';
import {
  buildAsr4RecoveryBudgetDiagnostic,
  evaluateAsr4RecoveryBudget,
} from '../../src/features/asr/asr4-recovery-budget';
import {
  buildAsr4WhisperAdvisoryDiagnostic,
  buildAsr4WhisperAdvisoryEvidence,
} from '../../src/features/asr/asr4-whisper-advisory';

describe('ASR4 authority scaffold', () => {
  test('WhisperBridge advisory evidence alone cannot authorize movement', () => {
    const whisper = buildAsr4WhisperAdvisoryEvidence({
      hintLine: 44,
      referenceLine: 43,
      confidence: 0.92,
      transcriptAgeMs: 880,
      correctionKind: 'reanchor_hint',
    });

    expect(whisper.role).toBe('advisory_only');
    expect(whisper.canAuthorizeMovement).toBe(false);
    expect(buildAsr4WhisperAdvisoryDiagnostic(whisper)).toContain('ASR4_WHISPER_ADVISORY_EVIDENCE');

    const pipeline = decideAsr4AuthorityPipeline({
      localAuthority: {
        currentLine: 40,
        requestedTargetLine: 44,
        freshNearbyProof: false,
        nearbyProofLine: null,
      },
      whisperAdvisory: {
        hintLine: 44,
        referenceLine: 43,
        confidence: 0.92,
        transcriptAgeMs: 880,
        correctionKind: 'reanchor_hint',
      },
      freshTailVeto: {
        freshTailText: 'probably line forty four',
        nearbyScriptText: 'probably line forty four',
        tailMatchesNearbyScript: true,
      },
      markerPocket: {
        markerViewportLine: 12,
        readViewportLine: 12,
      },
      recoveryBudget: {
        msSinceSafeReanchor: 600,
        hasSafeReanchor: true,
        hasFreshLocalProof: false,
      },
      motion: {
        currentVisibleLine: 40,
        currentScrollTop: 1000,
        targetScrollTop: 1100,
      },
    });

    expect(pipeline.finalMovementAllowed).toBe(false);
    expect(pipeline.finalTargetLine).toBeNull();
  });

  test('fresh off-script tail veto blocks movement even if old rolling context matches script', () => {
    const veto = evaluateAsr4FreshTailVeto({
      freshTailText: 'buy my new toaster',
      nearbyScriptText: 'welcome back to the show',
      tailMatchesNearbyScript: false,
      rollingContextMatchesScript: true,
    });

    expect(veto.vetoActive).toBe(true);
    expect(veto.reason).toBe('fresh_tail_offscript_overrides_old_context');

    const pipeline = decideAsr4AuthorityPipeline({
      localAuthority: {
        currentLine: 20,
        requestedTargetLine: 21,
        freshNearbyProof: true,
        nearbyProofLine: 21,
      },
      whisperAdvisory: {
        hintLine: 24,
        confidence: 0.88,
      },
      freshTailVeto: {
        freshTailText: 'buy my new toaster',
        nearbyScriptText: 'welcome back to the show',
        tailMatchesNearbyScript: false,
        rollingContextMatchesScript: true,
      },
      markerPocket: {
        markerViewportLine: 10,
        readViewportLine: 10,
      },
      recoveryBudget: {
        msSinceSafeReanchor: 200,
        hasSafeReanchor: true,
        hasFreshLocalProof: true,
      },
      motion: {
        currentVisibleLine: 20,
        currentScrollTop: 500,
        targetScrollTop: 540,
      },
    });

    expect(pipeline.localAuthority.canAuthorizeMovement).toBe(true);
    expect(pipeline.finalMovementAllowed).toBe(false);
    expect(pipeline.freezeReason).toBe('fresh_tail_offscript_overrides_old_context');
  });

  test('local fresh nearby proof can authorize a bounded movement request', () => {
    const decision = decideAsr4LocalAuthority({
      currentLine: 30,
      requestedTargetLine: 35,
      freshNearbyProof: true,
      nearbyProofLine: 34,
      maxForwardLines: 2,
    });

    expect(decision.status).toBe('authorize');
    expect(decision.canAuthorizeMovement).toBe(true);
    expect(decision.boundedTargetLine).toBe(32);
    expect(decision.boundedDeltaLines).toBe(2);
    expect(buildAsr4LocalAuthorityDiagnostic(decision)).toContain('ASR4_LOCAL_AUTHORITY_DECISION');
  });

  test('marker pocket reports safe, near-rail, and bottom-lock using marker plus/minus four visible lines', () => {
    const safe = evaluateAsr4MarkerPocket({
      markerViewportLine: 10,
      readViewportLine: 12,
    });
    expect(safe.pocketState).toBe('safe');

    const nearRail = evaluateAsr4MarkerPocket({
      markerViewportLine: 10,
      readViewportLine: 14,
    });
    expect(nearRail.pocketState).toBe('near_rail');

    const bottomLock = evaluateAsr4MarkerPocket({
      markerViewportLine: 10,
      readViewportLine: 15,
    });
    expect(bottomLock.pocketState).toBe('bottom_lock');
    expect(buildAsr4MarkerPocketDiagnostic(bottomLock)).toContain('ASR4_MARKER_POCKET_STATE');
  });

  test('recovery budget enters freeze state after two seconds without safe re-anchor', () => {
    const recovering = evaluateAsr4RecoveryBudget({
      msSinceSafeReanchor: 1499,
      hasSafeReanchor: false,
      hasFreshLocalProof: false,
    });
    expect(recovering.recoveryState).toBe('recovering');

    const frozen = evaluateAsr4RecoveryBudget({
      msSinceSafeReanchor: 2000,
      hasSafeReanchor: false,
      hasFreshLocalProof: false,
    });
    expect(frozen.recoveryState).toBe('freeze');
    expect(frozen.movementAllowed).toBe(false);
    expect(frozen.waitingForFreshLocalProof).toBe(true);
    expect(buildAsr4RecoveryBudgetDiagnostic(frozen)).toContain('ASR4_RECOVERY_BUDGET_STATE');
  });

  test('motion contract preserves immediate authority target while requiring eased visible movement', () => {
    const request = buildAsr4MotionRenderRequest({
      authorityTargetLine: 48,
      currentVisibleLine: 44,
      currentScrollTop: 1200,
      targetScrollTop: 1360,
    });

    expect(request.immediateAuthorityTargetLine).toBe(48);
    expect(request.mode).toBe('eased_follow');
    expect(request.requiresEasedMovement).toBe(true);
    expect(buildAsr4MotionDiagnostic(request)).toContain('ASR4_MOTION_RENDER_REQUEST');
  });

  test('pipeline precedence keeps veto above advisory and local authority, and recovery freeze waits for fresh proof', () => {
    const vetoFreeze = decideAsr4AuthorityPipeline({
      localAuthority: {
        currentLine: 60,
        requestedTargetLine: 61,
        freshNearbyProof: true,
        nearbyProofLine: 61,
      },
      whisperAdvisory: {
        hintLine: 65,
        confidence: 0.94,
        correctionKind: 'reanchor_hint',
      },
      freshTailVeto: {
        freshTailText: 'totally unrelated phrase',
        nearbyScriptText: 'the actual script line',
        tailMatchesNearbyScript: false,
        rollingContextMatchesScript: true,
      },
      markerPocket: {
        markerViewportLine: 11,
        readViewportLine: 11,
      },
      recoveryBudget: {
        msSinceSafeReanchor: 2400,
        hasSafeReanchor: false,
        hasFreshLocalProof: true,
      },
      motion: {
        currentVisibleLine: 60,
        currentScrollTop: 1400,
        targetScrollTop: 1440,
      },
    });
    expect(vetoFreeze.finalMovementAllowed).toBe(false);
    expect(vetoFreeze.freezeReason).toBe('fresh_tail_offscript_overrides_old_context');

    const recoveryFreeze = decideAsr4AuthorityPipeline({
      localAuthority: {
        currentLine: 70,
        requestedTargetLine: 72,
        freshNearbyProof: false,
        nearbyProofLine: null,
      },
      whisperAdvisory: {
        hintLine: 72,
        confidence: 0.91,
      },
      freshTailVeto: {
        freshTailText: 'we are still on script',
        nearbyScriptText: 'we are still on script',
        tailMatchesNearbyScript: true,
      },
      markerPocket: {
        markerViewportLine: 10,
        readViewportLine: 15,
      },
      recoveryBudget: {
        msSinceSafeReanchor: 2100,
        hasSafeReanchor: false,
        hasFreshLocalProof: false,
      },
      motion: {
        currentVisibleLine: 70,
        currentScrollTop: 1500,
        targetScrollTop: 1600,
      },
    });

    expect(recoveryFreeze.finalMovementAllowed).toBe(false);
    expect(recoveryFreeze.freezeReason).toBe('recovery_budget_exhausted_waiting_for_fresh_local_proof');

    const localProofClearsFreeze = decideAsr4AuthorityPipeline({
      localAuthority: {
        currentLine: 70,
        requestedTargetLine: 72,
        freshNearbyProof: true,
        nearbyProofLine: 72,
      },
      whisperAdvisory: {
        hintLine: 75,
        confidence: 0.91,
      },
      freshTailVeto: {
        freshTailText: 'we are still on script',
        nearbyScriptText: 'we are still on script',
        tailMatchesNearbyScript: true,
      },
      markerPocket: {
        markerViewportLine: 10,
        readViewportLine: 11,
      },
      recoveryBudget: {
        msSinceSafeReanchor: 2100,
        hasSafeReanchor: false,
        hasFreshLocalProof: true,
      },
      motion: {
        currentVisibleLine: 70,
        currentScrollTop: 1500,
        targetScrollTop: 1580,
      },
    });

    expect(localProofClearsFreeze.finalMovementAllowed).toBe(true);
    expect(localProofClearsFreeze.finalTargetLine).toBe(72);
    expect(localProofClearsFreeze.freezeReason).toBeNull();
  });
});
