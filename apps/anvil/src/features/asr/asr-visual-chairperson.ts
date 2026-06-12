import type {
  AsrRecoveryEpisode,
  AsrRecoveryKind,
  AsrScrollDecision,
  AsrSemanticSnapshot,
  AsrVisualAnchor,
  AsrVisualControlIntent,
  AsrVisualMode,
} from './asr-scroll-driver.types';

export type AsrVisualChairpersonInput = {
  nowMs: number;
  currentScrollTop: number;
  maxScrollTop: number;
  lineHeightPx: number;
  markerY: number;
  preferredBandTop: number;
  preferredBandBottom: number;
  toleratedBandBottom: number;
  semanticSnapshot: AsrSemanticSnapshot;
  visualAnchor: AsrVisualAnchor;
  currentLineIdx: number;
  committedLineIdx: number;
  selectedTargetScrollTop: number;
  selectedAuthority: string;
  selectedReason: string;
  speechFresh: boolean;
  finalFresh: boolean;
  sessionLive: boolean;
  asrMode: boolean;
  noMatchOrOffscript: boolean;
  hardContradiction: boolean;
  bridgeContextActive: boolean;
  trueVisualSilence: boolean;
  previousMode: AsrVisualMode;
  previousTargetScrollTop: number;
  settleUntilMs: number;
  activeRecoveryEpisode: AsrRecoveryEpisode | null;
};

export type AsrVisualChairpersonOutput = {
  decision: AsrScrollDecision;
  pocketBand: 'preferred' | 'tolerated' | 'recovery' | 'above';
  anchorGapPx: number;
  semanticAheadLines: number;
  backwardTargetRejected: boolean;
  safeForwardTargetSuppressed: boolean;
  minForwardStepPx: number;
};

const CHAIRPERSON_RECOVERY_MIN_TARGET_DEBT_PX = 120;

function describeProtection(reason: string, mode: AsrVisualMode): {
  controlIntent: AsrVisualControlIntent;
  recoveryKind: AsrRecoveryKind;
  isTrueVisualRecovery: boolean;
  isForwardProtection: boolean;
} {
  if (reason === 'visual_debt') {
    return {
      controlIntent: 'recover',
      recoveryKind: 'visual_debt',
      isTrueVisualRecovery: true,
      isForwardProtection: false,
    };
  }
  if (reason === 'semantic_ahead') {
    return {
      controlIntent: 'forward_protect',
      recoveryKind: 'semantic_ahead',
      isTrueVisualRecovery: false,
      isForwardProtection: true,
    };
  }
  if (mode === 'hold') {
    return {
      controlIntent: 'hold',
      recoveryKind: 'none',
      isTrueVisualRecovery: false,
      isForwardProtection: false,
    };
  }
  if (mode === 'settle') {
    return {
      controlIntent: 'settle',
      recoveryKind: 'none',
      isTrueVisualRecovery: false,
      isForwardProtection: false,
    };
  }
  return {
    controlIntent: 'track',
    recoveryKind: 'none',
    isTrueVisualRecovery: false,
    isForwardProtection: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function classifyPocketBand(args: {
  anchorViewportY: number;
  preferredBandTop: number;
  preferredBandBottom: number;
  toleratedBandBottom: number;
}): 'preferred' | 'tolerated' | 'recovery' | 'above' {
  const y = args.anchorViewportY;
  if (!Number.isFinite(y)) return 'recovery';
  if (y >= args.preferredBandTop && y <= args.preferredBandBottom) return 'preferred';
  if (y > args.preferredBandBottom && y <= args.toleratedBandBottom) return 'tolerated';
  if (y > args.toleratedBandBottom) return 'recovery';
  return 'above';
}

export function evaluateAsrVisualChairperson(
  input: AsrVisualChairpersonInput,
): AsrVisualChairpersonOutput {
  const currentScrollTop = safeNumber(input.currentScrollTop, 0);
  const maxScrollTop = Math.max(currentScrollTop, safeNumber(input.maxScrollTop, currentScrollTop));
  const selectedTargetScrollTop = clamp(
    safeNumber(input.selectedTargetScrollTop, currentScrollTop),
    0,
    maxScrollTop,
  );
  const lineHeightPx = clamp(safeNumber(input.lineHeightPx, 56), 12, 320);
  const anchorViewportY = safeNumber(input.visualAnchor.anchorViewportY, Number.NaN);
  const anchorGapPx =
    Number.isFinite(anchorViewportY) && Number.isFinite(input.markerY)
      ? anchorViewportY - input.markerY
      : Number.NaN;
  const pocketBand = classifyPocketBand({
    anchorViewportY,
    preferredBandTop: input.preferredBandTop,
    preferredBandBottom: input.preferredBandBottom,
    toleratedBandBottom: input.toleratedBandBottom,
  });
  const semanticAheadLines = Math.max(0, input.semanticSnapshot.lineIdx - input.visualAnchor.anchorLineIdx);
  const selectedTargetDebtPx = Math.max(0, selectedTargetScrollTop - currentScrollTop);
  const blockersActive =
    !input.sessionLive ||
    !input.asrMode ||
    input.noMatchOrOffscript ||
    input.hardContradiction ||
    input.bridgeContextActive ||
    input.trueVisualSilence ||
    !input.speechFresh ||
    !input.finalFresh;
  const activeRecoveryEpisode =
    !!input.activeRecoveryEpisode &&
    input.activeRecoveryEpisode.expiresAt > input.nowMs &&
    Number.isFinite(input.activeRecoveryEpisode.protectedTargetScrollTop);
  const chairpersonRecoveryDebtEligible =
    selectedTargetDebtPx >= CHAIRPERSON_RECOVERY_MIN_TARGET_DEBT_PX;
  const protectedTargetScrollTop = activeRecoveryEpisode
    ? clamp(input.activeRecoveryEpisode!.protectedTargetScrollTop, currentScrollTop, maxScrollTop)
    : Number.NaN;
  const recoveryNeeded =
    activeRecoveryEpisode ||
    (chairpersonRecoveryDebtEligible && (pocketBand === 'recovery' || semanticAheadLines >= 1));
  let mode: AsrVisualMode;
  if (blockersActive) mode = 'hold';
  else if (
    (input.previousMode === 'recover' || input.previousMode === 'settle') &&
    (activeRecoveryEpisode || input.settleUntilMs > input.nowMs) &&
    (pocketBand === 'preferred' || pocketBand === 'tolerated')
  ) mode = 'settle';
  else if (recoveryNeeded) mode = 'recover';
  else mode = 'track';

  let targetScrollTop = selectedTargetScrollTop;
  let backwardAllowed = mode === 'track';
  let preserveUntilMs = activeRecoveryEpisode ? input.activeRecoveryEpisode!.expiresAt : 0;
  let authority: AsrScrollDecision['authority'] = 'track_follow';
  let reason = input.selectedReason || 'legacy_selected_target';
  let minForwardStepPx = 0;

  if (mode === 'hold') {
    authority = 'hold';
    reason = blockersActive ? 'hard_blocker_active' : 'hold';
    backwardAllowed = false;
    targetScrollTop = currentScrollTop;
  } else if (mode === 'recover') {
    authority = semanticAheadLines >= 1 ? 'recover_semantic_ahead' : 'recover_visual_debt';
    reason = semanticAheadLines >= 1 ? 'semantic_ahead' : 'visual_debt';
    backwardAllowed = false;
    minForwardStepPx = clamp(lineHeightPx * 0.5, 12, lineHeightPx);
    targetScrollTop = Math.max(
      currentScrollTop,
      selectedTargetScrollTop,
      Number.isFinite(protectedTargetScrollTop) ? protectedTargetScrollTop : currentScrollTop,
    );
    if (targetScrollTop <= currentScrollTop + 0.5 && pocketBand === 'recovery') {
      targetScrollTop = clamp(currentScrollTop + minForwardStepPx, currentScrollTop, maxScrollTop);
    }
  } else if (mode === 'settle') {
    authority = 'settle_hold';
    reason = activeRecoveryEpisode ? 'recovery_episode_settle' : 'post_recover_settle';
    backwardAllowed = !activeRecoveryEpisode && input.settleUntilMs <= input.nowMs;
    targetScrollTop = activeRecoveryEpisode
      ? Math.max(
          currentScrollTop,
          selectedTargetScrollTop,
          Number.isFinite(protectedTargetScrollTop) ? protectedTargetScrollTop : currentScrollTop,
        )
      : selectedTargetScrollTop;
    preserveUntilMs = Math.max(
      preserveUntilMs,
      input.settleUntilMs > input.nowMs ? input.settleUntilMs : 0,
    );
  } else {
    authority = 'track_follow';
    reason = input.selectedReason || 'track_follow';
    backwardAllowed = pocketBand === 'preferred' || pocketBand === 'tolerated';
  }

  const backwardTargetRejected =
    selectedTargetScrollTop < currentScrollTop - 0.5 &&
    !backwardAllowed &&
    targetScrollTop >= currentScrollTop - 0.5;
  const safeForwardTargetSuppressed =
    mode === 'recover' &&
    Number.isFinite(protectedTargetScrollTop) &&
    selectedTargetScrollTop < protectedTargetScrollTop - 0.5 &&
    targetScrollTop >= protectedTargetScrollTop - 0.5;
  const protection = describeProtection(reason, mode);

  return {
    decision: {
      mode,
      anchorLineIdx: input.visualAnchor.anchorLineIdx,
      authority,
      targetScrollTop,
      maxVelocityPxps: mode === 'recover' ? 220 : (mode === 'settle' ? 80 : (mode === 'hold' ? 0 : 16)),
      backwardAllowed,
      preserveUntilMs,
      reason,
      controlIntent: protection.controlIntent,
      recoveryKind: protection.recoveryKind,
      isTrueVisualRecovery: protection.isTrueVisualRecovery,
      isForwardProtection: protection.isForwardProtection,
    },
    pocketBand,
    anchorGapPx,
    semanticAheadLines,
    backwardTargetRejected,
    safeForwardTargetSuppressed,
    minForwardStepPx,
  };
}
