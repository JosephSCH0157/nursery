import type { EpisodePackageV3, EpisodeSeoTitleV3, ThumbnailConceptRevision, ThumbnailRenderRecipe } from "./episode-package-v3";

export type ThumbnailAuthoringPair = {
  recipe: ThumbnailRenderRecipe | null;
  concept: ThumbnailConceptRevision | null;
  title: EpisodeSeoTitleV3 | null;
};

export function resolveCanonicalThumbnailPair(episodePackage: EpisodePackageV3): ThumbnailAuthoringPair {
  const activeId = episodePackage.thumbnail.active_render_recipe_id;
  const recipe = activeId
    ? [...episodePackage.thumbnail.render_recipes]
      .filter((entry) => entry.id === activeId)
      .sort((left, right) => right.revision - left.revision)[0] ?? null
    : null;
  if (!recipe) return { recipe: null, concept: null, title: null };
  const concept = episodePackage.thumbnail.concept_revisions.find(
    (entry) => entry.concept_revision_id === recipe.concept_revision_id,
  ) ?? null;
  const title = episodePackage.seo.titles.find(
    (entry) => entry.id === recipe.title_id && entry.revision === recipe.title_revision,
  ) ?? null;
  return { recipe, concept, title };
}

export function isValidThumbnailPair(pair: Pick<ThumbnailAuthoringPair, "concept" | "title">): boolean {
  return Boolean(pair.concept && pair.title);
}
