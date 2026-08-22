import type {
  AnvilPerformanceProjectionV1,
  PerformanceBreak,
} from './performance-projection';

export const PERFORMANCE_PROJECTION_EVALUATION_SCHEMA = 'anvil.performance-projection-evaluation.v1' as const;

export type PerformanceUnitDistribution = {
  count: number;
  minimum: number;
  maximum: number;
  mean: number;
  median: number;
  values: number[];
};

export type PerformanceProjectionEvaluationV1 = {
  schema: typeof PERFORMANCE_PROJECTION_EVALUATION_SCHEMA;
  projectionId: string;
  sourceScriptHash: string;
  spokenWordCount: number;
  control: {
    unit: 'authored_spoken_line';
    unitCount: number;
    transitionCount: number;
    wordsPerUnit: PerformanceUnitDistribution;
  };
  projection: {
    unit: 'performance_block';
    blockCount: number;
    transitionCount: number;
    wordsPerBlock: PerformanceUnitDistribution;
  };
  transitionReduction: {
    count: number;
    percentage: number;
  };
  breaks: {
    projectedBlockEntries: Record<PerformanceBreak, number>;
    deliberatePacingRangeCount: number;
    speakerTransitionRangeCount: number;
    noteDirectionRangeCount: number;
  };
  preservation: {
    exactWordSequencePreserved: boolean;
    completeSpokenSpanCoverage: boolean;
    nonOverlappingSourceRanges: boolean;
    utf8Utf16Agreement: boolean;
  };
};

function round(value: number): number {
  return Number(value.toFixed(4));
}

function distribution(values: number[]): PerformanceUnitDistribution {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length) return { count: 0, minimum: 0, maximum: 0, mean: 0, median: 0, values: [] };
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
  return {
    count: ordered.length,
    minimum: ordered[0]!,
    maximum: ordered[ordered.length - 1]!,
    mean: round(ordered.reduce((sum, value) => sum + value, 0) / ordered.length),
    median: round(median),
    values: ordered,
  };
}

function emptyBreakCounts(): Record<PerformanceBreak, number> {
  return {
    soft_continuation: 0,
    sentence_break: 0,
    deliberate_pause: 0,
    hard_break: 0,
    section_boundary: 0,
    speaker_transition: 0,
  };
}

export function evaluatePerformanceProjection(
  projection: AnvilPerformanceProjectionV1,
): PerformanceProjectionEvaluationV1 {
  const wordsByLine = new Map<number, number>();
  for (const word of projection.words) {
    wordsByLine.set(word.line, (wordsByLine.get(word.line) ?? 0) + 1);
  }
  const controlWordCounts = [...wordsByLine.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, count]) => count);
  const projectedWordCounts = projection.blocks.map((block) => block.wordOrdinals.length);
  const controlTransitions = Math.max(0, controlWordCounts.length - 1);
  const projectionTransitions = Math.max(0, projection.blocks.length - 1);
  const reduction = Math.max(0, controlTransitions - projectionTransitions);
  const entries = emptyBreakCounts();
  for (const block of projection.blocks) entries[block.entryBreak] += 1;

  return {
    schema: PERFORMANCE_PROJECTION_EVALUATION_SCHEMA,
    projectionId: projection.projectionId,
    sourceScriptHash: projection.source.scriptHash,
    spokenWordCount: projection.spokenWordCount,
    control: {
      unit: 'authored_spoken_line',
      unitCount: controlWordCounts.length,
      transitionCount: controlTransitions,
      wordsPerUnit: distribution(controlWordCounts),
    },
    projection: {
      unit: 'performance_block',
      blockCount: projection.blocks.length,
      transitionCount: projectionTransitions,
      wordsPerBlock: distribution(projectedWordCounts),
    },
    transitionReduction: {
      count: reduction,
      percentage: controlTransitions > 0 ? round((reduction / controlTransitions) * 100) : 0,
    },
    breaks: {
      projectedBlockEntries: entries,
      deliberatePacingRangeCount: projection.ranges.filter((range) => range.kind === 'deliberate_pacing').length,
      speakerTransitionRangeCount: projection.ranges.filter((range) => range.kind === 'speaker_transition').length,
      noteDirectionRangeCount: projection.ranges.filter((range) => range.kind === 'note_direction').length,
    },
    preservation: {
      exactWordSequencePreserved: projection.validation.exactWordSequencePreserved,
      completeSpokenSpanCoverage: projection.validation.completeSpokenSpanCoverage,
      nonOverlappingSourceRanges: projection.validation.nonOverlappingSourceRanges,
      utf8Utf16Agreement: projection.validation.utf8Utf16Agreement,
    },
  };
}
