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
