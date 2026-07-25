import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCanonicalCandidatePreviewPath,
  resolveConceptSetPresentation,
} from "../src/components/visuals/ThumbnailV3Panel";
import type { EpisodePackageV3 } from "../src/lib/episode-package-v3";

const makeSet = (id: string, state: "active" | "archived" = "active") => ({
  id, name: `Set ${id}`, created_at: "2026-07-16T00:00:00.000Z", state,
  approved_script_version: 1, generation_provenance: { source: "test" },
  prompt_schema_version: "hearth-thumbnail-concepts-v1", source_response_hash: id.repeat(64).slice(0, 64),
  concept_revision_ids: [],
});

test("concept-set presentation distinguishes zero, one, multiple, and archived history", () => {
  assert.equal(resolveConceptSetPresentation([]).mode, "empty");
  assert.equal(resolveConceptSetPresentation([makeSet("a")]).mode, "label");
  assert.equal(resolveConceptSetPresentation([makeSet("a"), makeSet("b")]).mode, "selector");
  const archivedOnly = resolveConceptSetPresentation([makeSet("a", "archived")]);
  assert.equal(archivedOnly.mode, "empty");
  assert.equal(archivedOnly.archived.length, 1);
});

test("candidate previews prefer the verified canonical asset path", () => {
  const episodePackage = {
    thumbnail: {
      launch_variant_revisions: [{
        snapshot: { asset_id: "asset-1", asset_path: "metadata/older-preview.png" },
      }],
    },
  } as unknown as EpisodePackageV3;
  assert.equal(
    resolveCanonicalCandidatePreviewPath(
      { composite_asset_id: "asset-1", asset_path: "thumbnails/canonical-preview.png" },
      episodePackage,
    ),
    "thumbnails/canonical-preview.png",
  );
  assert.equal(
    resolveCanonicalCandidatePreviewPath({ composite_asset_id: "asset-1" }, episodePackage),
    "metadata/older-preview.png",
  );
});
