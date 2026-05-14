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
    maxVelForErr = Math.min(maxVelForErr, input.minPxps);
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
