import type { EpisodePackageV2 } from "../../lib/episode-package-v2";
import { hasCanonicalFraming } from "../../lib/hearth-framing-authority";
import type { HearthMetadataProgress } from "./hearth-metadata-contracts";

export function buildHearthMetadataProgress(args: {
  active: boolean;
  loaded: boolean;
  authorityAvailable: boolean;
  episodePackage: EpisodePackageV2 | null;
  canonicalTitleCount: number;
  canonicalTagCount: number;
  canonicalHasDescriptions: boolean;
  dirty: boolean;
}): HearthMetadataProgress {
  const seo = args.episodePackage?.seo;
  const titleCount = seo?.titles.filter((title) => title.text.trim().length > 0).length ?? 0;
  const tagCount = seo?.tags.length ?? 0;
  const hasShortDescription = Boolean(seo?.description_short?.trim());
  const hasLongDescription = Boolean(seo?.description_long?.trim());
  const canonicallyComplete = hasCanonicalFraming(args.episodePackage)
    || (
      args.canonicalTitleCount > 0
      && args.canonicalTagCount > 0
      && args.canonicalHasDescriptions
    );

  const completion = !args.active
    ? "inactive"
    : !args.authorityAvailable
      ? "unavailable"
      : !args.loaded
        ? "loading"
        : args.dirty
          ? "dirty"
          : canonicallyComplete
            ? "complete"
            : "incomplete";

  return {
    titleCount,
    tagCount,
    hasShortDescription,
    hasLongDescription,
    completion,
  };
}
