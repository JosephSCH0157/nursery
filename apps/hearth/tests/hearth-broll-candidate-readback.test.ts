import assert from "node:assert/strict";
import test from "node:test";
import { mapCanonicalBrollCandidate } from "../src/lib/hearth-broll-v2-authority";
import { resolveCanonicalBrollBeatSelection } from "../src/hooks/visuals/useBrollWorkspace";
import type { EpisodeBrollPlanBeat } from "../src/lib/episode-package-v2";

function beat(id: string, selectedAssetId: string | null, candidateIds: string[]): EpisodeBrollPlanBeat {
  return {
    id,
    workpiece_id: "workpiece-1",
    anchor_text: id,
    description: id,
    purpose: "coverage",
    motion_intent: "broll",
    asset_category: "uploaded_video",
    priority: "supporting",
    keywords: [],
    mood: "neutral",
    shot_type: "mixed",
    motion_suggestion: null,
    suggested_duration_ms: 5000,
    placement_hint: "first_occurrence",
    source_type: "planned",
    candidate_assets: candidateIds.map((candidateId) => ({
      asset_id: candidateId,
      source: "generated",
      source_beat_id: id,
      label: "Runway clip",
      uri: "https://example.invalid/video",
      path: "assets/video.mp4",
      preview_path: "https://example.invalid/poster",
      thumbnail_path: "https://example.invalid/poster",
      mime_type: "video/mp4",
      ingest_status: "ready",
      ingest_error: null,
      source_url: null,
      asset_category: "ai_video",
      created_at: "2026-08-04T11:12:04.000Z",
    })),
    selected_asset_id: selectedAssetId,
    fulfillment_state: selectedAssetId ? "resolved" : candidateIds.length ? "candidate_assets_available" : "unresolved",
    origin: "hearth",
    external_request: null,
    data_visual_spec: null,
    created_at: "2026-08-04T11:00:00.000Z",
    updated_at: "2026-08-04T11:00:00.000Z",
  };
}

test("hard reload selects the actionable beat containing an unselected generated candidate", () => {
  const beats = [beat("selected-upload", "upload-revision", ["upload-revision"]), beat("runway-beat", null, ["runway-candidate-revision"])];
  assert.equal(resolveCanonicalBrollBeatSelection(beats, null), "runway-beat");
  assert.equal(resolveCanonicalBrollBeatSelection(beats, "selected-upload"), "selected-upload");
});

test("generated candidate normalization preserves its canonical revision and AI-video identity", () => {
  const candidate = mapCanonicalBrollCandidate({
    id: "d48b5444-b2dd-4d77-bc59-4b3f425e3813",
    beat_id: "da16d3ef-a2a7-40ca-a437-0f3c5db68cc4",
    source_kind: "generated",
    provider: "runway",
    asset_path: "assets/broll-v2/video.mp4",
    mime_type: "video/mp4",
    duration_ms: 5042,
    created_at: "2026-08-04T11:12:04.000Z",
  }, "https://example.invalid/video", "https://example.invalid/poster");
  assert.equal(candidate.asset_id, "d48b5444-b2dd-4d77-bc59-4b3f425e3813");
  assert.equal(candidate.source, "generated");
  assert.equal(candidate.asset_category, "ai_video");
  assert.equal(candidate.ingest_status, "ready");
  assert.equal(candidate.uri, "https://example.invalid/video");
  assert.equal(candidate.preview_path, "https://example.invalid/poster");
  assert.equal(candidate.duration_ms, 5042);
});
