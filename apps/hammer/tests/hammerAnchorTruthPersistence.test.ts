import assert from "node:assert/strict";
import test from "node:test";
import type { HammerWorkspaceSnapshot } from "../src/editor/hammerWorkspaceSnapshot";
import { buildHammerPersistenceSaveRequest } from "../src/persistence/hammerPersistence";
import { createDefaultVisualAnimation, createDefaultVisualGeometry, createDefaultVisualLane, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";

function buildSnapshot(): HammerWorkspaceSnapshot {
  const timeline = createEmptyVisualTimelineState({
    updated_at: "2026-04-03T15:30:00.000Z",
    assets: [{
      asset_id: "asset_timeline_001",
      asset_ref: "assets/timeline-image.png",
      kind: "image",
      label: "Timeline Image",
      path: "assets/timeline-image.png",
      storage_key: "workpieces/example/assets/timeline-image.png",
      mime_type: "image/png",
      source_mode: "manual",
      updated_at: "2026-04-03T15:30:00.000Z",
    }],
    clips: [{
      clip_id: "clip_timeline_001",
      asset_id: "asset_timeline_001",
      lane_id: "lane:primary",
      entry_id: "manual:clip_timeline_001",
      label: "Timeline Clip",
      visual_mode: "still_image",
      confidence: 0.95,
      placement_status: "placed",
      ingest_state: "approved",
      uncertainty_flags: [],
      start_sec: 1.5,
      end_sec: 4.5,
      geometry: createDefaultVisualGeometry({
        x: 0.2,
        y: 0.2,
        width: 0.4,
        height: 0.4,
        anchor: "top_left",
      }),
      animation: createDefaultVisualAnimation({
        preset: "fade_in",
      }),
      opacity: 0.9,
      z_index: 4,
      enabled: true,
      locked: false,
      source_mode: "manual",
      anchor_hint: {
        anchor_segment_id: "seg_timeline_001",
        matched_segment_ids: ["seg_timeline_001"],
        anchor_text: "Timeline anchor text",
        anchor_label: "Timeline Anchor",
        detached: false,
      },
      updated_at: "2026-04-03T15:30:00.000Z",
    }],
    lanes: [createDefaultVisualLane({
      lane_id: "lane:primary",
      clip_ids: ["clip_timeline_001"],
    })],
    selected_clip_id: "clip_timeline_001",
  });

  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workpieceId: "22222222-2222-4222-8222-222222222222",
    sessionId: "session_hammer_anchor_truth",
    sourceMode: "tongs",
    previewMode: "edit-aware",
    editPlanStatus: "clean",
    editPlanSignature: "sig_anchor_truth",
    transcriptSourceId: "transcript_anchor_truth",
    currentPass: "image_placement",
    passOrderVersion: 2,
    passStatus: {
      image_placement: "in_progress",
    },
    transcriptSegments: [{
      segment_id: "seg_timeline_001",
      start_sec: 1,
      end_sec: 5,
      speaker: "S1",
      text: "Timeline anchor segment",
    }],
    selectedSegmentId: "seg_timeline_001",
    selectedOverlayRowId: "legacy_overlay_row_should_not_win",
    visualPreviewSettings: {
      white_balance: 0,
      color_amount: 0,
      background_blur: false,
    },
    mediaRef: null,
    workspaceMapping: null,
    mediaSourceLabel: null,
    selectedMacroRecipeRef: null,
    lastMacroRunRef: null,
    structuredTranscript: null,
    editPlan: {
      edit_plan_id: "plan_anchor_truth",
      version: "1",
      created_at: "2026-04-03T15:30:00.000Z",
      updated_at: "2026-04-03T15:30:00.000Z",
      source_transcript_id: "transcript_anchor_truth",
      preview_mode: "edit-aware",
      instructions: [],
    },
    editorialAuthorityGraph: null,
    visualPlacements: {
      schema_version: 1,
      status: "prepared",
      source_refs: ["legacy_source"],
      uncertainty_flags: ["legacy_uncertain"],
      placements: [{
        placement_id: "legacy_placement_001",
        entry_id: "legacy_entry",
        anchor_segment_id: "seg_legacy",
        matched_segment_ids: ["seg_legacy"],
        anchor_text: "Legacy anchor text",
        asset_ref: "legacy_asset_ref",
        asset_id: "legacy_asset_id",
        asset_path: "assets/legacy.png",
        storage_key: "workpieces/example/assets/legacy.png",
        label: "Legacy placement",
        visual_mode: "still_image",
        start_sec: 9,
        end_sec: 11,
        confidence: 0.2,
        timing_source: "ordered_fallback",
        status: "uncertain",
        uncertainty_flags: ["legacy_uncertain"],
      }],
    },
    visualTimeline: timeline,
    audioPolish: null,
  };
}

test("save request derives visual placements from canonical timeline when timeline is present", () => {
  const saveRequest = buildHammerPersistenceSaveRequest(buildSnapshot());
  const placement = saveRequest.visual_placements?.data.placements[0];

  assert.equal(saveRequest.visual_placements?.data.placements.length, 1);
  assert.equal(placement?.placement_id, "clip_timeline_001");
  assert.equal(placement?.anchor_segment_id, "seg_timeline_001");
  assert.equal(placement?.asset_ref, "assets/timeline-image.png");
  assert.deepEqual(saveRequest.visual_placements?.data.source_refs, ["timeline_revision:1"]);
});

test("save request editor session selection follows canonical timeline selection", () => {
  const saveRequest = buildHammerPersistenceSaveRequest(buildSnapshot());

  assert.equal(
    saveRequest.editor_session?.data.selected_overlay_row_id,
    "clip_timeline_001",
  );
});
