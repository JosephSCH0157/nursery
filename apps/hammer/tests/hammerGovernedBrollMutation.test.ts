import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerEditorStateSerializable } from "../src/editor/hammerWorkspaceHistory";
import { createGovernedBrollPlacement, removeGovernedBrollPlacement, resolveGovernedBrollOperationId, updateGovernedBrollTiming } from "../src/editor/hammerGovernedBrollMutation";
import { evaluateHammerBrollConsistency } from "../src/editor/hammerBrollConsistency";
import { buildHammerRenderAssembly } from "../src/editor/hammerRenderAssembly";

const NOW = "2026-08-25T12:00:00.000Z";
const identity = { graphId: "wp:authority", workspaceId: "ws", workpieceId: "wp", sessionId: "session", sourceTranscriptId: "tx" };

function emptyState(): HammerEditorStateSerializable {
  return { transcriptSegments: [{ segment_id: "segment:1", speaker: "Host", text: "Orange groves", start_sec: 0, end_sec: 8 }],
    visualPlacements: null, visualTimeline: null, audioEdit: null, studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null, outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: "segment:1",
    playheadSec: 1, transcriptTimingHint: null };
}

function add(kind: "broll" | "reference_clip" = "broll"): HammerEditorStateSerializable {
  return createGovernedBrollPlacement({ before: emptyState(), placementId: "clip:1", assetPath: "assets/grove.mp4",
    label: "Grove", kind, segmentId: "segment:1", segmentText: "Orange groves", startSec: 1, endSec: 4,
    identity, nowIso: NOW });
}

function assertAligned(state: HammerEditorStateSerializable): void {
  assert.deepEqual(evaluateHammerBrollConsistency({ graph: state.editorialAuthorityGraph, visualTimeline: state.visualTimeline }),
    { status: "aligned", findings: [] });
}

test("manual B-roll add creates one exact graph/clip/duck compound state", () => {
  const state = add();
  const broll = state.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "insert_broll");
  const duck = state.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "audio_duck");
  const clip = state.visualTimeline?.clips[0];
  assert.ok(broll && broll.instruction.type === "insert_broll");
  assert.ok(duck && duck.instruction.type === "audio_duck");
  assert.equal(clip?.authority_operation_id, broll.operation_id);
  assert.equal(broll.instruction.companion_audio_duck_operation_id, duck.operation_id);
  assert.equal(duck.instruction.linked_broll_operation_id, broll.operation_id);
  assert.equal(state.visualPlacements?.placements[0]?.authority_operation_id, broll.operation_id);
  assertAligned(state);
});

test("executable reference add retains reference provenance while creating governed intent", () => {
  const state = add("reference_clip");
  assert.equal(state.visualTimeline?.clips[0]?.visual_mode, "reference_clip");
  assert.equal(state.visualTimeline?.assets[0]?.kind, "reference_clip");
  assert.equal(state.editorialAuthorityGraph?.operations.some((item) => item.instruction.type === "insert_broll"), true);
  assertAligned(state);
});

test("governed move and trim synchronize graph, clip, duck, and compatibility projection", () => {
  const before = add();
  const broll = before.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "insert_broll");
  assert.ok(broll);
  const after = updateGovernedBrollTiming({ before, clipId: "clip:1", operationId: broll.operation_id,
    startSec: 2, endSec: 3.5, nowIso: "2026-08-25T12:01:00.000Z" });
  const nextBroll = after.editorialAuthorityGraph?.operations.find((item) => item.operation_id === broll.operation_id);
  const duck = after.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "audio_duck");
  assert.ok(nextBroll?.instruction.type === "insert_broll" && duck?.instruction.type === "audio_duck");
  assert.deepEqual([nextBroll.instruction.start_sec, nextBroll.instruction.end_sec], [2, 3.5]);
  assert.deepEqual([after.visualTimeline?.clips[0]?.start_sec, after.visualTimeline?.clips[0]?.end_sec], [2, 3.5]);
  assert.deepEqual([duck.instruction.start_sec, duck.instruction.end_sec], [2, 3.5]);
  assert.deepEqual([after.visualPlacements?.placements[0]?.start_sec, after.visualPlacements?.placements[0]?.end_sec], [2, 3.5]);
  assertAligned(after);
});

test("governed Remove Clip reverts graph and duck while removing every projection", () => {
  const before = add();
  const broll = before.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "insert_broll");
  assert.ok(broll);
  const after = removeGovernedBrollPlacement({ before, clipId: "clip:1", operationId: broll.operation_id,
    nowIso: "2026-08-25T12:02:00.000Z" });
  assert.equal(after.editorialAuthorityGraph?.operations.find((item) => item.operation_id === broll.operation_id)?.lifecycle, "reverted");
  assert.equal(after.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "audio_duck")?.lifecycle, "reverted");
  assert.deepEqual(after.visualTimeline?.clips, []);
  assert.deepEqual(after.visualPlacements?.placements, []);
  assertAligned(after);
  const assembly = buildHammerRenderAssembly({ canonicalGraph: after.editorialAuthorityGraph, runtimeCapabilities: {
    preview_supported_operation_types: ["insert_broll", "audio_duck"], export_supported_operation_types: ["insert_broll", "audio_duck"],
    handoff_supported_operation_types: ["insert_broll", "audio_duck"] } });
  assert.equal(assembly.export_timeline.visual_layers.some((layer) => layer.kind === "broll"), false);
});

test("invalid governed commands are atomic no-ops and never adopt orphan projections", () => {
  const state = add();
  const before = JSON.stringify(state);
  assert.equal(updateGovernedBrollTiming({ before: state, clipId: "clip:1", operationId: "op:wrong",
    startSec: 2, endSec: 4, nowIso: NOW }), state);
  assert.equal(removeGovernedBrollPlacement({ before: state, clipId: "clip:1", operationId: "op:wrong", nowIso: NOW }), state);
  assert.equal(JSON.stringify(state), before);
  const orphan = { ...state, editorialAuthorityGraph: null };
  assert.equal(resolveGovernedBrollOperationId(orphan, "clip:1"), null);
});

test("one semantic before/after supports complete Undo and Redo without partial states", () => {
  const before = add();
  const broll = before.editorialAuthorityGraph?.operations.find((item) => item.instruction.type === "insert_broll");
  assert.ok(broll);
  const after = removeGovernedBrollPlacement({ before, clipId: "clip:1", operationId: broll.operation_id, nowIso: NOW });
  const history = { before: structuredClone(before), after: structuredClone(after) };
  assertAligned(history.before);
  assertAligned(history.after);
  assert.equal(history.before.visualTimeline?.clips.length, 1);
  assert.equal(history.after.visualTimeline?.clips.length, 0);
});

test("generic visual commands route governed clips through the compound boundary", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const visualEditing = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellVisualEditing.ts"), "utf8");
  const governed = fs.readFileSync(path.join(root, "src/editor/hammerGovernedBrollMutation.ts"), "utf8");
  assert.match(visualEditing, /resolveGovernedBrollOperationId\(before, placementId\)[\s\S]*updateGovernedBrollTiming/);
  assert.match(visualEditing, /resolveGovernedBrollOperationId\(before, placementId\)[\s\S]*removeGovernedBrollPlacement/);
  assert.match(visualEditing, /createGovernedBrollPlacement\(\{/);
  assert.doesNotMatch(governed, /applyHistoryMutation|Supabase|schedulePersist|localStorage/);
});
