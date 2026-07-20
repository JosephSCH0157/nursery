import { HEARTH_THUMBNAIL_TITLE_CONTRACT } from "./hearth-thumbnail-title-contract";
import { validateHearthProductionArtifactOutput } from "./hearth-production-feedback";
import {
  commitWorkpieceProductionArtifact,
  type ProductionArtifactKind,
} from "./hearth-production-repo";
import {
  normalizeSeoTags,
  type EpisodeSeoTitle,
} from "./episode-package-v2";

export function resolveAcceptedTagProposal(args: {
  canonicalTags: string[];
  proposedTags: string[];
  mode: "replace" | "merge";
}): string[] {
  return args.mode === "replace"
    ? normalizeSeoTags(args.proposedTags)
    : normalizeSeoTags([...args.canonicalTags, ...args.proposedTags]);
}

export type ProductionAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "release_prep_pack";

type ImageBeatSheetEntry = {
  id: string;
  attach_after: string;
  description: string;
  prompt: string;
  match?: string;
};

export const PRODUCTION_ACTION_LABEL: Record<ProductionAction, string> = {
  seo: "Generate Titles",
  tags: "Generate Tags",
  thumbnails: "Thumbnail Briefs",
  image_beat_sheet: "Image Beat Sheet",
  release_prep_pack: "Framing Pack",
};

export const PRODUCTION_ACTION_ARTIFACT_KIND: Record<ProductionAction, ProductionArtifactKind> = {
  seo: "seo",
  tags: "tags",
  thumbnails: "thumbnails",
  image_beat_sheet: "image_beat_sheet",
  release_prep_pack: "pack",
};

export function buildProductionPrompt(args: {
  action: ProductionAction;
  scriptVersion: number;
  episodeTitle: string;
}): string {
  const header = [
    `Production mode request for approved Script Version ${args.scriptVersion}.`,
    "Use the approved script in episode_context as the only source for script-derived outputs.",
    "Do not request topic basics. Do not output markdown tables.",
    "",
    `EPISODE_TITLE: ${args.episodeTitle || "Untitled Episode"}`,
    `SCRIPT_VERSION: ${args.scriptVersion}`,
    "",
  ];

  if (args.action === "seo") {
    return [
      ...header,
      "Return plain text only in this exact parseable shape. Replace every <...> value; do not add markdown, fences, or commentary:",
      "SEO_TITLES:",
      "SAFE: <title>",
      "SPICY: <title>",
      "BALANCED_1: <title>",
      "BALANCED_2: <title>",
      "BALANCED_3: <title>",
      "",
      `Each title must preserve a thumbnail-safe hook of ${HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words} words or fewer.`,
    ].join("\n");
  }

  if (args.action === "tags") {
    return [
      ...header,
      "Return plain text only in this exact parseable shape. Replace every <...> value; do not add markdown, fences, or commentary:",
      "TAGS_TOP10:",
      "<tag 1>, <tag 2>, <tag 3>, <tag 4>, <tag 5>, <tag 6>, <tag 7>, <tag 8>, <tag 9>, <tag 10>",
      "",
      "TAGS_FULL:",
      "<20 to 35 comma-separated tags>",
    ].join("\n");
  }

  if (args.action === "thumbnails") {
    return [
      ...header,
      "Return plain text only in this exact structure. Do not add research commentary, markdown, fences, or explanations:",
      "THUMBNAIL_STRATEGY",
      "Episode promise: <the truthful promise this episode fulfills>",
      "Intended viewer: <the specific viewer this should attract>",
      "Curiosity mechanism: <why the right viewer will want to click>",
      "Editorial positioning: <the honest angle that differentiates this episode>",
      "Truthful connection: <how the strategy is supported by the approved script>",
      "Prohibited exaggerations: <comma-separated claims or implications the thumbnail must avoid>",
      "",
      "THUMBNAIL_01",
      "Headline: <short internal concept name, not rendered text>",
      "Subject: <primary subject>",
      "Focal action: <what the subject is doing or expressing>",
      "Composition: <provider-neutral layout and crop>",
      "Emotional tone: <intended feeling>",
      "Visual hierarchy: <what is noticed first, second, and last>",
      "Title compatibility: <how canonical title text fits without duplicating the image>",
      "Integrity rationale: <why this image truthfully represents the approved script>",
      "Render direction: <clean base-art direction with no text, letters, logos, or watermarks>",
      "Mood/style: <visual style>",
      "",
      "Repeat THUMBNAIL_02 through THUMBNAIL_05 with every field present.",
      "The five concepts must use meaningfully different subjects or compositions.",
      "Never request burned-in typography; Forge composes the canonical title locally.",
    ].join("\n");
  }

  if (args.action === "release_prep_pack") {
    return [
      ...header,
      "Generate a Framing Pack from this approved script.",
      "Return plain text with exact sections in this order:",
      "YOUTUBE_OPTIMIZED_CUT:",
      "- tighter opening hook and clear promise",
      "- retention-aware structure notes",
      "",
      "TITLE_OPTIONS:",
      "- provide 3-7 options",
      "- click-optimized but honest",
      "- varied emotional framing",
      "",
      "SHORT_FORM_HOOK_20S:",
      "- one cold-open hook suitable for Shorts/TikTok/Reels",
      "- keep it to <= 20 seconds spoken length",
      "",
      "TONE_VARIANT_CREATOR:",
      "- more conversational personality-led version of the opening",
      "",
      "AUDIENCE_VARIANT:",
      "- one tailored opening variant for a likely audience angle",
      "",
      "MONETIZATION_ANGLE:",
      "- sponsorship positioning idea",
      "- one CTA direction",
      "- optional premium episode framing",
      "",
      "Rules:",
      "- Do not overwrite the primary script.",
      "- Treat this as a derived release-prep output.",
      "- Do not use markdown tables.",
      "- Keep recommendations practical and production-ready.",
    ].join("\n");
  }

  return [
    ...header,
    "Generate an image beat sheet.",
    "Return plain text with one or more blocks in this exact format:",
    "IMAGE_01",
    "Attach after: \"<EXACT QUOTE FROM APPROVED SCRIPT>\"",
    "Description: ...",
    "Prompt: ...",
    "Match: first occurrence",
    "",
    "Rules:",
    "- Attach after must be an exact quote from APPROVED_SCRIPT_TEXT.",
    "- If quote appears multiple times, include Match line with disambiguation.",
    "- Use plain text prompts only.",
  ].join("\n");
}

export async function persistProductionArtifact(args: {
  action: ProductionAction;
  scriptVersion: number;
  assistantText: string;
  workpieceId: string | null;
  workspaceId: string | null;
  refreshEpisodePackage: () => Promise<void>;
  loadLatestReleasePrepPack: (scriptVersion: number) => Promise<void>;
  setAiRuntimeWarning: (message: string | null) => void;
  setMetadataTitlesDraft: (next: EpisodeSeoTitle[] | ((current: EpisodeSeoTitle[]) => EpisodeSeoTitle[])) => void;
  setMetadataDescriptionShortDraft: (next: string) => void;
  setMetadataDescriptionLongDraft: (next: string) => void;
  setMetadataTagsDraft: (next: string[]) => void;
  onTagProposal?: (proposal: { tags: string[]; scriptVersion: number; generatedAt: string }) => void;
  generatedAt?: string;
  reuseStoredArtifact?: boolean;
}) {
  const episodeId = args.workpieceId?.trim();
  if (!episodeId) return;

  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const artifactKind = PRODUCTION_ACTION_ARTIFACT_KIND[args.action];
  const validation = validateHearthProductionArtifactOutput({
    action: args.action,
    assistantText: args.assistantText,
  });
  if (!validation.ok && args.action !== "thumbnails") {
    args.setAiRuntimeWarning(validation.error);
    return;
  }
  const payload = args.action === "image_beat_sheet"
    ? {
        script_version: args.scriptVersion,
        generated_at: generatedAt,
        action: args.action,
        raw_text: args.assistantText,
        entries: parseImageBeatSheetEntries(args.assistantText),
      }
    : {
        script_version: args.scriptVersion,
        generated_at: generatedAt,
        action: args.action,
        raw_text: args.assistantText,
      };

  try {
    const committed = await commitWorkpieceProductionArtifact({
      workpieceId: episodeId,
      workspaceId: args.workspaceId,
      scriptVersion: args.scriptVersion,
      kind: artifactKind,
      payload,
      syncCanonical: args.action !== "tags",
      artifactAlreadyPersisted: args.reuseStoredArtifact,
    });

    if (!committed.ok) {
      const stage = committed.stage ? ` at ${committed.stage}` : "";
      args.setAiRuntimeWarning(`${PRODUCTION_ACTION_LABEL[args.action]} failed${stage}: ${committed.reason} The paid response remains recoverable from the saved production artifact.`);
      return committed;
    }
    if (!validation.ok) {
      if (args.action === "thumbnails") {
        await args.refreshEpisodePackage();
        return committed;
      }
      args.setAiRuntimeWarning(validation.error);
      return;
    }
    if (args.action === "tags") {
      args.onTagProposal?.({ tags: validation.feedback.tags, scriptVersion: args.scriptVersion, generatedAt });
      return committed;
    }
    const artifactFeedback = validation.feedback;
    if (artifactFeedback.warning) {
      args.setAiRuntimeWarning(artifactFeedback.warning);
    }
    if (artifactFeedback.shouldRefreshEpisodePackage) {
      await args.refreshEpisodePackage();
    }
    if (args.action === "release_prep_pack") {
      await args.loadLatestReleasePrepPack(args.scriptVersion);
    }
    return committed;
  } catch {
    args.setAiRuntimeWarning(`Saved response in chat, but failed to persist ${PRODUCTION_ACTION_LABEL[args.action]}.`);
    return { ok: false as const, reason: "Unexpected persistence failure.", stage: "commit" as const };
  }
}

export async function runProductionAction(args: {
  action: ProductionAction;
  isAiProcessing: boolean;
  isApprovingScript: boolean;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  activeDraft: { body: string; title: string } | null;
  planningSessionTitle: string | null;
  setChatError: (message: string | null) => void;
  setActiveProductionAction: (action: ProductionAction | null) => void;
  sendChatMessage: (args: {
    requestContent: string;
    displayContent?: string;
    productionAction?: ProductionAction;
    productionScriptVersion?: number;
  }) => Promise<void>;
}) {
  if (args.isAiProcessing || args.isApprovingScript) return;
  if (!args.activeDraft) return;
  if (!args.hasApprovedScript || !args.approvedScriptVersion) {
    args.setChatError("Approve a Script Version before using production actions.");
    return;
  }
  if (!args.activeDraft.body.trim()) {
    args.setChatError("Approved script body is empty.");
    return;
  }
  if (args.action === "image_beat_sheet") {
    args.setChatError("Image Beat Sheet has been replaced by the Episode Visual Plan. Use Create visual plan in the media workspace.");
    return;
  }

  const prompt = buildProductionPrompt({
    action: args.action,
    scriptVersion: args.approvedScriptVersion,
    episodeTitle: args.activeDraft.title || args.planningSessionTitle || "",
  });
  const displayContent = `${PRODUCTION_ACTION_LABEL[args.action]} for Script Version ${args.approvedScriptVersion}.`;
  args.setActiveProductionAction(args.action);
  try {
    await args.sendChatMessage({
      requestContent: prompt,
      displayContent,
      productionAction: args.action,
      productionScriptVersion: args.approvedScriptVersion,
    });
  } finally {
    args.setActiveProductionAction(null);
  }
}

function parseImageBeatSheetEntries(text: string): ImageBeatSheetEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: ImageBeatSheetEntry[] = [];
  let current: Partial<ImageBeatSheetEntry> | null = null;

  const flush = () => {
    if (!current) return;
    if (current.id && current.attach_after && current.description && current.prompt) {
      entries.push({
        id: current.id,
        attach_after: current.attach_after,
        description: current.description,
        prompt: current.prompt,
        ...(current.match ? { match: current.match } : {}),
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const imageHeader = line.match(/^IMAGE_(\d{1,3})$/i);
    if (imageHeader) {
      flush();
      current = { id: `IMAGE_${imageHeader[1]?.padStart(2, "0") ?? "01"}` };
      continue;
    }
    if (!current) continue;

    const attach = line.match(/^Attach after:\s*["“](.+)["”]\s*$/i);
    if (attach && attach[1]) {
      current.attach_after = attach[1].trim();
      continue;
    }

    const description = line.match(/^Description:\s*(.+)$/i);
    if (description && description[1]) {
      current.description = description[1].trim();
      continue;
    }

    const prompt = line.match(/^Prompt:\s*(.+)$/i);
    if (prompt && prompt[1]) {
      current.prompt = prompt[1].trim();
      continue;
    }

    const match = line.match(/^Match:\s*(.+)$/i);
    if (match && match[1]) {
      current.match = match[1].trim();
    }
  }

  flush();
  return entries;
}
