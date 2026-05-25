import type {
  Asr4AuthorityDecision,
  Asr4AuthorityPipelineInput,
} from './asr4-authority.types';
import { evaluateAsr4FreshTailVeto } from './asr4-fresh-tail-veto';
import { decideAsr4LocalAuthority } from './asr4-local-authority';
import { evaluateAsr4MarkerPocket } from './asr4-marker-pocket';
import { buildAsr4MotionRenderRequest } from './asr4-motion-contract';
import { evaluateAsr4RecoveryBudget } from './asr4-recovery-budget';
import { buildAsr4WhisperAdvisoryEvidence } from './asr4-whisper-advisory';

export function decideAsr4AuthorityPipeline(input: Asr4AuthorityPipelineInput): Asr4AuthorityDecision {
  const whisperAdvisory = buildAsr4WhisperAdvisoryEvidence(input.whisperAdvisory);
  const freshTailVeto = evaluateAsr4FreshTailVeto(input.freshTailVeto);
  const markerPocket = evaluateAsr4MarkerPocket(input.markerPocket);
  const recoveryBudget = evaluateAsr4RecoveryBudget(input.recoveryBudget);
  const localAuthority = decideAsr4LocalAuthority(input.localAuthority);

  let finalMovementAllowed = false;
  let finalTargetLine: number | null = null;
  let freezeReason: string | null = null;

  if (freshTailVeto.vetoActive) {
    freezeReason = freshTailVeto.reason;
  } else if (recoveryBudget.recoveryState === 'freeze' && !localAuthority.canAuthorizeMovement) {
    freezeReason = recoveryBudget.reason;
  } else if (localAuthority.canAuthorizeMovement) {
    finalMovementAllowed = true;
    finalTargetLine = localAuthority.boundedTargetLine;
  }

  const motionRequest = buildAsr4MotionRenderRequest({
    authorityTargetLine: finalTargetLine,
    currentVisibleLine: input.motion.currentVisibleLine,
    currentScrollTop: input.motion.currentScrollTop,
    targetScrollTop: input.motion.targetScrollTop,
  });

  return {
    localAuthority,
    whisperAdvisory,
    freshTailVeto,
    markerPocket,
    recoveryBudget,
    motionRequest,
    finalMovementAllowed,
    finalTargetLine,
    freezeReason,
  };
}

