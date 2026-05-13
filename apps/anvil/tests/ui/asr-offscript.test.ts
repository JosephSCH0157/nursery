import {
  hasBackwardOrLocalContradiction,
  isExplicitNoMatch,
  isInvalidMatchResult,
  normalizeNoMatchEvidence,
  shouldAllowStalePrefixContradictionOverride,
} from '../../src/features/asr/asr-offscript';

describe('ASR off-script / noMatch predicates', () => {
  test('explicit noMatch packet is identified', () => {
    expect(isExplicitNoMatch({
      rawMatchId: null,
      noMatch: true,
      incomingMatch: undefined,
    })).toBe(true);
    expect(isExplicitNoMatch({
      rawMatchId: 'm1',
      noMatch: true,
      incomingMatch: undefined,
    })).toBe(false);
  });

  test('invalid or empty matcher result is identified without throwing', () => {
    expect(isInvalidMatchResult(null)).toBe(true);
    expect(isInvalidMatchResult(undefined)).toBe(true);
    expect(isInvalidMatchResult({ bestIdx: -1 } as any)).toBe(true);
    expect(isInvalidMatchResult({ noMatch: true, bestIdx: 5 } as any)).toBe(true);
    expect(isInvalidMatchResult({ bestIdx: 2, bestSim: 0.8 } as any)).toBe(false);
  });

  test('backward/local contradiction predicate matches current semantics', () => {
    expect(hasBackwardOrLocalContradiction({
      cursorLine: 10,
      bestSim: 0.9,
      currentLineDirectSim: 0.83,
      topScores: [],
      minSimFloor: 0.58,
      simSlack: 0.08,
    })).toBe(true);

    expect(hasBackwardOrLocalContradiction({
      cursorLine: 10,
      bestSim: 0.9,
      currentLineDirectSim: 0.1,
      topScores: [{ idx: 9, score: 0.85 }],
      minSimFloor: 0.58,
      simSlack: 0.08,
    })).toBe(true);
  });

  test('stale-prefix contradiction override predicate matches current semantics', () => {
    expect(shouldAllowStalePrefixContradictionOverride({
      contradictionActive: true,
      stalePrefixIgnored: true,
      backwardContradictionOverriddenByTail: false,
    })).toBe(true);
    expect(shouldAllowStalePrefixContradictionOverride({
      contradictionActive: true,
      stalePrefixIgnored: false,
      backwardContradictionOverriddenByTail: true,
    })).toBe(true);
    expect(shouldAllowStalePrefixContradictionOverride({
      contradictionActive: true,
      stalePrefixIgnored: false,
      backwardContradictionOverriddenByTail: false,
    })).toBe(false);
  });

  test('unrelated off-script transcript is not promoted as valid local evidence via normalization', () => {
    const normalized = normalizeNoMatchEvidence({
      bestIdx: -1,
      bestSim: 0.99,
      noMatch: true,
      topScores: [{ idx: 2, score: 0.99 }],
    });
    expect(normalized?.bestIdx).toBe(-1);
    expect(Number.isNaN(Number(normalized?.bestSim))).toBe(true);
    expect((normalized as any)?.noMatch).toBe(true);
  });

  test('helper returns are stable for normal matching transcript evidence', () => {
    const normalized = normalizeNoMatchEvidence({
      bestIdx: 12,
      bestSim: 0.77,
      topScores: [{ idx: 12, score: 0.77 }],
    });
    expect(normalized?.bestIdx).toBe(12);
    expect(normalized?.bestSim).toBe(0.77);
    expect(isInvalidMatchResult(normalized as any)).toBe(false);
  });
});
