import { shouldKeepHearthOutlineInChatOnly } from "./hearth-chat-proposal-routing";

export type HearthChatDestination = "chat" | "script_body";

export type HearthScriptMutationKind =
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

function normalizeMutationText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
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

  return {
    destination: "chat",
    kind: null,
    targetsScriptBody: false,
  };
}

export function resolveHearthScriptMutationRouting<TOp extends { op: string }>(args: {
  productionAction: boolean;
  autosaveReasonCode: string;
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
  const proposalOps = keepOutlineInChatOnly ? [] : args.ops;
  const hasScriptBodyProposal = proposalOps.some((op) => op.op === "set_body");
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
  return "No script changes made. Hearth returned analysis only, so the script body stayed untouched.";
}
