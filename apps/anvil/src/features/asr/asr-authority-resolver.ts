export type AsrSafetyClass = 'absolute_hold' | 'distance_restrict_only' | 'clear';

export type AsrResolvedGear =
  | 'hold'
  | 'normal_floor'
  | 'normal_tracking'
  | 'recovery';

export type AsrPocketState =
  | 'above_marker'
  | 'in_preferred_pocket'
  | 'below_preferred_pocket'
  | 'near_lower_rail'
  | 'bottom_locked'
  | 'top_pressure';

export type AsrScrollResolvedCommand = {
  movementAllowed: boolean;
  vetoAuthority: string | null;
  semanticTargetIdx: number | null;
  allowedTargetIdx: number | null;
  targetAuthority: string;
  movementEnvelopeAuthority: string;
  motionAuthority: string;
  smoothingAuthority: string;
  finalGear: AsrResolvedGear;
  finalMinStepPx: number;
  safetyClass: AsrSafetyClass;
  pocketState: AsrPocketState;
  oldPocketState: AsrPocketState;
  markerCenteredPocketState: AsrPocketState;
  markerViewportLine: number;
  readViewportLine: number;
  distanceFromMarkerLines: number;
  preferredTopLine: number;
  preferredBottomLine: number;
  movementEnvelopePx: number;
  movementEnvelopeReason: string;
  bridgeCueCapApplied: boolean;
  cappedTargetSafe: boolean;
  overruledAuthorities: string[];
  reason: string;
};

export type ResolveAsrScrollAuthorityInput = {
  currentLineIdx: number;
  requestedTargetIdx: number;
  semanticTargetIdx: number;
  acceptedCommitTargetIdx: number;
  distanceCapTargetIdx: number;
  bridgeOwner: string;
  cueOwner: string;
  markerLockState: string;
  comfortState: string;
  visualRecoveryState: string;
  hardSafetyState: string;
  safetyCapState: string;
  visualGovernorState: string;
  postAdjacentRecoveryState: string;
  targetDebtPx: number;
  markerY: number;
  nextSpeakableLineY: number;
  preferredBandTop: number;
  preferredSettleBottom: number;
  preferredBandBottom: number;
  toleratedBandBottom: number;
  lineHeightPx?: number;
  terminalClampActive: boolean;
  speechFresh: boolean;
  backendFresh: boolean;
  audioPacketFresh?: boolean;
  finalPacketFresh?: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
};

const RECOVERY_MIN_STEP_PX = 12;
const NORMAL_FLOOR_MIN_STEP_PX = 6;

function finiteNumber(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function finiteIdx(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const idx = Math.floor(Number(value));
  return idx >= 0 ? idx : null;
}

function determineLegacyPocketState(input: ResolveAsrScrollAuthorityInput): {
  pocketState: AsrPocketState;
  movementEnvelopePx: number;
  movementEnvelopeReason: string;
} {
  const markerY = finiteNumber(input.markerY);
  const nextY = finiteNumber(input.nextSpeakableLineY);
  const preferredTop = finiteNumber(input.preferredBandTop);
  const preferredSettleBottom = finiteNumber(input.preferredSettleBottom);
  const preferredBottom = finiteNumber(input.preferredBandBottom);
  const toleratedBottom = finiteNumber(input.toleratedBandBottom);
  const safetyCapState = String(input.safetyCapState || '').trim().toLowerCase();
  const visualRecoveryState = String(input.visualRecoveryState || '').trim().toLowerCase();

  if (
    safetyCapState === 'top_pressure_clamp' ||
    visualRecoveryState === 'top_pressure_clamp'
  ) {
    const envelopePx =
      nextY != null && preferredTop != null ? Math.max(0, preferredTop - nextY) : 0;
    return {
      pocketState: 'top_pressure',
      movementEnvelopePx: envelopePx,
      movementEnvelopeReason: 'top_pressure_clamp',
    };
  }

  if (
    visualRecoveryState === 'bottom_lock_release' ||
    String(input.comfortState || '').trim().toLowerCase() === 'comfort_nudge_large_debt'
  ) {
    const envelopePx =
      nextY != null && preferredBottom != null ? Math.max(0, nextY - preferredBottom) : 0;
    return {
      pocketState: 'bottom_locked',
      movementEnvelopePx: envelopePx,
      movementEnvelopeReason: visualRecoveryState || 'bottom_lock_release',
    };
  }

  if (
    nextY != null &&
    toleratedBottom != null &&
    nextY > toleratedBottom
  ) {
    const preferredBottomDelta =
      preferredBottom != null ? Math.max(0, nextY - preferredBottom) : 0;
    return {
      pocketState: 'below_preferred_pocket',
      movementEnvelopePx: preferredBottomDelta,
      movementEnvelopeReason: 'below_tolerated_bottom',
    };
  }

  if (
    nextY != null &&
    preferredSettleBottom != null &&
    preferredBottom != null &&
    nextY > preferredSettleBottom &&
    nextY <= preferredBottom
  ) {
    return {
      pocketState: 'near_lower_rail',
      movementEnvelopePx: Math.max(0, nextY - preferredSettleBottom),
      movementEnvelopeReason: 'preferred_lower_rail_not_settled',
    };
  }

  if (
    nextY != null &&
    preferredTop != null &&
    preferredBottom != null &&
    nextY >= preferredTop &&
    nextY <= preferredBottom
  ) {
    return {
      pocketState: 'in_preferred_pocket',
      movementEnvelopePx: 0,
      movementEnvelopeReason: 'already_in_preferred_pocket',
    };
  }

  if (
    nextY != null &&
    ((markerY != null && nextY < markerY) || (preferredTop != null && nextY < preferredTop))
  ) {
    const envelopePx =
      preferredTop != null ? Math.max(0, preferredTop - nextY) : 0;
    return {
      pocketState: 'above_marker',
      movementEnvelopePx: envelopePx,
      movementEnvelopeReason: 'above_preferred_pocket',
    };
  }

  return {
    pocketState: 'in_preferred_pocket',
    movementEnvelopePx: 0,
    movementEnvelopeReason: 'geometry_unclassified',
  };
}

function resolveLineHeightPx(input: ResolveAsrScrollAuthorityInput): number {
  const explicit = finiteNumber(input.lineHeightPx);
  if (explicit != null && explicit > 1) return explicit;
  const deltas = [
    finiteNumber(input.preferredBandBottom),
    finiteNumber(input.preferredBandTop),
    finiteNumber(input.toleratedBandBottom),
    finiteNumber(input.preferredBandBottom),
    finiteNumber(input.preferredSettleBottom),
    finiteNumber(input.preferredBandTop),
  ];
  const candidates = [
    deltas[0] != null && deltas[1] != null ? Math.abs(deltas[0] - deltas[1]) / 4 : null,
    deltas[2] != null && deltas[3] != null ? Math.abs(deltas[2] - deltas[3]) : null,
    deltas[4] != null && deltas[5] != null ? Math.abs(deltas[4] - deltas[5]) / 4 : null,
  ];
  for (const candidate of candidates) {
    if (candidate != null && Number.isFinite(candidate) && candidate > 8) {
      return candidate;
    }
  }
  return 24;
}

function resolveViewportLine(y: number | null, lineHeightPx: number): number {
  if (y == null || !Number.isFinite(y) || !Number.isFinite(lineHeightPx) || lineHeightPx <= 1) {
    return -1;
  }
  return Math.max(1, Math.round(y / lineHeightPx));
}

function determineMarkerCenteredPocketState(input: ResolveAsrScrollAuthorityInput): {
  pocketState: AsrPocketState;
  markerCenteredPocketState: AsrPocketState;
  oldPocketState: AsrPocketState;
  markerViewportLine: number;
  readViewportLine: number;
  distanceFromMarkerLines: number;
  preferredTopLine: number;
  preferredBottomLine: number;
  movementEnvelopePx: number;
  movementEnvelopeReason: string;
} {
  const legacy = determineLegacyPocketState(input);
  const markerY = finiteNumber(input.markerY);
  const readY = finiteNumber(input.nextSpeakableLineY);
  const lineHeightPx = resolveLineHeightPx(input);
  const markerViewportLine = resolveViewportLine(markerY, lineHeightPx);
  const readViewportLine = resolveViewportLine(readY, lineHeightPx);
  if (markerViewportLine < 1 || readViewportLine < 1) {
    return {
      pocketState: legacy.pocketState,
      markerCenteredPocketState: legacy.pocketState,
      oldPocketState: legacy.pocketState,
      markerViewportLine,
      readViewportLine,
      distanceFromMarkerLines: -1,
      preferredTopLine: -1,
      preferredBottomLine: -1,
      movementEnvelopePx: legacy.movementEnvelopePx,
      movementEnvelopeReason: legacy.movementEnvelopeReason,
    };
  }
  const preferredTopLine = Math.max(1, markerViewportLine - 4);
  const preferredBottomLine = markerViewportLine + 4;
  const distanceFromMarkerLines = readViewportLine - markerViewportLine;
  const rowsOutsidePocket = Math.max(0, Math.abs(distanceFromMarkerLines) - 4);
  const movementEnvelopePx = Math.round(rowsOutsidePocket * lineHeightPx);

  let pocketState: AsrPocketState;
  let movementEnvelopeReason: string;
  if (distanceFromMarkerLines < -4) {
    pocketState = 'top_pressure';
    movementEnvelopeReason = 'marker_centered_top_pressure';
  } else if (distanceFromMarkerLines > 8) {
    pocketState = 'bottom_locked';
    movementEnvelopeReason = 'marker_centered_bottom_locked';
  } else if (distanceFromMarkerLines > 6) {
    pocketState = 'near_lower_rail';
    movementEnvelopeReason = 'marker_centered_near_lower_rail';
  } else if (distanceFromMarkerLines > 4) {
    pocketState = 'below_preferred_pocket';
    movementEnvelopeReason = 'marker_centered_below_preferred_pocket';
  } else {
    pocketState = 'in_preferred_pocket';
    movementEnvelopeReason =
      distanceFromMarkerLines === 0
        ? 'marker_centered_ideal'
        : 'marker_centered_in_preferred_pocket';
  }

  return {
    pocketState,
    markerCenteredPocketState: pocketState,
    oldPocketState: legacy.pocketState,
    markerViewportLine,
    readViewportLine,
    distanceFromMarkerLines,
    preferredTopLine,
    preferredBottomLine,
    movementEnvelopePx,
    movementEnvelopeReason,
  };
}

function resolveSafetyClass(input: ResolveAsrScrollAuthorityInput): {
  safetyClass: AsrSafetyClass;
  vetoAuthority: string | null;
  reason: string;
} {
  const speechFresh = input.speechFresh === true;
  const audioPacketFresh = input.audioPacketFresh === true;
  const finalPacketFresh = input.finalPacketFresh === true;
  const backendFresh =
    input.backendFresh === true ||
    finalPacketFresh ||
    (audioPacketFresh && speechFresh);
  const geometryUnavailable =
    !Number.isFinite(input.markerY) ||
    !Number.isFinite(input.nextSpeakableLineY) ||
    !Number.isFinite(input.preferredBandTop) ||
    !Number.isFinite(input.preferredBandBottom);
  if (input.terminalClampActive) {
    return {
      safetyClass: 'absolute_hold',
      vetoAuthority: 'absolute_safety',
      reason: 'terminal_max_scroll_clamp',
    };
  }
  if (input.noMatchOrOffscript) {
    return {
      safetyClass: 'absolute_hold',
      vetoAuthority: 'absolute_safety',
      reason: 'offscript_or_no_match',
    };
  }
  if (input.hardContradiction) {
    return {
      safetyClass: 'absolute_hold',
      vetoAuthority: 'absolute_safety',
      reason: 'hard_contradiction',
    };
  }
  if (!backendFresh && !speechFresh) {
    return {
      safetyClass: 'absolute_hold',
      vetoAuthority: 'absolute_safety',
      reason: 'stale_backend_or_audio',
    };
  }
  if (geometryUnavailable || String(input.markerLockState || '').trim().toLowerCase() === 'geometry_unavailable') {
    return {
      safetyClass: 'absolute_hold',
      vetoAuthority: 'absolute_safety',
      reason: 'geometry_unavailable',
    };
  }
  if (
    String(input.hardSafetyState || '').trim().toLowerCase() === 'absolute_hold' ||
    String(input.visualGovernorState || '').trim().toLowerCase().includes('hold')
  ) {
    return {
      safetyClass: 'absolute_hold',
      vetoAuthority: 'absolute_safety',
      reason: String(input.hardSafetyState || 'absolute_hold'),
    };
  }
  if (
    String(input.hardSafetyState || '').trim().toLowerCase() === 'distance_restrict_only' ||
    (String(input.safetyCapState || '').trim() !== '' &&
      String(input.safetyCapState || '').trim().toLowerCase() !== 'none' &&
      String(input.safetyCapState || '').trim().toLowerCase() !== 'inactive')
  ) {
    return {
      safetyClass: 'distance_restrict_only',
      vetoAuthority: null,
      reason: String(input.safetyCapState || input.hardSafetyState || 'distance_restrict_only'),
    };
  }
  return {
    safetyClass: 'clear',
    vetoAuthority: null,
    reason: 'movement_allowed',
  };
}

function resolveAllowedTargetIdx(input: ResolveAsrScrollAuthorityInput, semanticTargetIdx: number | null): number | null {
  const capped = finiteIdx(input.distanceCapTargetIdx);
  if (capped != null && semanticTargetIdx != null && capped > input.currentLineIdx && capped <= semanticTargetIdx) {
    return capped;
  }
  const accepted = finiteIdx(input.acceptedCommitTargetIdx);
  if (accepted != null && semanticTargetIdx != null && accepted > input.currentLineIdx && accepted <= semanticTargetIdx) {
    return accepted;
  }
  if (semanticTargetIdx != null && semanticTargetIdx > input.currentLineIdx) {
    return semanticTargetIdx;
  }
  return null;
}

export function resolveAsrScrollAuthority(input: ResolveAsrScrollAuthorityInput): AsrScrollResolvedCommand {
  const requestedTargetIdx = finiteIdx(input.requestedTargetIdx);
  const semanticTargetIdx = finiteIdx(input.semanticTargetIdx);
  const allowedTargetIdx = resolveAllowedTargetIdx(input, semanticTargetIdx);
  const cappedTargetSafe =
    allowedTargetIdx != null &&
    allowedTargetIdx > input.currentLineIdx &&
    semanticTargetIdx != null &&
    allowedTargetIdx <= semanticTargetIdx;
  const bridgeCueCapApplied =
    (String(input.bridgeOwner || '').trim().toLowerCase() !== 'none') ||
    (String(input.cueOwner || '').trim().toLowerCase() !== 'none') ||
    (allowedTargetIdx != null && requestedTargetIdx != null && allowedTargetIdx < requestedTargetIdx) ||
    String(input.safetyCapState || '').toLowerCase().includes('bridge') ||
    String(input.safetyCapState || '').toLowerCase().includes('cue');

  const {
    pocketState,
    markerCenteredPocketState,
    oldPocketState,
    markerViewportLine,
    readViewportLine,
    distanceFromMarkerLines,
    preferredTopLine,
    preferredBottomLine,
    movementEnvelopePx,
    movementEnvelopeReason,
  } = determineMarkerCenteredPocketState(input);
  const { safetyClass, vetoAuthority, reason: safetyReason } = resolveSafetyClass(input);
  const movementAllowed = safetyClass !== 'absolute_hold';

  const targetAuthority =
    semanticTargetIdx != null ? 'semantic_target' : 'no_semantic_target';

  const movementEnvelopeAuthority =
    bridgeCueCapApplied || safetyClass === 'distance_restrict_only'
      ? 'reader_pocket_envelope'
      : 'reader_pocket_envelope';

  const smoothingActive =
    String(input.markerLockState || '').trim().toLowerCase() !== 'unknown';
  const smoothingAuthority =
    smoothingActive ? 'marker_lock_smoothing' : 'none';

  const largeDebt = Number.isFinite(input.targetDebtPx) && input.targetDebtPx >= 120;
  const lowPocketState =
    pocketState === 'below_preferred_pocket' ||
    pocketState === 'near_lower_rail' ||
    pocketState === 'bottom_locked';
  const recoveryEligible =
    movementAllowed &&
    cappedTargetSafe &&
    largeDebt &&
    lowPocketState &&
    input.speechFresh &&
    !input.noMatchOrOffscript &&
    !input.hardContradiction;

  let finalGear: AsrResolvedGear = 'hold';
  let finalMinStepPx = 0;
  let motionAuthority = 'actuator_execution';
  let reason = safetyReason;

  if (!movementAllowed) {
    finalGear = 'hold';
    finalMinStepPx = 0;
    motionAuthority = 'absolute_safety';
  } else if (recoveryEligible) {
    finalGear = 'recovery';
    finalMinStepPx = RECOVERY_MIN_STEP_PX;
    motionAuthority = 'visual_recovery';
    reason = movementEnvelopeReason || 'visual_recovery';
  } else if (allowedTargetIdx != null && Number.isFinite(input.targetDebtPx) && input.targetDebtPx > 0) {
    if (pocketState === 'in_preferred_pocket') {
      finalGear = 'normal_tracking';
      finalMinStepPx = 0;
      motionAuthority = 'reader_pocket_envelope';
      reason = 'already_in_preferred_pocket';
    } else {
      finalGear = 'normal_floor';
      finalMinStepPx = NORMAL_FLOOR_MIN_STEP_PX;
      motionAuthority = lowPocketState ? 'visual_recovery_not_selected' : 'reader_pocket_envelope';
      reason =
        recoveryEligible
          ? 'recovery_selected'
          : (lowPocketState
            ? 'recovery_not_selected'
            : movementEnvelopeReason || 'normal_floor_selected');
    }
  } else {
    finalGear = 'normal_floor';
    finalMinStepPx = NORMAL_FLOOR_MIN_STEP_PX;
    motionAuthority = 'actuator_execution';
    reason = allowedTargetIdx == null ? 'no_safe_allowed_target' : 'normal_floor_selected';
  }

  const activeAuthorities = [
    movementAllowed ? null : 'absolute_safety',
    semanticTargetIdx != null ? 'semantic_target' : null,
    bridgeCueCapApplied || safetyClass === 'distance_restrict_only' ? 'reader_pocket_envelope' : null,
    lowPocketState || pocketState === 'top_pressure' || pocketState === 'above_marker'
      ? 'visual_recovery'
      : null,
    smoothingActive ? 'marker_lock_smoothing' : null,
    String(input.comfortState || '').trim().toLowerCase() !== 'inactive' ? 'reader_comfort' : null,
  ].filter(Boolean) as string[];
  const controllingAuthorities = new Set(
    [
      vetoAuthority,
      targetAuthority,
      movementEnvelopeAuthority,
      motionAuthority,
      smoothingAuthority !== 'none' ? smoothingAuthority : null,
    ].filter(Boolean) as string[],
  );
  const overruledAuthorities = activeAuthorities.filter((authority) => !controllingAuthorities.has(authority));

  return {
    movementAllowed,
    vetoAuthority,
    semanticTargetIdx,
    allowedTargetIdx,
    targetAuthority,
    movementEnvelopeAuthority,
    motionAuthority,
    smoothingAuthority,
    finalGear,
    finalMinStepPx,
    safetyClass,
    pocketState,
    oldPocketState,
    markerCenteredPocketState,
    markerViewportLine,
    readViewportLine,
    distanceFromMarkerLines,
    preferredTopLine,
    preferredBottomLine,
    movementEnvelopePx,
    movementEnvelopeReason,
    bridgeCueCapApplied,
    cappedTargetSafe,
    overruledAuthorities,
    reason,
  };
}
