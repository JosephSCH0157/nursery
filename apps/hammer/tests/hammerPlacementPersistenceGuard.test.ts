import assert from "node:assert/strict";
import { countSnapshotAnchors, countSnapshotPlacements, shouldBlockTransientPlacementDrop } from "../src/editor/hammerPlacementPersistenceGuard";
import type { HammerWorkspaceSnapshot } from "../src/editor/hammerWorkspaceSnapshot";

function buildSnapshot(args: { placements: number; anchors: number }): HammerWorkspaceSnapshot {
  const clips = Array.from({ length: args.placements }).map((_, index) => ({
    clip_id: `clip-${index + 1}`,
    asset_id: `asset-${index + 1}`,
    lane_id: "images",
    entry_id: `entry-${index + 1}`,
    label: `Clip ${index + 1}`,
    visual_mode: "image",
    confidence: 0.9,
    placement_status: "placed" as const,
    ingest_state: "approved" as const,
    uncertainty_flags: [],
    start_sec: index,
    end_sec: index + 1,
    geometry: { x: 0, y: 0, width: 10, height: 10, anchor: "top_left" as const },
    animation: { preset: "none" as const },
    opacity: 1,
    z_index: index + 1,
    enabled: true,
    locked: false,
    source_mode: "manual" as const,
    anchor_hint: {
      anchor_segment_id: index < args.anchors ? `segment-${index + 1}` : null,
      matched_segment_ids: index < args.anchors ? [`segment-${index + 1}`] : [],
      anchor_text: null,
      anchor_label: null,
      detached: false,
    },
    updated_at: "2026-05-10T00:00:00.000Z",
  }));
  return {
    workspaceId: "workspace-1",
    workpieceId: "workpiece-1",
    sessionId: "session-1",
    sourceMode: "tongs",
    previewMode: "edit-aware",
    editPlanStatus: "clean",
    editPlanSignature: "sig",
    transcriptSourceId: "transcript-1",
    currentPass: "image_placement",
    passOrderVersion: 1,
    passStatus: {} as any,
    transcriptSegments: [],
    selectedSegmentId: null,
    selectedOverlayRowId: null,
    visualPreviewSettings: {} as any,
    mediaRef: null,
    workspaceMapping: null,
    mediaSourceLabel: null,
    selectedMacroRecipeRef: null,
    lastMacroRunRef: null,
    structuredTranscript: null,
    editPlan: {} as any,
    editorialAuthorityGraph: null,
    visualPlacements: null,
    visualTimeline: {
      version: 1,
      revision: 1,
      updated_at: "2026-05-10T00:00:00.000Z",
      source_mode: "packaging",
      selected_clip_id: clips[0]?.clip_id ?? null,
      assets: clips.map((clip) => ({
        asset_id: clip.asset_id!,
        asset_ref: clip.asset_id!,
        kind: "image",
        label: clip.label,
        path: `${clip.asset_id}.png`,
        storage_key: null,
        mime_type: "image/png",
        source_mode: "manual",
        updated_at: clip.updated_at,
      })),
      lanes: [{ lane_id: "images", label: "Images", clip_ids: clips.map((clip) => clip.clip_id) }],
      clips,
    },
    audioPolish: null,
  };
}

function testTransientDropIsBlocked() {
  const previous = buildSnapshot({ placements: 2, anchors: 2 });
  const incoming = buildSnapshot({ placements: 0, anchors: 0 });
  assert.equal(countSnapshotPlacements(previous), 2);
  assert.equal(countSnapshotAnchors(previous), 2);
  assert.equal(countSnapshotPlacements(incoming), 0);
  assert.equal(
    shouldBlockTransientPlacementDrop({
      diagnostics: {
        reason: "history:baseline_init",
        source: "source_desk_refresh",
        explicitUserAction: false,
        placementCount: 0,
        anchorCount: 0,
      },
      persistedPlacementCount: 2,
      previousSnapshotPlacementCount: 2,
      previousSnapshotAnchorCount: 2,
      incomingPlacementCount: 0,
      incomingAnchorCount: 0,
    }),
    true,
  );
}

function testExplicitRemovalIsNotBlocked() {
  assert.equal(
    shouldBlockTransientPlacementDrop({
      diagnostics: {
        reason: "user_remove_visual_placement",
        source: "timeline_user_action",
        explicitUserAction: true,
        placementCount: 0,
        anchorCount: 0,
      },
      persistedPlacementCount: 2,
      previousSnapshotPlacementCount: 2,
      previousSnapshotAnchorCount: 2,
      incomingPlacementCount: 0,
      incomingAnchorCount: 0,
    }),
    false,
  );
}

try {
  testTransientDropIsBlocked();
  testExplicitRemovalIsNotBlocked();
  console.log("Hammer placement persistence guard tests passed.");
} catch (error) {
  console.error("Hammer placement persistence guard tests failed:", error);
  process.exitCode = 1;
}
