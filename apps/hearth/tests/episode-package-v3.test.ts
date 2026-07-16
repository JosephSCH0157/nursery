import assert from "node:assert/strict";
import test from "node:test";
import { applyProductionArtifactToEpisodePackage } from "../src/lib/episode-package-v2";
import {
  EPISODE_PACKAGE_V3_SCHEMA,
  THUMBNAIL_COMPOSITION_ENGINE_VERSION,
  THUMBNAIL_PROMPT_TEMPLATE_VERSION,
  deriveThumbnailPromptPack,
  hydrateEpisodePackageV3,
  type ThumbnailConceptRevision,
  type ThumbnailConceptSet,
  type ThumbnailRenderRecipe,
} from "../src/lib/episode-package-v3";
import {
  appendConceptSet,
  appendLaunchSnapshot,
  appendPublicationEvent,
  proveThumbnailMutation,
  refineConcept,
  saveRenderRecipe,
} from "../src/lib/hearth-thumbnail-v3-authority";

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

function generatedConcepts(setId: string): ThumbnailConceptRevision[] {
  return Array.from({ length: 5 }, (_, index) => ({
    concept_lineage_id: `lineage-${index}`,
    concept_revision_id: `revision-${index}`,
    revision_number: 1,
    supersedes_revision_id: null,
    concept_set_id: setId,
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
  const concepts = generatedConcepts("set-new");
  const set: ThumbnailConceptSet = {
    id: "set-new", name: "New set", created_at: "2026-07-15T12:00:00.000Z", state: "active",
    approved_script_version: 7, generation_provenance: { model: "test" }, prompt_schema_version: "v1",
    source_response_hash: "abc", concept_revision_ids: concepts.map((entry) => entry.concept_revision_id),
  };
  const appended = appendConceptSet({ episodePackage: imported, conceptSet: set, concepts });
  assert.equal(appended.thumbnail.concept_sets.length, 2);
  assert.equal(imported.thumbnail.concept_sets.length, 1);
  assert.throws(() => appendConceptSet({ episodePackage: imported, conceptSet: { ...set, concept_revision_ids: set.concept_revision_ids.slice(0, 4) }, concepts: concepts.slice(0, 4) }));
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
    title_id: "title-1", title_revision: 1, provider_id: "forge", intended_aspect_ratio: "16:9",
    brand_template_id: "brand-1", brand_template_revision: 4, title_text: "DURABLE",
    treatment: { typography: { font: "Inter" }, placement: { x: 0.1 }, safe_zone: { enabled: true }, shadow: {}, treatment: {} },
    prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
    prompt_review_state: "reviewed", last_reviewed_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    created_at: "2026-07-15T12:00:00.000Z", updated_at: "2026-07-15T12:00:00.000Z",
  };
  const saved = saveRenderRecipe({ episodePackage: imported, recipe });
  assert.equal(saved.thumbnail.render_recipes[0]?.brand_template_id, "brand-1");
  assert.equal("brand_template_id" in concept, false);
  const first = deriveThumbnailPromptPack({ recipe, concept });
  const second = deriveThumbnailPromptPack({ recipe: structuredClone(recipe), concept: structuredClone(concept) });
  assert.deepEqual(first, second);
  assert.equal(first.positive_prompt.includes("DURABLE"), false);
  assert.equal(deriveThumbnailPromptPack({ recipe, concept, templateVersion: "v2" }).review_state, "needs_review");
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
    title_id: "title-1", title_revision: 1, provider_id: "forge", intended_aspect_ratio: "16:9",
    brand_template_id: null, brand_template_revision: null, title_text: "DURABLE",
    treatment: { typography: {}, placement: {}, safe_zone: {}, shadow: {}, treatment: {} },
    prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
    composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
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
    recipe_snapshot: recipe, recipe_snapshot_hash: hash, exported_at: recipe.created_at,
  };
  const launched = appendLaunchSnapshot({ episodePackage: withBase, launchVariantId: "launch-1", baseVersionId: "base-1", snapshot, createdAt: recipe.created_at });
  const revised = appendLaunchSnapshot({ episodePackage: launched, launchVariantId: "launch-1", baseVersionId: "base-1", snapshot: { ...snapshot, asset_id: "composite-2" }, createdAt: recipe.updated_at });
  assert.deepEqual(revised.thumbnail.launch_variant_revisions.map((entry) => entry.revision), [1, 2]);
  assert.equal(revised.thumbnail.launch_variant_revisions[0]?.snapshot.asset_id, "composite-1");
  const published = appendPublicationEvent({ episodePackage: revised, event: {
    id: "publish-1", launch_variant_id: "launch-1", launch_variant_revision: 2,
    snapshot: revised.thumbnail.launch_variant_revisions[1]!.snapshot,
    published_at: recipe.updated_at, destination: "youtube",
  } });
  assert.equal(published.thumbnail.publication_events.length, 1);
  assert.equal(revised.thumbnail.publication_events.length, 0);
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
