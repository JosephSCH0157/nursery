export type BackendRestartRequestedPayloadInput = {
  reason: string;
  transcriptAgeMs: number;
  audioAgeMs: number;
  current: number;
  backendRestartedInWindow: boolean;
  hasRecognizerControls: boolean;
  restartWindowMs: number;
};

export type BackendHeartbeatDiagnosticInput = {
  transcriptAgeMs: number | null;
  audioAgeMs: number | null;
  recognizerAttached: boolean;
  speechActive: boolean;
  activeReadMode: boolean;
  backendRestartedInWindow: boolean;
};

export type BackendHeartbeatDiagnosticPayloadInput = {
  transcriptAgeMs: number;
  audioAgeMs: number;
  recognizerAttached: boolean;
  speechActive: boolean;
  activeReadMode: boolean;
  backendRestartedInWindow: boolean;
};

export type BackendRestartRequestedPayload =
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
    };

export function buildBackendRestartRequestedPayloadInput(
  input: BackendRestartRequestedPayloadInput,
): BackendRestartRequestedPayload {
  if (input.backendRestartedInWindow) {
    return {
      skipped: 1,
      reason: input.reason,
      skipReason: 'already_restarted_in_window',
      windowMs: input.restartWindowMs,
      transcriptAgeMs: input.transcriptAgeMs,
      audioAgeMs: input.audioAgeMs,
    };
  }
  if (!input.hasRecognizerControls) {
    return {
      skipped: 1,
      reason: input.reason,
      skipReason: 'recognizer_controls_unavailable',
      transcriptAgeMs: input.transcriptAgeMs,
      audioAgeMs: input.audioAgeMs,
    };
  }
  return {
    skipped: 0,
    reason: input.reason,
    transcriptAgeMs: input.transcriptAgeMs,
    audioAgeMs: input.audioAgeMs,
    current: input.current,
  };
}

export function buildBackendHeartbeatDiagnosticInput(
  input: BackendHeartbeatDiagnosticInput,
): BackendHeartbeatDiagnosticPayloadInput {
  const transcriptHeartbeatAge = Number.isFinite(input.transcriptAgeMs as number)
    ? Number(input.transcriptAgeMs)
    : Number.NaN;
  const audioHeartbeatAge = Number.isFinite(input.audioAgeMs as number)
    ? Number(input.audioAgeMs)
    : Number.NaN;
  return {
    recognizerAttached: input.recognizerAttached,
    speechActive: input.speechActive,
    activeReadMode: input.activeReadMode,
    transcriptAgeMs: transcriptHeartbeatAge,
    audioAgeMs: audioHeartbeatAge,
    backendRestartedInWindow: input.backendRestartedInWindow,
  };
}
