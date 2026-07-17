import {
  canonicalContentHash,
  canonicalSerialize,
  deterministicUuid,
  type EpisodePackageV3,
  type ThumbnailBrandMode,
  type ThumbnailRenderRecipe,
  type ThumbnailVariationBatch,
  type ThumbnailVariationLocks,
  type ThumbnailVariationPromotion,
} from "./episode-package-v3";
import { saveRenderRecipe } from "./hearth-thumbnail-v3-authority";

export const DEFAULT_VARIATION_LOCKS: ThumbnailVariationLocks = {
  concept: true, title: true, subject: true, composition: false, emotional_tone: true,
  color_palette: false, typography: true, brand_template: true, provider: true,
};

const PALETTES = ["#F97316", "#22C55E", "#38BDF8", "#F43F5E", "#EAB308"];
const PLACEMENTS = ["top", "center", "bottom"] as const;

function latestSourceRecipe(pkg: EpisodePackageV3, id: string, revision: number) {
  return pkg.thumbnail.render_recipes.find((entry) => entry.id === id && entry.revision === revision) ?? null;
}

export function createDeterministicVariationBatch(args: { episodePackage: EpisodePackageV3; sourceRecipe: ThumbnailRenderRecipe;
  brandMode: ThumbnailBrandMode; locks: ThumbnailVariationLocks; count: number; createdAt: string }): ThumbnailVariationBatch {
  if (!latestSourceRecipe(args.episodePackage, args.sourceRecipe.id, args.sourceRecipe.revision)) throw new Error("Variation source must be an exact canonical recipe revision.");
  const count = Math.max(2, Math.min(5, Math.floor(args.count)));
  const effectiveLocks = args.brandMode === "strict_brand" ? { ...args.locks, typography: true, brand_template: true } : args.locks;
  if (Object.values(effectiveLocks).every(Boolean)) throw new Error("Unlock at least one property before generating controlled variations.");
  const sourceIdentity = canonicalContentHash({ source_recipe_id: args.sourceRecipe.id, source_recipe_revision: args.sourceRecipe.revision,
    brand_mode: args.brandMode, locks: effectiveLocks, count });
  const batchId = deterministicUuid("thumbnail-variation-batch", sourceIdentity);
  const concepts = args.episodePackage.thumbnail.concept_revisions;
  const titles = args.episodePackage.seo.titles;
  const sourceConceptIndex = Math.max(0, concepts.findIndex((entry) => entry.concept_revision_id === args.sourceRecipe.concept_revision_id));
  const sourceTitleIndex = Math.max(0, titles.findIndex((entry) => entry.id === args.sourceRecipe.title_id && entry.revision === args.sourceRecipe.title_revision));
  const variations = Array.from({ length: count }, (_, index) => {
    const concept = effectiveLocks.concept ? concepts[sourceConceptIndex] : concepts[(sourceConceptIndex + index + 1) % concepts.length];
    const title = effectiveLocks.title ? titles[sourceTitleIndex] : titles[(sourceTitleIndex + index + 1) % titles.length];
    if (!concept || !title) throw new Error("Variation authority requires at least one canonical concept and title.");
    const typography = { ...args.sourceRecipe.treatment.typography,
      ...(!effectiveLocks.color_palette ? { color: PALETTES[index % PALETTES.length] } : {}),
      ...(!effectiveLocks.typography && args.brandMode !== "strict_brand" ? { emphasis: index % 2 ? "condensed" : "wide" } : {}) };
    const placement = { ...args.sourceRecipe.treatment.placement,
      ...(!effectiveLocks.composition ? { vertical: PLACEMENTS[index % PLACEMENTS.length], variation_offset: index + 1 } : {}) };
    const variationId = deterministicUuid("thumbnail-recipe-variation", `${batchId}:${index + 1}`);
    const candidate: ThumbnailRenderRecipe = { ...args.sourceRecipe, id: variationId, revision: 1,
      concept_revision_id: concept.concept_revision_id, strategy_id: concept.strategy_id, strategy_revision: concept.strategy_revision,
      creative_brief_id: concept.creative_brief_id, creative_brief_revision: concept.creative_brief_revision,
      title_id: title.id, title_revision: title.revision, title_text: title.thumbnail_text || title.text,
      provider_settings: effectiveLocks.provider ? args.sourceRecipe.provider_settings : { ...args.sourceRecipe.provider_settings, variation_seed: index + 1 },
      treatment: { ...args.sourceRecipe.treatment, typography, placement }, composition_revision: 1,
      prompt_review_state: "needs_review", last_reviewed_template_version: null,
      created_at: args.sourceRecipe.updated_at, updated_at: args.sourceRecipe.updated_at };
    const changeSpecification = { ordinal: index + 1,
      changed_properties: Object.entries(effectiveLocks).filter(([, locked]) => !locked).map(([property]) => property),
      palette: effectiveLocks.color_palette ? null : PALETTES[index % PALETTES.length],
      placement: effectiveLocks.composition ? null : PLACEMENTS[index % PLACEMENTS.length] };
    const serialized = canonicalSerialize({ candidate_recipe: candidate, change_specification: changeSpecification });
    return { id: variationId, ordinal: index + 1, label: `Variation ${index + 1}`,
      change_specification: changeSpecification, candidate_recipe: candidate,
      canonical_serialized: serialized, content_hash: canonicalContentHash(serialized) };
  });
  if (new Set(variations.map((entry) => entry.content_hash)).size !== variations.length) throw new Error("Controlled variations must be distinct.");
  return { id: batchId, source_recipe_id: args.sourceRecipe.id, source_recipe_revision: args.sourceRecipe.revision,
    brand_mode: args.brandMode, locks: effectiveLocks, requested_count: count, generation_kind: "deterministic_recipe",
    estimated_ai_credits: 0, source_identity: sourceIdentity, variations, created_at: args.createdAt };
}

export function appendVariationBatch(pkg: EpisodePackageV3, batch: ThumbnailVariationBatch): EpisodePackageV3 {
  const existing = pkg.thumbnail.variation_batches.find((entry) => entry.source_identity === batch.source_identity);
  if (existing) return { ...pkg, thumbnail: { ...pkg.thumbnail, active_variation_batch_id: existing.id } };
  if (batch.variations.length !== batch.requested_count || batch.variations.length < 2) throw new Error("Variation batch is incomplete.");
  return { ...pkg, thumbnail: { ...pkg.thumbnail, variation_batches: [...pkg.thumbnail.variation_batches, batch], active_variation_batch_id: batch.id } };
}

export function promoteRecipeVariation(args: { episodePackage: EpisodePackageV3; batchId: string; variationId: string; createdAt: string }) {
  const batch = args.episodePackage.thumbnail.variation_batches.find((entry) => entry.id === args.batchId);
  const variation = batch?.variations.find((entry) => entry.id === args.variationId);
  if (!batch || !variation) throw new Error("Variation promotion requires an exact canonical batch and variation.");
  const existing = args.episodePackage.thumbnail.variation_promotions.find((entry) => entry.variation_batch_id === batch.id && entry.variation_id === variation.id);
  if (existing) return args.episodePackage;
  const recipe = { ...variation.candidate_recipe, created_at: args.createdAt, updated_at: args.createdAt };
  const withRecipe = saveRenderRecipe({ episodePackage: args.episodePackage, recipe });
  const promotion: ThumbnailVariationPromotion = { id: deterministicUuid("thumbnail-variation-promotion", `${batch.id}:${variation.id}`),
    variation_batch_id: batch.id, variation_id: variation.id, promoted_recipe_id: recipe.id,
    promoted_recipe_revision: recipe.revision, created_at: args.createdAt };
  return { ...withRecipe, thumbnail: { ...withRecipe.thumbnail,
    variation_promotions: [...withRecipe.thumbnail.variation_promotions, promotion] } };
}
