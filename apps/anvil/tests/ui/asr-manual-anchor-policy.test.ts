import { isManualAnchorPendingFresh } from '../../src/features/asr/asr-manual-anchor-policy';

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
});
