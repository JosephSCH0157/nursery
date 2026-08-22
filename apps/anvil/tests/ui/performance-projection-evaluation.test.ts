import { createHash } from 'crypto';
import { createPerformanceProjection } from '../../src/script/performance-projection';
import { evaluatePerformanceProjection } from '../../src/script/performance-projection-evaluation';
import {
  REPRESENTATIVE_PERFORMANCE_SCRIPT,
  REPRESENTATIVE_SOURCE_IDENTITY,
} from '../fixtures/performance-projection-representative';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    subtle: {
      digest: async (_algorithm: string, data: ArrayBuffer) => {
        const hash = createHash('sha256').update(new Uint8Array(data)).digest();
        return Uint8Array.from(hash).buffer;
      },
    },
  },
});

const encoder = new TextEncoder();

async function evaluateFixture() {
  const projection = await createPerformanceProjection({
    canonicalText: REPRESENTATIVE_PERFORMANCE_SCRIPT,
    canonicalUtf8Bytes: encoder.encode(REPRESENTATIVE_PERFORMANCE_SCRIPT),
    sourceIdentity: REPRESENTATIVE_SOURCE_IDENTITY,
  });
  return { projection, evaluation: evaluatePerformanceProjection(projection) };
}

describe('offline performance projection evaluation', () => {
  test('produces deterministic control-versus-projection metrics', async () => {
    const first = await evaluateFixture();
    const second = await evaluateFixture();
    expect(second).toEqual(first);
    expect(first.projection.source.scriptHash).toBe('3e37d7859d87b8f470ba1e5a7dc6970d26f62b87f89e668b87b90072716e1a9c');
    expect(first.projection.projectionId).toBe('07bdbdd5adf616d1d1736ed9c8488a9acd92e811cec5b5b344a05b231fa353d1');
    expect(first.evaluation.projectionId).toBe(first.projection.projectionId);
    expect(first.evaluation.sourceScriptHash).toBe(first.projection.source.scriptHash);
  });

  test('matches the representative fixture golden metrics', async () => {
    const { evaluation } = await evaluateFixture();
    expect({
      spokenWordCount: evaluation.spokenWordCount,
      control: evaluation.control,
      projection: evaluation.projection,
      transitionReduction: evaluation.transitionReduction,
      breaks: evaluation.breaks,
      preservation: evaluation.preservation,
    }).toEqual({
      spokenWordCount: 125,
      control: {
        unit: 'authored_spoken_line',
        unitCount: 17,
        transitionCount: 16,
        wordsPerUnit: {
          count: 17,
          minimum: 2,
          maximum: 13,
          mean: 7.3529,
          median: 7,
          values: [2, 2, 3, 4, 4, 7, 7, 7, 7, 8, 9, 9, 9, 11, 11, 12, 13],
        },
      },
      projection: {
        unit: 'performance_block',
        blockCount: 8,
        transitionCount: 7,
        wordsPerBlock: {
          count: 8,
          minimum: 7,
          maximum: 22,
          mean: 15.625,
          median: 18,
          values: [7, 9, 9, 16, 20, 21, 21, 22],
        },
      },
      transitionReduction: { count: 9, percentage: 56.25 },
      breaks: {
        projectedBlockEntries: {
          soft_continuation: 3,
          sentence_break: 0,
          deliberate_pause: 2,
          hard_break: 1,
          section_boundary: 0,
          speaker_transition: 2,
        },
        deliberatePacingRangeCount: 2,
        speakerTransitionRangeCount: 4,
        noteDirectionRangeCount: 3,
      },
      preservation: {
        exactWordSequencePreserved: true,
        completeSpokenSpanCoverage: true,
        nonOverlappingSourceRanges: true,
        utf8Utf16Agreement: true,
      },
    });
  });

  test('preserves explicit pauses, hard breaks, speakers, and exact word authority', async () => {
    const { projection, evaluation } = await evaluateFixture();
    expect(evaluation.breaks.deliberatePacingRangeCount).toBe(2);
    expect(evaluation.breaks.projectedBlockEntries.deliberate_pause).toBe(2);
    expect(evaluation.breaks.projectedBlockEntries.hard_break).toBeGreaterThanOrEqual(1);
    expect(evaluation.breaks.projectedBlockEntries.speaker_transition).toBe(2);
    expect(evaluation.preservation).toEqual({
      exactWordSequencePreserved: true,
      completeSpokenSpanCoverage: true,
      nonOverlappingSourceRanges: true,
      utf8Utf16Agreement: true,
    });
    expect(projection.blocks.flatMap((block) => block.wordOrdinals)).toEqual(
      projection.words.map((word) => word.ordinal),
    );
  });

  test('reduces offline screen transitions without claiming ASR improvement', async () => {
    const { evaluation } = await evaluateFixture();
    expect(evaluation.projection.blockCount).toBeLessThan(evaluation.control.unitCount);
    expect(evaluation.transitionReduction.count).toBeGreaterThan(0);
    expect(evaluation.transitionReduction.percentage).toBeGreaterThan(0);
  });
});
