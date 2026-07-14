import type { EpisodePackageV2, EpisodeSeo } from "./episode-package-v2";
import { ensureSeoV2 } from "./episode-package-v2";

export type CanonicalFraming = EpisodeSeo;

export function resolveCanonicalFraming(episodePackage: EpisodePackageV2): CanonicalFraming {
  return ensureSeoV2(episodePackage).seo;
}

export function hasCanonicalFraming(episodePackage: EpisodePackageV2 | null): boolean {
  if (!episodePackage) return false;
  const framing = resolveCanonicalFraming(episodePackage);
  return framing.titles.some((title) => title.text.trim().length > 0)
    && framing.tags.length > 0
    && Boolean(framing.description_short?.trim())
    && Boolean(framing.description_long?.trim());
}

export function canonicalFramingEquals(left: EpisodePackageV2, right: EpisodePackageV2): boolean {
  return JSON.stringify(resolveCanonicalFraming(left)) === JSON.stringify(resolveCanonicalFraming(right));
}
