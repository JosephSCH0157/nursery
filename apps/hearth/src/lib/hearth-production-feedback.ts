import {
  parseDescriptionFromSeoText,
  parseSeoTitlesFromText,
  parseTagsFromText,
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
    return {
      shouldRefreshEpisodePackage: true,
      titles: parseSeoTitlesFromText(args.assistantText),
      descriptionShort: descriptions.shortDescription,
      descriptionLong: descriptions.longDescription,
      tags: [],
      warning: null,
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
    return {
      ...EMPTY_FEEDBACK,
      shouldRefreshEpisodePackage: true,
    };
  }

  return EMPTY_FEEDBACK;
}
