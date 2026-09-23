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
  const conceptSet = conceptSetId
    ? (pkg.thumbnail.concept_sets ?? []).find((entry) => entry.id === conceptSetId) ?? null
    : null;
  const concepts = conceptSet
    ? conceptSet.concept_revision_ids
      .map((id) => pkg.thumbnail.concept_revisions.find((entry) => entry.concept_revision_id === id) ?? null)
      .filter((entry): entry is EpisodePackageV3["thumbnail"]["concept_revisions"][number] => Boolean(entry))
      .slice(0, 3)
    : (() => {
        const latestByLineage = new Map<string, EpisodePackageV3["thumbnail"]["concept_revisions"][number]>();
        for (const entry of pkg.thumbnail.concept_revisions) latestByLineage.set(entry.concept_lineage_id, entry);
        return [...latestByLineage.values()]
          .sort((left, right) => left.concept_lineage_id.localeCompare(right.concept_lineage_id) || left.revision_number - right.revision_number)
          .slice(0, 3);
      })();
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
  if (!status) return {
    ready: true,
    label: "Brand settings loading",
    message: "Hearth is reading the workspace default and episode binding from Tongs.",
    workspaceDefaultLabel: "Loading from Tongs…",
    episodeBindingLabel: "Loading from Tongs…",
    automaticResolutionLabel: "Waiting for Tongs",
  };
  const workspaceDefaultLabel = status.workspace_default_profile_label ?? "None configured";
  const ready = status.state === "canonical_branded" || (status.state === "stale_projection" && status.binding?.state === "profile" && !!status.profile_label);
  if (ready) {
    const profileLabel = status.profile_label ?? "Brand profile";
    return {
      ready: true,
      label: `Episode brand: ${profileLabel}`,
      message: "Automatic will use this episode’s verified Tongs brand binding.",
      workspaceDefaultLabel,
      episodeBindingLabel: profileLabel,
      automaticResolutionLabel: profileLabel,
    };
  }
  const canonicallyUnbranded = status.binding?.state === "disabled" || status.state === "canonical_unbranded";
  return {
    ready: false,
    label: canonicallyUnbranded ? "Episode brand: Forge Standard" : "Episode brand unavailable",
    message: canonicallyUnbranded
      ? "No verified thumbnail logo is available in this episode’s canonical Brand Profile. Automatic will use Forge Standard."
      : "No verified thumbnail logo is available in this episode’s canonical Brand Profile. Automatic will use Forge Standard.",
    workspaceDefaultLabel,
    episodeBindingLabel: canonicallyUnbranded ? "Forge Standard" : status.profile_label ? `${status.profile_label} (needs attention)` : "Brand binding needs attention",
    automaticResolutionLabel: "Forge Standard fallback",
  };
}

export function creatorThumbnailError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("expected") && normalized.includes("revision")) return "This episode changed in another window. Your work is safe. Review the latest changes, then retry.";
  if (normalized.includes("pairwise") || normalized.includes("distinction")) return "Two thumbnails are too similar for a useful test. Revise the closest-looking direction, then retry.";
  if (normalized.includes("readability")) return "One thumbnail is difficult to read at feed size. Edit its text treatment, then retry.";
  if (normalized.includes("brand_style_unavailable") || normalized.includes("brand could not be applied")) return "That brand style is not ready for thumbnails. Choose Automatic or Forge standard, or finish the brand style in Tongs.";
  if (normalized.includes("workspace default brand is no longer ready")) return "The workspace default is no longer ready for thumbnails. Review it in Tongs, then retry.";
  if (normalized.includes("brand")) return "This branded thumbnail needs review. Forge standard thumbnails remain available.";
  return message;
}
