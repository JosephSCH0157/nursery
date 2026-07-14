import {
  parseDescriptionFromSeoText,
  parseSeoTitlesFromText,
  parseTagsFromText,
  parseThumbnailConceptsFromText,
  type EpisodeSeoTitle,
} from "./episode-package-v2";

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

export function resolveHearthProductionArtifactFeedback(args: {
  action: HearthProductionAction;
  assistantText: string;
}): HearthProductionArtifactFeedback {
  if (args.action === "seo") {
    const descriptions = parseDescriptionFromSeoText(args.assistantText);
    const titles = parseSeoTitlesFromText(args.assistantText).filter((title) => !/^title\s*[abc]$/i.test(title.text.trim()));
    return {
      shouldRefreshEpisodePackage: true,
      titles,
      descriptionShort: descriptions.shortDescription,
      descriptionLong: descriptions.longDescription,
      tags: [],
      warning: titles.length >= 3
        ? null
        : "Generate Titles failed because Hearth did not return at least three usable titles.",
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
    const concepts = parseThumbnailConceptsFromText(args.assistantText);
    return {
      ...EMPTY_FEEDBACK,
      shouldRefreshEpisodePackage: true,
      warning: concepts.length
        ? null
        : "Thumbnail briefing finished, but Hearth could not extract structured concept briefs from the reply.",
    };
  }

  return EMPTY_FEEDBACK;
}

export function validateHearthProductionArtifactOutput(args: {
  action: HearthProductionAction;
  assistantText: string;
}): { ok: true; feedback: HearthProductionArtifactFeedback } | { ok: false; error: string; feedback: HearthProductionArtifactFeedback } {
  const feedback = resolveHearthProductionArtifactFeedback(args);
  if (args.action === "seo" && feedback.titles.length < 3) {
    return { ok: false, error: feedback.warning ?? "Generated title output was unusable.", feedback };
  }
  if (args.action === "tags" && feedback.tags.length === 0) {
    return { ok: false, error: feedback.warning ?? "Generated tag output was unusable.", feedback };
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
      ...(validation.feedback.descriptionLong
        ? ["", "DESCRIPTION:", validation.feedback.descriptionLong]
        : []),
    ].join("\n");
  }
  if (args.action === "tags") {
    return ["TAGS_FULL:", validation.feedback.tags.join(", ")].join("\n");
  }
  return args.assistantText;
}
