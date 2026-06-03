export type AsrTraceAnalyzerFinalEvent = {
  order: number;
  ts: string | null;
  matchBestIdx: number;
  matchBestSim: number;
  textLen: number;
  noMatch: boolean;
  matchReason: string;
};

export type AsrTraceAnalyzerComparisonStep = {
  order: number;
  ts: string | null;
  rawMatchBestIdx: number;
  previousStableCursorIdx: number;
  stableCursorIdx: number;
  action: 'hold' | 'advance_adjacent' | 'evidence_only' | 'reset_needed';
  confidence: number;
  reason: string;
  proposedAdjacentCommitTarget: number | null;
  proposedTargetIsBoundedPlusOne: boolean;
  rawMatchWasFarJump: boolean;
  heldDueToNoMatchOrQuietOrStale: boolean;
};

export type AsrTraceAnalyzerComparisonSummary = {
  steps: AsrTraceAnalyzerComparisonStep[];
  counts: {
    advance_adjacent: number;
    hold: number;
    evidence_only: number;
    reset_needed: number;
  };
  highestStableCursorIdx: number;
  monotonic: boolean;
  anyAdvanceOverOne: boolean;
  maxAdvance: number;
  proposedAdjacentCommitCount: number;
  proposedAdjacentCommitSequence: number[];
  everyProposedCommitMonotonicAndBounded: boolean;
};

export type AsrTraceAnalyzerComparisonDeps = {
  createInitialAsrEvidenceStabilizerState: (stableCursorIdx?: number) => {
    stableCursorIdx: number;
  };
  stepAsrEvidenceStabilizer: (
    state: any,
    input: {
      timestampMs: number;
      matchBestIdx: number;
      matchBestSim: number;
      textLen: number;
      noMatch: boolean;
      matchReason: string;
      currentCommittedLine: number;
      speechLive: boolean;
      transcriptFresh: boolean;
    },
  ) => {
    state: { stableCursorIdx: number };
    output: {
      stableCursorIdx: number;
      action: 'hold' | 'advance_adjacent' | 'evidence_only' | 'reset_needed';
      confidence: number;
      reason: string;
    };
  };
};

export function compareAsrTraceFinalsWithStabilizer(
  finals: AsrTraceAnalyzerFinalEvent[],
  deps: AsrTraceAnalyzerComparisonDeps,
): AsrTraceAnalyzerComparisonSummary {
  let state = deps.createInitialAsrEvidenceStabilizerState(0);
  const steps = finals.map((finalItem) => {
    const previousStableCursorIdx = state.stableCursorIdx;
    const result = deps.stepAsrEvidenceStabilizer(state, {
      timestampMs: finalItem.ts ? Date.parse(finalItem.ts) : finalItem.order * 1000,
      matchBestIdx: finalItem.matchBestIdx,
      matchBestSim: finalItem.matchBestSim,
      textLen: finalItem.textLen,
      noMatch: finalItem.noMatch,
      matchReason: finalItem.matchReason,
      currentCommittedLine: state.stableCursorIdx,
      speechLive: true,
      transcriptFresh: true,
    });
    state = result.state;
    const proposedAdjacentCommitTarget =
      result.output.action === 'advance_adjacent' ? result.output.stableCursorIdx : null;
    return {
      order: finalItem.order,
      ts: finalItem.ts,
      rawMatchBestIdx: finalItem.matchBestIdx,
      previousStableCursorIdx,
      stableCursorIdx: result.output.stableCursorIdx,
      action: result.output.action,
      confidence: result.output.confidence,
      reason: result.output.reason,
      proposedAdjacentCommitTarget,
      proposedTargetIsBoundedPlusOne:
        proposedAdjacentCommitTarget != null
          ? proposedAdjacentCommitTarget === previousStableCursorIdx + 1
          : true,
      rawMatchWasFarJump: finalItem.matchBestIdx >= previousStableCursorIdx + 3,
      heldDueToNoMatchOrQuietOrStale:
        result.output.action === 'hold' &&
        (
          result.output.reason === 'no_match_or_offscript' ||
          result.output.reason === 'quiet_or_stale_state'
        ),
    };
  });

  const counts = {
    advance_adjacent: steps.filter((item) => item.action === 'advance_adjacent').length,
    hold: steps.filter((item) => item.action === 'hold').length,
    evidence_only: steps.filter((item) => item.action === 'evidence_only').length,
    reset_needed: steps.filter((item) => item.action === 'reset_needed').length,
  };
  const highestStableCursorIdx = steps.reduce((max, item) => Math.max(max, item.stableCursorIdx), -1);
  const monotonic = steps.every((item, index) => index === 0 || item.stableCursorIdx >= steps[index - 1].stableCursorIdx);
  const maxAdvance = steps.reduce((max, item, index) => {
    if (index === 0) return Math.max(max, item.stableCursorIdx - item.previousStableCursorIdx);
    return Math.max(max, item.stableCursorIdx - steps[index - 1].stableCursorIdx);
  }, 0);
  const proposedAdjacentCommitSequence = steps
    .map((item) => item.proposedAdjacentCommitTarget)
    .filter((item): item is number => item != null);
  const everyProposedCommitMonotonicAndBounded = steps.every((item, index) => {
    if (item.proposedAdjacentCommitTarget == null) return true;
    const priorProposedTargets = steps
      .slice(0, index)
      .map((step) => step.proposedAdjacentCommitTarget)
      .filter((target): target is number => target != null);
    const previousProposed =
      index > 0
        ? priorProposedTargets[priorProposedTargets.length - 1] ?? item.previousStableCursorIdx
        : item.previousStableCursorIdx;
    return (
      item.proposedTargetIsBoundedPlusOne &&
      item.proposedAdjacentCommitTarget >= previousProposed &&
      item.proposedAdjacentCommitTarget === item.previousStableCursorIdx + 1
    );
  });

  return {
    steps,
    counts,
    highestStableCursorIdx,
    monotonic,
    anyAdvanceOverOne: maxAdvance > 1,
    maxAdvance,
    proposedAdjacentCommitCount: proposedAdjacentCommitSequence.length,
    proposedAdjacentCommitSequence,
    everyProposedCommitMonotonicAndBounded,
  };
}
