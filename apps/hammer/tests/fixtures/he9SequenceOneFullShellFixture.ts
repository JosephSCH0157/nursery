import type { HammerPersistedVisualPlacements } from "../../src/persistence/hammerPersistenceContract";
import { createDefaultSemanticAnchor, createDefaultVisualAnimation, createDefaultVisualGeometry, createEmptyVisualTimelineState } from "../../src/visuals/model/hammerVisualDefaults";
import type { HammerVisualClip } from "../../src/visuals/model/hammerVisualTypes";
import { deriveLegacyVisualPlacementsFromTimeline } from "../../src/visuals/persistence/hammerVisualTimelineLegacyAdapter";

export const HE9_REMOVED_PLACEMENT_ID = "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2";
const timestamp = "2026-08-23T08:00:33.854Z";

function clip(index: number): HammerVisualClip {
  const packaging = index === 28;
  return {
    clip_id: packaging ? "packaging:intro" : `placement:committed:${index}`,
    asset_id: packaging ? null : `asset:${index}`,
    lane_id: "lane:primary",
    entry_id: packaging ? "packaging:intro" : `entry:${index}`,
    label: packaging ? "Intro" : `Committed visual ${index}`,
    visual_mode: packaging ? "packaging_intro" : "image_overlay",
    confidence: index < 2 ? 0.4 : 1,
    placement_status: index < 2 ? "uncertain" : "placed",
    ingest_state: "approved",
    uncertainty_flags: index < 2 ? ["fixture_uncertain"] : [],
    start_sec: index,
    end_sec: index + 0.75,
    geometry: createDefaultVisualGeometry(),
    animation: createDefaultVisualAnimation(),
    opacity: 1,
    z_index: index,
    enabled: true,
    locked: false,
    source_mode: packaging ? "packaging" : "ai_initial",
    anchor_hint: { anchor_segment_id: `turn_${index + 1}`, matched_segment_ids: [`turn_${index + 1}`], anchor_text: null, anchor_label: null, detached: false },
    semantic_anchor: createDefaultSemanticAnchor({ status: "no_placement_intent", transcript: { segment_ids: [`turn_${index + 1}`] } }),
    updated_at: timestamp,
  };
}

export const he9CommittedTimeline = createEmptyVisualTimelineState({
  revision: 151,
  updated_at: timestamp,
  assets: Array.from({ length: 28 }, (_, index) => ({
    asset_id: `asset:${index}`, asset_ref: `visuals/${index}.png`, kind: "image" as const,
    label: `Committed visual ${index}`, path: `visuals/${index}.png`, storage_key: null,
    mime_type: "image/png", source_mode: "ai_initial" as const, updated_at: timestamp,
  })),
  clips: Array.from({ length: 29 }, (_, index) => clip(index)),
  lanes: [{ lane_id: "lane:primary", label: "Visuals", clip_ids: Array.from({ length: 29 }, (_, index) => clip(index).clip_id) }],
});

export const he9CommittedPlacements = deriveLegacyVisualPlacementsFromTimeline(he9CommittedTimeline)!;
export const he9StaleCompatibilityPlacements: HammerPersistedVisualPlacements = {
  ...he9CommittedPlacements,
  placements: [...he9CommittedPlacements.placements, {
    ...he9CommittedPlacements.placements[0],
    placement_id: HE9_REMOVED_PLACEMENT_ID,
    entry_id: "stale:removed-target",
    anchor_segment_id: "turn_102",
    matched_segment_ids: ["turn_102"],
    status: "uncertain",
  }],
};

export const he9SequenceOneFixture = Object.freeze({
  identities: Object.freeze({
    workspace_id: "494c2ae5-9037-4208-b898-fab4898ab430",
    workpiece_id: "85d076d6-54e6-4b56-ab60-5eff4c87cdd0",
    canonical_recording_id: "6c5b0d00-f775-4611-ac67-284dd9ae7d39",
    revision_id: "f642b5d9-cec2-4656-804e-49bb33bc0cb5",
    epoch_id: "53e3a94f-9f2e-4bd7-85bb-bd311f81939d",
    head_id: "5a85a189-5b06-4f59-a64e-a9b87af2be20",
    transition_id: "ba2cd0fa-1fbb-4e72-a2e5-0e985bde47f",
    result_editor_state_hash: "hammer-state:8387e7e6",
  }),
  history: Object.freeze({ sequence: 1, undo_stack: Object.freeze(["entry:53cc332f-11a3-4c38-883b-6483b2e31ac2"]), redo_stack: Object.freeze([]) }),
  registry: Object.freeze({
    history: Object.freeze({ bytes: 298829, sha256: "6508e868a8e324e8a8307b237a4f1b5ef5626d2ca9394be1d68c2d82f44ff247", revision: 1 }),
    visual_placements: Object.freeze({ bytes: 64059, sha256: "1aaf4483de5e5783ce66d9353b98aa641f9047bd488fba3a8a96d9c82334c998", revision: 193 }),
    visual_timeline: Object.freeze({ bytes: 79616, sha256_prefix: "2c208458", revision: 151 }),
  }),
  unrelated_artifact_fingerprints: Object.freeze({
    transcript_sha256_prefix: "005e41",
    audio_sha256_prefix: "1795e7",
    editorial_authority_sha256_prefix: "4a233d",
  }),
});
