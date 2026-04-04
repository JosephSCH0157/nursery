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
