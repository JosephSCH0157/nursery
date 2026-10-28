export type HammerPrepAiEffectiveLane = "forge-managed" | "personal-byo" | "ai-disabled";

export type HammerPrepAiNoticeModel = {
  title: "Preparing this episode";
  body: string;
  laneDetail: string;
  prepAllowed: boolean;
  laneSignature: HammerPrepAiEffectiveLane;
};

const PREP_AI_NOTICE_TITLE = "Preparing this episode" as const;

const FORGE_LANE_BODY =
  "This step may use AI to generate a transcript and prepare your editing workspace. AI usage may consume credits depending on your settings.";
const FORGE_LANE_DETAIL = "Uses Forge-managed AI.";

const BYO_LANE_BODY =
  "This step may use AI to generate a transcript and prepare your editing workspace.";
const BYO_LANE_DETAIL = "Uses your personal AI provider.";

const DISABLED_LANE_BODY =
  "AI is currently disabled. Episode prep will only continue if reusable prep artifacts or an existing transcript are available.";
const DISABLED_LANE_DETAIL = "No new AI transcription will be started.";

export function buildHammerPrepAiNoticeModel(
  lane: HammerPrepAiEffectiveLane,
): HammerPrepAiNoticeModel {
  if (lane === "forge-managed") {
    return {
      title: PREP_AI_NOTICE_TITLE,
      body: FORGE_LANE_BODY,
      laneDetail: FORGE_LANE_DETAIL,
      prepAllowed: true,
      laneSignature: "forge-managed",
    };
  }

  if (lane === "personal-byo") {
    return {
      title: PREP_AI_NOTICE_TITLE,
      body: BYO_LANE_BODY,
      laneDetail: BYO_LANE_DETAIL,
      prepAllowed: true,
      laneSignature: "personal-byo",
    };
  }

  return {
    title: PREP_AI_NOTICE_TITLE,
    body: DISABLED_LANE_BODY,
    laneDetail: DISABLED_LANE_DETAIL,
    prepAllowed: false,
    laneSignature: "ai-disabled",
  };
}

export function shouldShowHammerPrepAiNotice(args: {
  effectiveLane: HammerPrepAiEffectiveLane;
  acknowledgedLaneSignature: string | null;
}): boolean {
  return args.acknowledgedLaneSignature !== args.effectiveLane;
}

export function buildHammerPrepAiNoticeApprovalKey(
  runKey: string,
  lane: HammerPrepAiEffectiveLane,
): string {
  return `${runKey}:lane:${lane}`;
}

export type HammerPrepAiNoticeContinueResult =
  | {
      ok: true;
      runKey: string;
      approvalKey: string;
    }
  | {
      ok: false;
      reason: "missing_pending_attempt" | "pending_attempt_changed" | "acknowledgement_persistence_failed";
      message: string;
    };

export async function continueHammerPrepAiNotice(args: {
  pendingRunKey: string | null;
  effectiveLane: HammerPrepAiEffectiveLane;
  dontShowAgain: boolean;
  persistAcknowledgedLane?: (lane: HammerPrepAiEffectiveLane) => void | Promise<void>;
  isPendingRunKeyCurrent?: (runKey: string) => boolean;
}): Promise<HammerPrepAiNoticeContinueResult> {
  if (!args.pendingRunKey) {
    return {
      ok: false,
      reason: "missing_pending_attempt",
      message: "Hammer could not identify the preparation attempt to continue.",
    };
  }

  if (args.dontShowAgain) {
    if (!args.persistAcknowledgedLane) {
      return {
        ok: false,
        reason: "acknowledgement_persistence_failed",
        message: "Hammer could not save this AI notice preference. Try again or clear Don't show this again.",
      };
    }
    try {
      await args.persistAcknowledgedLane(args.effectiveLane);
    } catch {
      return {
        ok: false,
        reason: "acknowledgement_persistence_failed",
        message: "Hammer could not save this AI notice preference. Try again or clear Don't show this again.",
      };
    }
  }

  if (args.isPendingRunKeyCurrent && !args.isPendingRunKeyCurrent(args.pendingRunKey)) {
    return {
      ok: false,
      reason: "pending_attempt_changed",
      message: "The preparation attempt changed before Hammer could continue.",
    };
  }

  return {
    ok: true,
    runKey: args.pendingRunKey,
    approvalKey: buildHammerPrepAiNoticeApprovalKey(args.pendingRunKey, args.effectiveLane),
  };
}
