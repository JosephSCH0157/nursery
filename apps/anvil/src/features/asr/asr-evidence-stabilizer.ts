export type AsrEvidenceStabilizerAction =
  | 'hold'
  | 'advance_adjacent'
  | 'evidence_only'
  | 'reset_needed';

export type AsrEvidenceStabilizerInput = {
  timestampMs: number;
  matchBestIdx: number | null;
  matchBestSim: number;
  textLen: number;
  noMatch: boolean;
  matchReason: string;
  currentCommittedLine: number;
  speechLive?: boolean;
  transcriptFresh?: boolean;
};

export type AsrEvidenceStabilizerOutput = {
  stableCursorIdx: number;
  confidence: number;
  action: AsrEvidenceStabilizerAction;
  reason: string;
};

export type AsrEvidenceStabilizerState = {
  stableCursorIdx: number;
  lastRawIdx: number | null;
  sameLineRepeatCount: number;
  farEvidenceIdx: number | null;
  farEvidenceCount: number;
  farEvidenceBestSim: number;
  backwardRepeatCount: number;
  lastAction: AsrEvidenceStabilizerAction;
  lastTimestampMs: number | null;
};

const DEFAULTS = {
  adjacentMinSim: 0.6,
  shortAdjacentMinSim: 0.68,
  farEvidenceMinSim: 0.82,
  resetBackwardRepeatThreshold: 3,
  resetBackwardGapThreshold: 2,
  shortTextLen: 48,
  farJumpThreshold: 3,
} as const;

export function createInitialAsrEvidenceStabilizerState(
  stableCursorIdx = 0,
): AsrEvidenceStabilizerState {
  return {
    stableCursorIdx: Math.max(0, Math.floor(Number(stableCursorIdx) || 0)),
    lastRawIdx: null,
    sameLineRepeatCount: 0,
    farEvidenceIdx: null,
    farEvidenceCount: 0,
    farEvidenceBestSim: 0,
    backwardRepeatCount: 0,
    lastAction: 'hold',
    lastTimestampMs: null,
  };
}

function clampIndex(value: number | null | undefined, fallback = 0): number {
  return Number.isFinite(value as number) ? Math.max(0, Math.floor(Number(value))) : fallback;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function buildOutput(
  state: AsrEvidenceStabilizerState,
  action: AsrEvidenceStabilizerAction,
  confidence: number,
  reason: string,
): { state: AsrEvidenceStabilizerState; output: AsrEvidenceStabilizerOutput } {
  return {
    state: { ...state, lastAction: action },
    output: {
      stableCursorIdx: state.stableCursorIdx,
      confidence: clampConfidence(confidence),
      action,
      reason,
    },
  };
}

function resetFarEvidence(state: AsrEvidenceStabilizerState): AsrEvidenceStabilizerState {
  return {
    ...state,
    farEvidenceIdx: null,
    farEvidenceCount: 0,
    farEvidenceBestSim: 0,
  };
}

export function stepAsrEvidenceStabilizer(
  previous: AsrEvidenceStabilizerState,
  input: AsrEvidenceStabilizerInput,
): { state: AsrEvidenceStabilizerState; output: AsrEvidenceStabilizerOutput } {
  const committedLine = clampIndex(input.currentCommittedLine, previous.stableCursorIdx);
  let state: AsrEvidenceStabilizerState = {
    ...previous,
    stableCursorIdx: Math.max(previous.stableCursorIdx, committedLine),
    lastTimestampMs: Number.isFinite(input.timestampMs) ? input.timestampMs : previous.lastTimestampMs,
  };

  if (input.speechLive === false || input.transcriptFresh === false) {
    state = resetFarEvidence({ ...state, backwardRepeatCount: 0 });
    return buildOutput(state, 'hold', 0.25, 'quiet_or_stale_state');
  }

  if (input.noMatch) {
    state = resetFarEvidence({ ...state, backwardRepeatCount: 0, sameLineRepeatCount: 0 });
    return buildOutput(state, 'hold', 0.1, 'no_match_or_offscript');
  }

  const rawIdx = clampIndex(input.matchBestIdx, -1);
  if (rawIdx < 0) {
    state = resetFarEvidence({ ...state, backwardRepeatCount: 0, sameLineRepeatCount: 0 });
    return buildOutput(state, 'hold', 0.05, 'missing_match_idx');
  }

  const delta = rawIdx - state.stableCursorIdx;
  const isSameAsLastRaw = previous.lastRawIdx === rawIdx;
  const adjacentMinSim =
    input.textLen > 0 && input.textLen < DEFAULTS.shortTextLen
      ? DEFAULTS.shortAdjacentMinSim
      : DEFAULTS.adjacentMinSim;

  if (delta === 0) {
    state = resetFarEvidence({
      ...state,
      lastRawIdx: rawIdx,
      sameLineRepeatCount: isSameAsLastRaw ? previous.sameLineRepeatCount + 1 : 1,
      backwardRepeatCount: 0,
    });
    return buildOutput(state, 'hold', Math.max(0.4, input.matchBestSim), 'repeat_same_line_collapsed');
  }

  if (delta === 1) {
    if (!Number.isFinite(input.matchBestSim) || input.matchBestSim < adjacentMinSim) {
      state = resetFarEvidence({
        ...state,
        lastRawIdx: rawIdx,
        sameLineRepeatCount: 0,
        backwardRepeatCount: 0,
      });
      return buildOutput(state, 'evidence_only', Math.max(0.2, input.matchBestSim), 'adjacent_but_weak');
    }
    state = resetFarEvidence({
      ...state,
      stableCursorIdx: rawIdx,
      lastRawIdx: rawIdx,
      sameLineRepeatCount: 0,
      backwardRepeatCount: 0,
    });
    return buildOutput(state, 'advance_adjacent', input.matchBestSim, 'adjacent_forward_evidence');
  }

  if (delta >= 2) {
    const sameFarTarget = previous.farEvidenceIdx === rawIdx;
    state = {
      ...state,
      lastRawIdx: rawIdx,
      sameLineRepeatCount: 0,
      backwardRepeatCount: 0,
      farEvidenceIdx: rawIdx,
      farEvidenceCount: sameFarTarget ? previous.farEvidenceCount + 1 : 1,
      farEvidenceBestSim: sameFarTarget
        ? Math.max(previous.farEvidenceBestSim, input.matchBestSim)
        : input.matchBestSim,
    };
    const farReason =
      delta >= DEFAULTS.farJumpThreshold
        ? 'far_jump_buffered_as_evidence'
        : 'ahead_of_cursor_buffered_as_evidence';
    const farConfidence =
      Number.isFinite(input.matchBestSim) && input.matchBestSim >= DEFAULTS.farEvidenceMinSim
        ? input.matchBestSim
        : Math.max(0.25, input.matchBestSim);
    return buildOutput(state, 'evidence_only', farConfidence, farReason);
  }

  const backwardGap = Math.abs(delta);
  const locallyPlausible = backwardGap <= 1 && input.matchReason !== 'off_script';
  state = resetFarEvidence({
    ...state,
    lastRawIdx: rawIdx,
    sameLineRepeatCount: 0,
    backwardRepeatCount: locallyPlausible && isSameAsLastRaw ? previous.backwardRepeatCount + 1 : 1,
  });
  if (
    locallyPlausible &&
    state.backwardRepeatCount >= DEFAULTS.resetBackwardRepeatThreshold &&
    state.stableCursorIdx - committedLine >= DEFAULTS.resetBackwardGapThreshold
  ) {
    return buildOutput(state, 'reset_needed', Math.max(0.45, input.matchBestSim), 'repeated_local_backward_contradiction');
  }
  return buildOutput(state, 'evidence_only', Math.max(0.15, input.matchBestSim), 'backward_jump_ignored');
}
