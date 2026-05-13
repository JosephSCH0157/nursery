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
