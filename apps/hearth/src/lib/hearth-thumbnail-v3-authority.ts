import {
  canonicalSerialize,
  canonicalContentHash,
  deterministicUuid,
  deriveThumbnailPromptPack,
  thumbnailConceptSetCardinality,
  validateConceptGenerationSet,
  type EpisodePackageV3,
  type ThumbnailBaseVersion,
  type ThumbnailCompositeSnapshot,
  type ThumbnailConceptRevision,
  type ThumbnailConceptSet,
  type ThumbnailCompositionRevision,
  type ThumbnailLaunchVariantRevision,
  type ThumbnailPublicationEvent,
  type ThumbnailRenderRecipe,
} from "./episode-package-v3";

export type ThumbnailMutationProof =
  | { ok: true }
  | { ok: false; reason: string };

export function appendConceptSet(args: {
  episodePackage: EpisodePackageV3;
  conceptSet: ThumbnailConceptSet;
  concepts: readonly ThumbnailConceptRevision[];
}): EpisodePackageV3 {
  const expectedCount = thumbnailConceptSetCardinality(args.conceptSet);
  const errors = validateConceptGenerationSet(
    args.concepts.map(({ concept_set_id: _ignored, ...concept }) => concept),
    expectedCount,
  );
  if (errors.length) throw new Error(errors.join(" "));
  if (args.concepts.some((concept) => concept.concept_set_id !== args.conceptSet.id)) {
    throw new Error("Every concept revision must belong to the new concept set.");
  }
  for (const concept of args.concepts) {
    const strategy = args.episodePackage.thumbnail.creative_strategies.find(
      (entry) => entry.id === concept.strategy_id && entry.revision === concept.strategy_revision,
    );
    const brief = args.episodePackage.thumbnail.creative_briefs.find(
      (entry) => entry.id === concept.creative_brief_id && entry.revision === concept.creative_brief_revision,
    );
    if (!strategy || !brief || brief.strategy_id !== strategy.id || brief.strategy_revision !== strategy.revision) {
      throw new Error("Every concept must reference an exact canonical strategy and creative brief revision.");
    }
  }
  if (args.conceptSet.concept_revision_ids.length !== expectedCount
    || args.conceptSet.concept_revision_ids.some((id, index) => id !== args.concepts[index]?.concept_revision_id)) {
    throw new Error(`Concept-set revision identity does not match its ${expectedCount} immutable revisions.`);
  }
  const existingIds = new Set(args.episodePackage.thumbnail.concept_revisions.map((entry) => entry.concept_revision_id));
  if (args.concepts.some((entry) => existingIds.has(entry.concept_revision_id))) {
    throw new Error("Concept revision IDs are immutable and globally unique within the package.");
  }
  return {
    ...args.episodePackage,
    thumbnail: {
      ...args.episodePackage.thumbnail,
      concept_sets: [...args.episodePackage.thumbnail.concept_sets, args.conceptSet],
      concept_revisions: [...args.episodePackage.thumbnail.concept_revisions, ...args.concepts],
      active_concept_set_id: args.conceptSet.id,
    },
  };
}

export function refineConcept(args: {
  episodePackage: EpisodePackageV3;
  revision: ThumbnailConceptRevision;
}): EpisodePackageV3 {
  const prior = args.episodePackage.thumbnail.concept_revisions.find(
    (entry) => entry.concept_revision_id === args.revision.supersedes_revision_id,
  );
  if (!prior) throw new Error("A refinement must supersede an existing exact revision.");
  if (prior.concept_lineage_id !== args.revision.concept_lineage_id) throw new Error("A refinement cannot change concept lineage.");
  if (args.revision.revision_number !== prior.revision_number + 1) throw new Error("Concept revisions must increase monotonically within a lineage.");
  if (args.episodePackage.thumbnail.concept_revisions.some((entry) => entry.concept_revision_id === args.revision.concept_revision_id)) {
    throw new Error("Refinement must create a fresh immutable revision ID.");
  }
  return {
    ...args.episodePackage,
    thumbnail: {
      ...args.episodePackage.thumbnail,
      concept_revisions: [...args.episodePackage.thumbnail.concept_revisions, args.revision],
    },
  };
}

export function saveRenderRecipe(args: {
  episodePackage: EpisodePackageV3;
  recipe: ThumbnailRenderRecipe;
}): EpisodePackageV3 {
  if (!args.episodePackage.thumbnail.concept_revisions.some((entry) => entry.concept_revision_id === args.recipe.concept_revision_id)) {
    throw new Error("Render recipe must reference an exact persisted concept revision.");
  }
  const title = args.episodePackage.seo.titles.find((entry) => entry.id === args.recipe.title_id);
  if (!title || title.revision !== args.recipe.title_revision) throw new Error("Render recipe must reference an exact title revision.");
  const strategy = args.episodePackage.thumbnail.creative_strategies.find(
    (entry) => entry.id === args.recipe.strategy_id && entry.revision === args.recipe.strategy_revision,
  );
  const brief = args.episodePackage.thumbnail.creative_briefs.find(
    (entry) => entry.id === args.recipe.creative_brief_id && entry.revision === args.recipe.creative_brief_revision,
  );
  if (!strategy || !brief || brief.strategy_id !== strategy.id || brief.strategy_revision !== strategy.revision) {
    throw new Error("Render recipe must reference an exact strategy and creative brief revision.");
  }
  const concept = args.episodePackage.thumbnail.concept_revisions.find((entry) => entry.concept_revision_id === args.recipe.concept_revision_id)!;
  if (concept.strategy_id !== strategy.id || concept.strategy_revision !== strategy.revision
    || concept.creative_brief_id !== brief.id || concept.creative_brief_revision !== brief.revision) {
    throw new Error("Render recipe authority chain does not match the selected concept revision.");
  }
  const prior = args.episodePackage.thumbnail.render_recipes
    .filter((entry) => entry.id === args.recipe.id)
    .sort((left, right) => right.revision - left.revision)[0];
  if (prior && args.recipe.revision !== prior.revision + 1) throw new Error("Recipe updates must create the next immutable recipe revision.");
  if (prior && args.recipe.composition_revision !== prior.composition_revision + 1) {
    throw new Error("Composition revisions must increase with immutable render-recipe revisions.");
  }
  const recipes = prior
    ? [...args.episodePackage.thumbnail.render_recipes, args.recipe]
    : [...args.episodePackage.thumbnail.render_recipes, args.recipe];
  const compositionSerialized = canonicalSerialize({ render_recipe_id: args.recipe.id,
    render_recipe_revision: args.recipe.revision, composition_engine_version: args.recipe.composition_engine_version,
    title_id: args.recipe.title_id, title_revision: args.recipe.title_revision,
    title_text: args.recipe.title_text, treatment: args.recipe.treatment });
  const composition: ThumbnailCompositionRevision = {
    id: deterministicUuid("thumbnail-composition", `${args.recipe.id}:${args.recipe.revision}`),
    revision: args.recipe.composition_revision, render_recipe_id: args.recipe.id,
    render_recipe_revision: args.recipe.revision, composition_engine_version: args.recipe.composition_engine_version,
    title_id: args.recipe.title_id, title_revision: args.recipe.title_revision, title_text: args.recipe.title_text,
    treatment: args.recipe.treatment, canonical_serialized: compositionSerialized,
    content_hash: canonicalContentHash(compositionSerialized), created_at: args.recipe.updated_at,
  };
  return {
    ...args.episodePackage,
    thumbnail: { ...args.episodePackage.thumbnail, render_recipes: recipes, active_render_recipe_id: args.recipe.id,
      composition_revisions: [...args.episodePackage.thumbnail.composition_revisions, composition],
      active_composition_revision_id: composition.id },
  };
}

export function assertBaseVersionAuthority(pkg: EpisodePackageV3, base: ThumbnailBaseVersion): void {
  const recipe = pkg.thumbnail.render_recipes.find(
    (entry) => entry.id === base.render_recipe_id && entry.revision === base.render_recipe_revision,
  );
  if (!recipe) throw new Error("Base version must reference an exact immutable recipe revision.");
  if (recipe.concept_revision_id !== base.concept_revision_id) throw new Error("Base version concept and recipe authority disagree.");
  if (base.status === "ready" && !/^[a-f0-9]{64}$/i.test(base.content_hash)) throw new Error("Ready base artwork requires a canonical SHA-256 hash.");
}

export function proveThumbnailMutation(args: {
  expected: EpisodePackageV3;
  canonical: EpisodePackageV3;
  kind: "concept_set" | "concept_revision" | "recipe" | "base_version" | "primary" | "launch_revision" | "publication_event" | "variation_batch" | "variation_promotion" | "brand_binding" | "candidate_set";
  entityId: string;
  revision?: number;
  protectedRelationships?: readonly { versionId: string; conceptRevisionId: string }[];
}): ThumbnailMutationProof {
  const expected = findScoped(args.expected, args.kind, args.entityId, args.revision);
  const canonical = findScoped(args.canonical, args.kind, args.entityId, args.revision);
  if (!expected || !canonical) return { ok: false, reason: "Expected thumbnail entity was not recovered through canonical readback." };
  if (canonicalSerialize(expected) !== canonicalSerialize(canonical)) {
    return { ok: false, reason: "Canonical readback did not match the promised thumbnail mutation." };
  }
  for (const relationship of args.protectedRelationships ?? []) {
    const version = args.canonical.thumbnail.base_versions.find((entry) => entry.id === relationship.versionId);
    if (!version || version.concept_revision_id !== relationship.conceptRevisionId) {
      return { ok: false, reason: "A protected historical concept relationship changed." };
    }
  }
  return { ok: true };
}

function findScoped(pkg: EpisodePackageV3, kind: Parameters<typeof proveThumbnailMutation>[0]["kind"], id: string, revision?: number): unknown {
  switch (kind) {
    case "concept_set": return pkg.thumbnail.concept_sets.find((entry) => entry.id === id);
    case "concept_revision": return pkg.thumbnail.concept_revisions.find((entry) => entry.concept_revision_id === id);
    case "recipe": {
      const recipe = pkg.thumbnail.render_recipes.find((entry) => entry.id === id && (revision == null || entry.revision === revision));
      if (!recipe) return null;
      const composition = pkg.thumbnail.composition_revisions.find(
        (entry) => entry.render_recipe_id === recipe.id && entry.render_recipe_revision === recipe.revision,
      );
      return { recipe, composition };
    }
    case "base_version": return pkg.thumbnail.base_versions.find((entry) => entry.id === id);
    case "primary": return pkg.thumbnail.primary_base_version_id === id ? id : null;
    case "launch_revision": return pkg.thumbnail.launch_variant_revisions.find((entry) => entry.launch_variant_id === id && entry.revision === revision);
    case "publication_event": return pkg.thumbnail.publication_events.find((entry) => entry.id === id);
    case "variation_batch": return pkg.thumbnail.variation_batches.find((entry) => entry.id === id);
    case "variation_promotion": return pkg.thumbnail.variation_promotions.find((entry) => entry.id === id);
    case "brand_binding": return pkg.brand.binding?.active.id === id ? pkg.brand.binding : null;
    case "candidate_set": return pkg.thumbnail.candidate_sets.find((entry) => entry.candidate_set_id === id);
  }
}

export function appendLaunchSnapshot(args: {
  episodePackage: EpisodePackageV3;
  launchVariantId: string;
  baseVersionId: string;
  recipeId?: string;
  recipeRevision?: number;
  snapshot: ThumbnailCompositeSnapshot;
  status?: ThumbnailLaunchVariantRevision["status"];
  createdAt: string;
}): EpisodePackageV3 {
  const base = args.episodePackage.thumbnail.base_versions.find((entry) => entry.id === args.baseVersionId);
  if (!base || base.status !== "ready") throw new Error("Launch requires ready, hash-verified base artwork.");
  assertBaseVersionAuthority(args.episodePackage, base);
  if (!/^[a-f0-9]{64}$/i.test(args.snapshot.content_hash)) throw new Error("Composite snapshot requires a canonical SHA-256 hash.");
  const recipe = args.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === (args.recipeId ?? base.render_recipe_id)
      && entry.revision === (args.recipeRevision ?? base.render_recipe_revision),
  );
  if (!recipe) throw new Error("Launch recipe authority is missing.");
  if (recipe.concept_revision_id !== base.concept_revision_id) {
    throw new Error("Launch recipe and base artwork must reference the same canonical concept revision.");
  }
  const prior = args.episodePackage.thumbnail.launch_variant_revisions
    .filter((entry) => entry.launch_variant_id === args.launchVariantId)
    .sort((a, b) => b.revision - a.revision)[0];
  const next: ThumbnailLaunchVariantRevision = {
    launch_variant_id: args.launchVariantId,
    revision: (prior?.revision ?? 0) + 1,
    supersedes_revision: prior?.revision ?? null,
    base_version_id: base.id,
    concept_revision_id: base.concept_revision_id,
    title_id: recipe.title_id,
    title_revision: recipe.title_revision,
    recipe_id: recipe.id,
    recipe_revision: recipe.revision,
    snapshot: args.snapshot,
    status: args.status ?? "ready",
    created_at: args.createdAt,
  };
  return {
    ...args.episodePackage,
    thumbnail: {
      ...args.episodePackage.thumbnail,
      launch_variant_revisions: [...args.episodePackage.thumbnail.launch_variant_revisions, next],
    },
  };
}

export function rebuildActivePromptPack(pkg: EpisodePackageV3) {
  const recipe = [...pkg.thumbnail.render_recipes]
    .filter((entry) => entry.id === pkg.thumbnail.active_render_recipe_id)
    .sort((a, b) => b.revision - a.revision)[0];
  if (!recipe) return null;
  const concept = pkg.thumbnail.concept_revisions.find((entry) => entry.concept_revision_id === recipe.concept_revision_id);
  if (!concept) return null;
  const strategy = pkg.thumbnail.creative_strategies.find((entry) => entry.id === recipe.strategy_id && entry.revision === recipe.strategy_revision);
  const brief = pkg.thumbnail.creative_briefs.find((entry) => entry.id === recipe.creative_brief_id && entry.revision === recipe.creative_brief_revision);
  return deriveThumbnailPromptPack({ recipe, concept, strategy, brief });
}

export function canReuseLaunchSnapshotForPublish(args: {
  launchRevision: ThumbnailLaunchVariantRevision;
  recipeRevision: number;
  compositionEngineVersion: string;
  contentHash: string;
}): boolean {
  return args.launchRevision.recipe_revision === args.recipeRevision
    && args.launchRevision.snapshot.composition_engine_version === args.compositionEngineVersion
    && args.launchRevision.snapshot.content_hash === args.contentHash;
}

export function appendPublicationEvent(args: {
  episodePackage: EpisodePackageV3;
  event: ThumbnailPublicationEvent;
}): EpisodePackageV3 {
  if (args.episodePackage.thumbnail.publication_events.some((entry) => entry.id === args.event.id)) {
    throw new Error("Publication event IDs are immutable and unique.");
  }
  const launch = args.episodePackage.thumbnail.launch_variant_revisions.find(
    (entry) => entry.launch_variant_id === args.event.launch_variant_id
      && entry.revision === args.event.launch_variant_revision,
  );
  if (!launch) throw new Error("Publication must reference an exact launch revision.");
  if (!/^[a-f0-9]{64}$/i.test(args.event.snapshot.content_hash)) throw new Error("Publication snapshot requires a canonical SHA-256 hash.");
  return {
    ...args.episodePackage,
    thumbnail: {
      ...args.episodePackage.thumbnail,
      publication_events: [...args.episodePackage.thumbnail.publication_events, args.event],
    },
  };
}
