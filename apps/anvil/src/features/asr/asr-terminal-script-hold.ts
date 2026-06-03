export interface EvaluateAsrTerminalScriptHoldInput {
  terminalClampActive: boolean;
  currentLineIdx: number;
  committedLineIdx: number;
  acceptedCommitTargetIdx: number;
  requestedTargetIdx: number;
  lastSpeakableLineIdx: number | null;
  currentScrollTop: number;
  maxScrollTop: number;
  distanceToMaxScrollTop: number;
  targetDebtPx: number;
  scrollerClientHeight: number;
  markerPct?: number | null;
  terminalLineOffsetTop: number | null;
  terminalLineHeightPx: number;
  nearEndWindowLines?: number;
  markerTolerancePx?: number;
}

export interface EvaluateAsrTerminalScriptHoldResult {
  active: boolean;
  holdLineIdx: number;
  lastSpeakableLineIdx: number;
  currentResolvedLineIdx: number;
  nearEndThresholdLineIdx: number;
  currentScrollTop: number;
  maxScrollTop: number;
  distanceToMaxScrollTop: number;
  targetDebtPx: number;
  terminalLineDistanceFromMarkerPx: number;
  markerTopPx: number;
  terminalLineViewportCenterPx: number;
  paddingAdequate: boolean;
  physicallySatisfiable: boolean;
  physicallyUnsatisfiableDebtPx: number;
  reason:
    | 'inactive'
    | 'terminal_clamp_not_active'
    | 'no_last_speakable_line'
    | 'not_near_script_end'
    | 'terminal_script_hold';
}

function normalizeLineIdx(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(-1, Math.floor(Number(value))) : -1;
}

export function evaluateAsrTerminalScriptHold(
  input: EvaluateAsrTerminalScriptHoldInput,
): EvaluateAsrTerminalScriptHoldResult {
  const lastSpeakableLineIdx = normalizeLineIdx(input.lastSpeakableLineIdx);
  const currentLineIdx = normalizeLineIdx(input.currentLineIdx);
  const committedLineIdx = normalizeLineIdx(input.committedLineIdx);
  const acceptedCommitTargetIdx = normalizeLineIdx(input.acceptedCommitTargetIdx);
  const requestedTargetIdx = normalizeLineIdx(input.requestedTargetIdx);
  const holdLineIdx = Math.max(
    currentLineIdx,
    committedLineIdx,
    acceptedCommitTargetIdx,
    requestedTargetIdx,
  );
  const nearEndWindowLines = Math.max(0, Math.floor(Number(input.nearEndWindowLines ?? 1)));
  const nearEndThresholdLineIdx =
    lastSpeakableLineIdx >= 0
      ? Math.max(0, lastSpeakableLineIdx - nearEndWindowLines)
      : -1;
  const currentScrollTop = Number.isFinite(input.currentScrollTop) ? Number(input.currentScrollTop) : 0;
  const maxScrollTop = Number.isFinite(input.maxScrollTop) ? Math.max(0, Number(input.maxScrollTop)) : 0;
  const distanceToMaxScrollTop = Number.isFinite(input.distanceToMaxScrollTop)
    ? Math.max(0, Number(input.distanceToMaxScrollTop))
    : Math.max(0, maxScrollTop - currentScrollTop);
  const scrollerClientHeight = Math.max(
    1,
    Number.isFinite(input.scrollerClientHeight) ? Number(input.scrollerClientHeight) : 1,
  );
  const markerPct = Number.isFinite(input.markerPct as number) ? Number(input.markerPct) : 0.4;
  const markerTopPx = scrollerClientHeight * Math.max(0.05, Math.min(0.95, markerPct));
  const terminalLineOffsetTop = Number.isFinite(input.terminalLineOffsetTop as number)
    ? Number(input.terminalLineOffsetTop)
    : Number.NaN;
  const terminalLineHeightPx = Math.max(
    1,
    Number.isFinite(input.terminalLineHeightPx) ? Number(input.terminalLineHeightPx) : 1,
  );
  const terminalLineViewportCenterPx = Number.isFinite(terminalLineOffsetTop)
    ? terminalLineOffsetTop - maxScrollTop + (terminalLineHeightPx * 0.5)
    : Number.NaN;
  const terminalLineDistanceFromMarkerPx =
    Number.isFinite(terminalLineViewportCenterPx)
      ? terminalLineViewportCenterPx - markerTopPx
      : Number.NaN;
  const markerTolerancePx = Math.max(
    0,
    Number.isFinite(input.markerTolerancePx) ? Number(input.markerTolerancePx) : terminalLineHeightPx * 0.3,
  );
  const paddingAdequate =
    Number.isFinite(terminalLineDistanceFromMarkerPx) &&
    terminalLineDistanceFromMarkerPx <= markerTolerancePx;
  const physicallySatisfiable = !Number.isFinite(terminalLineDistanceFromMarkerPx) || paddingAdequate;
  const physicallyUnsatisfiableDebtPx =
    Number.isFinite(terminalLineDistanceFromMarkerPx) && terminalLineDistanceFromMarkerPx > markerTolerancePx
      ? terminalLineDistanceFromMarkerPx - markerTolerancePx
      : 0;

  if (!input.terminalClampActive) {
    return {
      active: false,
      holdLineIdx,
      lastSpeakableLineIdx,
      currentResolvedLineIdx: holdLineIdx,
      nearEndThresholdLineIdx,
      currentScrollTop,
      maxScrollTop,
      distanceToMaxScrollTop,
      targetDebtPx: Number.isFinite(input.targetDebtPx) ? Number(input.targetDebtPx) : Number.NaN,
      terminalLineDistanceFromMarkerPx,
      markerTopPx,
      terminalLineViewportCenterPx,
      paddingAdequate,
      physicallySatisfiable,
      physicallyUnsatisfiableDebtPx,
      reason: 'terminal_clamp_not_active',
    };
  }
  if (lastSpeakableLineIdx < 0) {
    return {
      active: false,
      holdLineIdx,
      lastSpeakableLineIdx,
      currentResolvedLineIdx: holdLineIdx,
      nearEndThresholdLineIdx,
      currentScrollTop,
      maxScrollTop,
      distanceToMaxScrollTop,
      targetDebtPx: Number.isFinite(input.targetDebtPx) ? Number(input.targetDebtPx) : Number.NaN,
      terminalLineDistanceFromMarkerPx,
      markerTopPx,
      terminalLineViewportCenterPx,
      paddingAdequate,
      physicallySatisfiable,
      physicallyUnsatisfiableDebtPx,
      reason: 'no_last_speakable_line',
    };
  }
  if (holdLineIdx < nearEndThresholdLineIdx) {
    return {
      active: false,
      holdLineIdx,
      lastSpeakableLineIdx,
      currentResolvedLineIdx: holdLineIdx,
      nearEndThresholdLineIdx,
      currentScrollTop,
      maxScrollTop,
      distanceToMaxScrollTop,
      targetDebtPx: Number.isFinite(input.targetDebtPx) ? Number(input.targetDebtPx) : Number.NaN,
      terminalLineDistanceFromMarkerPx,
      markerTopPx,
      terminalLineViewportCenterPx,
      paddingAdequate,
      physicallySatisfiable,
      physicallyUnsatisfiableDebtPx,
      reason: 'not_near_script_end',
    };
  }
  return {
    active: true,
    holdLineIdx,
    lastSpeakableLineIdx,
    currentResolvedLineIdx: holdLineIdx,
    nearEndThresholdLineIdx,
    currentScrollTop,
    maxScrollTop,
    distanceToMaxScrollTop,
    targetDebtPx: Number.isFinite(input.targetDebtPx) ? Number(input.targetDebtPx) : Number.NaN,
    terminalLineDistanceFromMarkerPx,
    markerTopPx,
    terminalLineViewportCenterPx,
    paddingAdequate,
    physicallySatisfiable,
    physicallyUnsatisfiableDebtPx,
    reason: 'terminal_script_hold',
  };
}
