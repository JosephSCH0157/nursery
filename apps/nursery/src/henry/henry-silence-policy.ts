import type {
  HearthHenrySignal,
  HenryContext,
  HenryMode,
  HenrySuggestion,
  HenrySuggestionKind,
} from "@forge/shared/henry";

export type HenrySuppressionReason =
  | "user_is_typing"
  | "recently_suggested_same_kind"
  | "already_recording_ready"
  | "no_meaningful_change"
  | "surface_not_hearth"
  | "user_muted_henry"
  | "suggestion_too_weak"
  | "none";

export type HenrySilencePolicyHistory = {
  nowMs: number;
  explicitUserInvocation: boolean;
  userIsTyping: boolean;
  userMutedHenry: boolean;
  previousMode: HenryMode | null;
  previousTagValidationOk: boolean | null;
  lastSignalFingerprint: string | null;
  lastSuggestionKind: HenrySuggestionKind | null;
  lastSuggestionAtMs: number | null;
};

type HenrySilencePolicyInput = {
  context: HenryContext;
  signal: HearthHenrySignal | null;
  mode: HenryMode | null;
  suggestion: HenrySuggestion | null;
  history: HenrySilencePolicyHistory;
};

const SAME_KIND_COOLDOWN_MS = 90_000;

function buildSignalFingerprint(signal: HearthHenrySignal | null): string | null {
  if (!signal) return null;
  return [
    signal.workspaceId ?? "none",
    signal.workpieceId ?? "none",
    signal.hasActiveSpark ? "spark:1" : "spark:0",
    signal.hasDraft ? "draft:1" : "draft:0",
    signal.tagValidationOk === null ? "tag:null" : `tag:${signal.tagValidationOk ? 1 : 0}`,
    signal.hasPacingCues === null ? "pace:null" : `pace:${signal.hasPacingCues ? 1 : 0}`,
    signal.isApprovedOrReady ? "ready:1" : "ready:0",
  ].join("|");
}

function isSuggestionTooWeak(suggestion: HenrySuggestion | null): boolean {
  if (!suggestion) return true;
  if (suggestion.kind === "none") return true;
  const text = suggestion.text.trim();
  if (text.length < 18) return true;
  if (/^(looks good|all set|okay|sounds fine)\.?$/i.test(text)) return true;
  return false;
}

export function getHenrySuppressionReason(input: HenrySilencePolicyInput): HenrySuppressionReason {
  const { context, signal, mode, suggestion, history } = input;

  if (context.surface !== "hearth") return "surface_not_hearth";
  if (history.userMutedHenry) return "user_muted_henry";
  if (history.userIsTyping && !history.explicitUserInvocation) return "user_is_typing";
  if (isSuggestionTooWeak(suggestion)) return "suggestion_too_weak";

  const currentFingerprint = buildSignalFingerprint(signal);
  const noMeaningfulChange = currentFingerprint !== null
    && history.lastSignalFingerprint === currentFingerprint
    && history.previousMode === mode;

  if (noMeaningfulChange && !history.explicitUserInvocation) return "no_meaningful_change";

  const becameBlocked = mode === "blocked" && history.previousTagValidationOk !== false;
  const becameRecordingReady = mode === "recording_ready" && history.previousMode !== "recording_ready";

  if (mode === "recording_ready" && !becameRecordingReady && !history.explicitUserInvocation) {
    return "already_recording_ready";
  }

  if (!history.explicitUserInvocation && !becameBlocked) {
    const sameKindRecently = history.lastSuggestionKind === suggestion?.kind
      && history.lastSuggestionAtMs !== null
      && (history.nowMs - history.lastSuggestionAtMs) < SAME_KIND_COOLDOWN_MS;
    if (sameKindRecently) return "recently_suggested_same_kind";
  }

  return "none";
}

export function shouldHenrySurfaceSuggestion(input: HenrySilencePolicyInput): boolean {
  return getHenrySuppressionReason(input) === "none";
}

export function buildHenrySignalFingerprint(signal: HearthHenrySignal | null): string | null {
  return buildSignalFingerprint(signal);
}

