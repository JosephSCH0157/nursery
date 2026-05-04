import type {
  HearthHenrySignal,
  HenryAILane,
  HenryContext,
  HenryMode,
  HenryObservation,
  HenryRecommendation,
  HenrySuggestion,
} from "@forge/shared/henry";
import type { EpisodeStatusSignals } from "../workspace/resolveEpisodeStatus";
import { resolveNextEpisodeAction } from "../workspace/resolveNextEpisodeAction";
import { buildHenryUserMeteredBoundaryReply, classifyHenryAiLane } from "./henry-ai-cost-policy";
import { resolveStagePurpose } from "./henryContext";
import { buildHenryHearthChatAnswer } from "./henry-deterministic-suggestions";
import { getHenryNextStep } from "./henry-next-step";
import { normalizeHenryVoice } from "./henry-voice";

type HenryBehaviorOptions = {
  mode?: HenryMode | null;
  suggestion?: HenrySuggestion | null;
  hearthSignal?: HearthHenrySignal | null;
};

export type HenryChatReply = {
  lane: HenryAILane;
  text: string;
};

function buildHenryOptionalHereAnswer(context: HenryContext): string {
  if (context.surface === "hearth") {
    const phaseNote = context.phase === "script"
      ? "In Hearth, drafting and structure choices are iterative."
      : "In Hearth, shaping choices stay reversible while you refine.";
    return `${phaseNote} Keep the core claim clear, then tighten pacing when you want Anvil-ready read-aloud flow.`;
  }
  return "Most controls here are optional unless marked required. Keep progress in place and move forward when the output is usable.";
}

function buildHenryActiveHelpAnswer(
  question: string,
  context: HenryContext,
  options?: HenryBehaviorOptions,
): string | null {
  const lower = question.toLowerCase();

  if (/how do i create images|how to create images|create images|image flow|visual flow/.test(lower)) {
    return "Use Hearth image or visual flows to define what you want on-screen, then run explicit generation actions from those controls. Henry tips do not generate assets by themselves, and full image generation stays in the normal AI or asset lane when enabled.";
  }

  if (/where does .*episode.*record|where .*episode.*get recorded|where does recording happen|where .*recorded/.test(lower)) {
    return "Recording happens in Anvil. Hearth shapes the script, Anvil captures the performance, Hammer handles edits, and Quench handles release.";
  }

  if (lower.includes("optional") || lower.includes("required")) {
    return buildHenryOptionalHereAnswer(context);
  }

  if (lower.includes("next")) {
    return buildHenryActionAnswer("what-next", context, options);
  }

  return null;
}

export function buildHenryContextSummary(context: HenryContext): string[] {
  const locationLine = context.surface === "forge-hub"
    ? "You are in the Forge hub."
    : `You are in ${context.surface}.`;
  const purposeLine = `This stage is for ${resolveStagePurpose(context.surface).toLowerCase()}`;
  const optionalLine = "Most fields and choices here are optional unless marked otherwise.";
  const safetyLine = "Nothing on this screen should force an irreversible step.";
  return [locationLine, purposeLine, optionalLine, safetyLine];
}

function normalizeSignalsFromDisplayStatus(displayStatus: string | null): EpisodeStatusSignals {
  switch ((displayStatus ?? "").toLowerCase()) {
    case "scripted":
    case "ready to record":
      return { hasApprovedScript: true };
    case "scheduled":
      return { hasApprovedScript: true, recordingSessionStatus: "planned" };
    case "recording":
      return { hasApprovedScript: true, recordingSessionStatus: "active" };
    case "recorded":
      return { hasKeptTake: true, recordingSessionStatus: "completed" };
    case "editing":
      return { hasEditorSession: true, hasKeptTake: true, hammerPrepStatus: "preparing" };
    case "edited":
    case "ready to release":
      return { hasEditorSession: true, hasKeptTake: true, hammerPrepStatus: "prepared" };
    case "releasing":
      return { releaseState: "prepared", hammerPrepStatus: "prepared", hasEditorSession: true };
    case "released":
      return { releaseState: "published" };
    default:
      return {};
  }
}

export function resolveHenryRecommendation(context: HenryContext): HenryRecommendation {
  const signals = normalizeSignalsFromDisplayStatus(context.displayStatus);
  const phase = context.phase ?? "script";
  const nextAction = resolveNextEpisodeAction(phase, signals);
  const primary = nextAction
    ? nextAction.label
    : "Review where this episode is and choose the next safe step.";
  const why = nextAction
    ? `This aligns with the current ${phase} stage and visible episode state.`
    : "No single required move is detected, so optional paths stay open.";
  const alternatives = phase === "script"
    ? ["Keep drafting and leave this in progress.", "Move to recording when the script feels ready."]
    : phase === "record"
    ? ["Return to script for refinements.", "Keep preparation in progress and record later."]
    : phase === "edit"
    ? ["Continue editing without publishing yet.", "Return to recording if a retake is needed."]
    : phase === "release"
    ? ["Prepare metadata now and publish later.", "Return upstream to revise edit outputs first."]
    : ["Open Hearth to continue shaping the episode.", "Open Quench when outputs are ready to release."];

  return {
    primary,
    why,
    alternatives: alternatives.slice(0, 2),
  };
}

export function resolveHenryObservation(context: HenryContext): HenryObservation | null {
  const surface = context.surface;
  if (surface === "unknown" || surface === "settings") return null;

  if (surface === "bar-stock") {
    return { id: "bar-stock:idea-capture", text: "One rough idea is enough to begin here.", surface };
  }
  if (surface === "hearth") {
    return { id: "hearth:ready-means-recordable", text: "Ready means recordable, not perfect.", surface };
  }
  if (surface === "tongs") {
    return { id: "tongs:schedule-vs-ready", text: "Scheduling coordinates timing; it does not change script content.", surface };
  }
  if (surface === "anvil") {
    return { id: "anvil:discard-safe", text: "Discarding a take does not remove the underlying script.", surface };
  }
  if (surface === "hammer") {
    return { id: "hammer:original-safe", text: "Editing here does not overwrite the original recording.", surface };
  }
  if (surface === "quench") {
    return { id: "quench:optional-fields", text: "Not every release field is required to proceed.", surface };
  }
  if (surface === "ledger") {
    return { id: "ledger:feedback-loop", text: "Insights here help decide what to improve upstream.", surface };
  }
  return { id: "forge-hub:choose-path", text: "You can start with any stage and iterate.", surface: "forge-hub" };
}

export function buildHenryActionAnswer(
  actionId: string,
  context: HenryContext,
  options?: HenryBehaviorOptions,
): string {
  if (actionId === "explain-screen") {
    return buildHenryContextSummary(context).join("\n");
  }
  if (actionId === "optional-here") {
    return "Most creators treat this stage as iterative. You can keep work in progress and return later.";
  }
  if (actionId === "path-to-publish") {
    return "Typical path: idea capture -> script shaping -> recording -> editing -> release.";
  }
  if (actionId === "show-unfinished") {
    return "Unfinished work stays valid. You can continue from the current phase without losing prior progress.";
  }
  if (actionId === "what-next") {
    if (context.surface === "hearth") {
      const hearthNextStep = getHenryNextStep(context, options?.hearthSignal ?? null);
      if (hearthNextStep) return normalizeHenryVoice(hearthNextStep);
    }
    const rec = resolveHenryRecommendation(context);
    return [
      `Best next step: ${rec.primary}`,
      `Why: ${rec.why}`,
      `You could also: ${rec.alternatives.join(" or ")}`,
    ].join("\n");
  }
  return "I can explain this stage and suggest the next safe move when you ask.";
}

export function buildHenryChatAnswer(
  question: string,
  context: HenryContext,
  options?: HenryBehaviorOptions,
): string {
  return buildHenryChatReply(question, context, options).text;
}

export function buildHenryChatReply(
  question: string,
  context: HenryContext,
  options?: HenryBehaviorOptions,
): HenryChatReply {
  const lane = classifyHenryAiLane(question, context);
  if (lane === "user_metered") {
    return {
      lane,
      text: normalizeHenryVoice(buildHenryUserMeteredBoundaryReply()),
    };
  }

  const activeHelpAnswer = buildHenryActiveHelpAnswer(question, context, options);
  if (activeHelpAnswer) {
    return {
      lane,
      text: normalizeHenryVoice(activeHelpAnswer),
    };
  }

  const hearthAnswer = buildHenryHearthChatAnswer({
    question,
    context,
    mode: options?.mode ?? null,
    suggestion: options?.suggestion ?? null,
  });
  if (hearthAnswer) {
    return {
      lane,
      text: normalizeHenryVoice(hearthAnswer),
    };
  }

  return {
    lane,
    text: normalizeHenryVoice("I may be missing the exact context. Tell me which surface you are in, and I will point to the owning tool and the next safe step."),
  };
}
