export type DecideStaleRecoveryTargetExpiryInput = {
  preservedTargetScrollTop: number | null;
  preservedTargetSourcePath: string;
  previousTargetScrollTop: number;
  pocketTargetScrollTop: number;
  currentScrollTop: number;
  currentLineIdx: number;
  committedLineIdx: number;
  nextSpeakableLineIdx: number;
  visualErrorPx: number;
  tolerancePx: number;
  lineHeightPx: number;
  authorityAction: 'hold' | 'pursue' | 'clamp';
  terminalClampActive: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  stopDeadbandPx: number;
};

export type DecideStaleRecoveryTargetExpiryResult = {
  expire: boolean;
  reason: 'pocket_authority_contradicts_preserved_recovery_target' | null;
  deltaPxToPreservedTarget: number;
  deltaPxToPocketTarget: number;
  contradictionTolerancePx: number;
};

export function decideStaleRecoveryTargetExpiry(
  input: DecideStaleRecoveryTargetExpiryInput,
): DecideStaleRecoveryTargetExpiryResult {
  const contradictionTolerancePx = Math.max(
    Number.isFinite(input.stopDeadbandPx) ? Number(input.stopDeadbandPx) : 0,
    Number.isFinite(input.tolerancePx) ? Number(input.tolerancePx) : 0,
    (Number.isFinite(input.lineHeightPx) ? Number(input.lineHeightPx) : 0) * 0.5,
  );
  const preservedTargetScrollTop = Number.isFinite(input.preservedTargetScrollTop as number)
    ? Number(input.preservedTargetScrollTop)
    : Number.NaN;
  const pocketTargetScrollTop = Number.isFinite(input.pocketTargetScrollTop)
    ? Number(input.pocketTargetScrollTop)
    : Number.NaN;
  const currentScrollTop = Number.isFinite(input.currentScrollTop)
    ? Number(input.currentScrollTop)
    : Number.NaN;
  const deltaPxToPreservedTarget = preservedTargetScrollTop - currentScrollTop;
  const deltaPxToPocketTarget = pocketTargetScrollTop - currentScrollTop;
  if (!Number.isFinite(preservedTargetScrollTop)) {
    return {
      expire: false,
      reason: null,
      deltaPxToPreservedTarget,
      deltaPxToPocketTarget,
      contradictionTolerancePx,
    };
  }
  const sameLineOrAdjacentSafe =
    (input.currentLineIdx === input.committedLineIdx || input.nextSpeakableLineIdx === input.committedLineIdx) &&
    input.nextSpeakableLineIdx <= input.currentLineIdx + 1;
  const meaningfulConflict =
    Number.isFinite(preservedTargetScrollTop) &&
    Number.isFinite(pocketTargetScrollTop) &&
    Math.abs(preservedTargetScrollTop - pocketTargetScrollTop) > contradictionTolerancePx;
  const contradictoryDirection =
    Number.isFinite(deltaPxToPreservedTarget) &&
    Number.isFinite(deltaPxToPocketTarget) &&
    Math.sign(deltaPxToPreservedTarget) !== 0 &&
    Math.sign(deltaPxToPocketTarget) !== 0 &&
    Math.sign(deltaPxToPreservedTarget) !== Math.sign(deltaPxToPocketTarget);
  const expire =
    input.preservedTargetSourcePath === 'asr-marker-lock-pocket-recovery' &&
    input.authorityAction === 'pursue' &&
    !input.terminalClampActive &&
    !input.noMatchOrOffscript &&
    !input.hardContradiction &&
    sameLineOrAdjacentSafe &&
    meaningfulConflict &&
    contradictoryDirection;
  return {
    expire,
    reason: expire ? 'pocket_authority_contradicts_preserved_recovery_target' : null,
    deltaPxToPreservedTarget,
    deltaPxToPocketTarget,
    contradictionTolerancePx,
  };
}
