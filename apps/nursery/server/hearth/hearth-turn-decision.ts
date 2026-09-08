import {
  isExplicitHearthFullScriptRequest,
  isExplicitHearthOutlineRequest,
} from "../../../hearth/src/lib/hearth-writing-format";
import { detectHearthScriptMutationIntent } from "../../../hearth/src/lib/hearth-script-mutation";
import type {
  HearthExplicitUiAction,
  HearthLifecycleState,
  HearthTurnDecision,
  HearthTurnMode,
} from "../../../hearth/src/lib/hearth-turn-contract";
import type { HearthOp } from "../../../hearth/src/lib/hearth-ai-ops";

const LISTENING_RE = /\b(?:are you with me(?: so far)?|do you follow(?: me)?|tracking(?: with me)?|you with me)\b/i;
const NO_EDIT_RE = /\b(?:do not|don't|dont|not asking (?:you )?to|didn't ask (?:you )?to|did not ask (?:you )?to|without)\b[^.!?\n]{0,80}\b(?:edit|change|rewrite|revise|update|apply|touch|modify|mutate)\b|\b(?:talk|discussion|discuss|conversation|explore)\b[^.!?\n]{0,80}\b(?:before|instead of|not)\b[^.!?\n]{0,40}\b(?:edit|change|rewrite|revise|update|apply)/i;
const DISCUSSION_RE = /\b(?:how|what|where|whether|should|could|would)\b[^.!?\n]{0,100}\b(?:change|changes|update|revise|rewrite|move|frame|strengthen|get .* across)\b/i;
const READINESS_RE = /\b(?:are we ready|ready to record|record now|can i record|good to record|ready for anvil|ship this|go live)\b/i;
const RESEARCH_RE = /\b(?:browse|look up|lookup|find(?: me)?|search|research|retrieval|web research|live research|news|reports?|reporting|sources?|citations?|evidence|verify|fact[- ]?check|corroborat)\b/i;
const URL_RE = /\bhttps?:\/\//i;
const FACT_QUESTION_RE = /\b(?:who|what|when|where|why|how (?:much|many|long|often)|what caused|what led to)\b/i;
const NON_RESEARCH_QUESTION_RE = /\b(?:what do you think|how does this (?:sound|read|feel)|should (?:i|we)|can (?:i|we)|help me (?:write|draft|revise|rewrite)|are you with me|do you follow)\b/i;
const CROSS_EPISODE_RE = /\b(?:other|another|previous|prior|earlier|last)\b[^.!?\n]{0,80}\b(?:episode|project|draft|script|conversation)\b|\b(?:episode|project|draft|script|conversation)\b[^.!?\n]{0,80}\b(?:other|another|previous|prior|earlier|last)\b|\b(?:workspace)\b[^.!?\n]{0,100}\b(?:compare|reference|use|pull|find|load|open)\b|\b(?:compare|reference|use|pull|find|load|open)\b[^.!?\n]{0,100}\bworkspace\b/i;
const NEW_SCRIPT_RE = /\b(?:write|create|make|build|give me|draft)\b[^.!?\n]{0,80}\b(?:full )?script\b|\b(?:turn|shape|make)\b[^.!?\n]{0,40}\b(?:this|that|it)\b[^.!?\n]{0,30}\binto\b[^.!?\n]{0,20}\bscript\b/i;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function actionMode(action: HearthExplicitUiAction | null): HearthTurnMode | null {
  if (!action) return null;
  if (action.kind === "generate_outline") return "outline_generate";
  if (action.kind === "generate_script") return "script_generate";
  if (action.kind === "mutate_script") return "script_mutate";
  if (action.kind === "readiness_review") return "readiness_review";
  if (action.kind === "production") return "production_action";
  return action.kind;
}

function decisionForMode(args: {
  mode: HearthTurnMode;
  lifecycle: HearthLifecycleState;
  retrievalScope: HearthTurnDecision["retrievalScope"];
  reasons: string[];
}): HearthTurnDecision {
  const requestedArtifact = args.mode === "research"
    ? "research"
    : args.mode === "outline_generate"
      ? "outline"
      : args.mode === "script_generate" || args.mode === "script_mutate"
        ? "script"
        : args.mode === "production_action"
          ? "production"
          : null;
  const requiresArtifact = requestedArtifact !== null;
  const hasMutationTarget = args.mode !== "script_mutate" || args.lifecycle.hasDraft;
  const allowsMutation = args.mode === "script_mutate" && hasMutationTarget;
  const reasons = [...args.reasons];
  if (args.mode === "script_mutate" && !args.lifecycle.hasDraft) reasons.push("canonical_draft_missing");
  if (args.mode === "production_action" && !args.lifecycle.hasApprovedScript) reasons.push("approved_script_missing");
  return {
    mode: args.mode,
    requiresArtifact,
    allowsMutation,
    retrievalScope: args.retrievalScope,
    requestedArtifact,
    reasons,
  };
}

export function resolveHearthTurnDecision(args: {
  creatorText: string;
  explicitAction: HearthExplicitUiAction | null;
  lifecycle: HearthLifecycleState;
}): HearthTurnDecision {
  const creatorText = normalize(args.creatorText);
  const retrievalScope = CROSS_EPISODE_RE.test(creatorText)
    ? "explicit_cross_episode" as const
    : "active_episode_only" as const;
  const reasons: string[] = [];
  let mode: HearthTurnMode = "conversation";

  if (LISTENING_RE.test(creatorText)) {
    mode = "listening";
    reasons.push("creator_requested_acknowledgement");
  } else {
    const explicitMode = actionMode(args.explicitAction);
    const explicitNoEdit = NO_EDIT_RE.test(creatorText);
    const discussion = DISCUSSION_RE.test(creatorText);
    if (explicitMode === "script_mutate" && explicitNoEdit) {
      mode = "conversation";
      reasons.push("creator_negated_script_mutation");
    } else if (explicitMode) {
      mode = explicitMode;
      reasons.push("explicit_ui_action");
    } else if (explicitNoEdit || discussion) {
      mode = "conversation";
      reasons.push(explicitNoEdit ? "creator_negated_script_mutation" : "editorial_discussion");
    } else if (READINESS_RE.test(creatorText)) {
      mode = "readiness_review";
      reasons.push("creator_requested_readiness_review");
    } else {
      const mutation = detectHearthScriptMutationIntent(creatorText);
      if (isExplicitHearthOutlineRequest(creatorText) && !mutation.targetsScriptBody) {
        mode = "outline_generate";
        reasons.push("creator_requested_outline");
      } else if (isExplicitHearthFullScriptRequest(creatorText) && NEW_SCRIPT_RE.test(creatorText)) {
        mode = "script_generate";
        reasons.push("creator_requested_script");
      } else if (mutation.targetsScriptBody) {
        mode = "script_mutate";
        reasons.push("affirmative_script_mutation");
      } else if (URL_RE.test(creatorText) || RESEARCH_RE.test(creatorText)
        || (creatorText.includes("?") && FACT_QUESTION_RE.test(creatorText) && !NON_RESEARCH_QUESTION_RE.test(creatorText))) {
        mode = "research";
        reasons.push("creator_requested_research");
      } else {
        reasons.push("ordinary_conversation");
      }
    }
  }

  return decisionForMode({ mode, lifecycle: args.lifecycle, retrievalScope, reasons });
}

export function filterHearthOperationsForDecision(
  decision: HearthTurnDecision,
  operations: readonly HearthOp[],
): HearthOp[] {
  if (decision.mode === "conversation" || decision.mode === "listening"
    || decision.mode === "readiness_review" || decision.mode === "production_action") return [];
  if (decision.mode === "outline_generate") return operations.filter((operation) => operation.op === "set_outline");
  if (decision.mode === "research") {
    return operations.filter((operation) => operation.op === "add_source"
      || operation.op === "update_source" || operation.op === "remove_source");
  }
  return operations.filter((operation) => operation.op === "set_body"
    || operation.op === "add_source" || operation.op === "update_source" || operation.op === "remove_source");
}
