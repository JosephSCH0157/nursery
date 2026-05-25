export type LivePocketFarTargetBlockedReason =
  | 'not_far_target'
  | 'true_far_target'
  | 'accepted_local_lag_overblocked'
  | 'terminal_near_end'
  | 'incoherent_indices'
  | 'unaccepted_target'
  | 'safety_blocked';

export type LivePocketFarTargetRelaxationDecision = {
  blockedReason: LivePocketFarTargetBlockedReason;
  lagLines: number;
  relaxed: boolean;
};

type DecideAcceptedLocalLagVisualCatchupInput = {
  belowPocketPx: number;
  committedLineIdx: number;
  contradiction: boolean;
  currentLineIdx: number;
  currentScrollTop: number;
  lineHeightPx: number;
  nextSpeakableLineIdx: number;
  noMatchOrOffscript: boolean;
  targetLineIdx: number;
  targetScrollTop: number;
  terminalClamp: boolean;
  visualDebtPx: number;
};

export function decideAcceptedLocalLagVisualCatchup(
  input: DecideAcceptedLocalLagVisualCatchupInput,
): LivePocketFarTargetRelaxationDecision {
  const currentLineIdx = Math.max(-1, Math.floor(Number(input.currentLineIdx)));
  const committedLineIdx = Math.max(-1, Math.floor(Number(input.committedLineIdx)));
  const nextSpeakableLineIdx = Math.max(-1, Math.floor(Number(input.nextSpeakableLineIdx)));
  const targetLineIdx = Number.isFinite(input.targetLineIdx) ? Math.floor(Number(input.targetLineIdx)) : -1;
  const lagLines =
    currentLineIdx >= 0 && committedLineIdx >= 0
      ? Math.max(-1, committedLineIdx - currentLineIdx)
      : -1;
  if (lagLines <= 1) {
    return { blockedReason: 'not_far_target', lagLines, relaxed: false };
  }
  if (input.terminalClamp) {
    return { blockedReason: 'terminal_near_end', lagLines, relaxed: false };
  }
  if (input.noMatchOrOffscript || input.contradiction) {
    return { blockedReason: 'safety_blocked', lagLines, relaxed: false };
  }
  if (currentLineIdx < 0 || committedLineIdx < 0 || nextSpeakableLineIdx < 0) {
    return { blockedReason: 'incoherent_indices', lagLines, relaxed: false };
  }
  if (lagLines > 2) {
    return { blockedReason: 'true_far_target', lagLines, relaxed: false };
  }
  if (nextSpeakableLineIdx !== committedLineIdx) {
    return { blockedReason: 'incoherent_indices', lagLines, relaxed: false };
  }
  const targetMatchesAccepted =
    targetLineIdx >= 0 &&
    (targetLineIdx === committedLineIdx || targetLineIdx === nextSpeakableLineIdx);
  const targetStillLocal =
    targetLineIdx < 0 ||
    targetLineIdx === currentLineIdx ||
    targetLineIdx === currentLineIdx + 1;
  if (!(targetMatchesAccepted || targetStillLocal)) {
    return { blockedReason: 'unaccepted_target', lagLines, relaxed: false };
  }
  const lineHeightPx = Math.max(1, Number.isFinite(input.lineHeightPx) ? Number(input.lineHeightPx) : 1);
  const belowPocketThresholdPx = Math.max(1, Math.round(lineHeightPx * 0.75));
  const significantBelowPocket = Number.isFinite(input.belowPocketPx) && input.belowPocketPx >= belowPocketThresholdPx;
  const significantVisualDebt = Number.isFinite(input.visualDebtPx) && input.visualDebtPx >= lineHeightPx;
  const boundedForwardCorrection =
    Number.isFinite(input.targetScrollTop) &&
    Number.isFinite(input.currentScrollTop) &&
    input.targetScrollTop > input.currentScrollTop + 0.5 &&
    (input.targetScrollTop - input.currentScrollTop) <= Math.max(lineHeightPx * 4, 220);
  if (significantBelowPocket && significantVisualDebt && boundedForwardCorrection) {
    return { blockedReason: 'accepted_local_lag_overblocked', lagLines, relaxed: true };
  }
  return { blockedReason: 'accepted_local_lag_overblocked', lagLines, relaxed: false };
}
