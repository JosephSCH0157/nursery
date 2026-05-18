export type VisualLeadClassification = {
  ahead: boolean;
  leadState: 'far_ahead' | 'ahead' | 'aligned_or_behind';
};

export type VisualHardHoldDecision = {
  shouldHold: boolean;
  readerPaceHold: boolean;
  reason?: 'governor_far_ahead' | 'reader_pace_hold';
};

export type VisualAdjacentCapDecision = {
  shouldApply: boolean;
};

export type VisualFollowVelocityDecision = {
  maxVelForErr: number;
};

export type BridgeVisualComfortCapDecision = {
  shouldApply: boolean;
  cappedPxps: number;
};

export type BridgeCommitComfortLeashDecision = {
  shouldHold: boolean;
};

export type LeadAwarePursuitCapDecision = {
  shouldApply: boolean;
  cappedPxps: number;
  reason?: 'reader_ahead_visual_pressure_reduced';
};

export type ReaderComfortBandDecision = {
  shouldHold: boolean;
  reason?:
    | 'next_line_above_comfort_band'
    | 'next_line_within_comfort_band'
    | 'current_line_near_top';
};

export type ReaderPressureVelocityDecision = {
  shouldApply: boolean;
  reducedPxps: number;
  reason?: 'reader_pressure_high_lead' | 'reader_pressure_ahead';
};

export type BottomRailReaderRoomRescuePlan = {
  shouldRescue: boolean;
  requestedDeltaPx: number;
  appliedDeltaPx: number;
  targetScrollTop: number;
  desiredLineY: number;
  bottomRailThresholdY: number;
};

export function classifyVisualLead(input: {
  speakableLead: number;
  renderedLead: number;
  softLeadStart: number;
  hardLeadStart: number;
}): VisualLeadClassification {
  const ahead = input.speakableLead > 0 || input.renderedLead > 0;
  const leadState =
    input.speakableLead >= input.hardLeadStart || input.renderedLead >= input.hardLeadStart
      ? 'far_ahead'
      : ((input.speakableLead >= input.softLeadStart || input.renderedLead >= input.softLeadStart)
        ? 'ahead'
        : (ahead ? 'ahead' : 'aligned_or_behind'));
  return { ahead, leadState };
}

export function shouldStopForVisualDeadband(input: {
  errPx: number;
  liveAsrFollowMode: boolean;
  stopDeadbandPx: number;
  deadbandPx: number;
  allowCreep: boolean;
}): boolean {
  if (input.errPx <= (input.liveAsrFollowMode ? input.stopDeadbandPx : 0.5)) return true;
  if (input.errPx <= input.deadbandPx && !input.allowCreep) return true;
  return false;
}

export function shouldHardHoldVisualFollow(input: {
  leadState: 'far_ahead' | 'ahead' | 'aligned_or_behind';
  markerLeadLines: number;
  readerDrivingNow: boolean;
  noSpeechMs: number;
  noSpeechHoldMs: number;
  maxMarkerLeadLines: number;
  hasRecentFinalTranscript: boolean;
}): VisualHardHoldDecision {
  const readerPaceHold =
    input.markerLeadLines >= input.maxMarkerLeadLines &&
    !input.readerDrivingNow &&
    input.noSpeechMs >= input.noSpeechHoldMs &&
    !input.hasRecentFinalTranscript;
  if (input.leadState === 'far_ahead') {
    return { shouldHold: true, readerPaceHold, reason: 'governor_far_ahead' };
  }
  if (readerPaceHold) {
    return { shouldHold: true, readerPaceHold, reason: 'reader_pace_hold' };
  }
  return { shouldHold: false, readerPaceHold };
}

export function shouldApplyNormalAdjacentCap(input: {
  now: number;
  boostUntilMs: number;
  liveHardHold: boolean;
  leadState: 'far_ahead' | 'ahead' | 'aligned_or_behind';
  errPx: number;
  minErrPx: number;
}): VisualAdjacentCapDecision {
  return {
    shouldApply:
      input.boostUntilMs > input.now &&
      !input.liveHardHold &&
      input.leadState === 'aligned_or_behind' &&
      input.errPx >= input.minErrPx,
  };
}

export function selectVisualFollowVelocity(input: {
  baseMaxVelForErr: number;
  liveHardHold: boolean;
  ahead: boolean;
  errPx: number;
  maxPxps: number;
  comfortablePxps: number;
  minPxps: number;
  hardCatchupPx: number;
  slowZonePx: number;
  unlockSlowFollowActive: boolean;
  unlockSlowFollowPxps: number;
}): VisualFollowVelocityDecision {
  let maxVelForErr = input.baseMaxVelForErr;
  if (input.liveHardHold) {
    maxVelForErr = 0;
  } else if (input.ahead) {
    maxVelForErr = Math.min(maxVelForErr, input.comfortablePxps);
  } else if (input.errPx >= input.hardCatchupPx) {
    maxVelForErr = Math.min(maxVelForErr, input.maxPxps);
  } else if (input.errPx >= input.slowZonePx) {
    maxVelForErr = Math.min(maxVelForErr, input.comfortablePxps);
  } else {
    // Smoothly ramp pursuit velocity inside the slow zone to avoid abrupt 20->8 style drops.
    const safeSlowZonePx = Math.max(1, input.slowZonePx);
    const rampT = Math.max(0, Math.min(1, input.errPx / safeSlowZonePx));
    const rampPxps = input.minPxps + (input.comfortablePxps - input.minPxps) * rampT;
    maxVelForErr = Math.min(maxVelForErr, rampPxps);
  }
  if (input.unlockSlowFollowActive) {
    maxVelForErr = Math.min(maxVelForErr, input.unlockSlowFollowPxps);
  }
  return { maxVelForErr };
}

export function selectBridgeVisualComfortCap(input: {
  liveAsrFollowMode: boolean;
  now: number;
  comfortUntilMs: number;
  deltaLines: number;
  basePxps: number;
  maxComfortDeltaLines: number;
  bridgeComfortPxps: number;
}): BridgeVisualComfortCapDecision {
  if (!input.liveAsrFollowMode) {
    return { shouldApply: false, cappedPxps: input.basePxps };
  }
  if (input.comfortUntilMs <= input.now) {
    return { shouldApply: false, cappedPxps: input.basePxps };
  }
  if (!(input.deltaLines > input.maxComfortDeltaLines)) {
    return { shouldApply: false, cappedPxps: input.basePxps };
  }
  return {
    shouldApply: true,
    cappedPxps: Math.min(input.basePxps, input.bridgeComfortPxps),
  };
}

export function shouldHoldBridgeCommitForVisualRecovery(input: {
  liveAsrFollowMode: boolean;
  now: number;
  comfortUntilMs: number;
  deltaLines: number;
  safeDeltaLines: number;
  bridgeLikeCommit: boolean;
  adjacentCommit: boolean;
  speechFresh: boolean;
}): BridgeCommitComfortLeashDecision {
  if (!input.liveAsrFollowMode) return { shouldHold: false };
  if (!input.bridgeLikeCommit || input.adjacentCommit) return { shouldHold: false };
  if (!input.speechFresh) return { shouldHold: false };
  if (input.comfortUntilMs <= input.now) return { shouldHold: false };
  if (!(input.deltaLines > input.safeDeltaLines)) return { shouldHold: false };
  return { shouldHold: true };
}

export function selectLeadAwarePursuitCap(input: {
  leadState: 'far_ahead' | 'ahead' | 'aligned_or_behind';
  speakableLead: number;
  renderedLead: number;
  speechFresh: boolean;
  basePxps: number;
  aheadCapPxps: number;
}): LeadAwarePursuitCapDecision {
  if (!input.speechFresh) {
    return { shouldApply: false, cappedPxps: input.basePxps };
  }
  const crowdingAhead =
    input.leadState === 'ahead' ||
    input.leadState === 'far_ahead' ||
    input.speakableLead >= 1 ||
    input.renderedLead >= 1;
  if (!crowdingAhead) {
    return { shouldApply: false, cappedPxps: input.basePxps };
  }
  return {
    shouldApply: input.basePxps > input.aheadCapPxps,
    cappedPxps: Math.min(input.basePxps, input.aheadCapPxps),
    reason: 'reader_ahead_visual_pressure_reduced',
  };
}

export function shouldHoldForReaderComfortBand(input: {
  currentLineY: number;
  nextLineY: number;
  comfortBandTop: number;
  comfortBandBottom: number;
}): ReaderComfortBandDecision {
  const currentNearTop = Number.isFinite(input.currentLineY) && input.currentLineY <= input.comfortBandTop;
  if (currentNearTop) {
    return { shouldHold: true, reason: 'current_line_near_top' };
  }
  const nextWithinBand =
    Number.isFinite(input.nextLineY) &&
    input.nextLineY >= input.comfortBandTop &&
    input.nextLineY <= input.comfortBandBottom;
  if (nextWithinBand) {
    return { shouldHold: true, reason: 'next_line_within_comfort_band' };
  }
  const nextAboveBand = Number.isFinite(input.nextLineY) && input.nextLineY < input.comfortBandTop;
  if (nextAboveBand) {
    return { shouldHold: true, reason: 'next_line_above_comfort_band' };
  }
  return { shouldHold: false };
}

export function selectReaderPressureVelocityCap(input: {
  speakableLead: number;
  renderedLead: number;
  basePxps: number;
  aheadPxps: number;
  highLeadPxps: number;
}): ReaderPressureVelocityDecision {
  const highLead = input.speakableLead >= 2 || input.renderedLead >= 3;
  if (highLead) {
    return {
      shouldApply: input.basePxps > input.highLeadPxps,
      reducedPxps: Math.min(input.basePxps, input.highLeadPxps),
      reason: 'reader_pressure_high_lead',
    };
  }
  const ahead = input.speakableLead >= 1 || input.renderedLead >= 1;
  if (ahead) {
    return {
      shouldApply: input.basePxps > input.aheadPxps,
      reducedPxps: Math.min(input.basePxps, input.aheadPxps),
      reason: 'reader_pressure_ahead',
    };
  }
  return { shouldApply: false, reducedPxps: input.basePxps };
}

export function planBottomRailReaderRoomRescue(input: {
  lineY: number;
  viewportHeight: number;
  markerY: number;
  lineHeightPx: number;
  currentScrollTop: number;
  maxScrollTop: number;
  desiredOffsetLines: number;
  maxMoveLines: number;
  bottomRailLines: number;
}): BottomRailReaderRoomRescuePlan {
  const safeLineHeightPx = Math.max(1, Number(input.lineHeightPx) || 0);
  const safeViewportHeight = Math.max(1, Number(input.viewportHeight) || 0);
  const safeCurrentScrollTop = Math.max(0, Number(input.currentScrollTop) || 0);
  const safeMaxScrollTop = Math.max(0, Number(input.maxScrollTop) || 0);
  const safeLineY = Number(input.lineY);
  if (!Number.isFinite(safeLineY) || safeLineY < 0 || safeLineY > safeViewportHeight) {
    return {
      shouldRescue: false,
      requestedDeltaPx: 0,
      appliedDeltaPx: 0,
      targetScrollTop: safeCurrentScrollTop,
      desiredLineY: Number(input.markerY) + Number(input.desiredOffsetLines) * safeLineHeightPx,
      bottomRailThresholdY: safeViewportHeight - Number(input.bottomRailLines) * safeLineHeightPx,
    };
  }
  const desiredLineY = Number(input.markerY) + Number(input.desiredOffsetLines) * safeLineHeightPx;
  const bottomRailThresholdY = safeViewportHeight - Number(input.bottomRailLines) * safeLineHeightPx;
  if (!(safeLineY >= bottomRailThresholdY)) {
    return {
      shouldRescue: false,
      requestedDeltaPx: 0,
      appliedDeltaPx: 0,
      targetScrollTop: safeCurrentScrollTop,
      desiredLineY,
      bottomRailThresholdY,
    };
  }
  const requestedDeltaPx = Math.max(0, safeLineY - desiredLineY);
  const maxMovePx = Math.max(0, Number(input.maxMoveLines) * safeLineHeightPx);
  const appliedDeltaPx = Math.max(
    0,
    Math.min(
      requestedDeltaPx,
      maxMovePx,
      Math.max(0, safeMaxScrollTop - safeCurrentScrollTop),
    ),
  );
  const targetScrollTop = Math.max(
    0,
    Math.min(safeMaxScrollTop, safeCurrentScrollTop + appliedDeltaPx),
  );
  return {
    shouldRescue: appliedDeltaPx > 0.5,
    requestedDeltaPx,
    appliedDeltaPx,
    targetScrollTop,
    desiredLineY,
    bottomRailThresholdY,
  };
}
