export type BackendLivenessThresholds = {
  heartbeatMs: number;
  transcriptStaleMs: number;
  audioChunkStaleMs: number;
  restartWindowMs: number;
  firstTranscriptGraceMs: number;
};

export type BackendLivenessInput = {
  now: number;
  liveAsr: boolean;
  asrArmed: boolean;
  recognizerAttached: boolean;
  recognizerAttachedAt: number | null;
  speechActive: boolean;
  activeReadMode: boolean;
  lastTranscriptPacketAt: number | null;
  lastAudioChunkAt: number | null;
  lastBackendHeartbeatAt: number | null;
  lastBackendTranscriptStaleAt: number | null;
  lastBackendAudioStaleAt: number | null;
  backendRestartWindowStartedAt: number | null;
  backendRestartedInWindow: boolean;
  thresholds: BackendLivenessThresholds;
};

export type BackendLivenessDecision = {
  shouldCheck: boolean;
  transcriptAgeMs: number | null;
  audioAgeMs: number | null;
  recognizerAgeMs: number | null;
  firstTranscriptGraceActive: boolean;
  shouldEmitHeartbeat: boolean;
  shouldEmitAudioStale: boolean;
  shouldEmitTranscriptStale: boolean;
  shouldRequestRestart: boolean;
  restartSkipReason?: string;
};

export function evaluateBackendLiveness(input: BackendLivenessInput): BackendLivenessDecision {
  const isSessionActive =
    input.liveAsr &&
    input.asrArmed &&
    input.recognizerAttached &&
    (input.speechActive || input.activeReadMode);
  if (!isSessionActive) {
    return {
      shouldCheck: false,
      transcriptAgeMs: null,
      audioAgeMs: null,
      recognizerAgeMs: null,
      firstTranscriptGraceActive: false,
      shouldEmitHeartbeat: false,
      shouldEmitAudioStale: false,
      shouldEmitTranscriptStale: false,
      shouldRequestRestart: false,
    };
  }

  const transcriptAgeMs =
    input.lastTranscriptPacketAt != null
      ? Math.max(0, input.now - input.lastTranscriptPacketAt)
      : null;
  const audioAgeMs =
    input.lastAudioChunkAt != null
      ? Math.max(0, input.now - input.lastAudioChunkAt)
      : null;
  const recognizerAgeMs =
    input.recognizerAttachedAt != null
      ? Math.max(0, input.now - input.recognizerAttachedAt)
      : null;

  const firstTranscriptGraceActive =
    transcriptAgeMs == null &&
    recognizerAgeMs != null &&
    recognizerAgeMs < input.thresholds.firstTranscriptGraceMs;

  const shouldEmitAudioStale =
    audioAgeMs != null &&
    audioAgeMs >= input.thresholds.audioChunkStaleMs;

  const transcriptStaleEligible =
    input.liveAsr &&
    input.asrArmed &&
    input.recognizerAttached &&
    (input.speechActive || input.activeReadMode) &&
    !firstTranscriptGraceActive;

  const shouldEmitTranscriptStale =
    transcriptStaleEligible &&
    (
      transcriptAgeMs == null ||
      transcriptAgeMs >= input.thresholds.transcriptStaleMs
    );

  const shouldRequestRestart =
    shouldEmitTranscriptStale &&
    !input.backendRestartedInWindow;

  const restartSkipReason =
    shouldEmitTranscriptStale && input.backendRestartedInWindow
      ? 'already_restarted_in_window'
      : undefined;

  return {
    shouldCheck: true,
    transcriptAgeMs,
    audioAgeMs,
    recognizerAgeMs,
    firstTranscriptGraceActive,
    shouldEmitHeartbeat: true,
    shouldEmitAudioStale,
    shouldEmitTranscriptStale,
    shouldRequestRestart,
    restartSkipReason,
  };
}
