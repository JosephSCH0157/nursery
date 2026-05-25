import { decideAcceptedLocalLagVisualCatchup } from '../../src/features/asr/asr-live-pocket-maintenance';

describe('ASR live pocket maintenance far-target relaxation', () => {
  test('relaxes accepted local lag catch-up for coherent +2 below-pocket debt', () => {
    const decision = decideAcceptedLocalLagVisualCatchup({
      currentLineIdx: 194,
      committedLineIdx: 196,
      nextSpeakableLineIdx: 196,
      targetLineIdx: 195,
      noMatchOrOffscript: false,
      contradiction: false,
      terminalClamp: false,
      belowPocketPx: 101,
      visualDebtPx: 161,
      lineHeightPx: 56,
      currentScrollTop: 13627,
      targetScrollTop: 13788,
    });
    expect(decision.relaxed).toBe(true);
    expect(decision.blockedReason).toBe('accepted_local_lag_overblocked');
    expect(decision.lagLines).toBe(2);
  });

  test('blocks true far target when lag is greater than two lines', () => {
    const decision = decideAcceptedLocalLagVisualCatchup({
      currentLineIdx: 194,
      committedLineIdx: 197,
      nextSpeakableLineIdx: 197,
      targetLineIdx: 195,
      noMatchOrOffscript: false,
      contradiction: false,
      terminalClamp: false,
      belowPocketPx: 101,
      visualDebtPx: 161,
      lineHeightPx: 56,
      currentScrollTop: 13627,
      targetScrollTop: 13788,
    });
    expect(decision.relaxed).toBe(false);
    expect(decision.blockedReason).toBe('true_far_target');
  });

  test('blocks incoherent indices when next speakable does not match committed', () => {
    const decision = decideAcceptedLocalLagVisualCatchup({
      currentLineIdx: 194,
      committedLineIdx: 196,
      nextSpeakableLineIdx: 195,
      targetLineIdx: 195,
      noMatchOrOffscript: false,
      contradiction: false,
      terminalClamp: false,
      belowPocketPx: 101,
      visualDebtPx: 161,
      lineHeightPx: 56,
      currentScrollTop: 13627,
      targetScrollTop: 13788,
    });
    expect(decision.relaxed).toBe(false);
    expect(decision.blockedReason).toBe('incoherent_indices');
  });

  test('blocks safety vetoes even in local lag catch-up shape', () => {
    const decision = decideAcceptedLocalLagVisualCatchup({
      currentLineIdx: 194,
      committedLineIdx: 196,
      nextSpeakableLineIdx: 196,
      targetLineIdx: 195,
      noMatchOrOffscript: true,
      contradiction: false,
      terminalClamp: false,
      belowPocketPx: 101,
      visualDebtPx: 161,
      lineHeightPx: 56,
      currentScrollTop: 13627,
      targetScrollTop: 13788,
    });
    expect(decision.relaxed).toBe(false);
    expect(decision.blockedReason).toBe('safety_blocked');
  });

  test('blocks terminal clamp at end of scroll', () => {
    const decision = decideAcceptedLocalLagVisualCatchup({
      currentLineIdx: 210,
      committedLineIdx: 213,
      nextSpeakableLineIdx: 213,
      targetLineIdx: 213,
      noMatchOrOffscript: false,
      contradiction: false,
      terminalClamp: true,
      belowPocketPx: 69,
      visualDebtPx: 129,
      lineHeightPx: 56,
      currentScrollTop: 14872,
      targetScrollTop: 14872,
    });
    expect(decision.relaxed).toBe(false);
    expect(decision.blockedReason).toBe('terminal_near_end');
  });

  test('blocks unaccepted target when resolved target is not local or accepted', () => {
    const decision = decideAcceptedLocalLagVisualCatchup({
      currentLineIdx: 194,
      committedLineIdx: 196,
      nextSpeakableLineIdx: 196,
      targetLineIdx: 199,
      noMatchOrOffscript: false,
      contradiction: false,
      terminalClamp: false,
      belowPocketPx: 101,
      visualDebtPx: 161,
      lineHeightPx: 56,
      currentScrollTop: 13627,
      targetScrollTop: 13788,
    });
    expect(decision.relaxed).toBe(false);
    expect(decision.blockedReason).toBe('unaccepted_target');
  });
});
