export function buildAsrBackendHeartbeatDiagnostic(args: {
  recognizerAttached: boolean;
  speechActive: boolean;
  activeReadMode: boolean;
  transcriptAgeMs: number;
  audioAgeMs: number;
  backendRestartedInWindow: boolean;
}): string {
  return `[ASR_BACKEND_HEARTBEAT] live=1 asrArmed=1 recognizerAttached=${args.recognizerAttached ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} activeReadMode=${args.activeReadMode ? 1 : 0} transcriptAgeMs=${Number.isFinite(args.transcriptAgeMs) ? Math.round(args.transcriptAgeMs) : -1} audioAgeMs=${Number.isFinite(args.audioAgeMs) ? Math.round(args.audioAgeMs) : -1} restartedInWindow=${args.backendRestartedInWindow ? 1 : 0}`;
}

export function buildAsrBackendTranscriptStaleDiagnostic(args: {
  ageMs: number;
  thresholdMs: number;
  recognizerAttached: boolean;
  speechActive: boolean;
  activeReadMode: boolean;
}): string {
  return `[ASR_BACKEND_TRANSCRIPT_STALE] ageMs=${Math.round(args.ageMs)} thresholdMs=${args.thresholdMs} recognizerAttached=${args.recognizerAttached ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} activeReadMode=${args.activeReadMode ? 1 : 0}`;
}

export function buildAsrAudioChunkStaleDiagnostic(args: {
  ageMs: number;
  thresholdMs: number;
  recognizerAttached: boolean;
  speechActive: boolean;
}): string {
  return `[ASR_AUDIO_CHUNK_STALE] ageMs=${Math.round(args.ageMs)} thresholdMs=${args.thresholdMs} recognizerAttached=${args.recognizerAttached ? 1 : 0} speechActive=${args.speechActive ? 1 : 0}`;
}

export function buildAsrStabilizerShadowDiagnostic(args: {
  rawMatchBestIdx: number | null;
  runtimeCurrentLineIdx: number | null;
  runtimeAcceptedCommitTargetIdx: number | null;
  previousStableCursorIdx: number;
  stableCursorIdx: number;
  action: 'hold' | 'advance_adjacent' | 'evidence_only' | 'reset_needed';
  reason: string;
  proposedAdjacentCommitTarget: number | null;
  proposedTargetIsBoundedPlusOne: boolean;
  rawMatchWasFarJump: boolean;
  heldDueToNoMatchOrQuietOrStale: boolean;
  runtimeDifferentFromStable: boolean;
  runtimeDifferentFromProposed: boolean;
  noMatch: boolean;
  speechLive: boolean;
  transcriptFresh: boolean;
}): string {
  const rawMatchBestIdx = Number.isFinite(args.rawMatchBestIdx as number) ? Math.round(Number(args.rawMatchBestIdx)) : -1;
  const runtimeCurrentLineIdx = Number.isFinite(args.runtimeCurrentLineIdx as number) ? Math.round(Number(args.runtimeCurrentLineIdx)) : -1;
  const runtimeAcceptedCommitTargetIdx = Number.isFinite(args.runtimeAcceptedCommitTargetIdx as number)
    ? Math.round(Number(args.runtimeAcceptedCommitTargetIdx))
    : -1;
  const proposedAdjacentCommitTarget = Number.isFinite(args.proposedAdjacentCommitTarget as number)
    ? Math.round(Number(args.proposedAdjacentCommitTarget))
    : -1;
  return `[ASR_STABILIZER_SHADOW] rawMatchBestIdx=${rawMatchBestIdx} runtimeCurrentLineIdx=${runtimeCurrentLineIdx} runtimeAcceptedCommitTargetIdx=${runtimeAcceptedCommitTargetIdx} previousStableCursorIdx=${Math.round(args.previousStableCursorIdx)} stableCursorIdx=${Math.round(args.stableCursorIdx)} action=${args.action} reason=${args.reason} proposedAdjacentCommitTarget=${proposedAdjacentCommitTarget} proposedTargetBounded=${args.proposedTargetIsBoundedPlusOne ? 1 : 0} rawFarJump=${args.rawMatchWasFarJump ? 1 : 0} heldDueToNoMatchOrQuietOrStale=${args.heldDueToNoMatchOrQuietOrStale ? 1 : 0} runtimeDifferentFromStable=${args.runtimeDifferentFromStable ? 1 : 0} runtimeDifferentFromProposed=${args.runtimeDifferentFromProposed ? 1 : 0} noMatch=${args.noMatch ? 1 : 0} speechLive=${args.speechLive ? 1 : 0} transcriptFresh=${args.transcriptFresh ? 1 : 0}`;
}

export function buildAsrStabilizerCommitCandidateDiagnostic(args: {
  currentLineIdx: number;
  proposedAdjacentCommitTarget: number | null;
  action: 'hold' | 'advance_adjacent' | 'evidence_only' | 'reset_needed';
  reason: string;
  rawMatchBestIdx: number | null;
  speechLive: boolean;
  transcriptFresh: boolean;
  noMatch: boolean;
  accepted: boolean;
  rejectReason: string;
}): string {
  const rawMatchBestIdx = Number.isFinite(args.rawMatchBestIdx as number)
    ? Math.round(Number(args.rawMatchBestIdx))
    : -1;
  const proposedAdjacentCommitTarget = Number.isFinite(args.proposedAdjacentCommitTarget as number)
    ? Math.round(Number(args.proposedAdjacentCommitTarget))
    : -1;
  return `[ASR_STABILIZER_COMMIT_CANDIDATE] currentLineIdx=${Math.round(args.currentLineIdx)} proposedAdjacentCommitTarget=${proposedAdjacentCommitTarget} action=${args.action} reason=${args.reason} rawMatchBestIdx=${rawMatchBestIdx} speechLive=${args.speechLive ? 1 : 0} transcriptFresh=${args.transcriptFresh ? 1 : 0} noMatch=${args.noMatch ? 1 : 0} accepted=${args.accepted ? 1 : 0} rejectReason=${args.rejectReason || 'none'}`;
}

export function buildAsrPostCommitVisualFollowBlockedDiagnostic(args: {
  previousSemanticLineIdx: number;
  newSemanticLineIdx: number;
  committedLineIdx: number;
  currentLineIdx: number;
  nextSpeakableLineIdx: number;
  visualAnchorSource: string;
  visualAnchorLineIdx: number;
  authoritativeLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  hasFreshVerifiedForwardCommit: boolean;
  proposedTargetScrollTop: number;
  cappedTargetScrollTop: number;
  selectedAuthority: string;
  beforeScrollTop: number;
  afterScrollTop: number;
  deltaScrollTop: number;
  blockerReason: string;
  pocketWallReason?: string;
  leadPressureReason?: string;
  markerY: number;
  currentLineViewportY?: number;
  activeLineViewportY?: number;
}): string {
  return `[ASR_POST_COMMIT_VISUAL_FOLLOW_BLOCKED] previousSemanticLineIdx=${Math.round(args.previousSemanticLineIdx)} newSemanticLineIdx=${Math.round(args.newSemanticLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} currentLineIdx=${Math.round(args.currentLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} visualAnchorSource=${args.visualAnchorSource || 'none'} visualAnchorLineIdx=${Math.round(args.visualAnchorLineIdx)} authoritativeLineIdx=${Math.round(args.authoritativeLineIdx)} lastVerifiedCommitLineIdx=${Math.round(args.lastVerifiedCommitLineIdx)} hasFreshVerifiedForwardCommit=${args.hasFreshVerifiedForwardCommit ? 1 : 0} proposedTargetScrollTop=${Math.round(args.proposedTargetScrollTop)} cappedTargetScrollTop=${Math.round(args.cappedTargetScrollTop)} selectedAuthority=${args.selectedAuthority || 'none'} beforeScrollTop=${Math.round(args.beforeScrollTop)} afterScrollTop=${Math.round(args.afterScrollTop)} deltaScrollTop=${Math.round(args.deltaScrollTop)} blockerReason=${args.blockerReason || 'unknown'} pocketWallReason=${args.pocketWallReason || 'none'} leadPressureReason=${args.leadPressureReason || 'none'} markerY=${Math.round(args.markerY)} currentLineViewportY=${Number.isFinite(args.currentLineViewportY as number) ? Math.round(Number(args.currentLineViewportY)) : -1} activeLineViewportY=${Number.isFinite(args.activeLineViewportY as number) ? Math.round(Number(args.activeLineViewportY)) : -1}`;
}

export function buildAsrPostCommitVisualFollowOkDiagnostic(args: {
  previousSemanticLineIdx: number;
  newSemanticLineIdx: number;
  committedLineIdx: number;
  currentLineIdx: number;
  nextSpeakableLineIdx: number;
  visualAnchorSource: string;
  visualAnchorLineIdx: number;
  authoritativeLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  hasFreshVerifiedForwardCommit: boolean;
  proposedTargetScrollTop: number;
  cappedTargetScrollTop: number;
  selectedAuthority: string;
  beforeScrollTop: number;
  afterScrollTop: number;
  deltaScrollTop: number;
  markerY: number;
  currentLineViewportY?: number;
  activeLineViewportY?: number;
}): string {
  return `[ASR_POST_COMMIT_VISUAL_FOLLOW_OK] previousSemanticLineIdx=${Math.round(args.previousSemanticLineIdx)} newSemanticLineIdx=${Math.round(args.newSemanticLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} currentLineIdx=${Math.round(args.currentLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} visualAnchorSource=${args.visualAnchorSource || 'none'} visualAnchorLineIdx=${Math.round(args.visualAnchorLineIdx)} authoritativeLineIdx=${Math.round(args.authoritativeLineIdx)} lastVerifiedCommitLineIdx=${Math.round(args.lastVerifiedCommitLineIdx)} hasFreshVerifiedForwardCommit=${args.hasFreshVerifiedForwardCommit ? 1 : 0} proposedTargetScrollTop=${Math.round(args.proposedTargetScrollTop)} cappedTargetScrollTop=${Math.round(args.cappedTargetScrollTop)} selectedAuthority=${args.selectedAuthority || 'none'} beforeScrollTop=${Math.round(args.beforeScrollTop)} afterScrollTop=${Math.round(args.afterScrollTop)} deltaScrollTop=${Math.round(args.deltaScrollTop)} markerY=${Math.round(args.markerY)} currentLineViewportY=${Number.isFinite(args.currentLineViewportY as number) ? Math.round(Number(args.currentLineViewportY)) : -1} activeLineViewportY=${Number.isFinite(args.activeLineViewportY as number) ? Math.round(Number(args.activeLineViewportY)) : -1}`;
}

export function buildAsrPostCommitVisualFollowReleaseDiagnostic(args: {
  previousSemanticLineIdx: number;
  newSemanticLineIdx: number;
  beforeScrollTop: number;
  proposedTargetScrollTop: number;
  releaseDesiredTargetScrollTop: number;
  boundedTargetScrollTop: number;
  releaseStepPx: number;
  afterScrollTop: number;
  deltaScrollTop: number;
  selectedAuthority: string;
  releaseAccepted: boolean;
  rejectReason: string;
  markerY: number;
  currentLineViewportY: number;
}): string {
  return `[ASR_POST_COMMIT_VISUAL_FOLLOW_RELEASE] previousSemanticLineIdx=${Math.round(args.previousSemanticLineIdx)} newSemanticLineIdx=${Math.round(args.newSemanticLineIdx)} beforeScrollTop=${Math.round(args.beforeScrollTop)} proposedTargetScrollTop=${Math.round(args.proposedTargetScrollTop)} releaseDesiredTargetScrollTop=${Math.round(args.releaseDesiredTargetScrollTop)} boundedTargetScrollTop=${Math.round(args.boundedTargetScrollTop)} releaseStepPx=${Math.round(args.releaseStepPx)} afterScrollTop=${Math.round(args.afterScrollTop)} deltaScrollTop=${Math.round(args.deltaScrollTop)} selectedAuthority=${args.selectedAuthority || 'none'} releaseAccepted=${args.releaseAccepted ? 1 : 0} rejectReason=${args.rejectReason || 'none'} markerY=${Math.round(args.markerY)} currentLineViewportY=${Number.isFinite(args.currentLineViewportY as number) ? Math.round(Number(args.currentLineViewportY)) : -1}`;
}

export function buildAsrPostReleaseAuthorityProtectedDiagnostic(args: {
  releaseLineIdx: number;
  protectedTargetScrollTop: number;
  competingAuthority: string;
  competingTargetScrollTop: number;
  selectedTargetScrollTop: number;
  protectionApplied: boolean;
  rejectReason: string;
  markerY: number;
  currentLineViewportY: number;
  scrollTop: number;
}): string {
  return `[ASR_POST_RELEASE_AUTHORITY_PROTECTED] releaseLineIdx=${Math.round(args.releaseLineIdx)} protectedTargetScrollTop=${Math.round(args.protectedTargetScrollTop)} competingAuthority=${args.competingAuthority || 'none'} competingTargetScrollTop=${Math.round(args.competingTargetScrollTop)} selectedTargetScrollTop=${Math.round(args.selectedTargetScrollTop)} protectionApplied=${args.protectionApplied ? 1 : 0} rejectReason=${args.rejectReason || 'none'} markerY=${Math.round(args.markerY)} currentLineViewportY=${Number.isFinite(args.currentLineViewportY as number) ? Math.round(Number(args.currentLineViewportY)) : -1} scrollTop=${Math.round(args.scrollTop)}`;
}

export function buildAsrPostFloorAuthorityProtectedDiagnostic(args: {
  protectionApplied: boolean;
  rejectReason: string;
  floorProtectedLineIdx: number;
  protectedTargetScrollTop: number;
  competingAuthority: string;
  competingReason: string;
  competingTargetScrollTop: number;
  selectedTargetBeforeProtection: number;
  selectedTargetAfterProtection: number;
  currentScrollTop: number;
  markerY: number;
  currentLineViewportY: number;
  matchedLineViewportY: number;
  visualDebtPx: number;
  matchedMarkerErrorPx: number;
  remainingProtectionMs: number;
  visualRecoveryFresh: boolean;
  trueVisualSilence: boolean;
  noMatchOrOffscript: boolean;
  bridgeContextActive: boolean;
  hardContradiction: boolean;
  sessionLive: boolean;
}): string {
  return `[ASR_POST_FLOOR_AUTHORITY_PROTECTED] protectionApplied=${args.protectionApplied ? 1 : 0} rejectReason=${args.rejectReason || 'none'} floorProtectedLineIdx=${Math.round(args.floorProtectedLineIdx)} protectedTargetScrollTop=${Math.round(args.protectedTargetScrollTop)} competingAuthority=${args.competingAuthority || 'none'} competingReason=${args.competingReason || 'none'} competingTargetScrollTop=${Math.round(args.competingTargetScrollTop)} selectedTargetBeforeProtection=${Math.round(args.selectedTargetBeforeProtection)} selectedTargetAfterProtection=${Math.round(args.selectedTargetAfterProtection)} currentScrollTop=${Math.round(args.currentScrollTop)} markerY=${Number.isFinite(args.markerY) ? Math.round(args.markerY) : -1} currentLineViewportY=${Number.isFinite(args.currentLineViewportY) ? Math.round(args.currentLineViewportY) : -1} matchedLineViewportY=${Number.isFinite(args.matchedLineViewportY) ? Math.round(args.matchedLineViewportY) : -1} visualDebtPx=${Number.isFinite(args.visualDebtPx) ? Math.round(args.visualDebtPx) : -1} matchedMarkerErrorPx=${Number.isFinite(args.matchedMarkerErrorPx) ? Math.round(args.matchedMarkerErrorPx) : -1} remainingProtectionMs=${Math.round(args.remainingProtectionMs)} visualRecoveryFresh=${args.visualRecoveryFresh ? 1 : 0} trueVisualSilence=${args.trueVisualSilence ? 1 : 0} noMatchOrOffscript=${args.noMatchOrOffscript ? 1 : 0} bridgeContextActive=${args.bridgeContextActive ? 1 : 0} hardContradiction=${args.hardContradiction ? 1 : 0} sessionLive=${args.sessionLive ? 1 : 0}`;
}

export function buildAsrPostFloorPocketWallProtectedDiagnostic(args: {
  protectionApplied: boolean;
  rejectReason: string;
  sourceAuthority: string;
  reasonBeforeProtection: string;
  currentTop: number;
  proposedTop: number;
  cappedTopBeforeProtection: number;
  cappedTopAfterProtection: number;
  protectedTargetScrollTop: number;
  floorProtectedLineIdx: number;
  currentLineIdx: number;
  committedLineIdx: number;
  visualDebtPx: number;
  matchedMarkerErrorPx: number;
  remainingProtectionMs: number;
  visualRecoveryFresh: boolean;
  trueVisualSilence: boolean;
  noMatchOrOffscript: boolean;
  bridgeContextActive: boolean;
  hardContradiction: boolean;
  sessionLive: boolean;
}): string {
  return `[ASR_POST_FLOOR_POCKET_WALL_PROTECTED] protectionApplied=${args.protectionApplied ? 1 : 0} rejectReason=${args.rejectReason || 'none'} sourceAuthority=${args.sourceAuthority || 'none'} reasonBeforeProtection=${args.reasonBeforeProtection || 'none'} currentTop=${Math.round(args.currentTop)} proposedTop=${Math.round(args.proposedTop)} cappedTopBeforeProtection=${Math.round(args.cappedTopBeforeProtection)} cappedTopAfterProtection=${Math.round(args.cappedTopAfterProtection)} protectedTargetScrollTop=${Math.round(args.protectedTargetScrollTop)} floorProtectedLineIdx=${Math.round(args.floorProtectedLineIdx)} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} visualDebtPx=${Number.isFinite(args.visualDebtPx) ? Math.round(args.visualDebtPx) : -1} matchedMarkerErrorPx=${Number.isFinite(args.matchedMarkerErrorPx) ? Math.round(args.matchedMarkerErrorPx) : -1} remainingProtectionMs=${Math.round(args.remainingProtectionMs)} visualRecoveryFresh=${args.visualRecoveryFresh ? 1 : 0} trueVisualSilence=${args.trueVisualSilence ? 1 : 0} noMatchOrOffscript=${args.noMatchOrOffscript ? 1 : 0} bridgeContextActive=${args.bridgeContextActive ? 1 : 0} hardContradiction=${args.hardContradiction ? 1 : 0} sessionLive=${args.sessionLive ? 1 : 0}`;
}

export function buildAsrPostCommitVisualReleaseTokenStateDiagnostic(args: {
  event: 'armed' | 'rejected' | 'accepted' | 'consumed' | 'stood_down';
  previousSemanticLineIdx: number;
  newSemanticLineIdx: number;
  currentLineIdx: number;
  committedLineIdx: number;
  sessionLive: boolean;
  asrMode: boolean;
  speechLive: boolean;
  transcriptFresh: boolean;
  noMatch: boolean;
  bridgeActive: boolean;
  pendingBridgeActive: boolean;
  proposedTargetScrollTop?: number | null;
  rejectReason?: string | null;
}): string {
  return `[ASR_POST_COMMIT_VISUAL_RELEASE_TOKEN_STATE] event=${args.event} previousSemanticLineIdx=${Math.round(args.previousSemanticLineIdx)} newSemanticLineIdx=${Math.round(args.newSemanticLineIdx)} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} sessionLive=${args.sessionLive ? 1 : 0} asrMode=${args.asrMode ? 1 : 0} speechLive=${args.speechLive ? 1 : 0} transcriptFresh=${args.transcriptFresh ? 1 : 0} noMatch=${args.noMatch ? 1 : 0} bridgeActive=${args.bridgeActive ? 1 : 0} pendingBridgeActive=${args.pendingBridgeActive ? 1 : 0} proposedTargetScrollTop=${Number.isFinite(args.proposedTargetScrollTop as number) ? Math.round(Number(args.proposedTargetScrollTop)) : -1} rejectReason=${args.rejectReason || 'none'}`;
}

export function buildAsrFocusLossTranscriptQuarantinedDiagnostic(args: {
  focusState: string;
  generation: number;
  runGeneration: number;
  runKey: string;
  sessionPhase: string;
  asrArmed: boolean;
  speechActive: boolean;
  recognizerAttached: boolean;
  activeReadMode: boolean;
  final: boolean;
  noMatch: boolean;
  matchBestIdx: number | null;
  currentIdx: number | null;
  clue?: string;
}): string {
  const matchBestIdx = Number.isFinite(args.matchBestIdx as number) ? Math.round(Number(args.matchBestIdx)) : -1;
  const currentIdx = Number.isFinite(args.currentIdx as number) ? Math.round(Number(args.currentIdx)) : -1;
  return `[ASR_FOCUS_LOSS_TRANSCRIPT_QUARANTINED] focusState=${args.focusState || 'unknown'} generation=${Math.round(args.generation)} runGeneration=${Math.round(args.runGeneration)} runKey=${args.runKey || 'none'} sessionPhase=${args.sessionPhase || 'unknown'} asrArmed=${args.asrArmed ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} recognizerAttached=${args.recognizerAttached ? 1 : 0} activeReadMode=${args.activeReadMode ? 1 : 0} final=${args.final ? 1 : 0} noMatch=${args.noMatch ? 1 : 0} matchBestIdx=${matchBestIdx} currentIdx=${currentIdx} clue="${String(args.clue || '').trim()}"`;
}

export function buildAsrFocusLossTranscriptAcceptedDiagnostic(args: {
  reason: string;
  focusState: string;
  generation: number;
  runGeneration: number;
  runKey: string;
  sessionPhase: string;
  asrArmed: boolean;
  speechActive: boolean;
  recognizerAttached: boolean;
  activeReadMode: boolean;
  final: boolean;
  noMatch: boolean;
  matchBestIdx: number | null;
  currentIdx: number | null;
  clue?: string;
}): string {
  const matchBestIdx = Number.isFinite(args.matchBestIdx as number) ? Math.round(Number(args.matchBestIdx)) : -1;
  const currentIdx = Number.isFinite(args.currentIdx as number) ? Math.round(Number(args.currentIdx)) : -1;
  return `[ASR_FOCUS_LOSS_TRANSCRIPT_ACCEPTED] reason=${args.reason || 'unknown'} focusState=${args.focusState || 'unknown'} generation=${Math.round(args.generation)} runGeneration=${Math.round(args.runGeneration)} runKey=${args.runKey || 'none'} sessionPhase=${args.sessionPhase || 'unknown'} asrArmed=${args.asrArmed ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} recognizerAttached=${args.recognizerAttached ? 1 : 0} activeReadMode=${args.activeReadMode ? 1 : 0} final=${args.final ? 1 : 0} noMatch=${args.noMatch ? 1 : 0} matchBestIdx=${matchBestIdx} currentIdx=${currentIdx} clue="${String(args.clue || '').trim()}"`;
}

export function buildAsrBackendRestartRequestedDiagnostic(args:
  | {
      skipped: 1;
      reason: string;
      skipReason: 'already_restarted_in_window';
      windowMs: number;
      transcriptAgeMs: number;
      audioAgeMs: number;
    }
  | {
      skipped: 1;
      reason: string;
      skipReason: 'recognizer_controls_unavailable';
      transcriptAgeMs: number;
      audioAgeMs: number;
    }
  | {
      skipped: 0;
      reason: string;
      transcriptAgeMs: number;
      audioAgeMs: number;
      current: number;
    }
): string {
  if (args.skipped === 0) {
    return `[ASR_BACKEND_RESTART_REQUESTED] skipped=0 reason=${args.reason} transcriptAgeMs=${Math.round(args.transcriptAgeMs)} audioAgeMs=${Math.round(args.audioAgeMs)} current=${args.current}`;
  }
  if (args.skipReason === 'already_restarted_in_window') {
    return `[ASR_BACKEND_RESTART_REQUESTED] skipped=1 reason=${args.reason} skipReason=already_restarted_in_window windowMs=${args.windowMs} transcriptAgeMs=${Math.round(args.transcriptAgeMs)} audioAgeMs=${Math.round(args.audioAgeMs)}`;
  }
  return `[ASR_BACKEND_RESTART_REQUESTED] skipped=1 reason=${args.reason} skipReason=recognizer_controls_unavailable transcriptAgeMs=${Math.round(args.transcriptAgeMs)} audioAgeMs=${Math.round(args.audioAgeMs)}`;
}

export function buildAsrBackendRestartCompletedDiagnostic(args: {
  reason: string;
  current: number;
  commitIndex: number;
  scrollTop: number;
}): string {
  return `[ASR_BACKEND_RESTART_COMPLETED] reason=${args.reason} current=${args.current} commitIndex=${args.commitIndex} scrollTop=${Math.round(args.scrollTop || 0)}`;
}

export function buildAsrBridgeTrapDetectedDiagnostic(args: {
  current: number;
  bestIdx: number;
  requestedTarget: number;
  adjacentTarget: number;
  skipped: string;
  repeatedHoldCount: number;
  noCommitMs: number;
  proofSource: string;
  textPreview: string;
}): string {
  return `[ASR_BRIDGE_TRAP_DETECTED] current=${args.current} bestIdx=${args.bestIdx} requestedTarget=${args.requestedTarget} adjacentTarget=${args.adjacentTarget} skipped=${args.skipped} repeatedHoldCount=${args.repeatedHoldCount} noCommitMs=${Math.round(args.noCommitMs)} blockerReason=bridge_or_non_adjacent_guard proofSource=${args.proofSource} textPreview="${args.textPreview}"`;
}

export function buildProofOwnedPrimaryCommitGuardBaseParts(args: {
  current: number;
  target: number;
  bestIdx: number;
  proofSource: string;
  skippedIgnorableLines: string[];
}): string[] {
  return [
    `current=${args.current}`,
    `target=${args.target}`,
    `bestIdx=${args.bestIdx}`,
    `proofSource=${args.proofSource}`,
    args.skippedIgnorableLines.length
      ? `skippedIgnorableLines=[${args.skippedIgnorableLines.join(',')}]`
      : 'skippedIgnorableLines=[]',
  ];
}

export function buildRecoverySkipNonAdjacentTargetGuardBaseParts(args: {
  current: number;
  requested: number;
  adjacentTarget: number;
  sourceBranch: string;
}): string[] {
  return [
    `current=${args.current}`,
    `requested=${args.requested}`,
    `adjacentTarget=${args.adjacentTarget}`,
    `sourceBranch=${args.sourceBranch}`,
  ];
}

export function buildAsrHudNoTargetDetail(args: {
  line: number;
  delta: number;
  simRaw: number;
  reasons: string;
  domLines: number;
  marker: number;
  retry: number;
  matchId: string | undefined;
}): {
  line: number;
  delta: number;
  sim: number;
  reasons: string;
  domLines: number;
  marker: number;
  retry: number;
  matchId: string | undefined;
} {
  return {
    line: args.line,
    delta: args.delta,
    sim: Number.isFinite(args.simRaw) ? Number(args.simRaw.toFixed(3)) : args.simRaw,
    reasons: args.reasons,
    domLines: args.domLines,
    marker: args.marker,
    retry: args.retry,
    matchId: args.matchId,
  };
}

export function buildAsrBottomLockGeometryDiagnostic(args: {
  markerY: number;
  currentLineY: number;
  nextSpeakableLineY: number;
  preferredBandTop: number;
  preferredSettleBottom: number;
  preferredBandBottom: number;
  toleratedBandBottom: number;
  currentScrollTop: number;
  targetScrollTop: number;
  scrollTopBefore: number;
  scrollTopAfter: number;
  pocketZone: string;
  lastAction: string;
  lastComfortReason: string;
  lastVisualTargetDeltaPx: number;
  lastVisualVelocityPxps: number;
  snapSuppressedInEpisode: boolean;
  reasonChain: string;
  deltaLinesSamples: string;
}): string {
  return `[ASR_BOTTOM_LOCK_GEOMETRY_DIAG] markerY=${Math.round(args.markerY)} currentLineY=${Math.round(args.currentLineY)} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} preferredBandTop=${Math.round(args.preferredBandTop)} preferredSettleBottom=${Math.round(args.preferredSettleBottom)} preferredBandBottom=${Math.round(args.preferredBandBottom)} toleratedBandBottom=${Math.round(args.toleratedBandBottom)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} scrollTopBefore=${Math.round(args.scrollTopBefore)} scrollTopAfter=${Math.round(args.scrollTopAfter)} pocketZone=${args.pocketZone} lastAction=${args.lastAction} lastComfortReason=${args.lastComfortReason} lastVisualTargetDeltaPx=${Math.round(args.lastVisualTargetDeltaPx)} lastVisualVelocityPxps=${Math.round(args.lastVisualVelocityPxps)} snapSuppressedInEpisode=${args.snapSuppressedInEpisode ? 1 : 0} reasonChain=${args.reasonChain} deltaLinesSamples=${args.deltaLinesSamples}`;
}

export function buildAsrVisualMarkerErrorCorrectionDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  markerY: number;
  actualNextSpeakableLineY: number;
  desiredLineY: number;
  desiredReadAheadPx: number;
  visualErrorPx: number;
  tolerancePx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  action: 'pursue' | 'nudge' | 'hold';
  reason: string;
}): string {
  return `[ASR_VISUAL_MARKER_ERROR_CORRECTION] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} markerY=${Math.round(args.markerY)} actualNextSpeakableLineY=${Math.round(args.actualNextSpeakableLineY)} desiredLineY=${Math.round(args.desiredLineY)} desiredReadAheadPx=${Math.round(args.desiredReadAheadPx)} visualErrorPx=${Math.round(args.visualErrorPx)} tolerancePx=${Math.round(args.tolerancePx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} action=${args.action} reason=${args.reason}`;
}

export function buildAsrReaderComfortRescueAppliedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  targetLineIdx: number;
  visualDebtPx: number;
  belowPocketPx: number;
  activeLineViewportRatio: number;
  distanceToBottomRailPx: number;
  writerSettleActive: boolean;
  visualRecoveryCooldownActive: boolean;
  cooldownRemainingMs: number;
  debtBelowLineHeight: boolean;
  unsafeTargetReason: string;
  targetAcceptedLocal: boolean;
  repeatedBelowPocketCount: number;
  lastCorrectionAgeMs: number;
  actualMovedPx: number;
  reason: string;
}): string {
  return `[ASR_READER_COMFORT_RESCUE_APPLIED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} targetLineIdx=${args.targetLineIdx} visualDebtPx=${Math.round(args.visualDebtPx)} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineViewportRatio=${Number.isFinite(args.activeLineViewportRatio) ? args.activeLineViewportRatio.toFixed(3) : 'na'} distanceToBottomRailPx=${Math.round(args.distanceToBottomRailPx)} writerSettleActive=${args.writerSettleActive ? 1 : 0} visualRecoveryCooldownActive=${args.visualRecoveryCooldownActive ? 1 : 0} cooldownRemainingMs=${Math.round(args.cooldownRemainingMs)} debtBelowLineHeight=${args.debtBelowLineHeight ? 1 : 0} unsafeTargetReason=${args.unsafeTargetReason || 'none'} targetAcceptedLocal=${args.targetAcceptedLocal ? 1 : 0} repeatedBelowPocketCount=${Math.round(args.repeatedBelowPocketCount)} lastCorrectionAgeMs=${Math.round(args.lastCorrectionAgeMs)} actualMovedPx=${Math.round(args.actualMovedPx)} reason=${args.reason}`;
}

export function buildAsrReaderComfortRescueBlockedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  targetLineIdx: number;
  visualDebtPx: number;
  belowPocketPx: number;
  activeLineViewportRatio: number;
  distanceToBottomRailPx: number;
  writerSettleActive: boolean;
  visualRecoveryCooldownActive: boolean;
  cooldownRemainingMs: number;
  debtBelowLineHeight: boolean;
  unsafeTargetReason: string;
  targetAcceptedLocal: boolean;
  repeatedBelowPocketCount: number;
  lastCorrectionAgeMs: number;
  actualMovedPx: number;
  reason: string;
}): string {
  return `[ASR_READER_COMFORT_RESCUE_BLOCKED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} targetLineIdx=${args.targetLineIdx} visualDebtPx=${Math.round(args.visualDebtPx)} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineViewportRatio=${Number.isFinite(args.activeLineViewportRatio) ? args.activeLineViewportRatio.toFixed(3) : 'na'} distanceToBottomRailPx=${Math.round(args.distanceToBottomRailPx)} writerSettleActive=${args.writerSettleActive ? 1 : 0} visualRecoveryCooldownActive=${args.visualRecoveryCooldownActive ? 1 : 0} cooldownRemainingMs=${Math.round(args.cooldownRemainingMs)} debtBelowLineHeight=${args.debtBelowLineHeight ? 1 : 0} unsafeTargetReason=${args.unsafeTargetReason || 'none'} targetAcceptedLocal=${args.targetAcceptedLocal ? 1 : 0} repeatedBelowPocketCount=${Math.round(args.repeatedBelowPocketCount)} lastCorrectionAgeMs=${Math.round(args.lastCorrectionAgeMs)} actualMovedPx=${Math.round(args.actualMovedPx)} reason=${args.reason}`;
}

export function buildAsrVisualSettleBypassedForReadabilityDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  targetLineIdx: number;
  visualDebtPx: number;
  belowPocketPx: number;
  activeLineViewportRatio: number;
  distanceToBottomRailPx: number;
  writerSettleActive: boolean;
  visualRecoveryCooldownActive: boolean;
  cooldownRemainingMs: number;
  debtBelowLineHeight: boolean;
  unsafeTargetReason: string;
  targetAcceptedLocal: boolean;
  repeatedBelowPocketCount: number;
  lastCorrectionAgeMs: number;
  actualMovedPx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_SETTLE_BYPASSED_FOR_READABILITY] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} targetLineIdx=${args.targetLineIdx} visualDebtPx=${Math.round(args.visualDebtPx)} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineViewportRatio=${Number.isFinite(args.activeLineViewportRatio) ? args.activeLineViewportRatio.toFixed(3) : 'na'} distanceToBottomRailPx=${Math.round(args.distanceToBottomRailPx)} writerSettleActive=${args.writerSettleActive ? 1 : 0} visualRecoveryCooldownActive=${args.visualRecoveryCooldownActive ? 1 : 0} cooldownRemainingMs=${Math.round(args.cooldownRemainingMs)} debtBelowLineHeight=${args.debtBelowLineHeight ? 1 : 0} unsafeTargetReason=${args.unsafeTargetReason || 'none'} targetAcceptedLocal=${args.targetAcceptedLocal ? 1 : 0} repeatedBelowPocketCount=${Math.round(args.repeatedBelowPocketCount)} lastCorrectionAgeMs=${Math.round(args.lastCorrectionAgeMs)} actualMovedPx=${Math.round(args.actualMovedPx)} reason=${args.reason}`;
}

export function buildAsrBridgeReducedVisualCashInAppliedDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number;
  reducedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  previousAcceptedCommitTargetIdx: number;
  bridgeCarry: number;
  bridgeClamp: number;
  blockerCategory: string;
  recoveryChainBlocked: boolean;
  noAdjacentMatchHold: boolean;
  markerLockSuppressed: boolean;
  repeatedObservationCount: number;
  stallDelayMs: number;
  visualDebtPx: number;
  belowPocketPx: number;
  actualMovedPx: number;
  reason: string;
}): string {
  return `[ASR_BRIDGE_REDUCED_VISUAL_CASH_IN_APPLIED] currentLineIdx=${args.currentLineIdx} requestedTargetIdx=${args.requestedTargetIdx} reducedTargetIdx=${args.reducedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} previousAcceptedCommitTargetIdx=${args.previousAcceptedCommitTargetIdx} bridgeCarry=${Math.round(args.bridgeCarry)} bridgeClamp=${Math.round(args.bridgeClamp)} blockerCategory=${args.blockerCategory || 'none'} recoveryChainBlocked=${args.recoveryChainBlocked ? 1 : 0} noAdjacentMatchHold=${args.noAdjacentMatchHold ? 1 : 0} markerLockSuppressed=${args.markerLockSuppressed ? 1 : 0} repeatedObservationCount=${Math.round(args.repeatedObservationCount)} stallDelayMs=${Math.round(args.stallDelayMs)} visualDebtPx=${Math.round(args.visualDebtPx)} belowPocketPx=${Math.round(args.belowPocketPx)} actualMovedPx=${Math.round(args.actualMovedPx)} reason=${args.reason}`;
}

export function buildAsrBridgeReducedVisualCashInBlockedDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number;
  reducedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  previousAcceptedCommitTargetIdx: number;
  bridgeCarry: number;
  bridgeClamp: number;
  blockerCategory: string;
  recoveryChainBlocked: boolean;
  noAdjacentMatchHold: boolean;
  markerLockSuppressed: boolean;
  repeatedObservationCount: number;
  stallDelayMs: number;
  visualDebtPx: number;
  belowPocketPx: number;
  actualMovedPx: number;
  reason: string;
}): string {
  return `[ASR_BRIDGE_REDUCED_VISUAL_CASH_IN_BLOCKED] currentLineIdx=${args.currentLineIdx} requestedTargetIdx=${args.requestedTargetIdx} reducedTargetIdx=${args.reducedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} previousAcceptedCommitTargetIdx=${args.previousAcceptedCommitTargetIdx} bridgeCarry=${Math.round(args.bridgeCarry)} bridgeClamp=${Math.round(args.bridgeClamp)} blockerCategory=${args.blockerCategory || 'none'} recoveryChainBlocked=${args.recoveryChainBlocked ? 1 : 0} noAdjacentMatchHold=${args.noAdjacentMatchHold ? 1 : 0} markerLockSuppressed=${args.markerLockSuppressed ? 1 : 0} repeatedObservationCount=${Math.round(args.repeatedObservationCount)} stallDelayMs=${Math.round(args.stallDelayMs)} visualDebtPx=${Math.round(args.visualDebtPx)} belowPocketPx=${Math.round(args.belowPocketPx)} actualMovedPx=${Math.round(args.actualMovedPx)} reason=${args.reason}`;
}

export function buildAsrBridgeReducedVisualCashInEvaluatedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  semanticTargetIdx: number;
  visualReducedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  nextSpeakableLineIdx: number;
  bridgeCarry: number;
  bridgeClamp: number;
  sourceBranch: string;
  proofSource: string;
  blockerCategory: string;
  recoveryChainBlocked: boolean;
  noAdjacentMatchHold: boolean;
  markerLockSuppressed: boolean;
  lastGuardReason: string;
  lastSelectedAuthority: string;
  lastVisualAction: string;
  visualErrorPx: number;
  belowPocketPx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  reason: string;
}): string {
  return `[ASR_BRIDGE_REDUCED_VISUAL_CASH_IN_EVALUATED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} semanticTargetIdx=${args.semanticTargetIdx} visualReducedTargetIdx=${args.visualReducedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} bridgeCarry=${Math.round(args.bridgeCarry)} bridgeClamp=${Math.round(args.bridgeClamp)} sourceBranch=${args.sourceBranch || 'unknown'} proofSource=${args.proofSource || 'none'} blockerCategory=${args.blockerCategory || 'none'} recoveryChainBlocked=${args.recoveryChainBlocked ? 1 : 0} noAdjacentMatchHold=${args.noAdjacentMatchHold ? 1 : 0} markerLockSuppressed=${args.markerLockSuppressed ? 1 : 0} lastGuardReason=${args.lastGuardReason || 'none'} lastSelectedAuthority=${args.lastSelectedAuthority || 'none'} lastVisualAction=${args.lastVisualAction || 'none'} visualErrorPx=${Math.round(args.visualErrorPx)} belowPocketPx=${Math.round(args.belowPocketPx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} reason=${args.reason}`;
}

export function buildAsrStaleRecoveryTargetExpiredDiagnostic(args: {
  sourcePath: string;
  reason: string;
  previousTargetScrollTop: number;
  preservedTargetScrollTop: number;
  pocketTargetScrollTop: number;
  currentScrollTop: number;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  visualErrorPx: number;
  tolerancePx: number;
  deltaPxToPreservedTarget: number;
  deltaPxToPocketTarget: number;
}): string {
  return `[ASR_STALE_RECOVERY_TARGET_EXPIRED] sourcePath=${args.sourcePath || 'unknown'} reason=${args.reason || 'unknown'} previousTargetScrollTop=${Math.round(args.previousTargetScrollTop)} preservedTargetScrollTop=${Math.round(args.preservedTargetScrollTop)} pocketTargetScrollTop=${Math.round(args.pocketTargetScrollTop)} currentScrollTop=${Math.round(args.currentScrollTop)} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} visualErrorPx=${Math.round(args.visualErrorPx)} tolerancePx=${Math.round(args.tolerancePx)} deltaPxToPreservedTarget=${Math.round(args.deltaPxToPreservedTarget)} deltaPxToPocketTarget=${Math.round(args.deltaPxToPocketTarget)}`;
}

export function buildAsrMarkerErrorLowerRailRejectedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  markerY: number;
  actualNextSpeakableLineY: number;
  desiredLineY: number;
  visualErrorPx: number;
  tolerancePx: number;
  pocketZone: string;
  preferredBandTop: number;
  preferredSettleBottom: number;
  preferredBandBottom: number;
  holdSafeBottomY: number;
  currentScrollTop: number;
  targetScrollTop: number;
  snapSuppressedInEpisode: boolean;
  reason: string;
}): string {
  return `[ASR_MARKER_ERROR_LOWER_RAIL_REJECTED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} markerY=${Math.round(args.markerY)} actualNextSpeakableLineY=${Math.round(args.actualNextSpeakableLineY)} desiredLineY=${Math.round(args.desiredLineY)} visualErrorPx=${Math.round(args.visualErrorPx)} tolerancePx=${Math.round(args.tolerancePx)} pocketZone=${args.pocketZone} preferredBandTop=${Math.round(args.preferredBandTop)} preferredSettleBottom=${Math.round(args.preferredSettleBottom)} preferredBandBottom=${Math.round(args.preferredBandBottom)} holdSafeBottomY=${Math.round(args.holdSafeBottomY)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} snapSuppressedInEpisode=${args.snapSuppressedInEpisode ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrMarkerErrorHoldBandRejectedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  markerY: number;
  actualNextSpeakableLineY: number;
  desiredLineY: number;
  visualErrorPx: number;
  tolerancePx: number;
  holdTolerancePx: number;
  pocketZone: string;
  currentScrollTop: number;
  targetScrollTop: number;
  reason: string;
}): string {
  return `[ASR_MARKER_ERROR_HOLD_BAND_REJECTED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} markerY=${Math.round(args.markerY)} actualNextSpeakableLineY=${Math.round(args.actualNextSpeakableLineY)} desiredLineY=${Math.round(args.desiredLineY)} visualErrorPx=${Math.round(args.visualErrorPx)} tolerancePx=${Math.round(args.tolerancePx)} holdTolerancePx=${Math.round(args.holdTolerancePx)} pocketZone=${args.pocketZone} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} reason=${args.reason}`;
}

export function buildAsrScrollAuthoritySelectedDiagnostic(args: {
  tickId: number;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  selectedAuthority: string;
  candidateAuthorities: string[];
  beforeScrollTop: number;
  targetScrollTop: number;
  afterScrollTop: number;
  reason: string;
}): string {
  return `[ASR_SCROLL_AUTHORITY_SELECTED] tickId=${args.tickId} currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} selectedAuthority=${args.selectedAuthority} candidateAuthorities=[${args.candidateAuthorities.join(',')}] beforeScrollTop=${Math.round(args.beforeScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} afterScrollTop=${Math.round(args.afterScrollTop)} reason=${args.reason}`;
}

export function buildAsrVisualControlRuntimeProofDiagnostic(args: {
  version: string;
  shadowEnabled: boolean;
  ownershipEnabled: boolean;
  integrationPath: string;
}): string {
  return `[ASR_VISUAL_CONTROL_RUNTIME_PROOF] version=${args.version} shadowEnabled=${args.shadowEnabled ? 1 : 0} ownershipEnabled=${args.ownershipEnabled ? 1 : 0} integrationPath=${args.integrationPath}`;
}

export function buildAsrVisualControlDecisionDiagnostic(args: {
  mode: string;
  semanticCursorLineIdx: number;
  visualAnchorLineIdx: number;
  anchorKind: string;
  markerY: number;
  anchorViewportY: number;
  anchorGapPx: number;
  pocketBand: string;
  targetScrollTop: number;
  previousTargetScrollTop: number;
  backwardAllowed: boolean;
  recoveryEpisodeActive: boolean;
  protectedTargetScrollTop: number;
  maxVelocityPxps: number;
  actuatorAppliedDeltaPx: number;
  reason: string;
  legacySelectedAuthority: string;
  legacySelectedTargetScrollTop: number;
  shadowDiffPx: number;
  backwardTargetRejected: boolean;
  safeForwardTargetSuppressed: boolean;
  ownershipActive: boolean;
}): string {
  return `[ASR_VISUAL_CONTROL_DECISION] mode=${args.mode} semanticCursorLineIdx=${Math.round(args.semanticCursorLineIdx)} visualAnchorLineIdx=${Math.round(args.visualAnchorLineIdx)} anchorKind=${args.anchorKind || 'none'} markerY=${Number.isFinite(args.markerY) ? Math.round(args.markerY) : -1} anchorViewportY=${Number.isFinite(args.anchorViewportY) ? Math.round(args.anchorViewportY) : -1} anchorGapPx=${Number.isFinite(args.anchorGapPx) ? Math.round(args.anchorGapPx) : -1} pocketBand=${args.pocketBand || 'unknown'} targetScrollTop=${Math.round(args.targetScrollTop)} previousTargetScrollTop=${Math.round(args.previousTargetScrollTop)} backwardAllowed=${args.backwardAllowed ? 1 : 0} recoveryEpisodeActive=${args.recoveryEpisodeActive ? 1 : 0} protectedTargetScrollTop=${Number.isFinite(args.protectedTargetScrollTop) ? Math.round(args.protectedTargetScrollTop) : -1} maxVelocityPxps=${Math.round(args.maxVelocityPxps)} actuatorAppliedDeltaPx=${Math.round(args.actuatorAppliedDeltaPx)} reason=${args.reason || 'none'} legacySelectedAuthority=${args.legacySelectedAuthority || 'none'} legacySelectedTargetScrollTop=${Math.round(args.legacySelectedTargetScrollTop)} shadowDiffPx=${Math.round(args.shadowDiffPx)} backwardTargetRejected=${args.backwardTargetRejected ? 1 : 0} safeForwardTargetSuppressed=${args.safeForwardTargetSuppressed ? 1 : 0} ownershipActive=${args.ownershipActive ? 1 : 0}`;
}

export function buildAsrRecoveryEpisodeStartedDiagnostic(args: {
  reason: string;
  protectedLineIdx: number;
  protectedTargetScrollTop: number;
  expiresInMs: number;
}): string {
  return `[ASR_RECOVERY_EPISODE_STARTED] reason=${args.reason} protectedLineIdx=${Math.round(args.protectedLineIdx)} protectedTargetScrollTop=${Math.round(args.protectedTargetScrollTop)} expiresInMs=${Math.max(0, Math.round(args.expiresInMs))}`;
}

export function buildAsrRecoveryEpisodeExtendedDiagnostic(args: {
  reason: string;
  protectedLineIdx: number;
  protectedTargetScrollTop: number;
  expiresInMs: number;
}): string {
  return `[ASR_RECOVERY_EPISODE_EXTENDED] reason=${args.reason} protectedLineIdx=${Math.round(args.protectedLineIdx)} protectedTargetScrollTop=${Math.round(args.protectedTargetScrollTop)} expiresInMs=${Math.max(0, Math.round(args.expiresInMs))}`;
}

export function buildAsrRecoveryEpisodeEndedDiagnostic(args: {
  reason: string;
  protectedLineIdx: number;
  protectedTargetScrollTop: number;
}): string {
  return `[ASR_RECOVERY_EPISODE_ENDED] reason=${args.reason} protectedLineIdx=${Math.round(args.protectedLineIdx)} protectedTargetScrollTop=${Math.round(args.protectedTargetScrollTop)}`;
}

export function buildAsrBackwardTargetRejectedDiagnostic(args: {
  mode: string;
  legacyAuthority: string;
  legacyTargetScrollTop: number;
  correctedTargetScrollTop: number;
  currentScrollTop: number;
  reason: string;
}): string {
  return `[ASR_BACKWARD_TARGET_REJECTED] mode=${args.mode} legacyAuthority=${args.legacyAuthority || 'none'} legacyTargetScrollTop=${Math.round(args.legacyTargetScrollTop)} correctedTargetScrollTop=${Math.round(args.correctedTargetScrollTop)} currentScrollTop=${Math.round(args.currentScrollTop)} reason=${args.reason || 'none'}`;
}

export function buildAsrRecoveryStepAppliedDiagnostic(args: {
  mode: string;
  authority: string;
  currentScrollTop: number;
  targetScrollTop: number;
  appliedDeltaPx: number;
  minForwardStepPx: number;
  reason: string;
}): string {
  return `[ASR_RECOVERY_STEP_APPLIED] mode=${args.mode} authority=${args.authority} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} minForwardStepPx=${Math.round(args.minForwardStepPx)} reason=${args.reason || 'none'}`;
}

export function buildAsrSettleCompleteDiagnostic(args: {
  previousMode: string;
  nextMode: string;
  anchorLineIdx: number;
  targetScrollTop: number;
  reason: string;
}): string {
  return `[ASR_SETTLE_COMPLETE] previousMode=${args.previousMode} nextMode=${args.nextMode} anchorLineIdx=${Math.round(args.anchorLineIdx)} targetScrollTop=${Math.round(args.targetScrollTop)} reason=${args.reason || 'none'}`;
}

export function buildAsrScrollAuthorityConflictDiagnostic(args: {
  tickId: number;
  authorities: string[];
  beforeScrollTop: number;
  intermediateScrollTop: number;
  finalScrollTop: number;
  currentLineIdx: number;
  nextSpeakableLineIdx: number;
  reason: string;
}): string {
  return `[ASR_SCROLL_AUTHORITY_CONFLICT] tickId=${args.tickId} authorities=[${args.authorities.join(',')}] beforeScrollTop=${Math.round(args.beforeScrollTop)} intermediateScrollTop=${Math.round(args.intermediateScrollTop)} finalScrollTop=${Math.round(args.finalScrollTop)} currentLineIdx=${args.currentLineIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} reason=${args.reason}`;
}

export function buildAsrDelayedSuppressionAutopsyDiagnostic(args: {
  episodeId?: string;
  runKey?: string;
  runGeneration?: number;
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  nextSpeakableLineIdx: number;
  visualOutcome: string;
  reasonChain: string;
  actions: string;
  stallDelayMs: number;
  settleMs: number;
  speechActive: boolean;
  transcriptAgeMs: number;
  audioAgeMs: number;
  finalPacketFresh: boolean;
  transcriptGrowing: boolean;
  lastGuardReason: string;
  lastHudGuardText: string;
  lastSelectedAuthority: string;
  lastVisualAction: string;
  lastVisualErrorPx: number;
  markerY: number;
  actualNextSpeakableLineY: number;
  desiredLineY: number;
  tolerancePx: number;
  holdTolerancePx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  deltaLinesSamples: string;
  snapSuppressedInEpisode: boolean;
  supersededByNewCommit: boolean;
  blockerCategory: string;
}): string {
  return `[ASR_DELAYED_SUPPRESSION_AUTOPSY] episodeId=${args.episodeId || 'none'} runKey=${args.runKey || 'none'} runGeneration=${Number.isFinite(args.runGeneration as number) ? Math.round(args.runGeneration as number) : -1} currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} visualOutcome=${args.visualOutcome} reasonChain=${args.reasonChain} actions=${args.actions} stallDelayMs=${Math.round(args.stallDelayMs)} settleMs=${Math.round(args.settleMs)} speechActive=${args.speechActive ? 1 : 0} transcriptAgeMs=${Math.round(args.transcriptAgeMs)} audioAgeMs=${Math.round(args.audioAgeMs)} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} transcriptGrowing=${args.transcriptGrowing ? 1 : 0} lastGuardReason=${args.lastGuardReason} lastHudGuardText=${args.lastHudGuardText} lastSelectedAuthority=${args.lastSelectedAuthority} lastVisualAction=${args.lastVisualAction} lastVisualErrorPx=${Math.round(args.lastVisualErrorPx)} markerY=${Math.round(args.markerY)} actualNextSpeakableLineY=${Math.round(args.actualNextSpeakableLineY)} desiredLineY=${Math.round(args.desiredLineY)} tolerancePx=${Math.round(args.tolerancePx)} holdTolerancePx=${Math.round(args.holdTolerancePx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} deltaLinesSamples=${args.deltaLinesSamples} snapSuppressedInEpisode=${args.snapSuppressedInEpisode ? 1 : 0} supersededByNewCommit=${args.supersededByNewCommit ? 1 : 0} blockerCategory=${args.blockerCategory}`;
}

export function buildAsrVisualGovernorDeadScreenAutopsyDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  bestIdx: number;
  acceptedCommitTargetIdx: number;
  proofSource: string;
  sourceBranch: string;
  currentScrollTop: number;
  targetScrollTop: number;
  moved: number;
  deltaLines: number;
  speakableLead: number;
  renderedLead: number;
  governorHoldAgeMs: number;
  noCommitMs: number;
  speechFresh: boolean;
  finalPacketFresh: boolean;
  liveSpeechFresh: boolean;
  speechActive: boolean;
  transcriptAgeMs: number;
  audioAgeMs: number;
  lastSelectedAuthority: string;
  lastGuardReason: string;
  lastHudGuardText: string;
  lastVisualAction: string;
  lastVisualErrorPx: number;
  finalCommitEligible: boolean;
  terminalCommitSuppressedByVisualGovernor: boolean;
  freshAdjacentUnlockSeen: boolean;
  suppressedForwardProofCountInWindow: number;
  hardHoldTickCountInWindow: number;
  deadScreenRebaseCountInWindow: number;
}): string {
  return `[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} bestIdx=${args.bestIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} moved=${Math.round(args.moved)} deltaLines=${args.deltaLines.toFixed(2)} speakableLead=${args.speakableLead} renderedLead=${args.renderedLead} governorHoldAgeMs=${Math.round(args.governorHoldAgeMs)} noCommitMs=${Math.round(args.noCommitMs)} speechFresh=${args.speechFresh ? 1 : 0} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} liveSpeechFresh=${args.liveSpeechFresh ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} transcriptAgeMs=${Math.round(args.transcriptAgeMs)} audioAgeMs=${Math.round(args.audioAgeMs)} lastSelectedAuthority=${args.lastSelectedAuthority} lastGuardReason=${args.lastGuardReason} lastHudGuardText=${args.lastHudGuardText} lastVisualAction=${args.lastVisualAction} lastVisualErrorPx=${Math.round(args.lastVisualErrorPx)} finalCommitEligible=${args.finalCommitEligible ? 1 : 0} terminalCommitSuppressedByVisualGovernor=${args.terminalCommitSuppressedByVisualGovernor ? 1 : 0} freshAdjacentUnlockSeen=${args.freshAdjacentUnlockSeen ? 1 : 0} suppressedForwardProofCountInWindow=${args.suppressedForwardProofCountInWindow} hardHoldTickCountInWindow=${args.hardHoldTickCountInWindow} deadScreenRebaseCountInWindow=${args.deadScreenRebaseCountInWindow}`;
}

export function buildAsrVisualGovernorDeadScreenEscapeCommitDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  bestIdx: number;
  proofSource: string;
  sourceBranch: string;
  currentScrollTop: number;
  targetScrollTop: number;
  moved: number;
  deltaLines: number;
  governorHoldAgeMs: number;
  noCommitMs: number;
  speechFresh: boolean;
  finalPacketFresh: boolean;
  liveSpeechFresh: boolean;
  freshAdjacentUnlockSeen: boolean;
  terminalCommitSuppressedByVisualGovernor: boolean;
  reason: string;
}): string {
  return `[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_ESCAPE_COMMIT] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} bestIdx=${args.bestIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} moved=${Math.round(args.moved)} deltaLines=${args.deltaLines.toFixed(2)} governorHoldAgeMs=${Math.round(args.governorHoldAgeMs)} noCommitMs=${Math.round(args.noCommitMs)} speechFresh=${args.speechFresh ? 1 : 0} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} liveSpeechFresh=${args.liveSpeechFresh ? 1 : 0} freshAdjacentUnlockSeen=${args.freshAdjacentUnlockSeen ? 1 : 0} terminalCommitSuppressedByVisualGovernor=${args.terminalCommitSuppressedByVisualGovernor ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrVisualGovernorDeadScreenEscapeBlockedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  bestIdx: number;
  proofSource: string;
  sourceBranch: string;
  currentScrollTop: number;
  targetScrollTop: number;
  moved: number;
  deltaLines: number;
  governorHoldAgeMs: number;
  noCommitMs: number;
  speechFresh: boolean;
  finalPacketFresh: boolean;
  liveSpeechFresh: boolean;
  freshAdjacentUnlockSeen: boolean;
  terminalCommitSuppressedByVisualGovernor: boolean;
  reason: string;
}): string {
  return `[ASR_VISUAL_GOVERNOR_DEAD_SCREEN_ESCAPE_BLOCKED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} bestIdx=${args.bestIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} moved=${Math.round(args.moved)} deltaLines=${args.deltaLines.toFixed(2)} governorHoldAgeMs=${Math.round(args.governorHoldAgeMs)} noCommitMs=${Math.round(args.noCommitMs)} speechFresh=${args.speechFresh ? 1 : 0} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} liveSpeechFresh=${args.liveSpeechFresh ? 1 : 0} freshAdjacentUnlockSeen=${args.freshAdjacentUnlockSeen ? 1 : 0} terminalCommitSuppressedByVisualGovernor=${args.terminalCommitSuppressedByVisualGovernor ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrAdjacentRecoveryCatchupAllowedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  commitTargetIdx: number;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  visualErrorPx: number;
  boundedVisualTolerancePx: number;
  pocketZone: string;
  nextSpeakableLineY: number;
  preferredBandBottom: number;
  finalPacketFresh: boolean;
  audioBackendFresh: boolean;
  reason: string;
}): string {
  return `[ASR_ADJACENT_RECOVERY_CATCHUP_ALLOWED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} commitTargetIdx=${args.commitTargetIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} visualErrorPx=${Math.round(args.visualErrorPx)} boundedVisualTolerancePx=${Math.round(args.boundedVisualTolerancePx)} pocketZone=${args.pocketZone} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} preferredBandBottom=${Math.round(args.preferredBandBottom)} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} audioBackendFresh=${args.audioBackendFresh ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrAdjacentRecoveryCatchupBlockedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  commitTargetIdx: number;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  visualErrorPx: number;
  boundedVisualTolerancePx: number;
  pocketZone: string;
  nextSpeakableLineY: number;
  preferredBandBottom: number;
  finalPacketFresh: boolean;
  audioBackendFresh: boolean;
  reason: string;
}): string {
  return `[ASR_ADJACENT_RECOVERY_CATCHUP_BLOCKED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} commitTargetIdx=${args.commitTargetIdx} nextSpeakableLineIdx=${args.nextSpeakableLineIdx} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} visualErrorPx=${Math.round(args.visualErrorPx)} boundedVisualTolerancePx=${Math.round(args.boundedVisualTolerancePx)} pocketZone=${args.pocketZone} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} preferredBandBottom=${Math.round(args.preferredBandBottom)} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} audioBackendFresh=${args.audioBackendFresh ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrAdjacentRecoveryCatchupPathProofDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number;
  commitTargetIdx: number;
  proofSource: string;
  sourceBranch: string;
  finalPacketFresh: boolean;
  audioBackendFresh: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  targetSpeakable: boolean;
  lowEnough: boolean;
  visualErrorPx: number;
  boundedVisualTolerancePx: number;
  bridgeTrapActive: boolean;
  terminalDeadScreenBlockActive: boolean;
  alreadyUsedInEpisode: boolean;
}): string {
  return `[ASR_ADJACENT_RECOVERY_CATCHUP_PATH_PROOF] currentLineIdx=${args.currentLineIdx} requestedTargetIdx=${args.requestedTargetIdx} commitTargetIdx=${args.commitTargetIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} audioBackendFresh=${args.audioBackendFresh ? 1 : 0} noMatchOrOffscript=${args.noMatchOrOffscript ? 1 : 0} hardContradiction=${args.hardContradiction ? 1 : 0} targetSpeakable=${args.targetSpeakable ? 1 : 0} lowEnough=${args.lowEnough ? 1 : 0} visualErrorPx=${Math.round(args.visualErrorPx)} boundedVisualTolerancePx=${Math.round(args.boundedVisualTolerancePx)} bridgeTrapActive=${args.bridgeTrapActive ? 1 : 0} terminalDeadScreenBlockActive=${args.terminalDeadScreenBlockActive ? 1 : 0} alreadyUsedInEpisode=${args.alreadyUsedInEpisode ? 1 : 0}`;
}

export function buildAsrAdjacentRecoveryCatchupBypassedDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number;
  commitTargetIdx: number;
  proofSource: string;
  sourceBranch: string;
  reason: string;
}): string {
  return `[ASR_ADJACENT_RECOVERY_CATCHUP_BYPASSED] currentLineIdx=${args.currentLineIdx} requestedTargetIdx=${args.requestedTargetIdx} commitTargetIdx=${args.commitTargetIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} reason=${args.reason}`;
}

export function buildAsrVisualRecoveryBoostAppliedDiagnostic(args: {
  authority: string;
  targetDebtPx: number;
  appliedDeltaPx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_RECOVERY_BOOST_APPLIED] authority=${args.authority} targetDebtPx=${Math.round(args.targetDebtPx)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} reason=${args.reason}`;
}

export function buildAsrVisualRecoveryBoostBlockedDiagnostic(args: {
  authority: string;
  targetDebtPx: number;
  appliedDeltaPx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_RECOVERY_BOOST_BLOCKED] authority=${args.authority} targetDebtPx=${Math.round(args.targetDebtPx)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} reason=${args.reason}`;
}

export function buildAsrVisualRecoveryBoostPathProofDiagnostic(args: {
  authority: string;
  reason: string;
  speechFresh: boolean;
  proofHealthy: boolean;
  bridgeBlocked: boolean;
  targetDebtPx: number;
  lowStateAgeMs: number;
  insidePreferredSettleBand: boolean;
  insideToleratedBand: boolean;
}): string {
  return `[ASR_VISUAL_RECOVERY_BOOST_PATH_PROOF] authority=${args.authority} reason=${args.reason} speechFresh=${args.speechFresh ? 1 : 0} proofHealthy=${args.proofHealthy ? 1 : 0} bridgeBlocked=${args.bridgeBlocked ? 1 : 0} targetDebtPx=${Math.round(args.targetDebtPx)} lowStateAgeMs=${Math.round(args.lowStateAgeMs)} insidePreferredSettleBand=${args.insidePreferredSettleBand ? 1 : 0} insideToleratedBand=${args.insideToleratedBand ? 1 : 0}`;
}

export function buildAsrVisualRecoveryBoostBypassedDiagnostic(args: {
  authority: string;
  reason: string;
  targetDebtPx: number;
  lowStateAgeMs: number;
  bypassReason: string;
}): string {
  return `[ASR_VISUAL_RECOVERY_BOOST_BYPASSED] authority=${args.authority} reason=${args.reason} targetDebtPx=${Math.round(args.targetDebtPx)} lowStateAgeMs=${Math.round(args.lowStateAgeMs)} bypassReason=${args.bypassReason}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryOpenedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  proofSource: string;
  snapSuppressed: boolean;
  moved: number;
  nextSpeakableLineY: number;
  markerY: number;
  targetDebtPx: number;
  visualErrorPx: number;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_OPENED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} proofSource=${args.proofSource} snapSuppressed=${args.snapSuppressed ? 1 : 0} moved=${Math.round(args.moved)} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} markerY=${Math.round(args.markerY)} targetDebtPx=${Math.round(args.targetDebtPx)} visualErrorPx=${Math.round(args.visualErrorPx)}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryPathProofDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  proofSource: string;
  sourceBranch: string;
  adjacentCommit: boolean;
  snapSuppressed: boolean;
  movedPx: number;
  scrollTopBefore: number;
  scrollTopAfter: number;
  nextSpeakableLineY: number;
  markerY: number;
  visualErrorPx: number;
  speechFresh: boolean;
  finalPacketFresh: boolean;
  liveSpeechFresh: boolean;
  audioBackendFresh: boolean;
  bridgeTrapActive: boolean;
  deadScreenActive: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_PATH_PROOF] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} adjacentCommit=${args.adjacentCommit ? 1 : 0} snapSuppressed=${args.snapSuppressed ? 1 : 0} movedPx=${Math.round(args.movedPx)} scrollTopBefore=${Math.round(args.scrollTopBefore)} scrollTopAfter=${Math.round(args.scrollTopAfter)} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} markerY=${Math.round(args.markerY)} visualErrorPx=${Math.round(args.visualErrorPx)} speechFresh=${args.speechFresh ? 1 : 0} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} liveSpeechFresh=${args.liveSpeechFresh ? 1 : 0} audioBackendFresh=${args.audioBackendFresh ? 1 : 0} bridgeTrapActive=${args.bridgeTrapActive ? 1 : 0} deadScreenActive=${args.deadScreenActive ? 1 : 0} noMatchOrOffscript=${args.noMatchOrOffscript ? 1 : 0} hardContradiction=${args.hardContradiction ? 1 : 0}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryBypassedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  requestedTargetIdx: number;
  acceptedCommitTargetIdx: number;
  proofSource: string;
  sourceBranch: string;
  reason: string;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_BYPASSED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} requestedTargetIdx=${args.requestedTargetIdx} acceptedCommitTargetIdx=${args.acceptedCommitTargetIdx} proofSource=${args.proofSource} sourceBranch=${args.sourceBranch} reason=${args.reason}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryAppliedDiagnostic(args: {
  authority: string;
  targetDebtPx: number;
  appliedDeltaPx: number;
  reason: string;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_APPLIED] authority=${args.authority} targetDebtPx=${Math.round(args.targetDebtPx)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} reason=${args.reason}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryBlockedDiagnostic(args: {
  reason: string;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_BLOCKED] reason=${args.reason}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryOpenBlockedDiagnostic(args: {
  reason: string;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_OPEN_BLOCKED] reason=${args.reason}`;
}

export function buildAsrPostAdjacentCommitVisualRecoveryWindowClearedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  reason: string;
  elapsedMs: number;
  nextSpeakableLineY: number;
  markerY: number;
}): string {
  return `[ASR_POST_ADJACENT_COMMIT_VISUAL_RECOVERY_WINDOW_CLEARED] currentLineIdx=${args.currentLineIdx} committedLineIdx=${args.committedLineIdx} reason=${args.reason} elapsedMs=${Math.round(args.elapsedMs)} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} markerY=${Math.round(args.markerY)}`;
}

export type AsrScrollChair =
  | 'absolute_hold'
  | 'semantic_target'
  | 'target_distance_cap'
  | 'visual_recovery'
  | 'marker_lock_smoothing'
  | 'comfort_advisory'
  | 'actuator_execution';

export type AsrActuatorGear =
  | 'hold'
  | 'normal_floor'
  | 'normal_tracking'
  | 'recovery'
  | 'urgent_recovery'
  | 'bounded_snap';

export type AsrFloorFallbackReason =
  | 'none'
  | 'no_recovery_owner'
  | 'recovery_owner_normal_gear'
  | 'distance_cap_normal_gear'
  | 'marker_lock_suppressed_recovery'
  | 'comfort_advisory_floor'
  | 'absolute_hold_not_applicable'
  | 'unknown_floor_path';

export function buildAsrScrollChairpersonArbitrationDiagnostic(args: {
  chair: AsrScrollChair;
  reason: string;
  semanticTargetIdx: number;
  acceptedCommitTargetIdx: number;
  distanceCapTargetIdx: number;
  currentLineIdx: number;
  requestedTargetIdx: number;
  bridgeOwner: string;
  cueOwner: string;
  markerLockState: string;
  comfortState: string;
  visualRecoveryState: string;
  hardSafetyState: string;
  safetyCapState: string;
  postAdjacentRecoveryState: string;
  targetDebtPx: number;
  appliedDeltaPx: number;
  clampReason: string;
  gear: AsrActuatorGear;
  floorFallbackReason: AsrFloorFallbackReason;
  overruled: string;
}): string {
  return `[ASR_SCROLL_CHAIRPERSON_ARBITRATION] chair=${args.chair} reason=${args.reason} semanticTargetIdx=${Math.round(args.semanticTargetIdx)} acceptedCommitTargetIdx=${Math.round(args.acceptedCommitTargetIdx)} distanceCapTargetIdx=${Math.round(args.distanceCapTargetIdx)} currentLineIdx=${Math.round(args.currentLineIdx)} requestedTargetIdx=${Math.round(args.requestedTargetIdx)} bridgeOwner=${args.bridgeOwner} cueOwner=${args.cueOwner} markerLockState=${args.markerLockState} comfortState=${args.comfortState} visualRecoveryState=${args.visualRecoveryState} hardSafetyState=${args.hardSafetyState} safetyCapState=${args.safetyCapState} postAdjacentRecoveryState=${args.postAdjacentRecoveryState} targetDebtPx=${Math.round(args.targetDebtPx)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} clampReason=${args.clampReason} gear=${args.gear} floorFallbackReason=${args.floorFallbackReason} overruled=${args.overruled}`;
}

export function buildAsrRecoveryGearSelectedDiagnostic(args: {
  currentLineIdx: number;
  targetLineIdx: number;
  acceptedCommitTargetIdx: number;
  cappedTargetIdx: number;
  targetDebtPx: number;
  appliedDeltaPx: number;
  selectedGear: AsrActuatorGear;
  previousGear: AsrActuatorGear;
  reason: string;
  hardSafetyClear: boolean;
  speechFresh: boolean;
  backendFresh: boolean;
  nextSpeakableLineY: number;
  overruledControllers: string;
  clampReasonBefore: string;
  clampReasonAfter: string;
  safetyClass: 'absolute_hold' | 'distance_restrict_only' | 'clear';
  distanceRestrictionReason: string;
  absoluteHoldReason: string;
  cappedTargetSafe: boolean;
  urgentRecoveryEligible: boolean;
  urgentRecoveryBlockedReason: string;
}): string {
  return `[ASR_RECOVERY_GEAR_SELECTED] currentLineIdx=${Math.round(args.currentLineIdx)} targetLineIdx=${Math.round(args.targetLineIdx)} acceptedCommitTargetIdx=${Math.round(args.acceptedCommitTargetIdx)} cappedTargetIdx=${Math.round(args.cappedTargetIdx)} targetDebtPx=${Math.round(args.targetDebtPx)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} selectedGear=${args.selectedGear} previousGear=${args.previousGear} reason=${args.reason} hardSafetyClear=${args.hardSafetyClear ? 1 : 0} speechFresh=${args.speechFresh ? 1 : 0} backendFresh=${args.backendFresh ? 1 : 0} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} overruledControllers=${args.overruledControllers} clampReasonBefore=${args.clampReasonBefore} clampReasonAfter=${args.clampReasonAfter} safetyClass=${args.safetyClass} distanceRestrictionReason=${args.distanceRestrictionReason} absoluteHoldReason=${args.absoluteHoldReason} cappedTargetSafe=${args.cappedTargetSafe ? 1 : 0} urgentRecoveryEligible=${args.urgentRecoveryEligible ? 1 : 0} urgentRecoveryBlockedReason=${args.urgentRecoveryBlockedReason}`;
}

export function buildAsrScrollAuthorityResolvedDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number | null;
  semanticTargetIdx: number | null;
  allowedTargetIdx: number | null;
  movementAllowed: boolean;
  vetoAuthority: string | null;
  targetAuthority: string;
  movementEnvelopeAuthority: string;
  motionAuthority: string;
  smoothingAuthority: string;
  finalGear: 'hold' | 'normal_floor' | 'normal_tracking' | 'recovery';
  finalMinStepPx: number;
  targetDebtPx: number;
  appliedDeltaPx: number;
  clampReason: string;
  pocketState: 'above_marker' | 'in_preferred_pocket' | 'below_preferred_pocket' | 'near_lower_rail' | 'bottom_locked' | 'top_pressure';
  oldPocketState: 'above_marker' | 'in_preferred_pocket' | 'below_preferred_pocket' | 'near_lower_rail' | 'bottom_locked' | 'top_pressure';
  markerCenteredPocketState: 'above_marker' | 'in_preferred_pocket' | 'below_preferred_pocket' | 'near_lower_rail' | 'bottom_locked' | 'top_pressure';
  markerViewportLine: number;
  readViewportLine: number;
  distanceFromMarkerLines: number;
  preferredTopLine: number;
  preferredBottomLine: number;
  movementEnvelopePx: number;
  movementEnvelopeReason: string;
  bridgeCueCapApplied: boolean;
  cappedTargetSafe: boolean;
  overruledAuthorities: string[];
  reason: string;
  chairpersonChair: AsrScrollChair;
  chairpersonGear: AsrActuatorGear;
  chairpersonFloorFallbackReason: AsrFloorFallbackReason;
  actualAppliedDeltaPx: number;
  actualClampReason: string;
}): string {
  const requestedTargetIdx = Number.isFinite(args.requestedTargetIdx as number) ? Math.round(Number(args.requestedTargetIdx)) : -1;
  const semanticTargetIdx = Number.isFinite(args.semanticTargetIdx as number) ? Math.round(Number(args.semanticTargetIdx)) : -1;
  const allowedTargetIdx = Number.isFinite(args.allowedTargetIdx as number) ? Math.round(Number(args.allowedTargetIdx)) : -1;
  const vetoAuthority = String(args.vetoAuthority || 'none');
  const overruledAuthorities =
    Array.isArray(args.overruledAuthorities) && args.overruledAuthorities.length > 0
      ? args.overruledAuthorities.join('|')
      : 'none';
  return `[ASR_SCROLL_AUTHORITY_RESOLVED] currentLineIdx=${Math.round(args.currentLineIdx)} requestedTargetIdx=${requestedTargetIdx} semanticTargetIdx=${semanticTargetIdx} allowedTargetIdx=${allowedTargetIdx} movementAllowed=${args.movementAllowed ? 1 : 0} vetoAuthority=${vetoAuthority} targetAuthority=${args.targetAuthority} movementEnvelopeAuthority=${args.movementEnvelopeAuthority} motionAuthority=${args.motionAuthority} smoothingAuthority=${args.smoothingAuthority} finalGear=${args.finalGear} finalMinStepPx=${Math.round(args.finalMinStepPx)} targetDebtPx=${Math.round(args.targetDebtPx)} appliedDeltaPx=${Math.round(args.appliedDeltaPx)} clampReason=${args.clampReason} pocketState=${args.pocketState} oldPocketState=${args.oldPocketState} markerCenteredPocketState=${args.markerCenteredPocketState} markerViewportLine=${Math.round(args.markerViewportLine)} readViewportLine=${Math.round(args.readViewportLine)} distanceFromMarkerLines=${Math.round(args.distanceFromMarkerLines)} preferredTopLine=${Math.round(args.preferredTopLine)} preferredBottomLine=${Math.round(args.preferredBottomLine)} movementEnvelopePx=${Math.round(args.movementEnvelopePx)} movementEnvelopeReason=${args.movementEnvelopeReason} bridgeCueCapApplied=${args.bridgeCueCapApplied ? 1 : 0} cappedTargetSafe=${args.cappedTargetSafe ? 1 : 0} overruledAuthorities=${overruledAuthorities} reason=${args.reason} chairpersonChair=${args.chairpersonChair} chairpersonGear=${args.chairpersonGear} chairpersonFloorFallbackReason=${args.chairpersonFloorFallbackReason} actualAppliedDeltaPx=${Math.round(args.actualAppliedDeltaPx)} actualClampReason=${args.actualClampReason}`;
}

export function buildAsrAccumulationSnapshotDiagnostic(args: {
  commitCount: number;
  eventsSinceCommit: number;
  finalsSinceCommit: number;
  alignmentEpisodeCount: number;
  activeEpisodeActions: number;
  activeEpisodeDeltaSamples: number;
  activeEpisodeReasonChain: number;
  guardEventsCount: number;
  strongHitsCount: number;
  evidenceEntriesCount: number;
  consistencyEntriesCount: number;
  bridgeBlockMapSize: number;
  bridgeTrapMapSize: number;
  logBufferEntryCount: number;
  logBufferDroppedCount: number;
  visualGovernorHoldAgeMs: number;
  noProgressStreak: number;
  lostForwardWallStreak: number;
  targetDebtPx: number;
  distanceToMaxScrollTop: number;
  currentLineIdx: number;
  requestedTargetIdx: number;
}): string {
  return `[ASR_ACCUMULATION_SNAPSHOT] commitCount=${Math.round(args.commitCount)} eventsSinceCommit=${Math.round(args.eventsSinceCommit)} finalsSinceCommit=${Math.round(args.finalsSinceCommit)} alignmentEpisodeCount=${Math.round(args.alignmentEpisodeCount)} activeEpisodeActions=${Math.round(args.activeEpisodeActions)} activeEpisodeDeltaSamples=${Math.round(args.activeEpisodeDeltaSamples)} activeEpisodeReasonChain=${Math.round(args.activeEpisodeReasonChain)} guardEventsCount=${Math.round(args.guardEventsCount)} strongHitsCount=${Math.round(args.strongHitsCount)} evidenceEntriesCount=${Math.round(args.evidenceEntriesCount)} consistencyEntriesCount=${Math.round(args.consistencyEntriesCount)} bridgeBlockMapSize=${Math.round(args.bridgeBlockMapSize)} bridgeTrapMapSize=${Math.round(args.bridgeTrapMapSize)} logBufferEntryCount=${Math.round(args.logBufferEntryCount)} logBufferDroppedCount=${Math.round(args.logBufferDroppedCount)} visualGovernorHoldAgeMs=${Math.round(args.visualGovernorHoldAgeMs)} noProgressStreak=${Math.round(args.noProgressStreak)} lostForwardWallStreak=${Math.round(args.lostForwardWallStreak)} targetDebtPx=${Math.round(args.targetDebtPx)} distanceToMaxScrollTop=${Math.round(args.distanceToMaxScrollTop)} currentLineIdx=${Math.round(args.currentLineIdx)} requestedTargetIdx=${Math.round(args.requestedTargetIdx)}`;
}

export function buildAsrScrollPinnedBottomLockSummaryDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number;
  targetDebtPx: number;
  distanceToMaxScrollTop: number;
  terminalClampActive: boolean;
  pinned: boolean;
  pocketState: string;
  markerLockState: string;
  selectedAuthority: string;
  noProgressStreak: number;
  visualGovernorHoldAgeMs: number;
  lastGuardReason: string;
}): string {
  return `[ASR_SCROLL_PINNED_BOTTOM_LOCK_SUMMARY] currentLineIdx=${Math.round(args.currentLineIdx)} requestedTargetIdx=${Math.round(args.requestedTargetIdx)} targetDebtPx=${Math.round(args.targetDebtPx)} distanceToMaxScrollTop=${Math.round(args.distanceToMaxScrollTop)} terminalClampActive=${args.terminalClampActive ? 1 : 0} pinned=${args.pinned ? 1 : 0} pocketState=${args.pocketState || 'unknown'} markerLockState=${args.markerLockState || 'unknown'} selectedAuthority=${args.selectedAuthority || 'unknown'} noProgressStreak=${Math.round(args.noProgressStreak)} visualGovernorHoldAgeMs=${Math.round(args.visualGovernorHoldAgeMs)} lastGuardReason=${args.lastGuardReason || 'none'}`;
}

export function buildAsrLiveScrollStalledDiagnostic(args: {
  currentLineIdx: number;
  requestedTargetIdx: number | null;
  semanticTargetIdx: number | null;
  allowedTargetIdx: number | null;
  acceptedCommitTargetIdx: number | null;
  recoveryTargetIdx: number | null;
  movementAllowed: boolean;
  finalGear: 'hold' | 'normal_floor' | 'normal_tracking' | 'recovery';
  pocketState: 'above_marker' | 'in_preferred_pocket' | 'below_preferred_pocket' | 'near_lower_rail' | 'bottom_locked' | 'top_pressure';
  cappedTargetSafe: boolean;
  targetDebtPx: number;
  noVisualProgressMs: number;
  noCommitMs: number;
  speechFresh: boolean;
  audioFresh: boolean;
  backendFresh: boolean;
  transcriptAgeMs: number;
  audioAgeMs: number;
  backendTranscriptStale: boolean;
  forwardEvidenceExists: boolean;
  visualGovernorHoldActive: boolean;
  restartAction: string;
  recoveryAction: string;
  reason: string;
}): string {
  const requestedTargetIdx = Number.isFinite(args.requestedTargetIdx as number) ? Math.round(Number(args.requestedTargetIdx)) : -1;
  const semanticTargetIdx = Number.isFinite(args.semanticTargetIdx as number) ? Math.round(Number(args.semanticTargetIdx)) : -1;
  const allowedTargetIdx = Number.isFinite(args.allowedTargetIdx as number) ? Math.round(Number(args.allowedTargetIdx)) : -1;
  const acceptedCommitTargetIdx = Number.isFinite(args.acceptedCommitTargetIdx as number) ? Math.round(Number(args.acceptedCommitTargetIdx)) : -1;
  const recoveryTargetIdx = Number.isFinite(args.recoveryTargetIdx as number) ? Math.round(Number(args.recoveryTargetIdx)) : -1;
  return `[ASR_LIVE_SCROLL_STALLED] currentLineIdx=${Math.round(args.currentLineIdx)} requestedTargetIdx=${requestedTargetIdx} semanticTargetIdx=${semanticTargetIdx} allowedTargetIdx=${allowedTargetIdx} acceptedCommitTargetIdx=${acceptedCommitTargetIdx} recoveryTargetIdx=${recoveryTargetIdx} movementAllowed=${args.movementAllowed ? 1 : 0} finalGear=${args.finalGear} pocketState=${args.pocketState} cappedTargetSafe=${args.cappedTargetSafe ? 1 : 0} targetDebtPx=${Math.round(args.targetDebtPx)} noVisualProgressMs=${Math.round(args.noVisualProgressMs)} noCommitMs=${Math.round(args.noCommitMs)} speechFresh=${args.speechFresh ? 1 : 0} audioFresh=${args.audioFresh ? 1 : 0} backendFresh=${args.backendFresh ? 1 : 0} transcriptAgeMs=${Math.round(args.transcriptAgeMs)} audioAgeMs=${Math.round(args.audioAgeMs)} backendTranscriptStale=${args.backendTranscriptStale ? 1 : 0} forwardEvidenceExists=${args.forwardEvidenceExists ? 1 : 0} visualGovernorHoldActive=${args.visualGovernorHoldActive ? 1 : 0} restartAction=${args.restartAction} recoveryAction=${args.recoveryAction} reason=${args.reason}`;
}

export const ASR_DELAYED_SUPPRESSION_AUTOPSY_VERSION = '2026-05-18a';
export const ASR_VISUAL_GOVERNOR_DEAD_SCREEN_AUTOPSY_VERSION = '2026-05-18a';

export function buildAsrDiagnosticBundleProofDiagnostic(args: {
  buildStamp: string;
  runKey: string;
  runGeneration: number;
  hasDelayedSuppressionAutopsyBuilder: boolean;
  hasVisualGovernorDeadScreenAutopsyBuilder: boolean;
  delayedAutopsyVersion: string;
  deadScreenAutopsyVersion: string;
}): string {
  return `[ASR_DIAGNOSTIC_BUNDLE_PROOF] buildStamp=${args.buildStamp} runKey=${args.runKey || 'none'} runGeneration=${Number.isFinite(args.runGeneration) ? Math.round(args.runGeneration) : -1} hasDelayedSuppressionAutopsyBuilder=${args.hasDelayedSuppressionAutopsyBuilder ? 1 : 0} hasVisualGovernorDeadScreenAutopsyBuilder=${args.hasVisualGovernorDeadScreenAutopsyBuilder ? 1 : 0} delayedAutopsyVersion=${args.delayedAutopsyVersion} deadScreenAutopsyVersion=${args.deadScreenAutopsyVersion}`;
}

export function buildAsrAlignmentEpisodeDumpPathProofDiagnostic(args: {
  visualOutcome: string;
  reasonChain: string;
  actions: string;
  markerY: number;
  nextSpeakableLineY: number;
  wouldQualifyDelayedSuppressionAutopsy: boolean;
  delayedAutopsyGateReason: string;
  wouldQualifyDeadScreenAutopsy: boolean;
  deadScreenAutopsyGateReason: string;
}): string {
  return `[ASR_ALIGNMENT_EPISODE_DUMP_PATH_PROOF] visualOutcome=${args.visualOutcome} reasonChain=${args.reasonChain} actions=${args.actions} markerY=${Math.round(args.markerY)} nextSpeakableLineY=${Math.round(args.nextSpeakableLineY)} wouldQualifyDelayedSuppressionAutopsy=${args.wouldQualifyDelayedSuppressionAutopsy ? 1 : 0} delayedAutopsyGateReason=${args.delayedAutopsyGateReason} wouldQualifyDeadScreenAutopsy=${args.wouldQualifyDeadScreenAutopsy ? 1 : 0} deadScreenAutopsyGateReason=${args.deadScreenAutopsyGateReason}`;
}

export function buildAsrOptionalDiagnosticErrorDiagnostic(args: {
  diagnosticTag: string;
  errorMessage: string;
}): string {
  return `[ASR_OPTIONAL_DIAGNOSTIC_ERROR] diagnosticTag=${args.diagnosticTag} errorMessage="${args.errorMessage.replace(/"/g, "'")}"`;
}

export function buildAsrEarlyBridgeTrapReleasedDiagnostic(args: {
  current: number;
  requestedTarget: number;
  commitTarget: number;
  skippedIgnorableLines: string[];
  repeatedHoldCount: number;
  noCommitMs: number;
  runAgeMs: number;
  pendingBridgeAgeMs: number;
  proofSource: string;
  finalPacketFresh: boolean;
  transcriptGrowing: boolean;
  targetViewportState: string;
  reason: string;
}): string {
  return `[ASR_EARLY_BRIDGE_TRAP_RELEASED] current=${args.current} requestedTarget=${args.requestedTarget} commitTarget=${args.commitTarget} skippedIgnorableLines=[${args.skippedIgnorableLines.join(',')}] repeatedHoldCount=${args.repeatedHoldCount} noCommitMs=${Math.round(args.noCommitMs)} runAgeMs=${Math.round(args.runAgeMs)} pendingBridgeAgeMs=${Math.round(args.pendingBridgeAgeMs)} proofSource=${args.proofSource} finalPacketFresh=${args.finalPacketFresh ? 1 : 0} transcriptGrowing=${args.transcriptGrowing ? 1 : 0} targetViewportState=${args.targetViewportState} reason=${args.reason}`;
}

export function buildAsr4FreshTailVetoDiagnostic(args: {
  currentLine: number;
  candidateTargetLine: number | null;
  transcriptSource: string;
  wouldFreeze: boolean;
  rollingContextMatchesScript: boolean;
  previousLineMatched: boolean;
  currentLineMatched: boolean;
  forwardLineMatched: boolean;
  selectedNearbyWindow: 'previous' | 'current' | 'forward' | 'unknown';
  packetMatchAnchorLine: number | null;
  packetMatchAnchorMatched: boolean;
  packetMatchAnchorSim: number | null;
  selectedAnchorSource: 'current_local' | 'packet_match_local';
  legacyMoved: boolean;
  reason: string;
  freshTailPreview: string;
  nearbyScriptPreview: string;
}): string {
  const candidateTargetLine = Number.isFinite(args.candidateTargetLine as number)
    ? Math.round(Number(args.candidateTargetLine))
    : -1;
  const packetMatchAnchorLine = Number.isFinite(args.packetMatchAnchorLine as number)
    ? Math.round(Number(args.packetMatchAnchorLine))
    : -1;
  const packetMatchAnchorSim = Number.isFinite(args.packetMatchAnchorSim as number)
    ? Number(args.packetMatchAnchorSim).toFixed(3)
    : 'na';
  return `[ASR4_FRESH_TAIL_VETO] currentLine=${Math.round(args.currentLine)} candidateTargetLine=${candidateTargetLine} transcriptSource=${args.transcriptSource || 'unknown'} wouldFreeze=${args.wouldFreeze ? 1 : 0} rollingContextMatchesScript=${args.rollingContextMatchesScript ? 1 : 0} previousLineMatched=${args.previousLineMatched ? 1 : 0} currentLineMatched=${args.currentLineMatched ? 1 : 0} forwardLineMatched=${args.forwardLineMatched ? 1 : 0} selectedNearbyWindow=${args.selectedNearbyWindow} packetMatchAnchorLine=${packetMatchAnchorLine} packetMatchAnchorMatched=${args.packetMatchAnchorMatched ? 1 : 0} packetMatchAnchorSim=${packetMatchAnchorSim} selectedAnchorSource=${args.selectedAnchorSource} legacyMoved=${args.legacyMoved ? 1 : 0} reason=${args.reason} freshTailPreview="${String(args.freshTailPreview || '').replace(/"/g, "'")}" nearbyScriptPreview="${String(args.nearbyScriptPreview || '').replace(/"/g, "'")}"`;
}

export function buildAsr4ShadowMismatchDiagnostic(args: {
  currentLine: number;
  legacyTargetLine: number;
  transcriptSource: string;
  reason: string;
  freshTailPreview: string;
  nearbyScriptPreview: string;
  rollingContextMatchesScript: boolean;
  previousLineMatched: boolean;
  currentLineMatched: boolean;
  forwardLineMatched: boolean;
  selectedNearbyWindow: 'previous' | 'current' | 'forward' | 'unknown';
  packetMatchAnchorLine: number | null;
  packetMatchAnchorMatched: boolean;
  packetMatchAnchorSim: number | null;
  selectedAnchorSource: 'current_local' | 'packet_match_local';
}): string {
  const packetMatchAnchorLine = Number.isFinite(args.packetMatchAnchorLine as number)
    ? Math.round(Number(args.packetMatchAnchorLine))
    : -1;
  const packetMatchAnchorSim = Number.isFinite(args.packetMatchAnchorSim as number)
    ? Number(args.packetMatchAnchorSim).toFixed(3)
    : 'na';
  return `[ASR4_SHADOW_MISMATCH] currentLine=${Math.round(args.currentLine)} legacyTargetLine=${Math.round(args.legacyTargetLine)} transcriptSource=${args.transcriptSource || 'unknown'} asr4WouldFreeze=1 rollingContextMatchesScript=${args.rollingContextMatchesScript ? 1 : 0} previousLineMatched=${args.previousLineMatched ? 1 : 0} currentLineMatched=${args.currentLineMatched ? 1 : 0} forwardLineMatched=${args.forwardLineMatched ? 1 : 0} selectedNearbyWindow=${args.selectedNearbyWindow} packetMatchAnchorLine=${packetMatchAnchorLine} packetMatchAnchorMatched=${args.packetMatchAnchorMatched ? 1 : 0} packetMatchAnchorSim=${packetMatchAnchorSim} selectedAnchorSource=${args.selectedAnchorSource} reason=${args.reason} freshTailPreview="${String(args.freshTailPreview || '').replace(/"/g, "'")}" nearbyScriptPreview="${String(args.nearbyScriptPreview || '').replace(/"/g, "'")}"`;
}

export function buildAsr4RecoveryBudgetStateDiagnostic(args: {
  currentLine: number;
  targetLine: number | null;
  pendingBridgeAgeMs: number;
  sinceOnResultMs: number;
  sinceIngestMs: number;
  sinceCommitMs: number;
  commitCount: number;
  holdReason: string;
  sourceBranch: string;
  recoveryState: 'healthy' | 'recovering' | 'freeze';
  wouldFreeze: boolean;
  targetRecoveryMs: number;
  freezeCeilingMs: number;
  waitingForFreshLocalProof: boolean;
  movementAllowed: boolean;
  reason: string;
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  return `[ASR4_RECOVERY_BUDGET_STATE] currentLine=${Math.round(args.currentLine)} targetLine=${targetLine} pendingBridgeAgeMs=${Math.round(args.pendingBridgeAgeMs)} sinceOnResultMs=${Math.round(args.sinceOnResultMs)} sinceIngestMs=${Math.round(args.sinceIngestMs)} sinceCommitMs=${Math.round(args.sinceCommitMs)} commitCount=${Math.round(args.commitCount)} holdReason=${args.holdReason || 'unknown'} sourceBranch=${args.sourceBranch || 'unknown'} recoveryState=${args.recoveryState} wouldFreeze=${args.wouldFreeze ? 1 : 0} movementAllowed=${args.movementAllowed ? 1 : 0} targetRecoveryMs=${Math.round(args.targetRecoveryMs)} freezeCeilingMs=${Math.round(args.freezeCeilingMs)} waitingForFreshLocalProof=${args.waitingForFreshLocalProof ? 1 : 0} reason=${args.reason}`;
}

export function buildAsr4RecoveryBudgetViolationDiagnostic(args: {
  currentLine: number;
  targetLine: number | null;
  pendingBridgeAgeMs: number;
  sinceOnResultMs: number;
  sinceIngestMs: number;
  sinceCommitMs: number;
  commitCount: number;
  holdReason: string;
  sourceBranch: string;
  recoveryState: 'healthy' | 'recovering' | 'freeze';
  wouldFreeze: boolean;
  targetRecoveryMs: number;
  freezeCeilingMs: number;
  waitingForFreshLocalProof: boolean;
  movementAllowed: boolean;
  reason: string;
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  return `[ASR4_RECOVERY_BUDGET_VIOLATION] currentLine=${Math.round(args.currentLine)} targetLine=${targetLine} pendingBridgeAgeMs=${Math.round(args.pendingBridgeAgeMs)} sinceOnResultMs=${Math.round(args.sinceOnResultMs)} sinceIngestMs=${Math.round(args.sinceIngestMs)} sinceCommitMs=${Math.round(args.sinceCommitMs)} commitCount=${Math.round(args.commitCount)} holdReason=${args.holdReason || 'unknown'} sourceBranch=${args.sourceBranch || 'unknown'} recoveryState=${args.recoveryState} wouldFreeze=${args.wouldFreeze ? 1 : 0} movementAllowed=${args.movementAllowed ? 1 : 0} targetRecoveryMs=${Math.round(args.targetRecoveryMs)} freezeCeilingMs=${Math.round(args.freezeCeilingMs)} waitingForFreshLocalProof=${args.waitingForFreshLocalProof ? 1 : 0} reason=${args.reason}`;
}

export function buildAsr4RecoveryBudgetAuthorityAppliedDiagnostic(args: {
  currentLine: number;
  targetLine: number | null;
  pendingBridgeAgeMs: number;
  holdReason: string;
  sourceBranch: string;
  previousLegacyAction?: string | null;
  authorityAction: 'expired_stale_pending_bridge';
  movementAllowed: false;
  staleBridgeCleared: boolean;
  waitingForFreshLocalProof: true;
  reason: 'recovery_budget_expired_pending_bridge_completion';
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  const previousLegacyAction = String(args.previousLegacyAction || '').trim() || 'na';
  return `[ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED] currentLine=${Math.round(args.currentLine)} targetLine=${targetLine} pendingBridgeAgeMs=${Math.round(args.pendingBridgeAgeMs)} holdReason=${args.holdReason || 'unknown'} sourceBranch=${args.sourceBranch || 'unknown'} previousLegacyAction=${previousLegacyAction} authorityAction=${args.authorityAction} movementAllowed=0 staleBridgeCleared=${args.staleBridgeCleared ? 1 : 0} waitingForFreshLocalProof=1 reason=${args.reason}`;
}

export function buildAsrStaleLandingRelaxedForFreshForwardAnchorDiagnostic(args: {
  currentLine: number;
  candidateLine: number;
  deltaLines: number;
  whisperFresh: boolean;
  matcherStable: boolean;
  priorHoldReason: string;
}): string {
  return `[ASR_STALE_LANDING_RELAXED_FOR_FRESH_FORWARD_ANCHOR] currentLine=${Math.round(args.currentLine)} candidateLine=${Math.round(args.candidateLine)} deltaLines=${Math.round(args.deltaLines)} whisperFresh=${args.whisperFresh ? 1 : 0} matcherStable=${args.matcherStable ? 1 : 0} priorHoldReason=${args.priorHoldReason || 'unknown'}`;
}

export function buildAsrVisualDebtCatchupAllowedDiagnostic(args: {
  debtPx: number;
  lineHeightPx: number;
  proposedMovePx: number;
  actualMovePx?: number | null;
  decisionReason?: string;
  clampReason?: string;
  currentScrollTop?: number | null;
  targetScrollTop?: number | null;
  consecutiveDebtObservations?: number;
}): string {
  const actualMovePx = Number.isFinite(args.actualMovePx as number)
    ? Math.round(Number(args.actualMovePx))
    : -1;
  const currentScrollTop = Number.isFinite(args.currentScrollTop as number)
    ? Math.round(Number(args.currentScrollTop))
    : -1;
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  const consecutiveDebtObservations = Number.isFinite(args.consecutiveDebtObservations as number)
    ? Math.round(Number(args.consecutiveDebtObservations))
    : -1;
  return `[ASR_VISUAL_DEBT_CATCHUP_ALLOWED] debtPx=${Math.round(args.debtPx)} lineHeightPx=${Math.round(args.lineHeightPx)} proposedMovePx=${Math.round(args.proposedMovePx)} actualMovePx=${actualMovePx} decisionReason=${args.decisionReason || 'none'} clampReason=${args.clampReason || 'none'} currentScrollTop=${currentScrollTop} targetScrollTop=${targetScrollTop} consecutiveDebtObservations=${consecutiveDebtObservations}`;
}

export function buildAsrVisualDebtCatchupEvaluationSeenDiagnostic(args: {
  debtPx: number;
  lineHeightPx: number;
  debtDirection: 'forward' | 'backward' | 'none' | 'unknown';
  consecutiveDebtObservations: number;
  targetLine: number | null;
  currentLine: number;
  committedLine: number;
  targetForward: boolean;
  targetSafe: boolean;
  directWriteBlocked: boolean;
  targetPreservedForEasing: boolean;
  markerLockActive: boolean;
  terminalClampActive: boolean;
  cooldownActive: boolean;
  postCommitGapMs?: number;
  requiredGapMs?: number;
  reducedGapEligible?: boolean;
  recentSafeCommitAgeMs?: number;
  finalDecision: string;
  decisionReason?: string;
  blockedReason?: string;
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  const postCommitGapMs = Number.isFinite(args.postCommitGapMs as number)
    ? Math.round(Number(args.postCommitGapMs))
    : -1;
  const requiredGapMs = Number.isFinite(args.requiredGapMs as number)
    ? Math.round(Number(args.requiredGapMs))
    : -1;
  const recentSafeCommitAgeMs = Number.isFinite(args.recentSafeCommitAgeMs as number)
    ? Math.round(Number(args.recentSafeCommitAgeMs))
    : -1;
  return `[ASR_VISUAL_DEBT_CATCHUP_EVALUATION_SEEN] debtPx=${Math.round(args.debtPx)} lineHeightPx=${Math.round(args.lineHeightPx)} debtDirection=${args.debtDirection} consecutiveDebtObservations=${Math.round(args.consecutiveDebtObservations)} targetLine=${targetLine} currentLine=${Math.round(args.currentLine)} committedLine=${Math.round(args.committedLine)} targetForward=${args.targetForward ? 1 : 0} targetSafe=${args.targetSafe ? 1 : 0} directWriteBlocked=${args.directWriteBlocked ? 1 : 0} targetPreservedForEasing=${args.targetPreservedForEasing ? 1 : 0} markerLockActive=${args.markerLockActive ? 1 : 0} terminalClampActive=${args.terminalClampActive ? 1 : 0} cooldownActive=${args.cooldownActive ? 1 : 0} postCommitGapMs=${postCommitGapMs} requiredGapMs=${requiredGapMs} reducedGapEligible=${args.reducedGapEligible ? 1 : 0} recentSafeCommitAgeMs=${recentSafeCommitAgeMs} finalDecision=${args.finalDecision || 'unknown'} decisionReason=${args.decisionReason || 'none'} blockedReason=${args.blockedReason || 'none'}`;
}

export function buildAsrVisualDebtCatchupBlockedDiagnostic(args: {
  debtPx: number;
  lineHeightPx: number;
  proposedMovePx: number;
  blockedReason: string;
  postCommitGapMs?: number;
  requiredGapMs?: number;
  reducedGapEligible?: boolean;
  recentSafeCommitAgeMs?: number;
  consecutiveDebtObservations?: number;
  currentLineIdx?: number;
  committedLineIdx?: number;
  targetLineIdx?: number | null;
  decisionReason?: string;
}): string {
  const postCommitGapMs = Number.isFinite(args.postCommitGapMs as number)
    ? Math.round(Number(args.postCommitGapMs))
    : -1;
  const requiredGapMs = Number.isFinite(args.requiredGapMs as number)
    ? Math.round(Number(args.requiredGapMs))
    : -1;
  const recentSafeCommitAgeMs = Number.isFinite(args.recentSafeCommitAgeMs as number)
    ? Math.round(Number(args.recentSafeCommitAgeMs))
    : -1;
  const consecutiveDebtObservations = Number.isFinite(args.consecutiveDebtObservations as number)
    ? Math.round(Number(args.consecutiveDebtObservations))
    : -1;
  const currentLineIdx = Number.isFinite(args.currentLineIdx as number)
    ? Math.round(Number(args.currentLineIdx))
    : -1;
  const committedLineIdx = Number.isFinite(args.committedLineIdx as number)
    ? Math.round(Number(args.committedLineIdx))
    : -1;
  const targetLineIdx = Number.isFinite(args.targetLineIdx as number)
    ? Math.round(Number(args.targetLineIdx))
    : -1;
  return `[ASR_VISUAL_DEBT_CATCHUP_BLOCKED] debtPx=${Math.round(args.debtPx)} lineHeightPx=${Math.round(args.lineHeightPx)} proposedMovePx=${Math.round(args.proposedMovePx)} blockedReason=${args.blockedReason || 'unknown'} postCommitGapMs=${postCommitGapMs} requiredGapMs=${requiredGapMs} reducedGapEligible=${args.reducedGapEligible ? 1 : 0} recentSafeCommitAgeMs=${recentSafeCommitAgeMs} consecutiveDebtObservations=${consecutiveDebtObservations} currentLineIdx=${currentLineIdx} committedLineIdx=${committedLineIdx} targetLineIdx=${targetLineIdx} decisionReason=${args.decisionReason || 'none'}`;
}

export function buildAsr4VisualRecoveryStateDiagnostic(args: {
  currentLine: number;
  committedLine: number;
  targetLine: number | null;
  beforeScrollTop: number;
  afterScrollTop: number;
  movedPx: number;
  consecutiveNoMoveCommits: number;
  directWriteBlocked: boolean;
  targetPreservedForEasing: boolean;
  visualSnapSuppressed: boolean;
  liveScrollStalled: boolean;
  authorityAction: 'observe_only' | 'force_marker_lock_correction' | 'force_safe_direct_write' | 'freeze_far_visual_target';
  movementAllowed: boolean;
  reason: string;
  suppressedReason?: 'none' | 'not_needed_in_pocket' | 'suppressed_already_ahead' | 'reader_overrun_hold';
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  return `[ASR4_VISUAL_RECOVERY_STATE] currentLine=${Math.round(args.currentLine)} committedLine=${Math.round(args.committedLine)} targetLine=${targetLine} beforeScrollTop=${Math.round(args.beforeScrollTop)} afterScrollTop=${Math.round(args.afterScrollTop)} movedPx=${Math.round(args.movedPx)} consecutiveNoMoveCommits=${Math.round(args.consecutiveNoMoveCommits)} directWriteBlocked=${args.directWriteBlocked ? 1 : 0} targetPreservedForEasing=${args.targetPreservedForEasing ? 1 : 0} visualSnapSuppressed=${args.visualSnapSuppressed ? 1 : 0} liveScrollStalled=${args.liveScrollStalled ? 1 : 0} authorityAction=${args.authorityAction} movementAllowed=${args.movementAllowed ? 1 : 0} suppressedReason=${args.suppressedReason || 'none'} reason=${args.reason}`;
}

export function buildAsr4VisualRecoveryAuthorityAppliedDiagnostic(args: {
  currentLine: number;
  committedLine: number;
  targetLine: number | null;
  beforeScrollTop: number;
  afterScrollTop: number;
  movedPx: number;
  consecutiveNoMoveCommits: number;
  directWriteBlocked: boolean;
  targetPreservedForEasing: boolean;
  visualSnapSuppressed: boolean;
  liveScrollStalled: boolean;
  authorityAction:
    | 'force_marker_lock_correction'
    | 'force_safe_direct_write'
    | 'freeze_far_visual_target'
    | 'lead_pressure_capped_forward_step';
  movementAllowed: boolean;
  reason: string;
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  return `[ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED] currentLine=${Math.round(args.currentLine)} committedLine=${Math.round(args.committedLine)} targetLine=${targetLine} beforeScrollTop=${Math.round(args.beforeScrollTop)} afterScrollTop=${Math.round(args.afterScrollTop)} movedPx=${Math.round(args.movedPx)} consecutiveNoMoveCommits=${Math.round(args.consecutiveNoMoveCommits)} directWriteBlocked=${args.directWriteBlocked ? 1 : 0} targetPreservedForEasing=${args.targetPreservedForEasing ? 1 : 0} visualSnapSuppressed=${args.visualSnapSuppressed ? 1 : 0} liveScrollStalled=${args.liveScrollStalled ? 1 : 0} authorityAction=${args.authorityAction} movementAllowed=${args.movementAllowed ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrReaderOverrunHoldDiagnostic(args: {
  lane: string;
  authority: 'asr4-pocket-drift-authority' | 'asr4-visual-recovery-authority';
  currentLine: number;
  committedLine: number;
  targetLine: number | null;
  currentScrollTop: number;
  markerTopPx: number;
  currentLineCenterPx: number;
  currentLineDistanceFromMarkerPx: number;
  aboveMarkerLines: number;
  holdBufferLines: number;
  semanticWindowLocal: boolean;
  holdActive: boolean;
  reason: string;
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  return `[ASR_READER_OVERRUN_HOLD] lane=${args.lane || 'unknown'} authority=${args.authority} currentLine=${Math.round(args.currentLine)} committedLine=${Math.round(args.committedLine)} targetLine=${targetLine} currentScrollTop=${Math.round(args.currentScrollTop)} markerTopPx=${Math.round(args.markerTopPx)} currentLineCenterPx=${Math.round(args.currentLineCenterPx)} currentLineDistanceFromMarkerPx=${Math.round(args.currentLineDistanceFromMarkerPx)} aboveMarkerLines=${Number.isFinite(args.aboveMarkerLines) ? Number(args.aboveMarkerLines).toFixed(2) : 'na'} holdBufferLines=${Number(args.holdBufferLines).toFixed(2)} semanticWindowLocal=${args.semanticWindowLocal ? 1 : 0} holdActive=${args.holdActive ? 1 : 0} reason=${args.reason || 'unknown'}`;
}

export function buildAsr4PocketDriftStateDiagnostic(args: {
  currentLine: number;
  committedLine: number;
  targetLine: number | null;
  currentScrollTop: number;
  targetScrollTop: number | null;
  markerTopPx: number;
  activeLineTopPx: number;
  activeLineDistanceFromMarkerPx: number;
  activeLineViewportRatio: number;
  lineHeightPx: number;
  pocketTolerancePx: number;
  belowPocketPx: number;
  abovePocketPx: number;
  visualDebtPx: number;
  movedPx: number;
  targetPreservedForEasing: boolean;
  directWriteBlocked: boolean;
  visualSnapSuppressed: boolean;
  terminalClampActive: boolean;
  asr4VisualRecoveryRecentlyApplied: boolean;
  scrollReason: string;
  followMode: string;
  pocketHealth: 'inPocket' | 'belowPocket' | 'bottomReading' | 'abovePocket' | 'unknown';
  suppressedReason:
    | 'none'
    | 'easing_too_weak'
    | 'target_preserved_but_not_closing'
    | 'marker_lock_suppressed'
    | 'direct_write_blocked'
    | 'visual_recovery_cooldown'
    | 'already_ahead_check_wrong'
    | 'terminal_clamp'
    | 'no_target'
    | 'stale_bridge_target'
    | 'unknown';
  reason: string;
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  return `[ASR4_POCKET_DRIFT_STATE] currentLine=${Math.round(args.currentLine)} committedLine=${Math.round(args.committedLine)} targetLine=${targetLine} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${targetScrollTop} markerTopPx=${Math.round(args.markerTopPx)} activeLineTopPx=${Math.round(args.activeLineTopPx)} activeLineDistanceFromMarkerPx=${Math.round(args.activeLineDistanceFromMarkerPx)} activeLineViewportRatio=${Number.isFinite(args.activeLineViewportRatio) ? Number(args.activeLineViewportRatio).toFixed(3) : 'na'} lineHeightPx=${Math.round(args.lineHeightPx)} pocketTolerancePx=${Math.round(args.pocketTolerancePx)} belowPocketPx=${Math.round(args.belowPocketPx)} abovePocketPx=${Math.round(args.abovePocketPx)} visualDebtPx=${Math.round(args.visualDebtPx)} movedPx=${Math.round(args.movedPx)} targetPreservedForEasing=${args.targetPreservedForEasing ? 1 : 0} directWriteBlocked=${args.directWriteBlocked ? 1 : 0} visualSnapSuppressed=${args.visualSnapSuppressed ? 1 : 0} terminalClampActive=${args.terminalClampActive ? 1 : 0} asr4VisualRecoveryRecentlyApplied=${args.asr4VisualRecoveryRecentlyApplied ? 1 : 0} pocketHealth=${args.pocketHealth} suppressedReason=${args.suppressedReason} scrollReason=${args.scrollReason || 'unknown'} followMode=${args.followMode || 'unknown'} reason=${args.reason}`;
}

export function buildAsr4PocketDriftAuthorityAppliedDiagnostic(args: {
  currentLine: number;
  committedLine: number;
  targetLine: number | null;
  currentScrollTop: number;
  targetScrollTop: number | null;
  markerTopPx: number;
  activeLineTopPx: number;
  activeLineDistanceFromMarkerPx: number;
  belowPocketPx: number;
  lineHeightPx: number;
  consecutiveBelowPocketCount: number;
  cooldownActive: boolean;
  terminalClampActive: boolean;
  authorityAction:
    | 'force_marker_lock_to_pocket'
    | 'suppress_terminal_clamp'
    | 'freeze_far_target'
    | 'lead_pressure_capped_forward_step';
  movementAllowed: boolean;
  reason: 'pocket_drift_below_marker' | 'terminal_clamp_suppressed';
}): string {
  const targetLine = Number.isFinite(args.targetLine as number)
    ? Math.round(Number(args.targetLine))
    : -1;
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  return `[ASR4_POCKET_DRIFT_AUTHORITY_APPLIED] currentLine=${Math.round(args.currentLine)} committedLine=${Math.round(args.committedLine)} targetLine=${targetLine} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${targetScrollTop} markerTopPx=${Math.round(args.markerTopPx)} activeLineTopPx=${Math.round(args.activeLineTopPx)} activeLineDistanceFromMarkerPx=${Math.round(args.activeLineDistanceFromMarkerPx)} belowPocketPx=${Math.round(args.belowPocketPx)} lineHeightPx=${Math.round(args.lineHeightPx)} consecutiveBelowPocketCount=${Math.round(args.consecutiveBelowPocketCount)} cooldownActive=${args.cooldownActive ? 1 : 0} terminalClampActive=${args.terminalClampActive ? 1 : 0} authorityAction=${args.authorityAction} movementAllowed=${args.movementAllowed ? 1 : 0} reason=${args.reason}`;
}

export function buildAsrLowPocketDeadbandReconciledDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number | null;
  belowPocketPx: number;
  activeLineDistanceFromMarkerPx: number;
  previousHoldReason: string;
  correctionPx: number;
  observations: number;
}): string {
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  return `[ASR_LOW_POCKET_DEADBAND_RECONCILED] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${targetScrollTop} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineDistanceFromMarkerPx=${Math.round(args.activeLineDistanceFromMarkerPx)} previousHoldReason=${args.previousHoldReason || 'unknown'} correctionPx=${Math.round(args.correctionPx)} observations=${Math.round(args.observations)}`;
}

export function buildAsrLowPocketDeadbandBlockedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number | null;
  belowPocketPx: number;
  activeLineDistanceFromMarkerPx: number;
  previousHoldReason: string;
  correctionPx: number;
  observations: number;
  reason: string;
}): string {
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  return `[ASR_LOW_POCKET_DEADBAND_BLOCKED] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${targetScrollTop} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineDistanceFromMarkerPx=${Math.round(args.activeLineDistanceFromMarkerPx)} previousHoldReason=${args.previousHoldReason || 'unknown'} correctionPx=${Math.round(args.correctionPx)} observations=${Math.round(args.observations)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrLowPocketFreezeFarTargetReconciledDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number | null;
  proposedScrollTop: number;
  belowPocketPx: number;
  activeLineDistanceFromMarkerPx: number;
  holdReason: string;
  authorityAction: string;
  farReason: string;
  semanticDistance: number;
  visualDistancePx: number;
  movementAllowed: boolean;
  correctionPx: number;
}): string {
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  return `[ASR_LOW_POCKET_FREEZE_FAR_TARGET_RECONCILED] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${targetScrollTop} proposedScrollTop=${Math.round(args.proposedScrollTop)} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineDistanceFromMarkerPx=${Math.round(args.activeLineDistanceFromMarkerPx)} holdReason=${args.holdReason || 'unknown'} authorityAction=${args.authorityAction || 'unknown'} farReason=${args.farReason || 'unknown'} semanticDistance=${Math.round(args.semanticDistance)} visualDistancePx=${Math.round(args.visualDistancePx)} movementAllowed=${args.movementAllowed ? 1 : 0} correctionPx=${Math.round(args.correctionPx)}`;
}

export function buildAsrLowPocketFreezeFarTargetBlockedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number | null;
  proposedScrollTop: number;
  belowPocketPx: number;
  activeLineDistanceFromMarkerPx: number;
  holdReason: string;
  authorityAction: string;
  farReason: string;
  semanticDistance: number;
  visualDistancePx: number;
  movementAllowed: boolean;
  correctionPx: number;
  blockedReason: string;
}): string {
  const targetScrollTop = Number.isFinite(args.targetScrollTop as number)
    ? Math.round(Number(args.targetScrollTop))
    : -1;
  return `[ASR_LOW_POCKET_FREEZE_FAR_TARGET_BLOCKED] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${targetScrollTop} proposedScrollTop=${Math.round(args.proposedScrollTop)} belowPocketPx=${Math.round(args.belowPocketPx)} activeLineDistanceFromMarkerPx=${Math.round(args.activeLineDistanceFromMarkerPx)} holdReason=${args.holdReason || 'unknown'} authorityAction=${args.authorityAction || 'unknown'} farReason=${args.farReason || 'unknown'} semanticDistance=${Math.round(args.semanticDistance)} visualDistancePx=${Math.round(args.visualDistancePx)} movementAllowed=${args.movementAllowed ? 1 : 0} correctionPx=${Math.round(args.correctionPx)} blockedReason=${args.blockedReason || 'unknown'}`;
}

export function buildAsrApprovedVisualSmoothingBypassedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  approvedTargetScrollTop: number;
  correctionPx: number;
  visualErrorPx: number;
  smoothingReason: string;
  bypassReason: string;
}): string {
  return `[ASR_APPROVED_VISUAL_SMOOTHING_BYPASSED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} approvedTargetScrollTop=${Math.round(args.approvedTargetScrollTop)} correctionPx=${Math.round(args.correctionPx)} visualErrorPx=${Math.round(args.visualErrorPx)} smoothingReason=${args.smoothingReason || 'unknown'} bypassReason=${args.bypassReason || 'unknown'}`;
}

export function buildAsrApprovedVisualSmoothingRebasedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  previousTargetScrollTop: number;
  approvedTargetScrollTop: number;
  correctionPx: number;
  previousReason: string;
  smoothingReason: string;
  rebaseReason: string;
}): string {
  return `[ASR_APPROVED_VISUAL_SMOOTHING_REBASED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} previousTargetScrollTop=${Math.round(args.previousTargetScrollTop)} approvedTargetScrollTop=${Math.round(args.approvedTargetScrollTop)} correctionPx=${Math.round(args.correctionPx)} previousReason=${args.previousReason || 'unknown'} smoothingReason=${args.smoothingReason || 'unknown'} rebaseReason=${args.rebaseReason || 'unknown'}`;
}

export function buildAsrProfileSelectedDiagnostic(args: {
  lane: string;
  profile: string;
  speechFreshMaxAgeMs: number;
  responseFreshMaxAgeMs: number;
  multiStepConfirmMinDelta: number;
  multiStepConfirmHits: number;
  backtrackHoldMs: number;
}): string {
  return `[ASR_PROFILE_SELECTED] lane=${args.lane || 'unknown'} profile=${args.profile || 'unknown'} speechFreshMaxAgeMs=${Math.round(args.speechFreshMaxAgeMs)} responseFreshMaxAgeMs=${Math.round(args.responseFreshMaxAgeMs)} multiStepConfirmMinDelta=${Math.round(args.multiStepConfirmMinDelta)} multiStepConfirmHits=${Math.round(args.multiStepConfirmHits)} backtrackHoldMs=${Math.round(args.backtrackHoldMs)}`;
}

export function buildAsrHighAccuracyProfileActiveDiagnostic(args: {
  lane: string;
  profile: string;
  reason: string;
}): string {
  return `[ASR_HIGH_ACCURACY_PROFILE_ACTIVE] lane=${args.lane || 'unknown'} profile=${args.profile || 'unknown'} reason=${args.reason || 'selected'}`;
}

export function buildAsrStandardLargeJumpHeldDiagnostic(args: {
  currentLineIdx: number;
  proposedLineIdx: number;
  bestIdx: number;
  delta: number;
  hasLocalProof: boolean;
  confirmHits: number;
  confirmHitsRequired: number;
  reason: string;
}): string {
  return `[ASR_STANDARD_LARGE_JUMP_HELD] currentLineIdx=${Math.round(args.currentLineIdx)} proposedLineIdx=${Math.round(args.proposedLineIdx)} bestIdx=${Math.round(args.bestIdx)} delta=${Math.round(args.delta)} hasLocalProof=${args.hasLocalProof ? 1 : 0} confirmHits=${Math.round(args.confirmHits)} confirmHitsRequired=${Math.round(args.confirmHitsRequired)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrStandardBacktrackInstabilityHeldDiagnostic(args: {
  currentLineIdx: number;
  proposedLineIdx: number;
  bestIdx: number;
  previousBestIdx: number;
  instabilityAgeMs: number;
  holdMs: number;
  reason: string;
}): string {
  return `[ASR_STANDARD_BACKTRACK_INSTABILITY_HELD] currentLineIdx=${Math.round(args.currentLineIdx)} proposedLineIdx=${Math.round(args.proposedLineIdx)} bestIdx=${Math.round(args.bestIdx)} previousBestIdx=${Math.round(args.previousBestIdx)} instabilityAgeMs=${Math.round(args.instabilityAgeMs)} holdMs=${Math.round(args.holdMs)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrStandardStaleCommitBlockedDiagnostic(args: {
  transcriptSeq: number;
  responseAgeMs: number;
  lastSpeechAgeMs: number;
  lastAudioChunkAgeMs: number;
  speechFresh: boolean;
  speechActive: boolean;
  currentLineIdx: number;
  proposedLineIdx: number;
  committedLineIdx: number;
  reason: string;
}): string {
  return `[ASR_STANDARD_STALE_COMMIT_BLOCKED] transcriptSeq=${Number.isFinite(args.transcriptSeq) ? Math.round(args.transcriptSeq) : -1} responseAgeMs=${Number.isFinite(args.responseAgeMs) ? Math.round(args.responseAgeMs) : -1} lastSpeechAgeMs=${Number.isFinite(args.lastSpeechAgeMs) ? Math.round(args.lastSpeechAgeMs) : -1} lastAudioChunkAgeMs=${Number.isFinite(args.lastAudioChunkAgeMs) ? Math.round(args.lastAudioChunkAgeMs) : -1} speechFresh=${args.speechFresh ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} currentLineIdx=${Math.round(args.currentLineIdx)} proposedLineIdx=${Math.round(args.proposedLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrStandardVisualReleaseSuppressedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentTop: number;
  proposedTop: number;
  cappedTop: number;
  targetScrollTop: number;
  reason: string;
}): string {
  return `[ASR_STANDARD_VISUAL_RELEASE_SUPPRESSED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentTop=${Math.round(args.currentTop)} proposedTop=${Math.round(args.proposedTop)} cappedTop=${Math.round(args.cappedTop)} targetScrollTop=${Math.round(args.targetScrollTop)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrVisualTargetOvershootDetectedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentTop: number;
  targetScrollTop: number;
  overshootPx: number;
  tolerancePx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_TARGET_OVERSHOOT_DETECTED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentTop=${Math.round(args.currentTop)} targetScrollTop=${Math.round(args.targetScrollTop)} overshootPx=${Math.round(args.overshootPx)} tolerancePx=${Math.round(args.tolerancePx)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrVisualForwardOvershootSuppressedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentTop: number;
  proposedTop: number;
  targetScrollTop: number;
  tolerancePx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_FORWARD_OVERSHOOT_SUPPRESSED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentTop=${Math.round(args.currentTop)} proposedTop=${Math.round(args.proposedTop)} targetScrollTop=${Math.round(args.targetScrollTop)} tolerancePx=${Math.round(args.tolerancePx)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrVisualTargetBoundedStepDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentTop: number;
  proposedTop: number;
  boundedTop: number;
  targetScrollTop: number;
  tolerancePx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_TARGET_BOUNDED_STEP] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentTop=${Math.round(args.currentTop)} proposedTop=${Math.round(args.proposedTop)} boundedTop=${Math.round(args.boundedTop)} targetScrollTop=${Math.round(args.targetScrollTop)} tolerancePx=${Math.round(args.tolerancePx)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrVisualRecenterPullbackAppliedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  beforeTop: number;
  afterTop: number;
  targetScrollTop: number;
  pullbackPx: number;
  tolerancePx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_RECENTER_PULLBACK_APPLIED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} beforeTop=${Math.round(args.beforeTop)} afterTop=${Math.round(args.afterTop)} targetScrollTop=${Math.round(args.targetScrollTop)} pullbackPx=${Math.round(args.pullbackPx)} tolerancePx=${Math.round(args.tolerancePx)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrVisualRecenterPullbackBlockedDiagnostic(args: {
  authority: string;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  currentTop: number;
  targetScrollTop: number;
  overshootPx: number;
  tolerancePx: number;
  reason: string;
}): string {
  return `[ASR_VISUAL_RECENTER_PULLBACK_BLOCKED] authority=${args.authority || 'unknown'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentTop=${Math.round(args.currentTop)} targetScrollTop=${Math.round(args.targetScrollTop)} overshootPx=${Math.round(args.overshootPx)} tolerancePx=${Math.round(args.tolerancePx)} reason=${args.reason || 'unknown'}`;
}

function buildAsrPocketWallDiagnostic(
  tag:
    | 'ASR_POCKET_WALL_EVALUATED'
    | 'ASR_POCKET_WALL_CAPPED'
    | 'ASR_POCKET_WALL_BYPASSED'
    | 'ASR_HOLD_FORWARD_WRITE_SUPPRESSED'
    | 'ASR_SAME_LINE_OVERSHOOT_CAPPED'
    | 'ASR_NO_SAFE_TARGET_FORWARD_SUPPRESSED',
  args: {
    reason: string;
    proposedTop: number;
    cappedTop: number;
    currentTop: number;
    lineHeightPx: number;
    authoritativeLineIdx: number;
    candidateLineIdx: number;
    lastVerifiedCommitLineIdx: number;
    lastVerifiedCommitAgeMs: number;
    hasFreshVerifiedForwardCommit: boolean;
    pocketTop: number;
    pocketBottom: number;
    tolerancePx: number;
    sourceAuthority: string;
    proposedTopSource?: string;
  },
): string {
  return `[${tag}] reason=${args.reason || 'unknown'} proposedTop=${Math.round(args.proposedTop)} cappedTop=${Math.round(args.cappedTop)} currentTop=${Math.round(args.currentTop)} lineHeightPx=${Math.round(args.lineHeightPx)} authoritativeLineIdx=${Math.round(args.authoritativeLineIdx)} candidateLineIdx=${Math.round(args.candidateLineIdx)} lastVerifiedCommitLineIdx=${Math.round(args.lastVerifiedCommitLineIdx)} lastVerifiedCommitAgeMs=${Math.round(args.lastVerifiedCommitAgeMs)} hasFreshVerifiedForwardCommit=${args.hasFreshVerifiedForwardCommit ? 1 : 0} pocketTop=${Math.round(args.pocketTop)} pocketBottom=${Math.round(args.pocketBottom)} tolerancePx=${Math.round(args.tolerancePx)} sourceAuthority=${args.sourceAuthority || 'unknown'} proposedTopSource=${args.proposedTopSource || 'normal_requested'}`;
}

export function buildAsrPocketWallEvaluatedDiagnostic(args: {
  reason: string;
  proposedTop: number;
  cappedTop: number;
  currentTop: number;
  lineHeightPx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  lastVerifiedCommitAgeMs: number;
  hasFreshVerifiedForwardCommit: boolean;
  pocketTop: number;
  pocketBottom: number;
  tolerancePx: number;
  sourceAuthority: string;
  proposedTopSource?: string;
}): string {
  return buildAsrPocketWallDiagnostic('ASR_POCKET_WALL_EVALUATED', args);
}

export function buildAsrPocketWallCappedDiagnostic(args: {
  reason: string;
  proposedTop: number;
  cappedTop: number;
  currentTop: number;
  lineHeightPx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  lastVerifiedCommitAgeMs: number;
  hasFreshVerifiedForwardCommit: boolean;
  pocketTop: number;
  pocketBottom: number;
  tolerancePx: number;
  sourceAuthority: string;
}): string {
  return buildAsrPocketWallDiagnostic('ASR_POCKET_WALL_CAPPED', args);
}

export function buildAsrPocketWallBypassedDiagnostic(args: {
  reason: string;
  proposedTop: number;
  cappedTop: number;
  currentTop: number;
  lineHeightPx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  lastVerifiedCommitAgeMs: number;
  hasFreshVerifiedForwardCommit: boolean;
  pocketTop: number;
  pocketBottom: number;
  tolerancePx: number;
  sourceAuthority: string;
}): string {
  return buildAsrPocketWallDiagnostic('ASR_POCKET_WALL_BYPASSED', args);
}

export function buildAsrHoldForwardWriteSuppressedDiagnostic(args: {
  reason: string;
  proposedTop: number;
  cappedTop: number;
  currentTop: number;
  lineHeightPx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  lastVerifiedCommitAgeMs: number;
  hasFreshVerifiedForwardCommit: boolean;
  pocketTop: number;
  pocketBottom: number;
  tolerancePx: number;
  sourceAuthority: string;
}): string {
  return buildAsrPocketWallDiagnostic('ASR_HOLD_FORWARD_WRITE_SUPPRESSED', args);
}

export function buildAsrSameLineOvershootCappedDiagnostic(args: {
  reason: string;
  proposedTop: number;
  cappedTop: number;
  currentTop: number;
  lineHeightPx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  lastVerifiedCommitAgeMs: number;
  hasFreshVerifiedForwardCommit: boolean;
  pocketTop: number;
  pocketBottom: number;
  tolerancePx: number;
  sourceAuthority: string;
}): string {
  return buildAsrPocketWallDiagnostic('ASR_SAME_LINE_OVERSHOOT_CAPPED', args);
}

export function buildAsrNoSafeTargetForwardSuppressedDiagnostic(args: {
  reason: string;
  proposedTop: number;
  cappedTop: number;
  currentTop: number;
  lineHeightPx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  lastVerifiedCommitLineIdx: number;
  lastVerifiedCommitAgeMs: number;
  hasFreshVerifiedForwardCommit: boolean;
  pocketTop: number;
  pocketBottom: number;
  tolerancePx: number;
  sourceAuthority: string;
}): string {
  return buildAsrPocketWallDiagnostic('ASR_NO_SAFE_TARGET_FORWARD_SUPPRESSED', args);
}

export function buildAsrVisualDeadlockEscapeDiagnostic(args: {
  recoveryMode: string;
  currentLineIdx: number;
  committedLineIdx: number;
  authoritativeLineIdx: number;
  candidateLineIdx: number;
  visualAnchorLineIdx: number;
  semanticAheadLines: number;
  selectedAuthority: string;
  leadPressureReason: string;
  pocketWallReason: string;
  speakableLead: number;
  renderedLead: number;
  proposedScrollTop: number;
  cappedScrollTop: number;
  cappedDeltaPx: number;
  targetScrollTop: number;
  beforeScrollTop: number;
  boundedEscapeTargetScrollTop: number;
  afterScrollTop: number;
  deltaScrollTop: number;
  markerY: number;
  currentLineViewportY: number;
  matchedLineViewportY: number;
  visualDebtPx: number;
  matchedMarkerErrorPx: number;
  bottomDriftGuardRecent: boolean;
  visualDebtCatchupBlockedRecent: boolean;
  pursueFlatlineMs: number;
  repeatCount: number;
  cooldownMs: number;
  escapeApplied: boolean;
  recoveryApplied: boolean;
  asrSilenceActive: boolean;
  visualRecoverySilenceBlocked: boolean;
  trueVisualSilence: boolean;
  silenceActiveAgeMs: number;
  lastSilenceStartAgeMs: number;
  quietOrStaleReason: string;
  speechLive: boolean;
  transcriptFresh: boolean;
  finalFresh: boolean;
  visualRecoveryFresh: boolean;
  lastFinalAgeMs: number;
  lastSpeechAgeMs: number;
  lastTranscriptAgeMs: number;
  lastSemanticProgressAgeMs: number;
  lastVisualProgressAgeMs: number;
  recentFinalDuringSilence: boolean;
  recentSpeechDuringSilence: boolean;
  staleForSemanticCommit: boolean;
  staleForVisualRecovery: boolean;
  rejectReason: string;
}): string {
  return `[ASR_VISUAL_DEADLOCK_ESCAPE] recoveryMode=${args.recoveryMode || 'semantic_ahead'} currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} authoritativeLineIdx=${Math.round(args.authoritativeLineIdx)} candidateLineIdx=${Math.round(args.candidateLineIdx)} visualAnchorLineIdx=${Math.round(args.visualAnchorLineIdx)} semanticAheadLines=${Math.round(args.semanticAheadLines)} selectedAuthority=${args.selectedAuthority || 'unknown'} leadPressureReason=${args.leadPressureReason || 'none'} pocketWallReason=${args.pocketWallReason || 'none'} speakableLead=${Math.round(args.speakableLead)} renderedLead=${Math.round(args.renderedLead)} proposedScrollTop=${Math.round(args.proposedScrollTop)} cappedScrollTop=${Math.round(args.cappedScrollTop)} cappedDeltaPx=${Math.round(args.cappedDeltaPx)} targetScrollTop=${Math.round(args.targetScrollTop)} beforeScrollTop=${Math.round(args.beforeScrollTop)} currentScrollTop=${Math.round(args.beforeScrollTop)} boundedEscapeTargetScrollTop=${Math.round(args.boundedEscapeTargetScrollTop)} boundedRecoveryTargetScrollTop=${Math.round(args.boundedEscapeTargetScrollTop)} afterScrollTop=${Math.round(args.afterScrollTop)} deltaScrollTop=${Math.round(args.deltaScrollTop)} markerY=${Number.isFinite(args.markerY) ? Math.round(args.markerY) : -1} currentLineViewportY=${Number.isFinite(args.currentLineViewportY) ? Math.round(args.currentLineViewportY) : -1} matchedLineViewportY=${Number.isFinite(args.matchedLineViewportY) ? Math.round(args.matchedLineViewportY) : -1} visualDebtPx=${Number.isFinite(args.visualDebtPx) ? Math.round(args.visualDebtPx) : -1} matchedMarkerErrorPx=${Number.isFinite(args.matchedMarkerErrorPx) ? Math.round(args.matchedMarkerErrorPx) : -1} bottomDriftGuardRecent=${args.bottomDriftGuardRecent ? 1 : 0} visualDebtCatchupBlockedRecent=${args.visualDebtCatchupBlockedRecent ? 1 : 0} pursueFlatlineMs=${Number.isFinite(args.pursueFlatlineMs) ? Math.round(args.pursueFlatlineMs) : -1} repeatCount=${Math.round(args.repeatCount)} cooldownMs=${Math.round(args.cooldownMs)} escapeApplied=${args.escapeApplied ? 1 : 0} recoveryApplied=${args.recoveryApplied ? 1 : 0} asrSilenceActive=${args.asrSilenceActive ? 1 : 0} visualRecoverySilenceBlocked=${args.visualRecoverySilenceBlocked ? 1 : 0} trueVisualSilence=${args.trueVisualSilence ? 1 : 0} silenceActiveAgeMs=${Number.isFinite(args.silenceActiveAgeMs) ? Math.round(args.silenceActiveAgeMs) : -1} lastSilenceStartAgeMs=${Number.isFinite(args.lastSilenceStartAgeMs) ? Math.round(args.lastSilenceStartAgeMs) : -1} quietOrStaleReason=${args.quietOrStaleReason || 'none'} speechLive=${args.speechLive ? 1 : 0} transcriptFresh=${args.transcriptFresh ? 1 : 0} finalFresh=${args.finalFresh ? 1 : 0} visualRecoveryFresh=${args.visualRecoveryFresh ? 1 : 0} lastFinalAgeMs=${Number.isFinite(args.lastFinalAgeMs) ? Math.round(args.lastFinalAgeMs) : -1} lastSpeechAgeMs=${Number.isFinite(args.lastSpeechAgeMs) ? Math.round(args.lastSpeechAgeMs) : -1} lastTranscriptAgeMs=${Number.isFinite(args.lastTranscriptAgeMs) ? Math.round(args.lastTranscriptAgeMs) : -1} lastSemanticProgressAgeMs=${Number.isFinite(args.lastSemanticProgressAgeMs) ? Math.round(args.lastSemanticProgressAgeMs) : -1} lastVisualProgressAgeMs=${Number.isFinite(args.lastVisualProgressAgeMs) ? Math.round(args.lastVisualProgressAgeMs) : -1} recentFinalDuringSilence=${args.recentFinalDuringSilence ? 1 : 0} recentSpeechDuringSilence=${args.recentSpeechDuringSilence ? 1 : 0} staleForSemanticCommit=${args.staleForSemanticCommit ? 1 : 0} staleForVisualRecovery=${args.staleForVisualRecovery ? 1 : 0} rejectReason=${args.rejectReason || 'none'}`;
}

export function buildAsrLeadPressureVisualDebtFloorDiagnostic(
  tag: 'ASR_LEAD_PRESSURE_VISUAL_DEBT_FLOOR_EVALUATED' | 'ASR_LEAD_PRESSURE_VISUAL_DEBT_FLOOR_APPLIED',
  args: {
    currentLineIdx: number;
    committedLineIdx: number;
    authoritativeLineIdx: number;
    visualAnchorLineIdx: number;
    targetLineIdx: number;
    selectedAuthority: string;
    proposedScrollTop: number;
    normalCappedScrollTop: number;
    flooredScrollTop: number;
    cappedDeltaPxBefore: number;
    cappedDeltaPxAfter: number;
    visualDebtPx: number;
    matchedMarkerErrorPx: number;
    markerY: number;
    currentLineViewportY: number;
    matchedLineViewportY: number;
    bottomDriftGuardRecent: boolean;
    visualDebtCatchupBlockedRecent: boolean;
    lastVisualProgressAgeMs: number;
    speakableLead: number;
    renderedLead: number;
    recoveryModeNearby: string;
    floorApplied: boolean;
    rejectReason: string;
  },
): string {
  return `[${tag}] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} authoritativeLineIdx=${Math.round(args.authoritativeLineIdx)} visualAnchorLineIdx=${Math.round(args.visualAnchorLineIdx)} targetLineIdx=${Math.round(args.targetLineIdx)} selectedAuthority=${args.selectedAuthority || 'unknown'} proposedScrollTop=${Math.round(args.proposedScrollTop)} normalCappedScrollTop=${Math.round(args.normalCappedScrollTop)} flooredScrollTop=${Math.round(args.flooredScrollTop)} cappedDeltaPxBefore=${Math.round(args.cappedDeltaPxBefore)} cappedDeltaPxAfter=${Math.round(args.cappedDeltaPxAfter)} visualDebtPx=${Number.isFinite(args.visualDebtPx) ? Math.round(args.visualDebtPx) : -1} matchedMarkerErrorPx=${Number.isFinite(args.matchedMarkerErrorPx) ? Math.round(args.matchedMarkerErrorPx) : -1} markerY=${Number.isFinite(args.markerY) ? Math.round(args.markerY) : -1} currentLineViewportY=${Number.isFinite(args.currentLineViewportY) ? Math.round(args.currentLineViewportY) : -1} matchedLineViewportY=${Number.isFinite(args.matchedLineViewportY) ? Math.round(args.matchedLineViewportY) : -1} bottomDriftGuardRecent=${args.bottomDriftGuardRecent ? 1 : 0} visualDebtCatchupBlockedRecent=${args.visualDebtCatchupBlockedRecent ? 1 : 0} lastVisualProgressAgeMs=${Number.isFinite(args.lastVisualProgressAgeMs) ? Math.round(args.lastVisualProgressAgeMs) : -1} speakableLead=${Math.round(args.speakableLead)} renderedLead=${Math.round(args.renderedLead)} recoveryModeNearby=${args.recoveryModeNearby || 'none'} floorApplied=${args.floorApplied ? 1 : 0} rejectReason=${args.rejectReason || 'none'}`;
}

function buildAsrCommitFreshnessDiagnostic(
  tag:
    | 'ASR_STALE_TRANSCRIPT_COMMIT_SUPPRESSED'
    | 'ASR_SILENCE_COMMIT_SUPPRESSED'
    | 'ASR_PENDING_RESPONSE_INVALIDATED'
    | 'ASR_COMMIT_FRESHNESS_EVALUATED',
  args: {
    transcriptSeq: number;
    responseAgeMs: number;
    lastSpeechAgeMs: number;
    lastAudioChunkAgeMs: number;
    speechFresh: boolean;
    speechActive: boolean;
    sessionPhase: string;
    asrRunning: boolean;
    currentLineIdx: number;
    proposedLineIdx: number;
    committedLineIdx: number;
    reason: string;
  },
): string {
  return `[${tag}] transcriptSeq=${Number.isFinite(args.transcriptSeq) ? Math.round(args.transcriptSeq) : -1} responseAgeMs=${Number.isFinite(args.responseAgeMs) ? Math.round(args.responseAgeMs) : -1} lastSpeechAgeMs=${Number.isFinite(args.lastSpeechAgeMs) ? Math.round(args.lastSpeechAgeMs) : -1} lastAudioChunkAgeMs=${Number.isFinite(args.lastAudioChunkAgeMs) ? Math.round(args.lastAudioChunkAgeMs) : -1} speechFresh=${args.speechFresh ? 1 : 0} speechActive=${args.speechActive ? 1 : 0} sessionPhase=${args.sessionPhase || 'unknown'} asrRunning=${args.asrRunning ? 1 : 0} currentLineIdx=${Math.round(args.currentLineIdx)} proposedLineIdx=${Math.round(args.proposedLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} reason=${args.reason || 'unknown'}`;
}

export function buildAsrStaleTranscriptCommitSuppressedDiagnostic(args: {
  transcriptSeq: number;
  responseAgeMs: number;
  lastSpeechAgeMs: number;
  lastAudioChunkAgeMs: number;
  speechFresh: boolean;
  speechActive: boolean;
  sessionPhase: string;
  asrRunning: boolean;
  currentLineIdx: number;
  proposedLineIdx: number;
  committedLineIdx: number;
  reason: string;
}): string {
  return buildAsrCommitFreshnessDiagnostic('ASR_STALE_TRANSCRIPT_COMMIT_SUPPRESSED', args);
}

export function buildAsrSilenceCommitSuppressedDiagnostic(args: {
  transcriptSeq: number;
  responseAgeMs: number;
  lastSpeechAgeMs: number;
  lastAudioChunkAgeMs: number;
  speechFresh: boolean;
  speechActive: boolean;
  sessionPhase: string;
  asrRunning: boolean;
  currentLineIdx: number;
  proposedLineIdx: number;
  committedLineIdx: number;
  reason: string;
}): string {
  return buildAsrCommitFreshnessDiagnostic('ASR_SILENCE_COMMIT_SUPPRESSED', args);
}

export function buildAsrPendingResponseInvalidatedDiagnostic(args: {
  transcriptSeq: number;
  responseAgeMs: number;
  lastSpeechAgeMs: number;
  lastAudioChunkAgeMs: number;
  speechFresh: boolean;
  speechActive: boolean;
  sessionPhase: string;
  asrRunning: boolean;
  currentLineIdx: number;
  proposedLineIdx: number;
  committedLineIdx: number;
  reason: string;
}): string {
  return buildAsrCommitFreshnessDiagnostic('ASR_PENDING_RESPONSE_INVALIDATED', args);
}

export function buildAsrCommitFreshnessEvaluatedDiagnostic(args: {
  transcriptSeq: number;
  responseAgeMs: number;
  lastSpeechAgeMs: number;
  lastAudioChunkAgeMs: number;
  speechFresh: boolean;
  speechActive: boolean;
  sessionPhase: string;
  asrRunning: boolean;
  currentLineIdx: number;
  proposedLineIdx: number;
  committedLineIdx: number;
  reason: string;
}): string {
  return buildAsrCommitFreshnessDiagnostic('ASR_COMMIT_FRESHNESS_EVALUATED', args);
}

export function buildAsrAcceptedLocalLagReconciledDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  acceptedLineIdx: number;
  targetLineIdx: number | null;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  proposedScrollTop: number;
  actualMovedPx: number;
  lineDeltaCurrentToCommitted: number;
  lineDeltaCurrentToTarget: number;
  lineDeltaCommittedToTarget: number;
  lineDeltaCommittedToAccepted: number;
  lineDeltaToNextSpeakable: number;
  blockedReason: string;
  coherenceReason: string;
  speechFresh: boolean;
  terminalClampActive: boolean;
  correctionPx: number;
  movementAllowed: boolean;
  authoritySource: string;
}): string {
  const targetLineIdx = Number.isFinite(args.targetLineIdx as number) ? Math.round(Number(args.targetLineIdx)) : -1;
  return `[ASR_ACCEPTED_LOCAL_LAG_RECONCILED] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} acceptedLineIdx=${Math.round(args.acceptedLineIdx)} targetLineIdx=${targetLineIdx} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} proposedScrollTop=${Math.round(args.proposedScrollTop)} actualMovedPx=${Math.round(args.actualMovedPx)} lineDeltaCurrentToCommitted=${Math.round(args.lineDeltaCurrentToCommitted)} lineDeltaCurrentToTarget=${Math.round(args.lineDeltaCurrentToTarget)} lineDeltaCommittedToTarget=${Math.round(args.lineDeltaCommittedToTarget)} lineDeltaCommittedToAccepted=${Math.round(args.lineDeltaCommittedToAccepted)} lineDeltaToNextSpeakable=${Math.round(args.lineDeltaToNextSpeakable)} blockedReason=${args.blockedReason || 'none'} coherenceReason=${args.coherenceReason || 'none'} speechFresh=${args.speechFresh ? 1 : 0} terminalClampActive=${args.terminalClampActive ? 1 : 0} correctionPx=${Math.round(args.correctionPx)} movementAllowed=${args.movementAllowed ? 1 : 0} authoritySource=${args.authoritySource || 'unknown'}`;
}

export function buildAsrAcceptedLocalLagBlockedDiagnostic(args: {
  currentLineIdx: number;
  committedLineIdx: number;
  acceptedLineIdx: number;
  targetLineIdx: number | null;
  nextSpeakableLineIdx: number;
  currentScrollTop: number;
  targetScrollTop: number;
  proposedScrollTop: number;
  actualMovedPx: number;
  lineDeltaCurrentToCommitted: number;
  lineDeltaCurrentToTarget: number;
  lineDeltaCommittedToTarget: number;
  lineDeltaCommittedToAccepted: number;
  lineDeltaToNextSpeakable: number;
  blockedReason: string;
  coherenceReason: string;
  speechFresh: boolean;
  terminalClampActive: boolean;
  correctionPx: number;
  movementAllowed: boolean;
  authoritySource: string;
}): string {
  const targetLineIdx = Number.isFinite(args.targetLineIdx as number) ? Math.round(Number(args.targetLineIdx)) : -1;
  return `[ASR_ACCEPTED_LOCAL_LAG_BLOCKED] currentLineIdx=${Math.round(args.currentLineIdx)} committedLineIdx=${Math.round(args.committedLineIdx)} acceptedLineIdx=${Math.round(args.acceptedLineIdx)} targetLineIdx=${targetLineIdx} nextSpeakableLineIdx=${Math.round(args.nextSpeakableLineIdx)} currentScrollTop=${Math.round(args.currentScrollTop)} targetScrollTop=${Math.round(args.targetScrollTop)} proposedScrollTop=${Math.round(args.proposedScrollTop)} actualMovedPx=${Math.round(args.actualMovedPx)} lineDeltaCurrentToCommitted=${Math.round(args.lineDeltaCurrentToCommitted)} lineDeltaCurrentToTarget=${Math.round(args.lineDeltaCurrentToTarget)} lineDeltaCommittedToTarget=${Math.round(args.lineDeltaCommittedToTarget)} lineDeltaCommittedToAccepted=${Math.round(args.lineDeltaCommittedToAccepted)} lineDeltaToNextSpeakable=${Math.round(args.lineDeltaToNextSpeakable)} blockedReason=${args.blockedReason || 'none'} coherenceReason=${args.coherenceReason || 'none'} speechFresh=${args.speechFresh ? 1 : 0} terminalClampActive=${args.terminalClampActive ? 1 : 0} correctionPx=${Math.round(args.correctionPx)} movementAllowed=${args.movementAllowed ? 1 : 0} authoritySource=${args.authoritySource || 'unknown'}`;
}

export function buildAsrReaderZoneSummaryDiagnostic(args: {
  bucketStartLineIdx: number;
  bucketEndLineIdx: number;
  timeInPocketMs: number;
  timeBelowPocketMs: number;
  maxBelowPocketPx: number;
  readerWaitTimeMs: number;
  negativeErrorZeroVelocityMs: number;
  visualCorrectionCount: number;
  blockedCorrectionCount: number;
  recoveryCount: number;
  terminalClampCount: number;
  dominantBlockedReason: string;
  dominantAuthoritySource: string;
}): string {
  return `[ASR_READER_ZONE_SUMMARY] bucketStartLineIdx=${Math.round(args.bucketStartLineIdx)} bucketEndLineIdx=${Math.round(args.bucketEndLineIdx)} timeInPocketMs=${Math.round(args.timeInPocketMs)} timeBelowPocketMs=${Math.round(args.timeBelowPocketMs)} maxBelowPocketPx=${Math.round(args.maxBelowPocketPx)} readerWaitTimeMs=${Math.round(args.readerWaitTimeMs)} negativeErrorZeroVelocityMs=${Math.round(args.negativeErrorZeroVelocityMs)} visualCorrectionCount=${Math.round(args.visualCorrectionCount)} blockedCorrectionCount=${Math.round(args.blockedCorrectionCount)} recoveryCount=${Math.round(args.recoveryCount)} terminalClampCount=${Math.round(args.terminalClampCount)} dominantBlockedReason=${args.dominantBlockedReason || 'none'} dominantAuthoritySource=${args.dominantAuthoritySource || 'none'}`;
}
