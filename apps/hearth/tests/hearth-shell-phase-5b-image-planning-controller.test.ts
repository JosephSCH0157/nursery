import assert from "node:assert/strict";
import test from "node:test";
import { deriveHearthImagePlanningCompletion } from "../src/routes/hearth-shell/buildHearthImagePlanningViewModel";
import { buildHearthImageMapProgress } from "../src/routes/hearth-shell/hearth-image-map-progress";
import { resolveHearthCanonicalImagePreviewPath } from "../src/routes/hearth-shell/hearth-image-preview";

const progress = buildHearthImageMapProgress({
  planned: 2,
  canonical: 2,
  selected: 2,
  unresolved: 0,
});

test("authority unavailable stays explicit and blocks B-roll", () => {
  assert.deepEqual(deriveHearthImagePlanningCompletion({
    active: true,
    loaded: false,
    authorityAvailable: false,
    progress,
  }), { kind: "authority_unavailable", complete: false, brollEligible: false });
});

test("failed or incomplete projection cannot become zero-of-zero complete", () => {
  assert.equal(deriveHearthImagePlanningCompletion({
    active: true,
    loaded: false,
    authorityAvailable: true,
    progress: buildHearthImageMapProgress({ planned: 0, canonical: 0, selected: 0, unresolved: 0 }),
  }).kind, "loading");
  assert.equal(deriveHearthImagePlanningCompletion({
    active: true,
    loaded: true,
    authorityAvailable: true,
    progress: buildHearthImageMapProgress({ planned: 0, canonical: 0, selected: 0, unresolved: 0 }),
  }).kind, "empty");
});

test("count mismatch, unresolved anchors, and missing selections remain distinct", () => {
  assert.equal(deriveHearthImagePlanningCompletion({
    active: true, loaded: true, authorityAvailable: true,
    progress: { ...progress, canonical: 1, selected: 1 },
  }).kind, "count_mismatch");
  assert.equal(deriveHearthImagePlanningCompletion({
    active: true, loaded: true, authorityAvailable: true,
    progress: { ...progress, unresolved: 1 },
  }).kind, "unresolved");
  assert.equal(deriveHearthImagePlanningCompletion({
    active: true, loaded: true, authorityAvailable: true,
    progress: { ...progress, selected: 1 },
  }).kind, "selection_incomplete");
});

test("only a loaded matching canonical projection is complete and B-roll eligible", () => {
  assert.deepEqual(deriveHearthImagePlanningCompletion({
    active: true,
    loaded: true,
    authorityAvailable: true,
    progress,
  }), { kind: "complete", complete: true, brollEligible: true });
});

test("preview evidence prefers canonical asset then canonical composite and stays honest", () => {
  assert.equal(resolveHearthCanonicalImagePreviewPath({
    canonicalAssetPath: " canonical/candidate.png ",
    canonicalCompositePath: "canonical/composite.png",
  }), "canonical/candidate.png");
  assert.equal(resolveHearthCanonicalImagePreviewPath({
    canonicalAssetPath: null,
    canonicalCompositePath: " canonical/composite.png ",
  }), "canonical/composite.png");
  assert.equal(resolveHearthCanonicalImagePreviewPath({
    canonicalAssetPath: null,
    canonicalCompositePath: null,
  }), null);
});
