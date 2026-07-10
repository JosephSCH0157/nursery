import assert from "node:assert/strict";
import { normalizeSpeakerMaskBoundsToFrame, resolveAutoPlacementDiagnosticsForPreview } from "../src/editor/hammerWorkspaceShellViewModels";
import { preservePlacementRichTimelineDuringHydration } from "../src/editor/hammerVisualTimelineHydrationGuard";
import { intersectionArea } from "../src/features/auto-placement/reservedZones";

const authorityContext = {
  workspaceId: "workspace-test",
  workpieceId: "workpiece-test",
  episodeId: null,
  expectedMediaPath: null,
  actualMediaPath: null,
  sourceDeskErrorRaw: null,
};

function testResolvedWhenBoundsAvailable() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    ...authorityContext,
    debugEnabled: true,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [{ x: 700, y: 220, width: 500, height: 700 }],
    playheadSec: 12,
    selectedOverlayForGhost: {
      clipId: "clip-1",
      hasRealAsset: true,
      widthPct: 28,
      heightPct: 24,
    },
    maskResolution: { width: 1920, height: 1080 },
    workspaceLoaded: true,
    workspaceReason: "workspace context available",
    playbackMediaReady: true,
    playbackMediaReason: "playback media source resolved",
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "resolved");
    assert.ok(result.overlay);
    assert.equal(typeof result.overlay?.zone, "string");
    assert.equal(result.faceSafeZoneCount, 1);
    assert.equal(result.bodyOverlapAllowed, true);
    assert.ok(result.ghost);
    assert.match(result.overlay?.reasonsSummary ?? "", /dead_space_bonus=/);
    assert.match(result.overlay?.reasonsSummary ?? "", /face_proximity_penalty=/);
  }
}

function testNoMaskBoundsWhenMissing() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    ...authorityContext,
    debugEnabled: true,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [],
    playheadSec: 12,
    selectedOverlayForGhost: {
      clipId: "clip-unknown",
      hasRealAsset: true,
      widthPct: 28,
      heightPct: 24,
    },
    maskResolution: { width: 1920, height: 1080 },
    workspaceLoaded: true,
    workspaceReason: "workspace context available",
    playbackMediaReady: true,
    playbackMediaReason: "playback media source resolved",
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "resolved");
    assert.ok(result.overlay);
    assert.equal(result.layoutMode, "unknown");
    assert.equal(result.overlay?.zone, "lower_right");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.fallbackReason, "no_mask_bounds");
    assert.equal(result.bodyOverlapAllowed, true);
    assert.equal(result.faceSafeZoneCount, 0);
  }
}

function testDisabledWhenDebugOff() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    ...authorityContext,
    debugEnabled: false,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [{ x: 700, y: 220, width: 500, height: 700 }],
    playheadSec: 12,
    maskResolution: { width: 1920, height: 1080 },
    workspaceLoaded: true,
    workspaceReason: "workspace context available",
    playbackMediaReady: true,
    playbackMediaReason: "playback media source resolved",
  });
  assert.deepEqual(result, { enabled: false });
}

function testWaitingWhenMaskBoundsPresentButSelectedOverlayMissing() {
  const result = resolveAutoPlacementDiagnosticsForPreview({
    ...authorityContext,
    debugEnabled: true,
    frameInput: { width: 1920, height: 1080 },
    speakerMaskBounds: [{ x: 700, y: 220, width: 500, height: 700 }],
    playheadSec: 12,
    selectedOverlayForGhost: null,
    maskResolution: { width: 1920, height: 1080 },
    workspaceLoaded: true,
    workspaceReason: "workspace context available",
    playbackMediaReady: true,
    playbackMediaReason: "playback media source resolved",
  });
  assert.equal(result.enabled, true);
  if (result.enabled) {
    assert.equal(result.state, "waiting_for_selected_overlay_asset");
    assert.equal(result.statusLabel, "auto-placement: debug enabled, waiting for selected overlay asset");
    assert.equal(result.overlay, null);
    assert.equal(result.ghost, null);
  }
}

function testCenteredSpeakerMaskRejectsCenterRegionAfterScalingTransform() {
  const frameInput = { width: 1920, height: 1080 };
  const maskResolution = { width: 640, height: 360 };
  const maskSpaceBounds = [{ x: 213, y: 80, width: 214, height: 200 }];
  const normalized = normalizeSpeakerMaskBoundsToFrame({
    speakerMaskBounds: maskSpaceBounds,
    frameInput,
    maskResolution,
  });
  assert.equal(normalized.length, 1);
  const center = normalized[0]!;
  assert.ok(center.x > 500 && center.x < 700);
  assert.ok(center.y > 200 && center.y < 300);

  const result = resolveAutoPlacementDiagnosticsForPreview({
    ...authorityContext,
    debugEnabled: true,
    frameInput,
    speakerMaskBounds: maskSpaceBounds,
    maskResolution,
    playheadSec: 19,
    selectedOverlayForGhost: {
      clipId: "clip-2",
      hasRealAsset: true,
      widthPct: 26,
      heightPct: 20,
    },
    workspaceLoaded: true,
    workspaceReason: "workspace context available",
    playbackMediaReady: true,
    playbackMediaReason: "playback media source resolved",
  });
  assert.equal(result.enabled, true);
  if (!result.enabled) return;
  assert.equal(result.state, "resolved");
  assert.ok(result.overlay);
  if (!result.overlay) return;
  const overlayRect = {
    x: (result.overlay.leftPct / 100) * frameInput.width,
    y: (result.overlay.topPct / 100) * frameInput.height,
    width: (result.overlay.widthPct / 100) * frameInput.width,
    height: (result.overlay.heightPct / 100) * frameInput.height,
  };
  const paddedCenter = {
    x: center.x - 20,
    y: center.y - 20,
    width: center.width + 40,
    height: center.height + 40,
  };
  assert.equal(intersectionArea(overlayRect, paddedCenter), 0);
  assert.notEqual(result.overlay.zone, "background_open");
}

function buildTimeline(anchorSegmentId: string | null, assetPath: string | null) {
  return {
    version: 1 as const,
    revision: 1,
    updated_at: "2026-05-10T12:00:00.000Z",
    source_mode: "packaging" as const,
    selected_clip_id: "clip-1",
    assets: [{
      asset_id: "asset-1",
      asset_ref: "asset-ref",
      kind: "image" as const,
      label: "Image A",
      path: assetPath,
      storage_key: null,
      mime_type: "image/png",
      source_mode: "manual" as const,
      updated_at: "2026-05-10T12:00:00.000Z",
    }],
    lanes: [{ lane_id: "images", label: "Images", clip_ids: ["clip-1"] }],
    clips: [{
      clip_id: "clip-1",
      asset_id: "asset-1",
      lane_id: "images",
      entry_id: "entry-1",
      label: "Image A",
      visual_mode: "image",
      confidence: 0.9,
      placement_status: "placed" as const,
      ingest_state: "approved" as const,
      uncertainty_flags: [],
      start_sec: 1,
      end_sec: 3,
      geometry: { x: 10, y: 10, width: 30, height: 30, anchor: "top_left" as const },
      animation: { preset: "none" as const },
      opacity: 1,
      z_index: 1,
      enabled: true,
      locked: false,
      source_mode: "manual" as const,
      anchor_hint: {
        anchor_segment_id: anchorSegmentId,
        matched_segment_ids: anchorSegmentId ? [anchorSegmentId] : [],
        anchor_text: anchorSegmentId ? "anchor text" : null,
        anchor_label: null,
        detached: false,
      },
      updated_at: "2026-05-10T12:00:00.000Z",
    }],
  };
}

function testHydrationPreservesPlacementRichTimeline() {
  const initialPlacementRich = buildTimeline("segment-1", null);
  const laterAssetOnly = buildTimeline(null, "media/image.png");
  const result = preservePlacementRichTimelineDuringHydration({
    previous: initialPlacementRich,
    incoming: laterAssetOnly,
  });
  assert.equal(result.reason, "preserved_anchor_rich_timeline");
  assert.ok(result.timeline);
  assert.equal(result.timeline?.clips[0]?.anchor_hint.anchor_segment_id, "segment-1");
  assert.deepEqual(result.timeline?.clips[0]?.anchor_hint.matched_segment_ids, ["segment-1"]);
  assert.equal(result.timeline?.assets[0]?.path, "media/image.png");
}

try {
  testResolvedWhenBoundsAvailable();
  testNoMaskBoundsWhenMissing();
  testDisabledWhenDebugOff();
  testWaitingWhenMaskBoundsPresentButSelectedOverlayMissing();
  testCenteredSpeakerMaskRejectsCenterRegionAfterScalingTransform();
  testHydrationPreservesPlacementRichTimeline();
  console.log("Hammer auto-placement diagnostics VM tests passed.");
} catch (error) {
  console.error("Hammer auto-placement diagnostics VM tests failed:", error);
  process.exitCode = 1;
}
