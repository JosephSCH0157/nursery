import {
  createInitialAsrEvidenceStabilizerState,
  stepAsrEvidenceStabilizer,
  type AsrEvidenceStabilizerAction,
  type AsrEvidenceStabilizerInput,
} from '../../src/features/asr/asr-evidence-stabilizer';

function runSequence(
  values: Array<Partial<AsrEvidenceStabilizerInput> & Pick<AsrEvidenceStabilizerInput, 'matchBestIdx'>>,
  initialStableCursorIdx = 0,
) {
  let state = createInitialAsrEvidenceStabilizerState(initialStableCursorIdx);
  return values.map((item, index) => {
    const result = stepAsrEvidenceStabilizer(state, {
      timestampMs: item.timestampMs ?? 1000 + index * 100,
      matchBestIdx: item.matchBestIdx,
      matchBestSim: item.matchBestSim ?? 0.9,
      textLen: item.textLen ?? 180,
      noMatch: item.noMatch ?? false,
      matchReason: item.matchReason ?? 'direct_matcher',
      currentCommittedLine: item.currentCommittedLine ?? state.stableCursorIdx,
      speechLive: item.speechLive ?? true,
      transcriptFresh: item.transcriptFresh ?? true,
    });
    state = result.state;
    return result.output;
  });
}

function actionsOf(outputs: Array<{ action: AsrEvidenceStabilizerAction }>) {
  return outputs.map((item) => item.action);
}

function cursorsOf(outputs: Array<{ stableCursorIdx: number }>) {
  return outputs.map((item) => item.stableCursorIdx);
}

describe('ASR evidence stabilizer', () => {
  test('early noisy far-jump sequence only accepts the first adjacent step', () => {
    const outputs = runSequence([
      { matchBestIdx: 1, matchBestSim: 0.693, textLen: 35 },
      { matchBestIdx: 6, matchBestSim: 0.885, textLen: 263 },
      { matchBestIdx: 3, matchBestSim: 0.658, textLen: 318 },
      { matchBestIdx: 1, matchBestSim: 0.653, textLen: 305 },
      { matchBestIdx: 4, matchBestSim: 0.846, textLen: 295 },
      { matchBestIdx: 9, matchBestSim: 0.883, textLen: 330 },
    ]);
    expect(actionsOf(outputs)).toEqual([
      'advance_adjacent',
      'evidence_only',
      'evidence_only',
      'hold',
      'evidence_only',
      'evidence_only',
    ]);
    expect(cursorsOf(outputs)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test('same-line stall zone collapses repeated line 9 finals', () => {
    const outputs = runSequence([
      { matchBestIdx: 9, currentCommittedLine: 9 },
      { matchBestIdx: 9, currentCommittedLine: 9 },
      { matchBestIdx: 9, currentCommittedLine: 9 },
      { matchBestIdx: 9, currentCommittedLine: 9 },
      { matchBestIdx: 9, currentCommittedLine: 9 },
    ], 9);
    expect(actionsOf(outputs)).toEqual(['hold', 'hold', 'hold', 'hold', 'hold']);
    expect(cursorsOf(outputs)).toEqual([9, 9, 9, 9, 9]);
    expect(outputs.every((item) => item.reason === 'repeat_same_line_collapsed')).toBe(true);
  });

  test('same-line stall after one adjacent advance only moves once at line 23', () => {
    const outputs = runSequence([
      { matchBestIdx: 23, currentCommittedLine: 22, matchBestSim: 0.909, textLen: 332 },
      { matchBestIdx: 23, currentCommittedLine: 23, matchBestSim: 0.909, textLen: 334 },
      { matchBestIdx: 23, currentCommittedLine: 23, matchBestSim: 0.901, textLen: 336 },
      { matchBestIdx: 23, currentCommittedLine: 23, matchBestSim: 0.902, textLen: 335 },
    ], 22);
    expect(actionsOf(outputs)).toEqual(['advance_adjacent', 'hold', 'hold', 'hold']);
    expect(cursorsOf(outputs)).toEqual([23, 23, 23, 23]);
  });

  test('backward jump after forward progress is treated as noise and cursor stays monotonic', () => {
    const outputs = runSequence([
      { matchBestIdx: 1, currentCommittedLine: 0, matchBestSim: 0.8 },
      { matchBestIdx: 2, currentCommittedLine: 1, matchBestSim: 0.81 },
      { matchBestIdx: 1, currentCommittedLine: 2, matchBestSim: 0.92 },
    ]);
    expect(actionsOf(outputs)).toEqual(['advance_adjacent', 'advance_adjacent', 'evidence_only']);
    expect(cursorsOf(outputs)).toEqual([1, 2, 2]);
    expect(outputs[2]?.reason).toBe('backward_jump_ignored');
  });

  test('far jump greater than or equal to three lines remains evidence only', () => {
    const outputs = runSequence([{ matchBestIdx: 9, currentCommittedLine: 5, matchBestSim: 0.97 }], 5);
    expect(outputs[0]).toMatchObject({
      stableCursorIdx: 5,
      action: 'evidence_only',
      reason: 'far_jump_buffered_as_evidence',
    });
  });

  test('noMatch and quiet or stale inputs hold the cursor', () => {
    const outputs = runSequence([
      { matchBestIdx: 7, currentCommittedLine: 7, noMatch: true, matchBestSim: 0.4 },
      { matchBestIdx: 8, currentCommittedLine: 7, speechLive: false, matchBestSim: 0.95 },
      { matchBestIdx: 8, currentCommittedLine: 7, transcriptFresh: false, matchBestSim: 0.95 },
    ], 7);
    expect(actionsOf(outputs)).toEqual(['hold', 'hold', 'hold']);
    expect(cursorsOf(outputs)).toEqual([7, 7, 7]);
    expect(outputs.map((item) => item.reason)).toEqual([
      'no_match_or_offscript',
      'quiet_or_stale_state',
      'quiet_or_stale_state',
    ]);
  });

  test('repeated locally plausible backward evidence can request reset without moving cursor backward', () => {
    const outputs = runSequence([
      { matchBestIdx: 4, currentCommittedLine: 2, matchBestSim: 0.88, textLen: 160 },
      { matchBestIdx: 4, currentCommittedLine: 2, matchBestSim: 0.9, textLen: 160 },
      { matchBestIdx: 4, currentCommittedLine: 2, matchBestSim: 0.91, textLen: 160 },
    ], 5);
    expect(actionsOf(outputs)).toEqual(['evidence_only', 'evidence_only', 'reset_needed']);
    expect(cursorsOf(outputs)).toEqual([5, 5, 5]);
    expect(outputs[2]?.reason).toBe('repeated_local_backward_contradiction');
  });
});
