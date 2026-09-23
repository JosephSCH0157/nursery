import type { ApprovedTitleScript } from "./hearth-paid-title-generation";
import { normalizeTag } from "../../../hearth/src/lib/episode-package-v2";

/** One approved episode, one bounded supplier attempt, one canonical result. */
export const HEARTH_TAG_ROUTE = "hearth.tag_generation" as const;
export const HEARTH_TAG_MODEL = "gpt-5.6-luna" as const;
export const HEARTH_TAG_CONTRACT = "forge.hearth.tag-generation.v1" as const;
// The semantic product is unchanged; v2 identifies the tolerant output parser
// in new quote fingerprints without rewriting the failed v1 operation.
export const HEARTH_TAG_OUTPUT_CONTRACT = "tags_top10_comma_block.v2" as const;
export const HEARTH_TAG_MAX_INPUT_TOKENS = 12_000;
export const HEARTH_TAG_MAX_OUTPUT_TOKENS = 256;
export const HEARTH_TAG_MAX_ATTEMPTS = 1;

export function buildPaidTagMessages(approved: ApprovedTitleScript) {
  return [
    {
      role: "system" as const,
      content: [
        "Generate 6 to 10 distinct, episode-specific podcast tags from the approved script only.",
        "The tags must describe this one episode, not a series or neighboring episodes.",
        "Choose the exact subject, defining entities, and central themes actually supported by the script.",
        "Prefer precise multi-word tags over generic categories or near-duplicates.",
        "Do not browse, retrieve, call tools, or add unsupported topics.",
        "Return plain text only in exactly two lines: TAGS_TOP10: followed by a line of 6 to 10 comma-separated tags, strongest first.",
        "No markdown, explanations, or extra tags.",
      ].join(" "),
    },
    {
      role: "user" as const,
      content: [
        `EPISODE_TITLE: ${approved.episodeTitle}`,
        `SCRIPT_VERSION: ${approved.approvalRevision}`,
        "APPROVED_SCRIPT_TEXT:",
        approved.scriptText,
      ].join("\n"),
    },
  ];
}

export function paidTagFingerprintPayload(args: {
  userId: string;
  workspaceId: string;
  workpieceId: string;
  approved: ApprovedTitleScript;
  operationIntentId: string;
}) {
  return {
    schema: HEARTH_TAG_CONTRACT,
    route_code: HEARTH_TAG_ROUTE,
    user_id: args.userId,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    script_approval_id: args.approved.approvalId,
    script_approval_revision: args.approved.approvalRevision,
    script_content_hash: args.approved.scriptHash,
    operation_intent_id: args.operationIntentId,
    episode_title: args.approved.episodeTitle,
    output_contract: HEARTH_TAG_OUTPUT_CONTRACT,
    model: HEARTH_TAG_MODEL,
    maximum_input_tokens: HEARTH_TAG_MAX_INPUT_TOKENS,
    maximum_output_tokens: HEARTH_TAG_MAX_OUTPUT_TOKENS,
    maximum_attempts: HEARTH_TAG_MAX_ATTEMPTS,
    browsing_requests: 0,
    retrieval_requests: 0,
    tools: 0,
    attachments: 0,
  };
}

export function validatePaidTagOutput(value: unknown):
  | { ok: true; text: string; tags: string[] }
  | { ok: false; error: string } {
  if (typeof value !== "string" || value.length > 1_024) return { ok: false, error: "invalid_tag_output" };
  const text = value.trim();
  const lines = text.split(/\r?\n/);
  let tagLine: string;
  if (lines.length === 2 && lines[0].trim() === "TAGS_TOP10:") {
    tagLine = lines[1];
  } else if (lines.length === 1) {
    const sameLine = /^TAGS_TOP10:[ \t]+(.+)$/.exec(lines[0]);
    if (!sameLine) return { ok: false, error: "invalid_tag_structure" };
    tagLine = sameLine[1];
  } else {
    return { ok: false, error: "invalid_tag_structure" };
  }
  const tags = tagLine.split(",").map((tag) => tag.trim());
  if (tags.length < 6 || tags.length > 10) return { ok: false, error: "invalid_tag_count" };
  if (tags.some((tag) => !tag || tag.length > 80 || /[<>`\r\n]/.test(tag))) {
    return { ok: false, error: "invalid_tag_candidate" };
  }
  const normalized = tags.map((tag) => normalizeTag(tag.normalize("NFKC")));
  if (normalized.some((tag) => !tag)) return { ok: false, error: "invalid_tag_candidate" };
  if (new Set(normalized).size !== tags.length) return { ok: false, error: "duplicate_tag_candidate" };
  return { ok: true, text: `TAGS_TOP10:\n${tags.join(", ")}`, tags };
}
