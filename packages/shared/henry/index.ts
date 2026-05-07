export type HenrySurface =
  | "forge-hub"
  | "bar-stock"
  | "hearth"
  | "tongs"
  | "anvil"
  | "hammer"
  | "quench"
  | "ledger"
  | "settings"
  | "unknown";

export type HenryMessageId = string;

export type HenryQuickActionId =
  | "what-next"
  | "explain-screen"
  | "optional-here"
  | "path-to-publish"
  | "show-unfinished"
  | "hide-tips"
  | "ask-henry";

export interface HenryQuickAction {
  id: HenryQuickActionId;
  label: string;
  enabled: boolean;
}

export interface HenryRecommendation {
  primary: string;
  why: string;
  alternatives: string[];
}

export interface HenryObservation {
  id: HenryMessageId;
  text: string;
  surface: HenrySurface;
}

export interface HenrySuppressionState {
  isSuppressed: boolean;
  reasons: string[];
}

export interface HenryPreferenceState {
  showHenry: boolean;
  hideTips: boolean;
  mutedUntil: string | null;
  openLastTab: boolean;
}

export interface HenryConversationTurn {
  role: "user" | "assistant";
  text: string;
  timestampIso: string;
}

export interface HenryContext {
  surface: HenrySurface;
  routePath: string;
  workspaceId: string | null;
  workpieceId: string | null;
  episodeTitle: string | null;
  phase: "script" | "record" | "edit" | "release" | "analytics" | null;
  displayStatus: string | null;
  episodeContextState: "none" | "loading" | "active" | "missing";
  workspaceResolutionState: "ready" | "resolving" | "missing";
}

export * from "./contract";
