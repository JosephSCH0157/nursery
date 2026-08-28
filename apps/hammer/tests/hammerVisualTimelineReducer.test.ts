import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultVisualAnimation, createDefaultVisualGeometry, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { hammerVisualTimelineReducer } from "../src/visuals/state/hammerVisualReducer";
import { selectClipById, selectEnabledClipsAtTimeSorted, selectPreviewClips, selectPrimaryActiveClipAtTime } from "../src/visuals/state/hammerVisualSelectors";
import type { HammerVisualClip } from "../src/visuals/model/hammerVisualTypes";

function buildClip(overrides?: Partial<HammerVisualClip>): HammerVisualClip {
  return {
    clip_id: overrides?.clip_id ?? "clip_001",
    asset_id: overrides?.asset_id ?? "asset_001",
    canonical_asset_id: overrides?.canonical_asset_id ?? overrides?.asset_id ?? "asset_001",
    canonical_asset_state: overrides?.canonical_asset_state ?? "canonical_proven",
    lane_id: overrides?.lane_id ?? "lane:primary",
    entry_id: overrides?.entry_id ?? "packaging:intro",
    label: overrides?.label ?? "Card A",
    visual_mode: overrides?.visual_mode ?? "packaging_intro",
    confidence: overrides?.confidence ?? null,
    placement_status: overrides?.placement_status ?? "placed",
    ingest_state: overrides?.ingest_state ?? "approved",
    uncertainty_flags: overrides?.uncertainty_flags ?? [],
    start_sec: overrides?.start_sec ?? 1,
    end_sec: overrides?.end_sec ?? 3,
    geometry: overrides?.geometry ?? createDefaultVisualGeometry(),
    animation: overrides?.animation ?? createDefaultVisualAnimation(),
    opacity: overrides?.opacity ?? 1,
    z_index: overrides?.z_index ?? 0,
    enabled: overrides?.enabled ?? true,
    locked: overrides?.locked ?? false,
    source_mode: overrides?.source_mode ?? "packaging",
    anchor_hint: overrides?.anchor_hint ?? {
      anchor_segment_id: "seg_001",
      matched_segment_ids: ["seg_001"],
      anchor_text: "hello",
      anchor_label: null,
      detached: false,
    },
    updated_at: overrides?.updated_at ?? "2026-04-02T12:00:00.000Z",
  };
}

function buildState() {
  return createEmptyVisualTimelineState({
    updated_at: "2026-04-02T12:00:00.000Z",
    assets: [{
      asset_id: "asset_001",
      asset_ref: "visuals/card-a.png",
      kind: "image",
      label: "Card A",
      path: "visuals/card-a.png",
      storage_key: null,
      mime_type: "image/png",
      source_mode: "packaging",
      updated_at: "2026-04-02T12:00:00.000Z",
    }],
    clips: [buildClip()],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_001"],
    }],
    selected_clip_id: "clip_001",
  });
}

test("reducer increments revision on every mutating action", () => {
  const state = buildState();
  const next = hammerVisualTimelineReducer(state, {
    type: "SET_CLIP_ENABLED",
    clip_id: "clip_001",
    enabled: false,
    updated_at: "2026-04-02T12:05:00.000Z",
  });

  assert.equal(next.revision, state.revision + 1);
  assert.equal(next.updated_at, "2026-04-02T12:05:00.000Z");
});

test("packaging intent is an ordinary undoable timeline mutation", () => {
  const state = buildState();
  const next = hammerVisualTimelineReducer(state, {
    type: "SET_PACKAGING_INTENT",
    packaging: {
      version: 1,
      intro_asset_id: "11111111-1111-4111-8111-111111111111",
      outro_asset_id: null,
      intro_source: "manual",
      outro_source: null,
    },
    updated_at: "2026-08-26T12:00:00.000Z",
  });
  assert.equal(next.packaging.intro_asset_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(next.revision, state.revision + 1);
});

test("Florida B-roll DELETE_CLIP removes only the exact placement and lane membership", () => {
  const state = buildState();
  const florida = buildClip({ clip_id: "placement:florida-broll", asset_id: "asset_001", lane_id: "lane:primary", label: "Florida B-roll", visual_mode: "broll" });
  const retained = buildClip({ clip_id: "placement:retained", asset_id: "asset_001", lane_id: "lane:primary", label: "Retained visual" });
  state.clips = [florida, retained];
  state.lanes[0] = { ...state.lanes[0]!, clip_ids: [florida.clip_id, retained.clip_id] };
  state.selected_clip_id = florida.clip_id;
  const next = hammerVisualTimelineReducer(state, { type: "DELETE_CLIP", clip_id: florida.clip_id, updated_at: "2026-08-23T12:00:00.000Z" });
  assert.deepEqual(next.clips.map((clip) => clip.clip_id), [retained.clip_id]);
  assert.deepEqual(next.lanes[0]?.clip_ids, [retained.clip_id]);
  assert.equal(next.selected_clip_id, null);
});

test("LOAD_TIMELINE replaces state cleanly", () => {
  const replacement = createEmptyVisualTimelineState({
    revision: 4,
    updated_at: "2026-04-02T12:10:00.000Z",
  });

  const next = hammerVisualTimelineReducer(buildState(), {
    type: "LOAD_TIMELINE",
    timeline: replacement,
  });

  assert.deepEqual(next, replacement);
});

test("locked clip rejects timing update", () => {
  const state = buildState();
  state.clips[0] = buildClip({ locked: true });
  const next = hammerVisualTimelineReducer(state, {
    type: "UPDATE_CLIP_TIMING",
    clip_id: "clip_001",
    start_sec: 5,
    end_sec: 7,
    updated_at: "2026-04-02T12:11:00.000Z",
  });

  assert.equal(next, state);
});

test("locked clip rejects geometry update", () => {
  const state = buildState();
  state.clips[0] = buildClip({ locked: true });
  const next = hammerVisualTimelineReducer(state, {
    type: "PATCH_CLIP_GEOMETRY",
    clip_id: "clip_001",
    geometry: { x: 0.2 },
    updated_at: "2026-04-02T12:12:00.000Z",
  });

  assert.equal(next, state);
});

test("detach anchor only changes detached", () => {
  const state = buildState();
  const next = hammerVisualTimelineReducer(state, {
    type: "DETACH_CLIP_ANCHOR",
    clip_id: "clip_001",
    updated_at: "2026-04-02T12:13:00.000Z",
  });

  assert.deepEqual(next.clips[0].anchor_hint, {
    anchor_segment_id: "seg_001",
    matched_segment_ids: ["seg_001"],
    anchor_text: "hello",
    anchor_label: null,
    detached: true,
  });
});

test("relabel anchor replaces anchor explicitly", () => {
  const state = buildState();
  const next = hammerVisualTimelineReducer(state, {
    type: "RELABEL_CLIP_ANCHOR",
    clip_id: "clip_001",
    anchor_hint: {
      anchor_segment_id: "seg_009",
      matched_segment_ids: ["seg_009", "seg_010"],
      anchor_text: "updated",
      anchor_label: "Manual relabel",
      detached: false,
    },
    updated_at: "2026-04-02T12:14:00.000Z",
  });

  assert.deepEqual(next.clips[0].anchor_hint, {
    anchor_segment_id: "seg_009",
    matched_segment_ids: ["seg_009", "seg_010"],
    anchor_text: "updated",
    anchor_label: "Manual relabel",
    detached: false,
  });
});

test("selectEnabledClipsAtTimeSorted sorts by z-index then stable fallback", () => {
  const state = createEmptyVisualTimelineState({
    clips: [
      buildClip({ clip_id: "clip_b", z_index: 4 }),
      buildClip({ clip_id: "clip_a", z_index: 4 }),
      buildClip({ clip_id: "clip_c", z_index: 1 }),
    ],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_b", "clip_a", "clip_c"],
    }],
  });

  const ordered = selectEnabledClipsAtTimeSorted(state, 1.5);

  assert.deepEqual(ordered.map((clip) => clip.clip_id), ["clip_c", "clip_a", "clip_b"]);
});

test("clip targeting resolves exact canonical clip id even with similar labels", () => {
  const state = createEmptyVisualTimelineState({
    clips: [
      buildClip({ clip_id: "clip_101", label: "Same Label" }),
      buildClip({ clip_id: "clip_102", label: "Same Label", start_sec: 4, end_sec: 6 }),
    ],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_101", "clip_102"],
    }],
    selected_clip_id: "clip_102",
  });

  const selected = selectClipById(state, state.selected_clip_id);
  assert.equal(selected?.clip_id, "clip_102");
});

test("fit mode updates on canonical clip state", () => {
  const state = buildState();
  const next = hammerVisualTimelineReducer(state, {
    type: "UPDATE_CLIP_FIT_MODE",
    clip_id: "clip_001",
    fit_mode: "cover",
    updated_at: "2026-04-02T12:15:00.000Z",
  });

  assert.equal(next.clips[0]?.fit_mode, "cover");
});

test("selectPrimaryActiveClipAtTime returns the topmost active clip", () => {
  const state = createEmptyVisualTimelineState({
    clips: [
      buildClip({ clip_id: "clip_low", z_index: 1 }),
      buildClip({ clip_id: "clip_high", z_index: 9 }),
    ],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_low", "clip_high"],
    }],
  });

  const primary = selectPrimaryActiveClipAtTime(state, 1.5);
  assert.equal(primary?.clip_id, "clip_high");
});

test("selectPreviewClips follows playhead time during playback regardless of selected clip", () => {
  const state = createEmptyVisualTimelineState({
    assets: [{ asset_id: "asset_001", canonical_asset_id: "asset_001", authority_state: "canonical_proven", asset_ref: "asset_001", kind: "image", label: "Asset", path: "asset.png", storage_key: null, mime_type: "image/png", source_mode: "packaging", roles: ["timeline_visual"], updated_at: "2026-04-02T12:00:00.000Z" }],
    clips: [
      buildClip({ clip_id: "clip_a", start_sec: 0, end_sec: 2 }),
      buildClip({ clip_id: "clip_b", start_sec: 4, end_sec: 6 }),
    ],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_a", "clip_b"],
    }],
    selected_clip_id: "clip_a",
  });

  const candidates = selectPreviewClips({
    state,
    playheadSec: 4.5,
    isPlaybackActive: true,
    isScrubbing: false,
  });

  assert.deepEqual(candidates.map((clip) => clip.clip_id), ["clip_b"]);
});

test("selectPreviewClips stays playhead-driven when paused", () => {
  const state = createEmptyVisualTimelineState({
    assets: [{ asset_id: "asset_001", canonical_asset_id: "asset_001", authority_state: "canonical_proven", asset_ref: "asset_001", kind: "image", label: "Asset", path: "asset.png", storage_key: null, mime_type: "image/png", source_mode: "packaging", roles: ["timeline_visual"], updated_at: "2026-04-02T12:00:00.000Z" }],
    clips: [
      buildClip({ clip_id: "clip_a", start_sec: 0, end_sec: 2 }),
      buildClip({ clip_id: "clip_b", start_sec: 4, end_sec: 6 }),
    ],
    lanes: [{
      lane_id: "lane:primary",
      label: "Visuals",
      clip_ids: ["clip_a", "clip_b"],
    }],
    selected_clip_id: "clip_a",
  });

  const candidates = selectPreviewClips({
    state,
    playheadSec: 4.5,
    isPlaybackActive: false,
    isScrubbing: false,
  });

  assert.deepEqual(candidates.map((clip) => clip.clip_id), ["clip_b"]);
});
