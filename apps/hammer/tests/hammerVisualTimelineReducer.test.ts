import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultVisualAnimation, createDefaultVisualGeometry, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { hammerVisualTimelineReducer } from "../src/visuals/state/hammerVisualReducer";
import { selectEnabledClipsAtTimeSorted } from "../src/visuals/state/hammerVisualSelectors";
import type { HammerVisualClip } from "../src/visuals/model/hammerVisualTypes";

function buildClip(overrides?: Partial<HammerVisualClip>): HammerVisualClip {
  return {
    clip_id: overrides?.clip_id ?? "clip_001",
    asset_id: overrides?.asset_id ?? "asset_001",
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
