import type { EpisodePackageV3 } from "./episode-package-v3";
import type { ThumbnailBrandAuthorityStatus } from "./hearth-thumbnail-v3-api";

export type ThumbnailDirectionView = {
  key: "A" | "B" | "C";
  name: string;
  thumbnailText: string;
  visual: string;
  approach: string;
  conceptRevisionId: string;
  titleId: string | null;
  titleRevision: number | null;
};

const DIRECTION_KEYS = ["A", "B", "C"] as const;

export function buildThumbnailDirections(pkg: EpisodePackageV3, conceptSetId: string | null): ThumbnailDirectionView[] {
  const latestByLineage = new Map<string, EpisodePackageV3["thumbnail"]["concept_revisions"][number]>();
  for (const entry of pkg.thumbnail.concept_revisions) {
    if (!conceptSetId || entry.concept_set_id === conceptSetId) latestByLineage.set(entry.concept_lineage_id, entry);
  }
  const concepts = [...latestByLineage.values()]
    .sort((left, right) => left.concept_lineage_id.localeCompare(right.concept_lineage_id) || left.revision_number - right.revision_number)
    .slice(0, 3);
  const titles = pkg.seo.titles.slice(0, 3);
  return concepts.map((concept, index) => {
    const title = titles[index] ?? null;
    const brief = pkg.thumbnail.creative_briefs.find((entry) => entry.id === concept.creative_brief_id && entry.revision === concept.creative_brief_revision);
    const strategy = pkg.thumbnail.creative_strategies.find((entry) => entry.id === concept.strategy_id && entry.revision === concept.strategy_revision);
    return {
      key: DIRECTION_KEYS[index]!,
      name: concept.headline,
      thumbnailText: title ? (title.thumbnail_text || title.text).trim() : "Thumbnail text needed",
      visual: brief?.subject_direction ?? concept.image_concept,
      approach: brief?.emotional_tone ?? strategy?.editorial_positioning ?? "Distinct editorial direction",
      conceptRevisionId: concept.concept_revision_id,
      titleId: title?.id ?? null,
      titleRevision: title?.revision ?? null,
    };
  });
}

export function creatorBrandStatus(status: ThumbnailBrandAuthorityStatus | null) {
  if (!status) return { ready: false, label: "Checking brand…", message: "Hearth is checking the active brand profile." };
  const ready = status.state === "canonical_branded";
  if (ready) return { ready, label: `Brand: ${status.profile_label ?? "Active profile"} — Active`, message: "Approved brand styles will be applied automatically." };
  return {
    ready: false,
    label: "Brand setup needed",
    message: "Your brand profile needs a thumbnail text style before Hearth can create branded thumbnails.",
  };
}

export function creatorThumbnailError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("expected") && normalized.includes("revision")) return "This episode changed in another window. Your work is safe. Review the latest changes, then retry.";
  if (normalized.includes("pairwise") || normalized.includes("distinction")) return "Two thumbnails are too similar for a useful test. Revise the closest-looking direction, then retry.";
  if (normalized.includes("readability")) return "One thumbnail is difficult to read at feed size. Edit its text treatment, then retry.";
  if (normalized.includes("brand")) return "One thumbnail no longer matches the active brand. Review its brand treatment, then retry.";
  return message;
}
