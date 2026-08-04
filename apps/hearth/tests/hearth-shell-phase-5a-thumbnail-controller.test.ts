import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveHearthThumbnailLoadStatus,
  isCanonicalThumbnailSetComplete,
} from "../src/routes/hearth-shell/buildHearthThumbnailViewModel";
import { resolveHearthThumbnailCanonicalPreviewPath } from "../src/routes/hearth-shell/hearth-thumbnail-preview";

const progress = {
  workpieceId: "workpiece-1",
  conceptRevisionCount: 1,
  baseVersionCount: 3,
  candidateCount: 3,
  eligibleCandidateCount: 3,
  previewAssetPaths: ["thumbnails/candidate-1.png"],
  titleCount: 2,
  tagCount: 4,
  hasDescriptions: true,
};

test("inactive, absent, failed, and unavailable thumbnail loads remain distinct", () => {
  assert.equal(deriveHearthThumbnailLoadStatus({
    workpieceId: null, loading: false, error: null, authorityUnavailable: false, candidateCount: 0,
  }), "inactive");
  assert.equal(deriveHearthThumbnailLoadStatus({
    workpieceId: "w", loading: false, error: null, authorityUnavailable: false, candidateCount: 0,
  }), "absent");
  assert.equal(deriveHearthThumbnailLoadStatus({
    workpieceId: "w", loading: false, error: "failed", authorityUnavailable: false, candidateCount: 0,
  }), "error");
  assert.equal(deriveHearthThumbnailLoadStatus({
    workpieceId: "w", loading: false, error: null, authorityUnavailable: true, candidateCount: 0,
  }), "unavailable");
});

test("loading takes precedence over candidate projection", () => {
  assert.equal(deriveHearthThumbnailLoadStatus({
    workpieceId: "w", loading: true, error: null, authorityUnavailable: false, candidateCount: 3,
  }), "loading");
});

test("empty and partially eligible candidate sets cannot appear complete", () => {
  assert.equal(isCanonicalThumbnailSetComplete({ ...progress, candidateCount: 0, eligibleCandidateCount: 0 }), false);
  assert.equal(isCanonicalThumbnailSetComplete({ ...progress, eligibleCandidateCount: 2 }), false);
});

test("eligible candidates without recoverable canonical previews cannot appear complete", () => {
  assert.equal(isCanonicalThumbnailSetComplete({ ...progress, previewAssetPaths: [] }), false);
  assert.equal(isCanonicalThumbnailSetComplete({
    ...progress,
    previewAssetPaths: ["thumbnails/candidate-1.png", "thumbnails/candidate-2.png"],
  }), false);
});

test("completion requires a non-empty fully eligible canonical set", () => {
  assert.equal(isCanonicalThumbnailSetComplete({
    ...progress,
    previewAssetPaths: [
      "thumbnails/candidate-1.png",
      "thumbnails/candidate-2.png",
      "thumbnails/candidate-3.png",
    ],
  }), true);
});

test("canonical candidate asset path wins preview resolution", () => {
  assert.equal(resolveHearthThumbnailCanonicalPreviewPath({
    candidateAssetPath: " canonical/candidate.png ",
    compositeAssetId: "asset-1",
    versions: [{ asset_id: "asset-1", asset_path: "fallback/composite.png" }],
  }), "canonical/candidate.png");
});

test("canonical composite path is the only fallback", () => {
  assert.equal(resolveHearthThumbnailCanonicalPreviewPath({
    candidateAssetPath: null,
    compositeAssetId: "asset-1",
    versions: [{ asset_id: "asset-1", asset_path: "canonical/composite.png" }],
  }), "canonical/composite.png");
});

test("missing canonical preview remains honestly unavailable", () => {
  assert.equal(resolveHearthThumbnailCanonicalPreviewPath({
    candidateAssetPath: null,
    compositeAssetId: "missing",
    versions: [{ asset_id: "other", asset_path: "canonical/other.png" }],
  }), null);
});

test("preview resolution does not mutate candidate or version inputs", () => {
  const versions = Object.freeze([{ asset_id: "asset-1", asset_path: "canonical/composite.png" }]);
  const before = JSON.stringify(versions);
  resolveHearthThumbnailCanonicalPreviewPath({
    candidateAssetPath: null,
    compositeAssetId: "asset-1",
    versions: [...versions],
  });
  assert.equal(JSON.stringify(versions), before);
});
