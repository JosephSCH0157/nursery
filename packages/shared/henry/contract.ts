export type HenryMode =
  | "idle"
  | "warming"
  | "structuring"
  | "recording_ready"
  | "blocked"
  | "reviewing";

export type HenrySuggestionKind =
  | "question"
  | "clarify"
  | "structure"
  | "cadence"
  | "anvil_readiness"
  | "research_prompt"
  | "none";

export const HENRY_PRINCIPLES = {
  neverPush: true,
  preserveUserVoice: true,
  illuminateDontDirect: true,
  userOwnsTruth: true,
  aiMustBeExplicit: true,
  noHiddenAutomation: true,
} as const;

export const HENRY_HEARTH_SIGNAL_EVENT = "forge:henry:hearth-signal";

export interface HenrySuggestion {
  kind: HenrySuggestionKind;
  text: string;
}

export interface HearthHenrySignal {
  surface: "hearth";
  workspaceId: string | null;
  workpieceId: string | null;
  hasActiveSpark: boolean;
  hasDraft: boolean;
  tagValidationOk: boolean | null;
  hasPacingCues: boolean | null;
  isApprovedOrReady: boolean;
  updatedAtIso: string;
}

