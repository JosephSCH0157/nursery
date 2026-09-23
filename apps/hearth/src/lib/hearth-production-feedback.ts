import {
  parseDescriptionFromSeoText,
  parseSeoTitlesFromText,
  parseTagsFromText,
  parseThumbnailConceptsFromText,
  parseThumbnailCreativeAuthorityFromText,
  type EpisodeSeoTitle,
} from "./episode-package-v2";
import { HEARTH_EPISODE_TITLE_CONTRACT } from "./hearth-episode-title-contract";
import { validatePaidThumbnailDirectionOutput } from "./hearth-thumbnail-direction-contract";

type HearthProductionAction = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "release_prep_pack";

export type HearthProductionArtifactFeedback = {
  shouldRefreshEpisodePackage: boolean;
  titles: EpisodeSeoTitle[];
  descriptionShort: string | null;
  descriptionLong: string | null;
  tags: string[];
  warning: string | null;
};

const EMPTY_FEEDBACK: HearthProductionArtifactFeedback = {
  shouldRefreshEpisodePackage: false,
  titles: [],
  descriptionShort: null,
  descriptionLong: null,
  tags: [],
  warning: null,
};

const SEO_TITLE_LABELS = ["SAFE", "SPICY", "BALANCED_1", "BALANCED_2", "BALANCED_3"] as const;

export function validateExactSeoTitleBlock(value: unknown, hardMaxWords: number = HEARTH_EPISODE_TITLE_CONTRACT.hard_max_words): { ok: true; text: string; titles: string[] } | { ok: false; error: string } {
  if (typeof value !== "string" || value.length > 2_048) return { ok: false, error: "invalid_title_output" };
  const text = value.trim();
  const lines = text.split(/\r?\n/);
  if (lines.length !== 6 || lines[0] !== "SEO_TITLES:") return { ok: false, error: "invalid_title_structure" };
  const titles: string[] = [];
  for (let index = 0; index < SEO_TITLE_LABELS.length; index += 1) {
    const prefix = `${SEO_TITLE_LABELS[index]}: `;
    const line = lines[index + 1];
    if (!line.startsWith(prefix)) return { ok: false, error: "invalid_title_labels" };
    const title = line.slice(prefix.length).trim();
    if (!title || /[<>`\r\n]/.test(title) || title.split(/\s+/).length > hardMaxWords) {
      return { ok: false, error: "invalid_title_candidate" };
    }
    titles.push(title);
  }
  if (new Set(titles.map((title) => title.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase())).size !== 5) {
    return { ok: false, error: "duplicate_title_candidate" };
  }
  return { ok: true, text, titles };
}

export function resolveHearthProductionArtifactFeedback(args: {
  action: HearthProductionAction;
  assistantText: string;
}): HearthProductionArtifactFeedback {
  if (args.action === "seo") {
    const exact = validateExactSeoTitleBlock(args.assistantText);
    const titles = parseSeoTitlesFromText(args.assistantText).filter((title) => !/^title\s*[abc]$/i.test(title.text.trim()));
    return {
      shouldRefreshEpisodePackage: true,
      titles,
      descriptionShort: null,
      descriptionLong: null,
      tags: [],
      warning: exact.ok && titles.length === 5
        ? null
        : "Generate Titles failed because Hearth did not return exactly five labeled, distinct, thumbnail-safe titles.",
    };
  }

  if (args.action === "tags") {
    const tags = parseTagsFromText(args.assistantText);
    return {
      shouldRefreshEpisodePackage: true,
      titles: [],
      descriptionShort: null,
      descriptionLong: null,
      tags,
      warning: tags.length
        ? null
        : "Generated Tags finished, but Hearth could not extract structured tags from the reply.",
    };
  }

  if (args.action === "thumbnails") {
    if (/^THUMBNAIL_A$/m.test(args.assistantText)) {
      const paid = validatePaidThumbnailDirectionOutput(args.assistantText);
      return {
        ...EMPTY_FEEDBACK,
        shouldRefreshEpisodePackage: true,
        warning: paid.ok ? null : `Thumbnail directions were not saved: ${paid.error}.`,
      };
    }
    const concepts = parseThumbnailConceptsFromText(args.assistantText);
    const authority = parseThumbnailCreativeAuthorityFromText(args.assistantText);
    const complete = concepts.length === 5
      && concepts.every((concept) => concept.label.trim() && concept.prompt_text.trim())
      && new Set(concepts.map((concept) => concept.label.trim().toLowerCase())).size === 5
      && new Set(concepts.map((concept) => concept.prompt_text.trim().toLowerCase())).size === 5;
    return {
      ...EMPTY_FEEDBACK,
      shouldRefreshEpisodePackage: true,
      warning: complete && authority
        ? null
        : complete
          ? "Thumbnail briefing was not saved because the creative strategy or one of its five actionable briefs was incomplete."
        : "Thumbnail briefing was not saved because Hearth did not return exactly five complete, distinct concept briefs.",
    };
  }

  if (args.action === "release_prep_pack") {
    const descriptions = parseDescriptionFromSeoText(args.assistantText);
    const complete = Boolean(descriptions.shortDescription && descriptions.longDescription);
    return {
      ...EMPTY_FEEDBACK,
      shouldRefreshEpisodePackage: true,
      descriptionShort: descriptions.shortDescription,
      descriptionLong: descriptions.longDescription,
      warning: complete
        ? null
        : "Framing Pack was not saved because Hearth did not return both SHORT_DESCRIPTION and LONG_DESCRIPTION.",
    };
  }

  return EMPTY_FEEDBACK;
}

export function validateHearthProductionArtifactOutput(args: {
  action: HearthProductionAction;
  assistantText: string;
}): { ok: true; feedback: HearthProductionArtifactFeedback } | { ok: false; error: string; feedback: HearthProductionArtifactFeedback } {
  const feedback = resolveHearthProductionArtifactFeedback(args);
  if (args.action === "seo" && feedback.warning) {
    return { ok: false, error: feedback.warning ?? "Generated title output was unusable.", feedback };
  }
  if (args.action === "tags" && feedback.tags.length === 0) {
    return { ok: false, error: feedback.warning ?? "Generated tag output was unusable.", feedback };
  }
  if (args.action === "thumbnails" && feedback.warning) {
    return { ok: false, error: feedback.warning, feedback };
  }
  if (args.action === "release_prep_pack" && feedback.warning) {
    return { ok: false, error: feedback.warning, feedback };
  }
  return { ok: true, feedback };
}

export function canonicalizeHearthProductionArtifactOutput(args: {
  action: HearthProductionAction;
  assistantText: string;
}): string | null {
  const validation = validateHearthProductionArtifactOutput(args);
  if (!validation.ok) return null;
  if (args.action === "seo") {
    const labels = ["SAFE", "SPICY", "BALANCED_1", "BALANCED_2", "BALANCED_3"];
    return [
      "SEO_TITLES:",
      ...validation.feedback.titles.map((title, index) => `${labels[index] ?? `OPTION_${index + 1}`}: ${title.text}`),
    ].join("\n");
  }
  if (args.action === "tags") {
    return ["TAGS_FULL:", validation.feedback.tags.join(", ")].join("\n");
  }
  return args.assistantText;
}
