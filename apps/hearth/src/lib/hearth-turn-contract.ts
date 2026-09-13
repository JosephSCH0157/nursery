import type { HearthOp } from "./hearth-ai-ops";
import type { HearthResearchResult } from "./hearth-research-contract";

export type HearthProductionAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "release_prep_pack";
export type HearthOutputPreference = "explore_expand" | "full_script" | "bullet_outline";

export type HearthTurnMode =
  | "conversation"
  | "listening"
  | "research"
  | "outline_generate"
  | "script_generate"
  | "script_mutate"
  | "readiness_review"
  | "production_action";

export type HearthExplicitUiAction =
  | { kind: "conversation" }
  | { kind: "listening" }
  | { kind: "research" }
  | { kind: "generate_outline" }
  | { kind: "generate_script" }
  | { kind: "mutate_script" }
  | { kind: "readiness_review" }
  | { kind: "production"; action: HearthProductionAction };

export type HearthLifecycleState = {
  hasDraft: boolean;
  hasApprovedScript: boolean;
  isReady: boolean;
};

export type HearthTurnDecision = {
  mode: HearthTurnMode;
  requiresArtifact: boolean;
  allowsMutation: boolean;
  retrievalScope: "active_episode_only" | "explicit_cross_episode";
  requestedArtifact: "research" | "outline" | "script" | "production" | null;
  reasons: string[];
};

export type HearthValidatedArtifact =
  | { kind: "research"; value: HearthResearchResult }
  | { kind: "outline"; text: string }
  | { kind: "script"; text: string }
  | { kind: "production"; action: HearthProductionAction; value: unknown };

export type HearthTurnFailureKind =
  | "none"
  | "admission_failure"
  | "provider_failure"
  | "invalid_model_output"
  | "identity_mismatch"
  | "persistence_failure";

export type HearthTurnResult = {
  decision: HearthTurnDecision;
  assistantMessage: string;
  artifact: HearthValidatedArtifact | null;
  operations: HearthOp[];
  validation: {
    ok: boolean;
    failureKind: HearthTurnFailureKind;
    message: string | null;
  };
  persistence: "not_attempted" | "pending" | "saved" | "failed";
};

export function buildHearthTurnResult(args: {
  decision: HearthTurnDecision;
  assistantMessage: string;
  artifact?: HearthValidatedArtifact | null;
  operations?: HearthOp[];
  failureKind?: HearthTurnFailureKind;
  failureMessage?: string | null;
  persistence?: HearthTurnResult["persistence"];
}): HearthTurnResult {
  const failureKind = args.failureKind ?? "none";
  return {
    decision: args.decision,
    assistantMessage: args.assistantMessage,
    artifact: args.artifact ?? null,
    operations: args.operations ?? [],
    validation: {
      ok: failureKind === "none",
      failureKind,
      message: args.failureMessage ?? null,
    },
    persistence: args.persistence ?? "not_attempted",
  };
}
