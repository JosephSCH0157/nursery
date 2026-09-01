import assert from "node:assert/strict";
import test from "node:test";
import { applyProductionArtifactToEpisodePackage, diagnoseThumbnailConceptParsing, hydrateEpisodePackageV2 } from "../src/lib/episode-package-v2";
import {
  EPISODE_PACKAGE_V3_SCHEMA,
  THUMBNAIL_COMPOSITION_ENGINE_VERSION,
  THUMBNAIL_PROMPT_TEMPLATE_VERSION,
  deriveThumbnailPromptPack,
  hydrateEpisodePackageV3,
  validateConceptGenerationSet,
  type ThumbnailConceptRevision,
  type ThumbnailConceptSet,
  type ThumbnailRenderRecipe,
} from "../src/lib/episode-package-v3";
import {
  appendConceptSet,
  appendLaunchSnapshot,
  appendPublicationEvent,
  canReuseLaunchSnapshotForPublish,
  proveThumbnailMutation,
  refineConcept,
  saveRenderRecipe,
} from "../src/lib/hearth-thumbnail-v3-authority";
import { isValidThumbnailPair, resolveCanonicalThumbnailPair } from "../src/lib/hearth-thumbnail-pairing";
import { DEFAULT_VARIATION_LOCKS, appendVariationBatch, createDeterministicVariationBatch, promoteRecipeVariation } from "../src/lib/hearth-thumbnail-variations";

const legacyMetadata = {
  updated_at: "2026-07-14T19:00:00.000Z",
  episode: {
    schema: "forge.episode.package.v2",
    seo: {
      titles: [{ id: "title-1", label: "A", text: "A durable title", thumbnail_text: "DURABLE", is_primary: true }],
      tags: [], description_short: null, description_long: null,
    },
    thumbnail: {
      concepts: Array.from({ length: 5 }, (_, index) => ({
        id: `legacy-${index + 1}`,
        label: `Concept ${index + 1}`,
        prompt_text: `Distinct visual direction ${index + 1}`,
        style_preset: "studio_photography",
        title_style: { font_family: "Impact" },
        brand_template_id: "legacy-brand",
      })),
      versions: [], primary_version_id: null,
    },
    launch_variants: [], spoken_beats: [],
    media_map: { version: 1, status: "draft", entries: [], generated_at: "2026-07-14T19:00:00.000Z", updated_at: "2026-07-14T19:00:00.000Z" },
    image_map: { entries: [] },
    broll_plan: { id: "b", workpiece_id: "w", version: 1, beats: [], generated_at: "2026-07-14T19:00:00.000Z" },
    cdc_plan: { id: "c", workpiece_id: "w", version: 1, entries: [], generated_at: "2026-07-14T19:00:00.000Z" },
  },
};

test("v2 hydration is deterministic, in-memory only, and separates presentation suggestions", () => {
  const before = JSON.stringify(legacyMetadata);
  const first = hydrateEpisodePackageV3(legacyMetadata);
  const second = hydrateEpisodePackageV3(structuredClone(legacyMetadata));
  assert.equal(JSON.stringify(legacyMetadata), before);
  assert.equal(first.schema, EPISODE_PACKAGE_V3_SCHEMA);
  assert.deepEqual(first, second);
  assert.equal(first.thumbnail.concept_sets[0]?.name, "Imported Concepts");
  assert.equal(first.thumbnail.concept_sets[0]?.concept_revision_ids.length, 5);
  assert.equal("brand_template_id" in first.thumbnail.concept_revisions[0]!, false);
  assert.equal(first.thumbnail.concept_revisions[0]?.presentation_suggestions?.brand_template_id, "legacy-brand");
  assert.equal(first.seo.titles[0]?.revision, 1);
});

function generatedConcepts(setId: string, authority?: ReturnType<typeof hydrateEpisodePackageV3>): ThumbnailConceptRevision[] {
  return Array.from({ length: 5 }, (_, index) => ({
    concept_lineage_id: `lineage-${index}`,
    concept_revision_id: `revision-${index}`,
    revision_number: 1,
    supersedes_revision_id: null,
    concept_set_id: setId,
    strategy_id: authority?.thumbnail.creative_strategies[0]?.id ?? "strategy",
    strategy_revision: authority?.thumbnail.creative_strategies[0]?.revision ?? 1,
    creative_brief_id: authority?.thumbnail.creative_briefs[index]?.id ?? `brief-${index}`,
    creative_brief_revision: authority?.thumbnail.creative_briefs[index]?.revision ?? 1,
    headline: `Headline ${index}`,
    image_concept: `Image concept ${index}`,
    mood_style: `Mood ${index}`,
    normalized_prompt_basis: `Prompt basis ${index}`,
    created_at: "2026-07-15T12:00:00.000Z",
    provenance: { model: "test" },
  }));
}

test("concept generation is atomic, additive, exact-five, and refinement preserves lineage", () => {
  const imported = hydrateEpisodePackageV3(legacyMetadata);
  const concepts = generatedConcepts("set-new", imported);
  const set: ThumbnailConceptSet = {
    id: "set-new", name: "New set", created_at: "2026-07-15T12:00:00.000Z", state: "active",
    approved_script_version: 7, generation_provenance: { model: "test" }, prompt_schema_version: "v1",
    source_response_hash: "abc", concept_revision_ids: concepts.map((entry) => entry.concept_revision_id),
  };
  const appended = appendConceptSet({ episodePackage: imported, conceptSet: set, concepts });
  assert.equal(appended.thumbnail.concept_sets.length, 2);
  assert.equal(imported.thumbnail.concept_sets.length, 1);
  assert.throws(() => appendConceptSet({ episodePackage: imported, conceptSet: { ...set, concept_revision_ids: set.concept_revision_ids.slice(0, 4) }, concepts: concepts.slice(0, 4) }));
  assert.ok(validateConceptGenerationSet([]).length > 0);
  assert.ok(validateConceptGenerationSet(concepts.slice(0, 4).map(({ concept_set_id: _ignored, ...concept }) => concept)).length > 0);
  assert.ok(validateConceptGenerationSet([...concepts, concepts[0]!].map(({ concept_set_id: _ignored, ...concept }) => concept)).length > 0);
  assert.ok(validateConceptGenerationSet(concepts.map(({ concept_set_id: _ignored, ...concept }, index) => index === 0
    ? { ...concept, image_concept: "placeholder" } : concept)).length > 0);
  assert.ok(validateConceptGenerationSet(concepts.map(({ concept_set_id: _ignored, ...concept }, index) => index === 1
    ? { ...concept, image_concept: concepts[0]!.image_concept } : concept)).length > 0);
  const refined = refineConcept({
    episodePackage: appended,
    revision: { ...concepts[0]!, concept_revision_id: "revision-0-v2", revision_number: 2, supersedes_revision_id: "revision-0", headline: "Refined" },
  });
  assert.equal(refined.thumbnail.concept_revisions.length, appended.thumbnail.concept_revisions.length + 1);
  assert.equal(refined.thumbnail.concept_revisions.at(-1)?.concept_lineage_id, "lineage-0");
});

test("render recipe is sole live presentation authority and prompt reconstruction is deterministic", () => {
  const imported = hydrateEpisodePackageV3(legacyMetadata);
  const concept = imported.thumbnail.concept_revisions[0]!;
  const recipe: ThumbnailRenderRecipe = {
    id: "recipe-1", revision: 1, concept_revision_id: concept.concept_revision_id,
    strategy_id: concept.strategy_id, strategy_revision: concept.strategy_revision,
    creative_brief_id: concept.creative_brief_id, creative_brief_revision: concept.creative_brief_revision,
    title_id: "title-1", title_revision: 1, provider_id: "forge", intended_aspect_ratio: "16:9",
    provider_settings: {},
    brand_template_id: "brand-1", brand_template_revision: 4, title_text: "DURABLE",
    presentation_override: { text_color: null, treatment: null, logo_visible: true, logo_placement: "top_left", logo_opacity: null, decision_origin: "automatic" },
    treatment: { typography: { font: "Inter" }, placement: { vertical: "center", horizontal_padding_percent: 8 }, safe_zone: { enabled: true }, shadow: {}, treatment: {} },
    prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
    composition_revision: 1,
    prompt_review_state: "reviewed", last_reviewed_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    created_at: "2026-07-15T12:00:00.000Z", updated_at: "2026-07-15T12:00:00.000Z",
  };
  const saved = saveRenderRecipe({ episodePackage: imported, recipe });
  const revisionTwo = saveRenderRecipe({ episodePackage: saved, recipe: { ...recipe, revision: 2, composition_revision: 2, prompt_review_state: "unreviewed" } });
  const revisionThree = saveRenderRecipe({ episodePackage: revisionTwo, recipe: { ...recipe, revision: 3, composition_revision: 3 } });
  assert.deepEqual(revisionThree.thumbnail.render_recipes.map((entry) => entry.revision), [1, 2, 3]);
  assert.throws(() => saveRenderRecipe({ episodePackage: revisionThree, recipe: { ...recipe, revision: 3 } }));
  assert.equal(saved.thumbnail.render_recipes[0]?.brand_template_id, "brand-1");
  assert.equal("brand_template_id" in concept, false);
  const first = deriveThumbnailPromptPack({ recipe, concept });
  const second = deriveThumbnailPromptPack({ recipe: structuredClone(recipe), concept: structuredClone(concept) });
  assert.deepEqual(first, second);
  assert.equal(first.canonical_serialized, second.canonical_serialized);
  assert.equal(first.canonical_hash, second.canonical_hash);
  assert.equal(first.canonical_hash.length, 64);
  assert.equal(first.positive_prompt.includes("DURABLE"), true);
  assert.equal(first.canonical_serialized.includes('"id":"title-1"'), true);
  const changedProviderSettings = deriveThumbnailPromptPack({
    recipe: { ...recipe, provider_settings: { guidance: 7 } },
    concept,
  });
  assert.notEqual(changedProviderSettings.canonical_hash, first.canonical_hash);
  assert.equal(saved.thumbnail.composition_revisions[0]?.render_recipe_id, recipe.id);
  assert.equal(saved.thumbnail.composition_revisions[0]?.revision, recipe.composition_revision);
  const reloaded = hydrateEpisodePackageV3({ episode: saved });
  assert.equal(reloaded.thumbnail.render_recipes[0]?.treatment.placement.vertical, "center");
  assert.equal(reloaded.thumbnail.render_recipes[0]?.presentation_override?.logo_placement, "top_left");
  assert.equal(imported.thumbnail.render_recipes.length, 0, "cancelling before save leaves canonical authority unchanged");
  assert.equal(deriveThumbnailPromptPack({ recipe, concept, templateVersion: "v2" }).review_state, "needs_review");
});

test("active render recipe restores the exact independent concept/title pairing", () => {
  const imported = hydrateEpisodePackageV3(legacyMetadata);
  imported.seo.titles.push({ id: "title-2", label: "B", text: "A second title", thumbnail_text: "SECOND", is_primary: false, revision: 3 });
  const secondConcept = imported.thumbnail.concept_revisions[1]!;
  const recipe: ThumbnailRenderRecipe = {
    id: "pairing", revision: 1, concept_revision_id: secondConcept.concept_revision_id,
    strategy_id: secondConcept.strategy_id, strategy_revision: secondConcept.strategy_revision,
    creative_brief_id: secondConcept.creative_brief_id, creative_brief_revision: secondConcept.creative_brief_revision,
    title_id: "title-2", title_revision: 3, title_text: "SECOND", provider_id: "forge", intended_aspect_ratio: "16:9",
    provider_settings: {},
    brand_template_id: null, brand_template_revision: null,
    treatment: { typography: {}, placement: {}, safe_zone: {}, shadow: {}, treatment: {} },
    prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
    composition_revision: 1,
    prompt_review_state: "unreviewed", last_reviewed_template_version: null,
    created_at: "2026-07-16T12:00:00.000Z", updated_at: "2026-07-16T12:00:00.000Z",
  };
  const saved = saveRenderRecipe({ episodePackage: imported, recipe });
  const pair = resolveCanonicalThumbnailPair(saved);
  assert.equal(pair.concept?.concept_revision_id, secondConcept.concept_revision_id);
  assert.equal(pair.title?.id, "title-2");
  assert.equal(pair.title?.revision, 3);
  assert.equal(isValidThumbnailPair(pair), true);

  const changedTitle = saveRenderRecipe({ episodePackage: saved, recipe: { ...recipe, revision: 2, composition_revision: 2, title_id: "title-1", title_revision: 1, title_text: "DURABLE" } });
  assert.equal(resolveCanonicalThumbnailPair(changedTitle).concept?.concept_revision_id, secondConcept.concept_revision_id);
  assert.equal(resolveCanonicalThumbnailPair(changedTitle).title?.id, "title-1");
  assert.equal(imported.thumbnail.concept_revisions[1]?.headline, secondConcept.headline);
  assert.equal(imported.seo.titles[0]?.text, "A durable title");
});

test("controlled variations are deterministic, respect locks, and promote non-destructively", () => {
  const imported = hydrateEpisodePackageV3(legacyMetadata);
  imported.seo.titles.push({ id: "title-2", label: "B", text: "Alternate title", thumbnail_text: "ALTERNATE", is_primary: false, revision: 1 });
  const concept = imported.thumbnail.concept_revisions[0]!;
  const recipe: ThumbnailRenderRecipe = { id: "variation-source", revision: 1, concept_revision_id: concept.concept_revision_id,
    strategy_id: concept.strategy_id, strategy_revision: concept.strategy_revision, creative_brief_id: concept.creative_brief_id,
    creative_brief_revision: concept.creative_brief_revision, title_id: "title-1", title_revision: 1, title_text: "DURABLE",
    provider_id: "forge", provider_settings: {}, intended_aspect_ratio: "16:9", brand_template_id: "brand", brand_template_revision: 1,
    treatment: { typography: { color: "#FFFFFF" }, placement: { vertical: "bottom" }, safe_zone: {}, shadow: {}, treatment: {} },
    prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION, composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
    composition_revision: 1, prompt_review_state: "reviewed", last_reviewed_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    created_at: "2026-07-17T10:00:00.000Z", updated_at: "2026-07-17T10:00:00.000Z" };
  const saved = saveRenderRecipe({ episodePackage: imported, recipe });
  const locks = { ...DEFAULT_VARIATION_LOCKS, title: false };
  const first = createDeterministicVariationBatch({ episodePackage: saved, sourceRecipe: recipe, brandMode: "strict_brand", locks, count: 3, createdAt: "2026-07-17T11:00:00.000Z" });
  const second = createDeterministicVariationBatch({ episodePackage: saved, sourceRecipe: recipe, brandMode: "strict_brand", locks, count: 3, createdAt: "2026-07-17T12:00:00.000Z" });
  assert.equal(first.source_identity, second.source_identity);
  assert.deepEqual(first.variations.map((entry) => entry.content_hash), second.variations.map((entry) => entry.content_hash));
  assert.equal(first.estimated_ai_credits, 0);
  assert.ok(first.variations.every((entry) => entry.candidate_recipe.concept_revision_id === recipe.concept_revision_id));
  assert.ok(first.variations.every((entry) => entry.candidate_recipe.brand_template_id === recipe.brand_template_id));
  const withBatch = appendVariationBatch(saved, first);
  const promoted = promoteRecipeVariation({ episodePackage: withBatch, batchId: first.id, variationId: first.variations[0]!.id, createdAt: "2026-07-17T13:00:00.000Z" });
  assert.equal(saved.thumbnail.render_recipes.length, 1);
  assert.equal(promoted.thumbnail.render_recipes.length, 2);
  assert.equal(promoted.thumbnail.variation_promotions.length, 1);
  assert.equal(promoted.thumbnail.variation_batches[0]?.variations.length, 3);
  const promotedAgain = promoteRecipeVariation({ episodePackage: promoted, batchId: first.id, variationId: first.variations[0]!.id, createdAt: "2026-07-17T14:00:00.000Z" });
  assert.equal(promotedAgain.thumbnail.variation_promotions.length, 1);
});

test("stored fallback summary reports its exact zero-concept parser structure", () => {
  const stored = "Research outcome: Live retrieval was unavailable in this run, so this answer is a knowledge-first fallback.\n\nHere are five thumbnail concepts that stay faithful to Script V1’s core images: the lost smell, the empty roadside stands, the invisible disease, and the 90% collapse.";
  const diagnostic = diagnoseThumbnailConceptParsing(stored);
  assert.equal(diagnostic.branch, "line_blocks");
  assert.equal(diagnostic.recognizedHeaders, 0);
  assert.equal(diagnostic.completeBlocks, 0);
  assert.deepEqual(diagnostic.concepts, []);
  assert.match(diagnostic.structuralErrors.join(" "), /No THUMBNAIL 1-5 concept headers/);
});

test("mutation proof is scoped and ignores unrelated package changes", () => {
  const expected = hydrateEpisodePackageV3(legacyMetadata);
  const canonical = structuredClone(expected);
  canonical.seo.tags.push("unrelated-concurrent-change");
  const setId = expected.thumbnail.concept_sets[0]!.id;
  assert.deepEqual(proveThumbnailMutation({ expected, canonical, kind: "concept_set", entityId: setId }), { ok: true });
  canonical.thumbnail.concept_sets[0]!.name = "Changed authority";
  assert.equal(proveThumbnailMutation({ expected, canonical, kind: "concept_set", entityId: setId }).ok, false);
});

test("launch and publication snapshots append immutable revisions", () => {
  const imported = hydrateEpisodePackageV3(legacyMetadata);
  const concept = imported.thumbnail.concept_revisions[0]!;
  const recipe: ThumbnailRenderRecipe = {
    id: "recipe-snapshot", revision: 1, concept_revision_id: concept.concept_revision_id,
    strategy_id: concept.strategy_id, strategy_revision: concept.strategy_revision,
    creative_brief_id: concept.creative_brief_id, creative_brief_revision: concept.creative_brief_revision,
    title_id: "title-1", title_revision: 1, provider_id: "forge", intended_aspect_ratio: "16:9",
    provider_settings: {},
    brand_template_id: null, brand_template_revision: null, title_text: "DURABLE",
    treatment: { typography: {}, placement: {}, safe_zone: {}, shadow: {}, treatment: {} },
    prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
    composition_revision: 1,
    prompt_review_state: "reviewed", last_reviewed_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    created_at: "2026-07-15T12:00:00.000Z", updated_at: "2026-07-15T12:00:00.000Z",
  };
  const withRecipe = saveRenderRecipe({ episodePackage: imported, recipe });
  const hash = "a".repeat(64);
  const withBase = {
    ...withRecipe,
    thumbnail: { ...withRecipe.thumbnail, base_versions: [{
      id: "base-1", asset_id: "asset-base", asset_path: "base.png", content_hash: hash,
      source_type: "forge_ai" as const, provider_id: "forge", provider_request_id: null,
      created_at: recipe.created_at, concept_revision_id: concept.concept_revision_id,
      render_recipe_id: recipe.id, render_recipe_revision: 1, intended_aspect_ratio: "16:9" as const,
      mime_type: "image/png", status: "ready" as const, error_details: null,
    }] },
  };
  const snapshot = {
    asset_id: "composite-1", asset_path: "composite.png", content_hash: hash,
    composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
    recipe_snapshot: { ...recipe, template_revision: 1, text_color: "#FFFFFF", shadow_color: "#000000",
      shadow_opacity: 0.7, placement: "bottom" as const, max_lines: 2, horizontal_padding_percent: 8 },
    recipe_snapshot_hash: hash, exported_at: recipe.created_at,
  };
  const launched = appendLaunchSnapshot({ episodePackage: withBase, launchVariantId: "launch-1", baseVersionId: "base-1", snapshot, createdAt: recipe.created_at });
  const editedRecipe = { ...recipe, revision: 2, composition_revision: 2,
    presentation_override: { text_color: null, treatment: null, logo_visible: true, logo_placement: "top_left" as const, logo_opacity: null, decision_origin: "automatic" as const },
    treatment: { ...recipe.treatment, placement: { vertical: "top", horizontal_padding_percent: 8 } } };
  const withEdit = saveRenderRecipe({ episodePackage: launched, recipe: editedRecipe });
  const revised = appendLaunchSnapshot({ episodePackage: withEdit, launchVariantId: "launch-1", baseVersionId: "base-1",
    recipeId: editedRecipe.id, recipeRevision: editedRecipe.revision,
    snapshot: { ...snapshot, asset_id: "composite-2", recipe_snapshot: { ...snapshot.recipe_snapshot, ...editedRecipe, placement: "top" as const } }, createdAt: recipe.updated_at });
  assert.deepEqual(revised.thumbnail.launch_variant_revisions.map((entry) => entry.revision), [1, 2]);
  assert.equal(revised.thumbnail.launch_variant_revisions[0]?.snapshot.asset_id, "composite-1");
  assert.equal(revised.thumbnail.launch_variant_revisions[0]?.recipe_revision, 1);
  assert.equal(revised.thumbnail.launch_variant_revisions[1]?.recipe_revision, 2);
  assert.equal(revised.thumbnail.launch_variant_revisions[1]?.snapshot.recipe_snapshot.presentation_override?.logo_placement, "top_left");
  const published = appendPublicationEvent({ episodePackage: revised, event: {
    id: "publish-1", launch_variant_id: "launch-1", launch_variant_revision: 2,
    snapshot: revised.thumbnail.launch_variant_revisions[1]!.snapshot,
    published_at: recipe.updated_at, destination: "youtube",
  } });
  assert.equal(published.thumbnail.publication_events.length, 1);
  assert.equal(revised.thumbnail.publication_events.length, 0);
  assert.equal(canReuseLaunchSnapshotForPublish({ launchRevision: revised.thumbnail.launch_variant_revisions[1]!,
    recipeRevision: 2, compositionEngineVersion: THUMBNAIL_COMPOSITION_ENGINE_VERSION, contentHash: hash }), true);
  assert.equal(canReuseLaunchSnapshotForPublish({ launchRevision: revised.thumbnail.launch_variant_revisions[1]!,
    recipeRevision: 1, compositionEngineVersion: THUMBNAIL_COMPOSITION_ENGINE_VERSION, contentHash: hash }), false);
  assert.deepEqual(proveThumbnailMutation({ expected: published, canonical: structuredClone(published),
    kind: "publication_event", entityId: "publish-1" }), { ok: true });
});

test("legacy non-thumbnail production writes preserve v3 thumbnail authority and emit v3", () => {
  const v3 = hydrateEpisodePackageV3(legacyMetadata);
  const metadata = { ...legacyMetadata, episode: v3 };
  const updated = applyProductionArtifactToEpisodePackage({
    metadata, action: "tags", rawText: JSON.stringify({ tags: ["durable", "canonical"] }), generatedAt: "2026-07-15T13:00:00.000Z",
  });
  const episode = updated.episode as EpisodePackageV3;
  assert.equal(episode.schema, EPISODE_PACKAGE_V3_SCHEMA);
  assert.deepEqual(episode.thumbnail, v3.thumbnail);
  assert.deepEqual(episode.seo.tags, ["durable", "canonical"]);
});

test("framing pack projects short and long descriptions without disturbing v3 authority", () => {
  const v3 = hydrateEpisodePackageV3(legacyMetadata);
  const updated = applyProductionArtifactToEpisodePackage({
    metadata: { ...legacyMetadata, episode: v3 },
    action: "pack",
    rawText: [
      "SHORT_DESCRIPTION:",
      "A concise canonical description.",
      "",
      "LONG_DESCRIPTION:",
      "A longer canonical description retained for release packaging.",
    ].join("\n"),
    generatedAt: "2026-09-01T12:00:00.000Z",
  });
  const episode = updated.episode as EpisodePackageV3;
  assert.equal(episode.seo.description_short, "A concise canonical description.");
  assert.equal(episode.seo.description_long, "A longer canonical description retained for release packaging.");
  assert.deepEqual(episode.thumbnail, v3.thumbnail);
});

test("v2 workspace projection preserves v3 thumbnail progress for cold-boot summaries", () => {
  const v3 = hydrateEpisodePackageV3(legacyMetadata);
  const projected = hydrateEpisodePackageV2({ ...legacyMetadata, episode: v3 });
  assert.equal(projected.thumbnail.concepts.length, v3.thumbnail.concept_revisions.length);
  assert.deepEqual(projected.thumbnail.concepts.map((entry) => entry.id), v3.thumbnail.concept_revisions.map((entry) => entry.concept_revision_id));

  const withBase = { ...v3, thumbnail: { ...v3.thumbnail, base_versions: [{
    id: "base-projection", asset_id: "asset-projection", asset_path: "thumb.png", content_hash: "a".repeat(64),
    source_type: "forge_ai" as const, provider_id: "forge", provider_request_id: null, created_at: "2026-07-15T14:00:00.000Z",
    concept_revision_id: v3.thumbnail.concept_revisions[0]!.concept_revision_id,
    render_recipe_id: "recipe-projection", render_recipe_revision: 1, intended_aspect_ratio: "16:9" as const,
    mime_type: "image/png" as const, status: "ready" as const, error_details: null,
  }], primary_base_version_id: "base-projection" } };
  const projectedWithBase = hydrateEpisodePackageV2({ ...legacyMetadata, episode: withBase });
  assert.equal(projectedWithBase.thumbnail.versions.length, 1);
  assert.equal(projectedWithBase.thumbnail.primary_version_id, "base-projection");
});

test("candidate-set projection preserves stable candidate identity across set revisions",()=>{
  const v3=hydrateEpisodePackageV3(legacyMetadata); const candidate={candidate_revision_id:"candidate-stable",candidate_ordinal:1,recipe_id:"recipe",recipe_revision:1,recipe_hash:"a".repeat(64),title_revision_id:"title-revision",concept_revision_id:"concept",base_artwork_content_hash:"b".repeat(64),structural_composition_fingerprint:"c".repeat(64),composite_asset_id:"asset",composite_content_hash:"d".repeat(64),candidate_binding_id:"binding",candidate_binding_revision:1,readability_evidence_hash:"e".repeat(64),eligibility_state:"current" as const};
  const first={candidate_set_id:"set-1",revision:1,previous_candidate_set_id:null,content_hash:"f".repeat(64),distinction_contract_version:"forge.thumbnail-candidate-distinction.v1" as const,candidates:[candidate],projected_at:"2026-07-18T00:00:00Z"};
  const second={...first,candidate_set_id:"set-2",revision:2,previous_candidate_set_id:"set-1",content_hash:"1".repeat(64),candidates:[{...candidate,candidate_ordinal:2}]};
  const hydrated=hydrateEpisodePackageV3({episode:{...v3,thumbnail:{...v3.thumbnail,candidate_sets:[first,second],active_candidate_set_id:"set-2"}}});
  assert.equal(hydrated.thumbnail.candidate_sets[0]?.candidates[0]?.candidate_revision_id,"candidate-stable"); assert.equal(hydrated.thumbnail.candidate_sets[1]?.candidates[0]?.candidate_revision_id,"candidate-stable");
  assert.deepEqual(proveThumbnailMutation({expected:hydrated,canonical:structuredClone(hydrated),kind:"candidate_set",entityId:"set-2",revision:2}),{ok:true});
});
