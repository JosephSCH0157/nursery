import {
  createInitialAsrEvidenceStabilizerState,
  stepAsrEvidenceStabilizer,
} from '../../src/features/asr/asr-evidence-stabilizer';
import { compareAsrTraceFinalsWithStabilizer } from '../../src/features/asr/asr-trace-analyzer-comparison';

describe('ASR trace analyzer comparison mode', () => {
  test('feeds parsed finals through the evidence stabilizer without runtime wiring', () => {
    const summary = compareAsrTraceFinalsWithStabilizer(
      [
        {
          order: 1,
          ts: '2026-06-01T00:00:01.000Z',
          matchBestIdx: 1,
          matchBestSim: 0.8,
          textLen: 35,
          noMatch: false,
          matchReason: 'direct_matcher',
        },
        {
          order: 2,
          ts: '2026-06-01T00:00:02.000Z',
          matchBestIdx: 6,
          matchBestSim: 0.91,
          textLen: 260,
          noMatch: false,
          matchReason: 'direct_matcher',
        },
      ],
      {
        createInitialAsrEvidenceStabilizerState,
        stepAsrEvidenceStabilizer,
      },
    );
    expect(summary).toMatchObject({
      highestStableCursorIdx: 1,
      monotonic: true,
      anyAdvanceOverOne: false,
      counts: {
        advance_adjacent: 1,
        hold: 0,
        evidence_only: 1,
        reset_needed: 0,
      },
    });
    expect(summary.steps.map((item) => item.stableCursorIdx)).toEqual([1, 1]);
    expect(summary.steps.map((item) => item.action)).toEqual([
      'advance_adjacent',
      'evidence_only',
    ]);
    expect(summary.proposedAdjacentCommitSequence).toEqual([1]);
    expect(summary.everyProposedCommitMonotonicAndBounded).toBe(true);
    expect(summary.steps[0]).toMatchObject({
      previousStableCursorIdx: 0,
      proposedAdjacentCommitTarget: 1,
      proposedTargetIsBoundedPlusOne: true,
      rawMatchWasFarJump: false,
      heldDueToNoMatchOrQuietOrStale: false,
    });
  });

  test('dry-run comparison emits a bounded adjacent commit sequence for a noisy 6-1-4-style stream', () => {
    const summary = compareAsrTraceFinalsWithStabilizer(
      [
        { order: 1, ts: '2026-06-01T00:00:01.000Z', matchBestIdx: 1, matchBestSim: 0.69, textLen: 35, noMatch: false, matchReason: 'direct_matcher' },
        { order: 2, ts: '2026-06-01T00:00:02.000Z', matchBestIdx: 6, matchBestSim: 0.88, textLen: 263, noMatch: false, matchReason: 'direct_matcher' },
        { order: 3, ts: '2026-06-01T00:00:03.000Z', matchBestIdx: 3, matchBestSim: 0.66, textLen: 318, noMatch: false, matchReason: 'direct_matcher' },
        { order: 4, ts: '2026-06-01T00:00:04.000Z', matchBestIdx: 1, matchBestSim: 0.65, textLen: 305, noMatch: false, matchReason: 'direct_matcher' },
        { order: 5, ts: '2026-06-01T00:00:05.000Z', matchBestIdx: 4, matchBestSim: 0.84, textLen: 295, noMatch: false, matchReason: 'direct_matcher' },
        { order: 6, ts: '2026-06-01T00:00:06.000Z', matchBestIdx: 9, matchBestSim: 0.88, textLen: 330, noMatch: false, matchReason: 'direct_matcher' },
        { order: 7, ts: '2026-06-01T00:00:07.000Z', matchBestIdx: 9, matchBestSim: 0.88, textLen: 330, noMatch: false, matchReason: 'direct_matcher' },
        { order: 8, ts: '2026-06-01T00:00:08.000Z', matchBestIdx: 9, matchBestSim: 0.88, textLen: 353, noMatch: false, matchReason: 'direct_matcher' },
      ],
      {
        createInitialAsrEvidenceStabilizerState,
        stepAsrEvidenceStabilizer,
      },
    );
    expect(summary.proposedAdjacentCommitSequence).toEqual([1, 2, 3]);
    expect(summary.proposedAdjacentCommitCount).toBe(3);
    expect(summary.everyProposedCommitMonotonicAndBounded).toBe(true);
    expect(summary.anyAdvanceOverOne).toBe(false);
    expect(summary.steps.every((item, index) => {
      if (item.proposedAdjacentCommitTarget == null) return true;
      return item.proposedAdjacentCommitTarget === item.previousStableCursorIdx + 1;
    })).toBe(true);
  });

  test('every advance_adjacent step remains exactly +1 bounded in comparison mode', () => {
    const summary = compareAsrTraceFinalsWithStabilizer(
      [
        { order: 1, ts: '2026-06-01T00:00:01.000Z', matchBestIdx: 1, matchBestSim: 0.91, textLen: 180, noMatch: false, matchReason: 'direct_matcher' },
        { order: 2, ts: '2026-06-01T00:00:02.000Z', matchBestIdx: 7, matchBestSim: 0.91, textLen: 240, noMatch: false, matchReason: 'direct_matcher' },
        { order: 3, ts: '2026-06-01T00:00:03.000Z', matchBestIdx: 7, matchBestSim: 0.91, textLen: 240, noMatch: false, matchReason: 'direct_matcher' },
        { order: 4, ts: '2026-06-01T00:00:04.000Z', matchBestIdx: 7, matchBestSim: 0.91, textLen: 240, noMatch: false, matchReason: 'direct_matcher' },
        { order: 5, ts: '2026-06-01T00:00:05.000Z', matchBestIdx: 12, matchBestSim: 0.93, textLen: 260, noMatch: false, matchReason: 'direct_matcher' },
        { order: 6, ts: '2026-06-01T00:00:06.000Z', matchBestIdx: 12, matchBestSim: 0.93, textLen: 260, noMatch: false, matchReason: 'direct_matcher' },
        { order: 7, ts: '2026-06-01T00:00:07.000Z', matchBestIdx: 12, matchBestSim: 0.93, textLen: 260, noMatch: false, matchReason: 'direct_matcher' },
      ],
      {
        createInitialAsrEvidenceStabilizerState,
        stepAsrEvidenceStabilizer,
      },
    );
    const adjacentSteps = summary.steps.filter((item) => item.action === 'advance_adjacent');
    expect(adjacentSteps.length).toBeGreaterThan(0);
    expect(adjacentSteps.every((item) =>
      item.stableCursorIdx - item.previousStableCursorIdx === 1 &&
      item.proposedAdjacentCommitTarget === item.stableCursorIdx &&
      item.proposedTargetIsBoundedPlusOne === true,
    )).toBe(true);
  });
});
