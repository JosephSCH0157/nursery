import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveHearthReferenceClipsCompletion,
  parseHearthReferenceClipValues,
} from "../src/routes/hearth-shell/buildHearthReferenceClipsViewModel";
import { buildHearthReferenceClipsProgress } from "../src/routes/hearth-shell/hearth-reference-clips-progress";
import { resolveHearthCanonicalReferenceClipPreviewPath } from "../src/routes/hearth-shell/hearth-reference-clip-preview";
import type { EpisodeContextualDataCompositePlan } from "../src/lib/episode-package-v2";

function entry(input: {
  id: string;
  candidateIds?: string[];
  selectedId?: string | null;
  sourceType?: EpisodeContextualDataCompositePlan["source_type"];
}): EpisodeContextualDataCompositePlan {
  return {
    id: input.id,
    source_type: input.sourceType ?? "planned",
    candidate_assets: (input.candidateIds ?? []).map((assetId) => ({
      asset_id: assetId,
      asset_class: "reference_clip",
      source_kind: "creator_upload",
      label: assetId,
      path: `assets/${assetId}.png`,
      preview_path: null,
      thumbnail_path: null,
      source_url: null,
      source_label: "Creator upload",
      provider_id: null,
      provenance: null,
      ingestion_state: "ready",
      ingestion_error: null,
      created_at: "2026-01-01T00:00:00.000Z",
    })),
    selected_asset_id: input.selectedId ?? null,
  } as EpisodeContextualDataCompositePlan;
}

test("inactive, failed, unavailable, and successful absence remain distinct", () => {
  const empty = { planned: 0, withCanonicalCandidates: 0, selected: 0 };
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: false, loaded: false, failed: false, authorityAvailable: true, progress: empty,
  }).kind, "inactive");
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true, loaded: false, failed: true, authorityAvailable: true, progress: empty,
  }).kind, "loading");
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true, loaded: false, failed: false, authorityAvailable: false, progress: empty,
  }).kind, "unavailable");
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true, loaded: true, failed: false, authorityAvailable: true, progress: empty,
  }).kind, "empty");
});

test("empty arrays cannot vacuously complete an expected-reference workflow", () => {
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true,
    loaded: true,
    failed: false,
    authorityAvailable: true,
    progress: { planned: 0, withCanonicalCandidates: 0, selected: 0 },
  }).complete, false);
});

test("completion requires canonical candidates and selected membership for every entry", () => {
  const missingSource = buildHearthReferenceClipsProgress([
    entry({ id: "reference-1" }),
  ]);
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true, loaded: true, failed: false, authorityAvailable: true, progress: missingSource,
  }).kind, "source_incomplete");

  const invalidSelection = buildHearthReferenceClipsProgress([
    entry({ id: "reference-1", candidateIds: ["asset-1"], selectedId: "missing" }),
  ]);
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true, loaded: true, failed: false, authorityAvailable: true, progress: invalidSelection,
  }).kind, "selection_incomplete");

  const complete = buildHearthReferenceClipsProgress([
    entry({ id: "reference-2", candidateIds: ["asset-2"], selectedId: "asset-2" }),
    entry({ id: "reference-1", candidateIds: ["asset-1"], selectedId: "asset-1" }),
  ]);
  assert.deepEqual(complete, { planned: 2, withCanonicalCandidates: 2, selected: 2 });
  assert.equal(deriveHearthReferenceClipsCompletion({
    active: true, loaded: true, failed: false, authorityAvailable: true, progress: complete,
  }).complete, true);
});

test("local source values remain a pure non-canonical draft projection", () => {
  assert.deepEqual(parseHearthReferenceClipValues(" 1, 2.5, unknown, , 4 "), [
    1,
    2.5,
    "unknown",
    4,
  ]);
});

test("preview prefers canonical evidence and never fabricates a video preview", () => {
  assert.equal(resolveHearthCanonicalReferenceClipPreviewPath({
    previewPath: " canonical/preview.jpg ",
    thumbnailPath: "canonical/thumb.jpg",
    assetPath: "canonical/video.mp4",
    video: true,
  }), "canonical/preview.jpg");
  assert.equal(resolveHearthCanonicalReferenceClipPreviewPath({
    previewPath: null,
    thumbnailPath: " canonical/thumb.jpg ",
    assetPath: "canonical/video.mp4",
    video: true,
  }), "canonical/thumb.jpg");
  assert.equal(resolveHearthCanonicalReferenceClipPreviewPath({
    previewPath: null,
    thumbnailPath: null,
    assetPath: "canonical/video.mp4",
    video: true,
  }), null);
});

test("progress projection preserves source distinctions and does not mutate entries", () => {
  const entries = [
    entry({ id: "upload", candidateIds: ["asset-1"], selectedId: "asset-1", sourceType: "hammer_upload" }),
    entry({ id: "planned", candidateIds: [], sourceType: "planned" }),
  ];
  const before = JSON.stringify(entries);
  buildHearthReferenceClipsProgress(entries);
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(entries.map((item) => item.source_type), ["hammer_upload", "planned"]);
});
