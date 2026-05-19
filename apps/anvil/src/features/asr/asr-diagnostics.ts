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
