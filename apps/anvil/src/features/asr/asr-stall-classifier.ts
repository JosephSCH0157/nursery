export type AsrStallKind =
  | 'none'
  | 'backend_transcript_stall'
  | 'bridge_trap'
  | 'scroll_commit_stall'
  | 'scroll_hold';

export type AsrStallClassification = {
  active: boolean;
  kind: AsrStallKind;
};

export type AsrLiveScrollStallRecoveryAction =
  | 'none'
  | 'safe_capped_recovery'
  | 'safe_adjacent_rebase'
  | 'unrecoverable';

export type AsrLiveScrollStallDecision = {
  active: boolean;
  forwardEvidenceExists: boolean;
  backendTranscriptStale: boolean;
  recoveryAction: AsrLiveScrollStallRecoveryAction;
  recoveryTargetIdx: number | null;
  reason: string;
};

export function shouldClassifyBridgeTrap(input: {
  liveTranscriptFresh: boolean;
  conf: number;
  speechActive: boolean;
  activeReadMode: boolean;
  requestedTarget: number;
  currentLine: number;
  adjacentTarget: number;
  repeatedHoldCount: number;
  stallMs: number;
}): boolean {
  const bridgeTrapThresholdMs = input.repeatedHoldCount > 3 ? 2500 : 3500;
  return (
    input.liveTranscriptFresh &&
    Number.isFinite(input.conf) &&
    input.conf > 0 &&
    (input.speechActive || input.activeReadMode) &&
    input.requestedTarget > input.currentLine &&
    input.adjacentTarget > input.currentLine &&
    input.repeatedHoldCount >= 3 &&
    input.stallMs >= bridgeTrapThresholdMs
  );
}

export function shouldClassifyScrollCommitStall(input: {
  lastCommitIndex: number | null | undefined;
  noCommitMs: number;
  commitGapMs: number;
  currentCursorIndex: number;
  explicitNoMatch?: boolean;
}): boolean {
  return (
    input.lastCommitIndex != null &&
    input.noCommitMs > input.commitGapMs &&
    input.currentCursorIndex === input.lastCommitIndex &&
    input.explicitNoMatch !== true
  );
}

export function shouldClassifyBackendTranscriptStall(input: {
  liveAsr: boolean;
  asrArmed: boolean;
  recognizerAttached: boolean;
  speechActive: boolean;
  activeReadMode: boolean;
  firstTranscriptGraceActive: boolean;
  transcriptAgeMs: number | null;
  transcriptStaleMs: number;
}): boolean {
  if (!input.liveAsr || !input.asrArmed || !input.recognizerAttached) return false;
  if (!input.speechActive && !input.activeReadMode) return false;
  if (input.firstTranscriptGraceActive) return false;
  return input.transcriptAgeMs == null || input.transcriptAgeMs >= input.transcriptStaleMs;
}

export function classifyAsrStall(input: {
  liveAsr: boolean;
  asrArmed: boolean;
  recognizerAttached: boolean;
  speechActive: boolean;
  activeReadMode: boolean;
  firstTranscriptGraceActive: boolean;
  transcriptAgeMs: number | null;
  transcriptStaleMs: number;
  lastCommitIndex: number | null | undefined;
  currentCursorIndex: number;
  noCommitMs: number;
  commitGapMs: number;
  explicitNoMatch?: boolean;
  liveTranscriptFresh: boolean;
  repeatedHoldCount: number;
  conf: number;
  requestedTarget: number;
  adjacentTarget: number;
}): AsrStallClassification {
  if (!input.liveAsr || !input.asrArmed || !input.recognizerAttached) {
    return { active: false, kind: 'none' };
  }
  if (shouldClassifyBackendTranscriptStall(input)) {
    return { active: true, kind: 'backend_transcript_stall' };
  }
  if (shouldClassifyBridgeTrap({
    liveTranscriptFresh: input.liveTranscriptFresh,
    conf: input.conf,
    speechActive: input.speechActive,
    activeReadMode: input.activeReadMode,
    requestedTarget: input.requestedTarget,
    currentLine: input.currentCursorIndex,
    adjacentTarget: input.adjacentTarget,
    repeatedHoldCount: input.repeatedHoldCount,
    stallMs: input.noCommitMs,
  })) {
    return { active: true, kind: 'bridge_trap' };
  }
  if (shouldClassifyScrollCommitStall({
    lastCommitIndex: input.lastCommitIndex,
    noCommitMs: input.noCommitMs,
    commitGapMs: input.commitGapMs,
    currentCursorIndex: input.currentCursorIndex,
    explicitNoMatch: input.explicitNoMatch,
  })) {
    return input.liveTranscriptFresh
      ? { active: true, kind: 'scroll_commit_stall' }
      : { active: true, kind: 'scroll_hold' };
  }
  return { active: false, kind: 'none' };
}

export function resolveAsrLiveScrollStall(input: {
  liveAsr: boolean;
  movementAllowed: boolean;
  speechFresh: boolean;
  audioFresh: boolean;
  backendFresh: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  terminalClampActive: boolean;
  noVisualProgressMs: number;
  noVisualProgressThresholdMs: number;
  currentLineIdx: number;
  allowedTargetIdx: number | null;
  acceptedCommitTargetIdx: number | null;
  lastAcceptedProofLine: number | null;
  cappedTargetSafe: boolean;
  targetDebtPx: number;
  transcriptAgeMs: number | null;
  transcriptStaleMs: number;
  pocketState:
    | 'above_marker'
    | 'in_preferred_pocket'
    | 'below_preferred_pocket'
    | 'near_lower_rail'
    | 'bottom_locked'
    | 'top_pressure';
}): AsrLiveScrollStallDecision {
  if (!input.liveAsr) {
    return {
      active: false,
      forwardEvidenceExists: false,
      backendTranscriptStale: false,
      recoveryAction: 'none',
      recoveryTargetIdx: null,
      reason: 'inactive',
    };
  }

  const currentLineIdx = Math.max(0, Math.floor(Number(input.currentLineIdx) || 0));
  const allowedTargetIdx = Number.isFinite(input.allowedTargetIdx as number)
    ? Math.max(-1, Math.floor(Number(input.allowedTargetIdx)))
    : -1;
  const acceptedCommitTargetIdx = Number.isFinite(input.acceptedCommitTargetIdx as number)
    ? Math.max(-1, Math.floor(Number(input.acceptedCommitTargetIdx)))
    : -1;
  const lastAcceptedProofLine = Number.isFinite(input.lastAcceptedProofLine as number)
    ? Math.max(-1, Math.floor(Number(input.lastAcceptedProofLine)))
    : -1;
  const backendTranscriptStale =
    input.transcriptAgeMs == null || input.transcriptAgeMs >= input.transcriptStaleMs;
  const lowPocketState =
    input.pocketState === 'below_preferred_pocket' ||
    input.pocketState === 'near_lower_rail' ||
    input.pocketState === 'bottom_locked';
  const forwardEvidenceExists =
    allowedTargetIdx > currentLineIdx ||
    acceptedCommitTargetIdx > currentLineIdx ||
    lastAcceptedProofLine > currentLineIdx;

  if (
    !input.movementAllowed ||
    input.noMatchOrOffscript ||
    input.hardContradiction ||
    input.terminalClampActive
  ) {
    return {
      active: false,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'none',
      recoveryTargetIdx: null,
      reason: 'movement_vetoed',
    };
  }
  if (!input.audioFresh) {
    return {
      active: false,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'none',
      recoveryTargetIdx: null,
      reason: 'audio_not_fresh',
    };
  }
  if (!forwardEvidenceExists) {
    return {
      active: false,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'none',
      recoveryTargetIdx: null,
      reason: 'no_forward_evidence',
    };
  }
  if (!lowPocketState) {
    return {
      active: false,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'none',
      recoveryTargetIdx: null,
      reason: 'pocket_not_recovery_eligible',
    };
  }
  if (!Number.isFinite(input.noVisualProgressMs) || input.noVisualProgressMs < input.noVisualProgressThresholdMs) {
    return {
      active: false,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'none',
      recoveryTargetIdx: null,
      reason: 'stall_threshold_not_met',
    };
  }

  if (input.cappedTargetSafe && allowedTargetIdx > currentLineIdx) {
    return {
      active: true,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'safe_capped_recovery',
      recoveryTargetIdx: allowedTargetIdx,
      reason: backendTranscriptStale ? 'stale_backend_safe_capped_target' : 'safe_capped_target',
    };
  }

  const adjacentRebaseTargetIdx =
    acceptedCommitTargetIdx === currentLineIdx + 1
      ? acceptedCommitTargetIdx
      : (lastAcceptedProofLine === currentLineIdx + 1 ? lastAcceptedProofLine : -1);
  if (adjacentRebaseTargetIdx > currentLineIdx) {
    return {
      active: true,
      forwardEvidenceExists,
      backendTranscriptStale,
      recoveryAction: 'safe_adjacent_rebase',
      recoveryTargetIdx: adjacentRebaseTargetIdx,
      reason: backendTranscriptStale ? 'stale_backend_adjacent_rebase' : 'adjacent_rebase_from_last_accepted_proof',
    };
  }

  return {
    active: true,
    forwardEvidenceExists,
    backendTranscriptStale,
    recoveryAction: 'unrecoverable',
    recoveryTargetIdx: null,
    reason: input.speechFresh || input.backendFresh
      ? 'no_safe_visual_recovery_target'
      : 'stale_backend_no_safe_visual_recovery_target',
  };
}
