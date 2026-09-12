import { shouldKeepHearthOutlineInChatOnly } from "./hearth-chat-proposal-routing";
import { hasSubstantiveHearthScript } from "./hearth-composition-output";

export type HearthChatDestination = "chat" | "script_body";

export type HearthScriptMutationKind =
  | "format_only"
  | "draft_script"
  | "rewrite"
  | "revise"
  | "integrate"
  | "replace_section"
  | "update_outline"
  | null;

export type HearthScriptMutationIntent = {
  destination: HearthChatDestination;
  kind: HearthScriptMutationKind;
  targetsScriptBody: boolean;
};

const REWRITE_VERB_PATTERN = /\b(rewrite|redo|rework)\b/;
const REVISE_VERB_PATTERN = /\b(revise|edit|polish|tighten|shorten|improve|punch up|update)\b/;
const SCRIPT_OBJECT_PATTERN = /\b(script|draft|outline|section|intro|opening|cold open|segment|body|bullet(?:\s+points?)?|beats?)\b/;
const INTEGRATE_PATTERN = /\b(integrate|merge|fold in|work in|add|include)\b[^.!?\n]{0,60}\b(?:into|in)\b[^.!?\n]{0,30}\b(script|draft|outline|section|intro|segment|body)\b/;
const REPLACE_SECTION_PATTERN = /\b(replace|redo|rework|rewrite|revise|update)\b[^.!?\n]{0,40}\b(section|intro|opening|cold open|segment|body)\b/;
const UPDATE_OUTLINE_PATTERN = /\b(update|rewrite|revise|redo|rework|tighten)\b[^.!?\n]{0,40}\boutline\b/;
const DRAFT_SCRIPT_PATTERN = /\b(full script|write\b|draft\b|script this|turn\b|shape\b|make\b)\b/;
const FORMAT_ONLY_PATTERN = /(?:\breformat\b|\bformat(?:ting)?\s+only\b|\bfix\s+(?:the\s+)?line\s*breaks?\b|\bmake\s+(?:this(?:\s+(?:script|draft))?|it|the\s+(?:script|draft))\s+anvil[- ]ready\b|\bnormalize\s+(?:the\s+)?speaker\s+blocks?\b|\brepair\s+(?:the\s+)?formatting\b|\bformat\b[^.!?\n]{0,50}\bwithout\s+changing\s+(?:the\s+)?wording\b)/;
const EDITORIAL_CHANGE_PATTERN = /(?:\b(rewrite|redo|rework|revise|edit|polish|tighten|shorten|improve|punch up|integrate|merge|fold in|replace)\b|\b(?:add|include)\b[^.!?\n]{0,40}\b(?:words?|joke|section|research|detail|example|source|fact|point|story)\b)/;
const EXPLICIT_MUTATION_COMMAND_PATTERN = /(?:^|[.!?;]\s+)(?:okay[, ]+)?(?:please\s+|go ahead (?:and|to)\s+)?(?:update|revise|rewrite|edit|replace|rework|redo|integrate|merge|add|include|apply|write|draft)\b[^.!?;\n]{0,80}\b(?:script|draft|outline|section|intro|opening|ending|cold open|segment|body|bullet(?:\s+points?)?|beats?)\b|\b(?:please|can you|could you|would you|i want you to|i need you to|go ahead (?:and|to))\s+(?:actually\s+)?(?:update|revise|rewrite|edit|replace|rework|redo|integrate|merge|add|include|apply|write|draft)\b[^.!?;\n]{0,80}\b(?:script|draft|outline|section|intro|opening|ending|cold open|segment|body|bullet(?:\s+points?)?|beats?)\b/;
const NEGATED_MUTATION_PATTERN = /\b(?:do not|don't|did not|didn't|not asking|not ask|not ready|without)\b[^.!?;,\n]{0,90}\b(?:update|change|revise|rewrite|edit|replace|rework|redo|integrate|merge|add|include|put|apply|create|write|draft|touch|modify|reformat|format|normalize|repair|fix)\b/;
const EDITORIAL_DISCUSSION_PATTERN = /(?:\bhow\s+(?:do|can|could|should|would)\s+(?:we|i)\b[^.!?\n]{0,100}\b(?:update|change|revise|rewrite|edit|make|get|frame|move|strengthen|improve|reformat|format)\b|\bwhat\s+(?:changes?\s+)?(?:can|could|should|would)\s+(?:we|i|you)\b|\bwhat\s+would\s+you\s+(?:change|revise|rewrite|edit|move|improve)\b|\bshould\s+(?:we|i)\s+(?:move|update|change|revise|rewrite|edit)\b|\b(?:talk|discuss|conversation|brainstorm)\b[^.!?\n]{0,100}\b(?:change|changes|update|revise|rewrite|edit|script|draft|section|framing)\b)/;
const APPLY_CHANGES_PATTERN = /\bapply\s+(?:those|these|the|that|your|proposed)\s+changes\b/;
const CREATE_VERSION_PATTERN = /\bcreate\s+(?:a\s+)?(?:new\s+)?version\s+(?:\d+|two|three|four|five)\b/;
const PUT_IN_SCRIPT_PATTERN = /\bput\s+(?:that|this|those|these|it)\s+(?:into|in)\s+(?:the\s+)?(?:script|draft|section|intro|opening|ending|body)\b/;
const PUT_MATERIAL_IN_SCRIPT_PATTERN = /(?:^|[.!?;]\s+)(?:okay[, ]+)?(?:please\s+)?put\b[^.!?;\n]{0,80}\b(?:into|in)\s+(?:the\s+)?(?:script|draft|section|intro|opening|ending|body)\b/;
const DIRECT_REVISION_COMMAND_PATTERN = /(?:^|[.!?;]\s+)(?:okay[, ]+)?(?:please\s+|go ahead (?:and|to)\s+)?(?:rewrite|revise|edit|rework|redo|polish|tighten|shorten|punch up)\b/i;

function normalizeMutationText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

export function detectHearthScriptMutationIntent(text: string): HearthScriptMutationIntent {
  const normalized = normalizeMutationText(text);
  if (!normalized) {
    return {
      destination: "chat",
      kind: null,
      targetsScriptBody: false,
    };
  }

  const hasExplicitMutationCommand = EXPLICIT_MUTATION_COMMAND_PATTERN.test(normalized)
    || APPLY_CHANGES_PATTERN.test(normalized)
    || CREATE_VERSION_PATTERN.test(normalized)
    || PUT_IN_SCRIPT_PATTERN.test(normalized)
    || PUT_MATERIAL_IN_SCRIPT_PATTERN.test(normalized)
    || DIRECT_REVISION_COMMAND_PATTERN.test(normalized);
  if (!hasExplicitMutationCommand && (
    NEGATED_MUTATION_PATTERN.test(normalized)
    || EDITORIAL_DISCUSSION_PATTERN.test(normalized)
  )) {
    return {
      destination: "chat",
      kind: null,
      targetsScriptBody: false,
    };
  }

  if (FORMAT_ONLY_PATTERN.test(normalized) && !EDITORIAL_CHANGE_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "format_only",
      targetsScriptBody: true,
    };
  }

  if (
    /\bfull script\b/.test(normalized)
    || /\b(?:write|draft|script)\b[^.!?\n]{0,50}\b(?:script|segments?|cold open)\b/.test(normalized)
    || /\b(?:turn|shape|make)\b[^.!?\n]{0,40}\b(?:this|that|it)\b[^.!?\n]{0,30}\b(?:into|as)\b[^.!?\n]{0,20}\b(?:a )?(?:full )?script\b/.test(normalized)
  ) {
    return {
      destination: "script_body",
      kind: "draft_script",
      targetsScriptBody: true,
    };
  }

  if (UPDATE_OUTLINE_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "update_outline",
      targetsScriptBody: true,
    };
  }

  if (INTEGRATE_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "integrate",
      targetsScriptBody: true,
    };
  }

  if (PUT_IN_SCRIPT_PATTERN.test(normalized) || PUT_MATERIAL_IN_SCRIPT_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "integrate",
      targetsScriptBody: true,
    };
  }

  if (APPLY_CHANGES_PATTERN.test(normalized) || CREATE_VERSION_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "revise",
      targetsScriptBody: true,
    };
  }

  if (REPLACE_SECTION_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "replace_section",
      targetsScriptBody: true,
    };
  }

  if (REWRITE_VERB_PATTERN.test(normalized) && SCRIPT_OBJECT_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "rewrite",
      targetsScriptBody: true,
    };
  }

  if (REVISE_VERB_PATTERN.test(normalized) && SCRIPT_OBJECT_PATTERN.test(normalized)) {
    return {
      destination: "script_body",
      kind: "revise",
      targetsScriptBody: true,
    };
  }

  if (DRAFT_SCRIPT_PATTERN.test(normalized) && /\bscript\b/.test(normalized)) {
    return {
      destination: "script_body",
      kind: "draft_script",
      targetsScriptBody: true,
    };
  }

  if (hasExplicitMutationCommand) {
    return {
      destination: "script_body",
      kind: "revise",
      targetsScriptBody: true,
    };
  }

  return {
    destination: "chat",
    kind: null,
    targetsScriptBody: false,
  };
}

export function resolveHearthScriptMutationRouting<TOp extends { op: string; value?: unknown }>(args: {
  productionAction: boolean;
  autosaveReasonCode: string | null;
  ops: TOp[];
  intent: HearthScriptMutationIntent;
}): {
  keepOutlineInChatOnly: boolean;
  proposalOps: TOp[];
  hasScriptBodyProposal: boolean;
  missingScriptBodyMutation: boolean;
} {
  const keepOutlineInChatOnly = shouldKeepHearthOutlineInChatOnly({
    productionAction: args.productionAction,
    autosaveReasonCode: args.autosaveReasonCode,
    ops: args.ops,
  });
  const candidateProposalOps = keepOutlineInChatOnly ? [] : args.ops;
  const proposalOps = !args.productionAction && !args.intent.targetsScriptBody
    ? candidateProposalOps.filter((op) => op.op !== "set_body")
    : candidateProposalOps;
  const hasScriptBodyProposal = proposalOps.some((op) => (
    op.op === "set_body"
    && typeof op.value === "string"
    && hasSubstantiveHearthScript(op.value)
  ));
  const missingScriptBodyMutation = !args.productionAction
    && args.intent.targetsScriptBody
    && !hasScriptBodyProposal;

  return {
    keepOutlineInChatOnly,
    proposalOps: missingScriptBodyMutation ? [] : proposalOps,
    hasScriptBodyProposal,
    missingScriptBodyMutation,
  };
}

export function buildNoScriptChangesExplanation(intent: HearthScriptMutationIntent): string {
  if (!intent.targetsScriptBody) return "No script changes made.";
  if (intent.kind === "integrate") {
    return "No script changes made. Hearth returned analysis only, so nothing was integrated into the draft body.";
  }
  if (intent.kind === "replace_section") {
    return "No script changes made. Hearth did not return a replacement section in canonical script form.";
  }
  if (intent.kind === "update_outline") {
    return "No script changes made. Hearth did not return an updated script-body outline to commit.";
  }
  if (intent.kind === "draft_script") {
    return "No script changes made. Hearth did not return a canonical script-body draft to stage.";
  }
  if (intent.kind === "format_only") {
    return "No script changes made. Hearth could not produce a formatting-only preview without changing protected script content.";
  }
  return "No script changes made. Hearth returned analysis only, so the script body stayed untouched.";
}
