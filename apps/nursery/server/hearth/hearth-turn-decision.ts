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
const NO_ARTIFACT_RE = /\b(?:do not|don't|dont|not asking (?:you )?to|didn't ask (?:you )?to|did not ask (?:you )?to)\b[^.!?\n]{0,80}\b(?:write|draft|generate|create|outline)\b/i;
const DISCUSSION_RE = /\b(?:how|what|where|whether|should|could|would)\b[^.!?\n]{0,100}\b(?:change|changes|update|revise|rewrite|move|frame|strengthen|get .* across)\b/i;
const READINESS_RE = /\b(?:ready to record|record now|can i record|good to record|ready for anvil|ship this|go live)\b/i;
const RESEARCH_RE = /\b(?:browse|look up|lookup|find(?: me)?|search|research|retrieval|web research|live research|news|reports?|reporting|sources?|citations?|evidence|verify|fact[- ]?check|corroborat)\b/i;
const NO_RESEARCH_RE = /\b(?:do not|don't|dont|without|no need to|please avoid)\b[^.!?\n]{0,100}\b(?:browse|look up|lookup|search|research|check (?:the )?(?:web|news|current)|use (?:the )?(?:web|internet)|find sources?|verify)\b|\b(?:just|only)\b[^.!?\n]{0,40}\b(?:explain|answer)\b[^.!?\n]{0,50}\b(?:generally|from general knowledge|without (?:browsing|research))\b/i;
const URL_RE = /\bhttps?:\/\//i;
const FACT_QUESTION_RE = /\b(?:who|what|when|where|why|how (?:much|many|long|often)|what caused|what led to)\b/i;
const NON_RESEARCH_QUESTION_RE = /\b(?:what do you think|how does this (?:sound|read|feel)|should (?:i|we)|can (?:i|we)|help me (?:write|draft|revise|rewrite)|are you with me|do you follow)\b/i;
const EVERGREEN_RE = /\b(?:generally|in general|typically|usually|as a rule|evergreen|conceptually)\b/i;
const HISTORICAL_PERIOD_RE = /\b(?:19|20)\d{2}\b|\b(?:historically|history of|during the|in the past|previous century)\b/i;
const CURRENT_TIME_RE = /\b(?:right now|currently|today|this (?:week|month|year)|recently|lately|at the moment|breaking|latest|current|ongoing|newly|record (?:high|low)s?)\b/i;
const CURRENT_OBSERVATION_RE = /\b(?:why|how come)\s+(?:are|is)\s+(?:(?:we|people|creators?|companies|customers?|audiences?)\s+)?(?:seeing|experiencing|getting|reporting|noticing|facing)\b|\bwhat\s+(?:is|are)\s+(?:driving|causing|behind)\b/i;
const GEOPOLITICAL_EVENT_RE = /\b(?:war|conflict|crisis)\s+(?:with|in|between|against|over)\b|\b(?:sanctions?|embargo|blockade|invasion|hostilities|ceasefire)\b/i;
const EVENT_CAUSAL_QUESTION_RE = /\bhow\s+(?:has|have|did)\b[^.!?\n]{0,240}\b(?:affect(?:ed|ing)?|impact(?:ed|ing)?|influenc(?:e|ed|ing)|involved|shape(?:d|ing)?|change(?:d|ing)?|drive|driven|driving)\b/i;
const CROSS_EPISODE_RE = /\b(?:other|another|previous|prior|earlier|last)\b[^.!?\n]{0,80}\b(?:episode|project|draft|script|conversation)\b|\b(?:episode|project|draft|script|conversation)\b[^.!?\n]{0,80}\b(?:other|another|previous|prior|earlier|last)\b|\b(?:workspace)\b[^.!?\n]{0,100}\b(?:compare|reference|use|pull|find|load|open)\b|\b(?:compare|reference|use|pull|find|load|open)\b[^.!?\n]{0,100}\bworkspace\b/i;
const NEW_SCRIPT_RE = /\b(?:write|create|make|build|give me|draft)\b[^.!?\n]{0,80}\b(?:full )?script\b|\b(?:turn|shape|make)\b[^.!?\n]{0,40}\b(?:this|that|it)\b[^.!?\n]{0,30}\binto\b[^.!?\n]{0,20}\bscript\b/i;
const DIRECT_SCRIPT_FIX_RE = /\b(?:fix|repair|polish|tighten)\b[^.!?\n]{0,50}\b(?:this|the|my|our)?\s*script\b/i;
const EDITORIAL_METADATA_DISCUSSION_RE = /\b(?:help me|how|what|could|should|would)\b[^.!?\n]{0,80}\b(?:tighten|improve|change|revise|shape)\b[^.!?\n]{0,40}\b(?:title|description|hook|framing)\b/i;

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
  if (action.kind === "deterministic") return "deterministic_cleanup";
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
        : args.mode === "deterministic_cleanup"
          ? "script"
        : args.mode === "production_action"
          ? "production"
          : null;
  const requiresArtifact = requestedArtifact !== null;
  const hasMutationTarget = args.mode !== "script_mutate" || args.lifecycle.hasDraft;
  const allowsMutation = (args.mode === "script_mutate" || args.mode === "deterministic_cleanup") && hasMutationTarget;
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
  const explicitMode = actionMode(args.explicitAction);

  if (explicitMode === "deterministic_cleanup") {
    mode = explicitMode;
    reasons.push("explicit_deterministic_action");
  } else if (LISTENING_RE.test(creatorText)) {
    mode = "listening";
    reasons.push("creator_requested_acknowledgement");
  } else {
    const explicitNoEdit = NO_EDIT_RE.test(creatorText) || NO_ARTIFACT_RE.test(creatorText);
    const discussion = DISCUSSION_RE.test(creatorText);
    if ((explicitMode === "script_mutate" || explicitMode === "script_generate" || explicitMode === "outline_generate") && explicitNoEdit) {
      mode = "conversation";
      reasons.push("creator_negated_script_mutation");
    } else if (explicitMode) {
      mode = explicitMode;
      reasons.push("explicit_ui_action");
    } else if (explicitNoEdit || discussion || EDITORIAL_METADATA_DISCUSSION_RE.test(creatorText)) {
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
      } else if (mutation.targetsScriptBody || DIRECT_SCRIPT_FIX_RE.test(creatorText)) {
        mode = "script_mutate";
        reasons.push("affirmative_script_mutation");
      } else if (NO_RESEARCH_RE.test(creatorText)) {
        mode = "conversation";
        reasons.push("creator_declined_research");
      } else if (URL_RE.test(creatorText) || RESEARCH_RE.test(creatorText)) {
        mode = "research";
        reasons.push("creator_requested_research");
      } else if (GEOPOLITICAL_EVENT_RE.test(creatorText) && EVENT_CAUSAL_QUESTION_RE.test(creatorText)) {
        mode = "research";
        reasons.push("current_event_evidence_required");
      } else if (!HISTORICAL_PERIOD_RE.test(creatorText)
        && !EVERGREEN_RE.test(creatorText)
        && (CURRENT_TIME_RE.test(creatorText) || CURRENT_OBSERVATION_RE.test(creatorText))
        && FACT_QUESTION_RE.test(creatorText)
        && !NON_RESEARCH_QUESTION_RE.test(creatorText)) {
        mode = "research";
        reasons.push("current_evidence_required");
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
