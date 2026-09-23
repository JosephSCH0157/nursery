import {
  HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES,
  HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
} from "../../../hearth/src/lib/hearth-thumbnail-direction-contract";
import type { ApprovedTitleScript } from "./hearth-paid-title-generation";

export const HEARTH_THUMBNAIL_DIRECTION_ROUTE = "hearth.thumbnail_direction_generation" as const;
export const HEARTH_THUMBNAIL_DIRECTION_MODEL = "gpt-5.6-luna" as const;
export const HEARTH_THUMBNAIL_DIRECTION_CONTRACT = "forge.hearth.thumbnail-direction-generation.v1" as const;
export { HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT, HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES };
export const HEARTH_THUMBNAIL_DIRECTION_MAX_INPUT_TOKENS = 16_000;
export const HEARTH_THUMBNAIL_DIRECTION_MAX_OUTPUT_TOKENS = 2_048;
export const HEARTH_THUMBNAIL_DIRECTION_MAX_ATTEMPTS = 1;
export const HEARTH_THUMBNAIL_DIRECTION_STYLE_FALLBACK = "forge.thumbnail-direction-style.forge-standard.v1" as const;

export type ThumbnailDirectionTitleInput = {
  key: "A" | "B" | "C";
  id: string;
  revision: number;
  text: string;
  thumbnailText: string;
};

export type ThumbnailDirectionStyleAuthority = {
  resolvedSource: "forge_standard" | "brand_profile";
  authorityRevision: string;
  bindingId: string | null;
  bindingRevision: number | null;
  profileRevisionId: string | null;
  profileContentHash: string | null;
  planningRules: Readonly<Record<string, unknown>> | null;
};

export type ThumbnailDirectionAuthority = {
  thumbnailAuthorityVersion: string;
  activeStrategyId: string | null;
  activeConceptSetId: string | null;
  planningSubtreeHash: string;
};

export type PaidThumbnailDirectionInput = {
  approved: ApprovedTitleScript;
  titles: [ThumbnailDirectionTitleInput, ThumbnailDirectionTitleInput, ThumbnailDirectionTitleInput];
  style: ThumbnailDirectionStyleAuthority;
  authority: ThumbnailDirectionAuthority;
};

export const HEARTH_THUMBNAIL_DIRECTION_SYSTEM_PROMPT = [
  "Create one canonical podcast Thumbnail Creative Strategy and exactly three thumbnail directions from the approved script and the three supplied canonical title choices.",
  "Do not browse, retrieve sources, call tools, use attachments, generate images, add facts unsupported by the script, or select a winner.",
  "Each direction must be a pairwise-distinct editorial approach, must remain truthful to the approved script, and must be compatible with the canonical title choice having the same A/B/C key.",
  "Render directions must be provider-neutral base-art instructions with no text, letters, numbers, logos, watermarks, UI, or brand marks burned into the image. Forge adds canonical title treatment later.",
  "Return plain text only. Use exactly the following labels once each, in exactly this order. Replace every angle-bracket instruction with finished content. Do not add markdown, fences, commentary, blank sections, THUMBNAIL_D, or any fourth/fifth concept:",
  "THUMBNAIL_STRATEGY",
  "Episode promise: <truthful promise fulfilled by the episode>",
  "Intended viewer: <specific intended viewer>",
  "Curiosity mechanism: <truthful reason that viewer will click>",
  "Editorial positioning: <honest differentiating angle>",
  "Truthful connection: <how the strategy is supported by the approved script>",
  "Prohibited exaggerations: <comma-separated unsupported claims or implications to avoid>",
  "",
  "THUMBNAIL_A",
  "Headline: <short internal concept name, not rendered text>",
  "Subject direction: <primary visual subject>",
  "Focal action: <what the subject is doing or expressing>",
  "Composition direction: <provider-neutral layout, crop, depth, and negative space>",
  "Emotional tone: <intended feeling>",
  "Visual hierarchy: <what is noticed first, second, and last>",
  "Title compatibility: <how TITLE_A and its thumbnail text fit without duplicating the image>",
  "Integrity rationale: <why the direction truthfully represents the approved script>",
  "Render direction: <complete provider-neutral base-art direction with no typography or marks>",
  "Mood/style: <visual style>",
  "Subject classification: <concise subject class>",
  "Composition classification: <concise composition class>",
  "Dominant colors: <2 to 4 comma-separated color names>",
  "",
  "Repeat that exact field sequence under THUMBNAIL_B and THUMBNAIL_C, using TITLE_B and TITLE_C respectively.",
  "A, B, and C must differ meaningfully in editorial approach, primary subject or focal action, and composition. Rewording the same direction is invalid.",
].join("\n");

export function buildPaidThumbnailDirectionMessages(input: PaidThumbnailDirectionInput) {
  const titleLines = input.titles.flatMap((title) => [
    `TITLE_${title.key}:`,
    `ID: ${title.id}`,
    `REVISION: ${title.revision}`,
    `TITLE: ${title.text}`,
    `THUMBNAIL_TEXT: ${title.thumbnailText}`,
  ]);
  return [
    { role: "system" as const, content: HEARTH_THUMBNAIL_DIRECTION_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [
        `EPISODE_TITLE: ${input.approved.episodeTitle}`,
        `SCRIPT_APPROVAL_ID: ${input.approved.approvalId}`,
        `SCRIPT_APPROVAL_REVISION: ${input.approved.approvalRevision}`,
        `SCRIPT_CONTENT_HASH: ${input.approved.scriptHash}`,
        ...titleLines,
        `RESOLVED_STYLE_SOURCE: ${input.style.resolvedSource}`,
        `STYLE_AUTHORITY_REVISION: ${input.style.authorityRevision}`,
        "APPROVED_SCRIPT_TEXT:",
        input.approved.scriptText,
      ].join("\n"),
    },
  ];
}

export function paidThumbnailDirectionFingerprintPayload(args: {
  userId: string;
  workspaceId: string;
  workpieceId: string;
  operationIntentId: string;
  input: PaidThumbnailDirectionInput;
}) {
  return {
    schema: HEARTH_THUMBNAIL_DIRECTION_CONTRACT,
    route_code: HEARTH_THUMBNAIL_DIRECTION_ROUTE,
    user_id: args.userId,
    workspace_id: args.workspaceId,
    workpiece_id: args.workpieceId,
    operation_intent_id: args.operationIntentId,
    script_approval_id: args.input.approved.approvalId,
    script_approval_revision: args.input.approved.approvalRevision,
    script_content_hash: args.input.approved.scriptHash,
    episode_title: args.input.approved.episodeTitle,
    titles: args.input.titles.map((title) => ({
      key: title.key, id: title.id, revision: title.revision,
      text: title.text, thumbnail_text: title.thumbnailText,
    })),
    style_authority: {
      resolved_source: args.input.style.resolvedSource,
      authority_revision: args.input.style.authorityRevision,
      binding_id: args.input.style.bindingId,
      binding_revision: args.input.style.bindingRevision,
      profile_revision_id: args.input.style.profileRevisionId,
      profile_content_hash: args.input.style.profileContentHash,
      planning_rules: args.input.style.planningRules,
    },
    thumbnail_authority: {
      authority_version: args.input.authority.thumbnailAuthorityVersion,
      active_strategy_id: args.input.authority.activeStrategyId,
      active_concept_set_id: args.input.authority.activeConceptSetId,
      planning_subtree_hash: args.input.authority.planningSubtreeHash,
    },
    output_contract: HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
    model: HEARTH_THUMBNAIL_DIRECTION_MODEL,
    maximum_input_tokens: HEARTH_THUMBNAIL_DIRECTION_MAX_INPUT_TOKENS,
    maximum_output_tokens: HEARTH_THUMBNAIL_DIRECTION_MAX_OUTPUT_TOKENS,
    maximum_attempts: HEARTH_THUMBNAIL_DIRECTION_MAX_ATTEMPTS,
    maximum_response_bytes: HEARTH_THUMBNAIL_DIRECTION_MAX_RESPONSE_BYTES,
    browsing_requests: 0,
    retrieval_requests: 0,
    tools: 0,
    attachments: 0,
    image_provider_calls: 0,
  };
}
