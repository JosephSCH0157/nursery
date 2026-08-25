import assert from "node:assert/strict";
import test from "node:test";
import { automaticPlacementCanonicalRevision, selectAutomaticPlacementBatch } from "../src/editor/hammerAutomaticPlacementBatch";
import { executeAutomaticPlacementBatch } from "../src/editor/hammerAutomaticPlacementBatchCommand";
import { applyWorkspaceVisualTimelineActions, resolveCanonicalWorkspaceVisualTimeline } from "../src/editor/hammerWorkspaceMutationGateway";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "../src/editor/hammerWorkspaceHistory";
import type { HammerVisualClip, HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";
import { createDefaultSemanticAnchor, createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";

function clip(id: string, x: number): HammerVisualClip {
  return { clip_id: id, lane_id: "images", asset_id: null, start_sec: Number(id.slice(1)), end_sec: Number(id.slice(1)) + 2,
    geometry: { x, y: 0.3, width: 0.2, height: 0.2, anchor: "top_left" }, placement_status: "placed", enabled: true,
    updated_at: `2026-08-25T00:00:0${id.slice(1)}.000Z`, uncertainty_flags: [], animation: { preset: "none" },
    anchor_hint: { anchor_segment_id: null, matched_segment_ids: [], anchor_text: null, anchor_label: null, detached: false },
    semantic_anchor: createDefaultSemanticAnchor({ status: "no_placement_intent" }),
    divergence: { state: "not_comparable", start_delta_sec: null, end_delta_sec: null }, opacity: 1, z_index: 1, locked: false } as HammerVisualClip;
}

function timeline(clips: HammerVisualClip[]): HammerVisualTimelineState {
  return { ...createEmptyVisualTimelineState({ updated_at: "2026-08-25T00:00:00.000Z", debug_origin: "empty_init" }), revision: 7,
    lanes: [{ lane_id: "images", label: "Images", clip_ids: clips.map((item) => item.clip_id) }], clips };
}

function entry(tl: HammerVisualTimelineState, item: HammerVisualClip, status: "resolved-safe" | "safe-existing" | "needs-review",
  leftPct = 60, canonicalRevision = automaticPlacementCanonicalRevision(tl, item)) {
  return { item: { placementId: item.clip_id, sessionIdentity: "session", sourceIdentity: "workpiece:blob:video", compositionPresentationTimeSec: item.start_sec,
    canonicalRevision, mediaRevision: "blob:video", geometryRevision: "g1" }, status,
    ...(status === "resolved-safe" ? { resolvedTransform: { leftPct, topPct: 10, widthPct: 20, heightPct: 20 } } : {}) } as const;
}

test("batch eligibility includes only current changed resolved-safe placements", () => {
  const clips = [clip("p1", 0.1), clip("p2", 0.1), clip("p3", 0.1), clip("p4", 0.1), clip("p5", 0.1), clip("p6", 0.1), clip("p7", 0.1), clip("p8", 0.1), clip("p9", 0.6)];
  const tl = timeline(clips);
  const entries = [entry(tl, clips[0], "resolved-safe"), entry(tl, clips[1], "resolved-safe"), entry(tl, clips[2], "resolved-safe"), entry(tl, clips[3], "resolved-safe"),
    entry(tl, clips[4], "safe-existing"), entry(tl, clips[5], "safe-existing"), entry(tl, clips[6], "needs-review"),
    entry(tl, clips[7], "resolved-safe", 60, "superseded"), { ...entry(tl, clips[8], "resolved-safe", 60),
      resolvedTransform: { leftPct: 60, topPct: 30, widthPct: 20, heightPct: 20 } }];
  const plan = selectAutomaticPlacementBatch({ timeline: tl, mediaRevision: "blob:video", entries });
  assert.deepEqual(plan.changes.map((change) => change.placementId), ["p1", "p2", "p3", "p4"]);
  assert.deepEqual({ safe: plan.safeExisting, review: plan.review, stale: plan.stale, unchanged: plan.unchanged }, { safe: 2, review: 1, stale: 1, unchanged: 1 });
});

test("batch uses one history mutation and one computeAfter for atomic undo and redo", () => {
  const clips = [clip("p1", 0.1), clip("p2", 0.2), clip("p3", 0.3)];
  const tl = timeline(clips); const entries = clips.map((item) => entry(tl, item, "resolved-safe"));
  let current = { visualTimeline: tl } as HammerEditorStateSerializable;
  let historyCalls = 0; let computeCalls = 0; let persistBoundaries = 0; let before: HammerEditorStateSerializable | null = null; let after: HammerEditorStateSerializable | null = null;
  const result = executeAutomaticPlacementBatch({ timeline: tl, mediaRevision: "blob:video", entries,
    resolveCanonicalTimeline: resolveCanonicalWorkspaceVisualTimeline, applyTimelineActions: applyWorkspaceVisualTimelineActions, requestDurablePersistBoundary: () => { persistBoundaries += 1; },
    applyHistoryMutation: (mutation) => { historyCalls += 1; before = current; computeCalls += 1; after = mutation.computeAfter(current); current = after; return {} as HammerHistoryEntry; } });
  assert.equal(result.applied, true); assert.deepEqual([historyCalls, computeCalls, persistBoundaries], [1, 1, 1]);
  assert.deepEqual(result.plan.changes.map((change) => change.placementId), ["p1", "p2", "p3"]);
  assert.deepEqual(resolveCanonicalWorkspaceVisualTimeline(current).clips.map((item) => item.geometry.x), [0.6, 0.6, 0.6]);
  current = before!; assert.deepEqual(resolveCanonicalWorkspaceVisualTimeline(current).clips.map((item) => item.geometry.x), [0.1, 0.2, 0.3]);
  current = after!; assert.deepEqual(resolveCanonicalWorkspaceVisualTimeline(current).clips.map((item) => item.geometry.x), [0.6, 0.6, 0.6]);
});

test("stale-at-click and empty plans never create stale or no-op history", () => {
  const a = clip("p1", 0.1); const b = clip("p2", 0.2); const original = timeline([a, b]);
  const entries = [entry(original, a, "resolved-safe"), entry(original, b, "resolved-safe")];
  const changed = { ...original, clips: [{ ...a, updated_at: "later" }, b] } as HammerVisualTimelineState;
  let calls = 0; let persists = 0;
  const result = executeAutomaticPlacementBatch({ timeline: changed, mediaRevision: "blob:video", entries,
    resolveCanonicalTimeline: resolveCanonicalWorkspaceVisualTimeline, applyTimelineActions: applyWorkspaceVisualTimelineActions, requestDurablePersistBoundary: () => { persists += 1; },
    applyHistoryMutation: (mutation) => { calls += 1; mutation.computeAfter({ visualTimeline: changed } as HammerEditorStateSerializable); return {} as HammerHistoryEntry; } });
  assert.equal(result.applied, true); assert.deepEqual(result.plan.changes.map((change) => change.placementId), ["p2"]); assert.deepEqual([calls, persists], [1, 1]);
  const noOp = executeAutomaticPlacementBatch({ timeline: changed, mediaRevision: "other", entries,
    resolveCanonicalTimeline: resolveCanonicalWorkspaceVisualTimeline, applyTimelineActions: applyWorkspaceVisualTimelineActions, requestDurablePersistBoundary: () => { persists += 1; },
    applyHistoryMutation: () => { calls += 1; return {} as HammerHistoryEntry; } });
  assert.equal(noOp.applied, false); assert.deepEqual([calls, persists], [1, 1]);
});
