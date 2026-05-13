import {
  isManualAnchorPendingFresh,
  isManualAnchorWithinLineWindow,
} from '../../src/features/asr/asr-manual-anchor-policy';

describe('ASR manual anchor policy', () => {
  test('returns false when pendingTs is null', () => {
    expect(
      isManualAnchorPendingFresh({
        pendingTs: null,
        now: 1000,
        timeoutMs: 500,
      }),
    ).toBe(false);
  });

  test('returns true when pendingTs is within timeout', () => {
    expect(
      isManualAnchorPendingFresh({
        pendingTs: 1000,
        now: 1499,
        timeoutMs: 500,
      }),
    ).toBe(true);
  });

  test('returns false when pendingTs is older than timeout', () => {
    expect(
      isManualAnchorPendingFresh({
        pendingTs: 1000,
        now: 1501,
        timeoutMs: 500,
      }),
    ).toBe(false);
  });

  test('preserves timeout edge behavior (equal to timeout is stale)', () => {
    expect(
      isManualAnchorPendingFresh({
        pendingTs: 1000,
        now: 1500,
        timeoutMs: 500,
      }),
    ).toBe(false);
  });

  test('handles zero and negative timeout with current semantics', () => {
    expect(
      isManualAnchorPendingFresh({
        pendingTs: 1000,
        now: 1000,
        timeoutMs: 0,
      }),
    ).toBe(false);

    expect(
      isManualAnchorPendingFresh({
        pendingTs: 1000,
        now: 999,
        timeoutMs: -1,
      }),
    ).toBe(false);
  });

  test('does not mutate input', () => {
    const input = {
      pendingTs: 1000,
      now: 1200,
      timeoutMs: 500,
    };
    const before = { ...input };
    isManualAnchorPendingFresh(input);
    expect(input).toEqual(before);
  });

  test('line-window returns true when candidate equals target', () => {
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 10,
        candidateIndex: 10,
        windowLines: 3,
      }),
    ).toBe(true);
  });

  test('line-window returns true exactly at forward window edge', () => {
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 10,
        candidateIndex: 13,
        windowLines: 3,
      }),
    ).toBe(true);
  });

  test('line-window returns true exactly at backward window edge', () => {
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 10,
        candidateIndex: 7,
        windowLines: 3,
      }),
    ).toBe(true);
  });

  test('line-window returns false one line beyond the edge', () => {
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 10,
        candidateIndex: 14,
        windowLines: 3,
      }),
    ).toBe(false);
  });

  test('line-window preserves exact boundary behavior', () => {
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 0,
        candidateIndex: 2,
        windowLines: 2,
      }),
    ).toBe(true);
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 0,
        candidateIndex: 3,
        windowLines: 2,
      }),
    ).toBe(false);
  });

  test('line-window handles zero window with current semantics', () => {
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 5,
        candidateIndex: 5,
        windowLines: 0,
      }),
    ).toBe(true);
    expect(
      isManualAnchorWithinLineWindow({
        targetIndex: 5,
        candidateIndex: 6,
        windowLines: 0,
      }),
    ).toBe(false);
  });

  test('line-window does not mutate input', () => {
    const input = {
      targetIndex: 12,
      candidateIndex: 15,
      windowLines: 3,
    };
    const before = { ...input };
    isManualAnchorWithinLineWindow(input);
    expect(input).toEqual(before);
  });
});
