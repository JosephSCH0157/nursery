import { validateExactSeoTitleBlock } from "../../../hearth/src/lib/hearth-production-feedback";

/** The title product is deliberately independent of the conversational Hearth prompt. */
export const HEARTH_TITLE_ROUTE = "hearth.title_generation" as const;
export const HEARTH_TITLE_MODEL = "gpt-5.6-luna" as const;
export const HEARTH_TITLE_CONTRACT = "forge.hearth.title-generation.v1" as const;
export const HEARTH_TITLE_MAX_INPUT_TOKENS = 12_000;
export const HEARTH_TITLE_MAX_OUTPUT_TOKENS = 512;
export const HEARTH_TITLE_MAX_ATTEMPTS = 1;

export type ApprovedTitleScript = {
  approvalId: string;
  approvalRevision: number;
  scriptHash: string;
  scriptText: string;
  episodeTitle: string;
};

export async function hashApprovedTitleScript(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildPaidTitleMessages(approved: ApprovedTitleScript) {
  return [
    {
      role: "system" as const,
      content: [
        "Generate exactly five distinct podcast episode titles from the approved script only.",
        "Do not browse, use tools, retrieve sources, or infer facts outside the script.",
        "Be creative: SPICY may be provocative, but do not fabricate a claim.",
        "Each title must be a thumbnail-safe hook of at most four words.",
        "Return plain text only, with exactly these six lines and no markdown or commentary:",
        "SEO_TITLES:",
        "SAFE: <title>",
        "SPICY: <title>",
        "BALANCED_1: <title>",
        "BALANCED_2: <title>",
        "BALANCED_3: <title>",
      ].join("\n"),
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

export function paidTitleFingerprintPayload(args: {
  userId: string;
  workspaceId: string;
  workpieceId: string;
  approved: ApprovedTitleScript;
}) {
  return {
    schema: HEARTH_TITLE_CONTRACT,
    route_code: HEARTH_TITLE_ROUTE,
    user_id: args.userId,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    script_approval_id: args.approved.approvalId,
    script_approval_revision: args.approved.approvalRevision,
    script_content_hash: args.approved.scriptHash,
    episode_title: args.approved.episodeTitle,
    output_contract: "seo_titles_five_lines.v1",
    model: HEARTH_TITLE_MODEL,
    maximum_input_tokens: HEARTH_TITLE_MAX_INPUT_TOKENS,
    maximum_output_tokens: HEARTH_TITLE_MAX_OUTPUT_TOKENS,
    maximum_attempts: HEARTH_TITLE_MAX_ATTEMPTS,
    browsing_requests: 0,
    retrieval_requests: 0,
    tools: 0,
    attachments: 0,
  };
}

export const validatePaidTitleOutput = validateExactSeoTitleBlock;
