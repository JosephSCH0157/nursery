import {
  ASR4_LOCAL_AUTHORITY_DECISION,
  type Asr4LocalAuthorityDecision,
  type Asr4LocalAuthorityInput,
} from './asr4-authority.types';

function clampForwardTarget(currentLine: number, requestedTargetLine: number, maxForwardLines: number): number {
  return Math.min(requestedTargetLine, currentLine + Math.max(1, Math.floor(maxForwardLines)));
}

export function decideAsr4LocalAuthority(input: Asr4LocalAuthorityInput): Asr4LocalAuthorityDecision {
  const maxForwardLines = Math.max(1, Math.floor(input.maxForwardLines ?? 2));
  const currentLine = Math.floor(input.currentLine);
  const requestedTargetLine = Math.floor(input.requestedTargetLine);
  const nearbyProofLine = input.nearbyProofLine == null ? null : Math.floor(input.nearbyProofLine);

  if (!input.freshNearbyProof || nearbyProofLine == null) {
    return {
      tag: ASR4_LOCAL_AUTHORITY_DECISION,
      lane: 'local_authority',
      status: 'hold',
      canAuthorizeMovement: false,
      hasFreshNearbyProof: false,
      requestedTargetLine,
      boundedTargetLine: null,
      boundedDeltaLines: 0,
      reason: 'fresh_nearby_proof_missing',
    };
  }

  if (nearbyProofLine < currentLine) {
    return {
      tag: ASR4_LOCAL_AUTHORITY_DECISION,
      lane: 'local_authority',
      status: 'hold',
      canAuthorizeMovement: false,
      hasFreshNearbyProof: true,
      requestedTargetLine,
      boundedTargetLine: null,
      boundedDeltaLines: 0,
      reason: 'proof_behind_current_line',
    };
  }

  const boundedTargetLine = clampForwardTarget(currentLine, Math.min(requestedTargetLine, nearbyProofLine), maxForwardLines);
  const boundedDeltaLines = Math.max(0, boundedTargetLine - currentLine);

  if (boundedDeltaLines <= 0) {
    return {
      tag: ASR4_LOCAL_AUTHORITY_DECISION,
      lane: 'local_authority',
      status: 'hold',
      canAuthorizeMovement: false,
      hasFreshNearbyProof: true,
      requestedTargetLine,
      boundedTargetLine: currentLine,
      boundedDeltaLines: 0,
      reason: 'no_forward_bounded_movement',
    };
  }

  return {
    tag: ASR4_LOCAL_AUTHORITY_DECISION,
    lane: 'local_authority',
    status: 'authorize',
    canAuthorizeMovement: true,
    hasFreshNearbyProof: true,
    requestedTargetLine,
    boundedTargetLine,
    boundedDeltaLines,
    reason: 'fresh_nearby_proof_bounded_forward',
  };
}

export function buildAsr4LocalAuthorityDiagnostic(decision: Asr4LocalAuthorityDecision): string {
  return `[${decision.tag}] status=${decision.status} canAuthorizeMovement=${decision.canAuthorizeMovement ? 1 : 0} hasFreshNearbyProof=${decision.hasFreshNearbyProof ? 1 : 0} requestedTargetLine=${decision.requestedTargetLine} boundedTargetLine=${decision.boundedTargetLine ?? -1} boundedDeltaLines=${decision.boundedDeltaLines} reason=${decision.reason}`;
}

