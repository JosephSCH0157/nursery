import assert from "node:assert/strict";
import test from "node:test";
import type { HammerEditInstruction } from "../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditorialAuthorityGraph } from "../../../packages/contracts/hammer/editorial-authority.contract";
import { evaluateHammerReadinessGate } from "../src/editor/hammerReadinessGate";
import { buildHammerRenderAssembly, projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { migrateLegacyPlacementRecordToAsset, migrateLegacyPlacementRecordToClip } from "../src/visuals/model/hammerVisualMigrations";
import type { HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";
import type { HammerVisualPlacementRecord } from "../src/persistence/hammerPersistenceContract";

const NOW = "2026-08-25T12:00:00.000Z";

function graphWith(instructions: HammerEditInstruction[]): HammerEditorialAuthorityGraph {
  return projectEditorialAuthorityGraphFromEditPlan({
    editPlan: { edit_plan_id: "plan:broll-readiness", version: "1", created_at: NOW, updated_at: NOW,
      source_transcript_id: "transcript:1", preview_mode: "edit-aware", instructions },
    workspaceId: "workspace:1", workpieceId: "workpiece:1", sessionId: "session:1", nowIso: NOW,
  });
}

function broll(overrides: Partial<Extract<HammerEditInstruction, { type: "insert_broll" }>> = {}): Extract<HammerEditInstruction, { type: "insert_broll" }> {
  return { instruction_id: "instruction:broll:1", segment_id: "segment:1", type: "insert_broll",
    asset_ref: "assets/broll/grove.mp4", start_sec: 2, end_sec: 5, asset_binding_state: "resolved",
    duck_preference: "none", companion_audio_duck_operation_id: null, created_at: NOW, ...overrides };
}

function record(operationId?: string, overrides: Partial<HammerVisualPlacementRecord> = {}): HammerVisualPlacementRecord {
  return { placement_id: "clip:broll:1", entry_id: "entry:broll:1", anchor_segment_id: "segment:1",
    matched_segment_ids: ["segment:1"], anchor_text: "Orange groves.", asset_ref: "assets/broll/grove.mp4",
    asset_id: "asset:broll:1", asset_path: "assets/broll/grove.mp4", storage_key: "assets/broll/grove.mp4",
    label: "Grove", visual_mode: "b_roll", start_sec: 2, end_sec: 5, confidence: 1,
    timing_source: "transcript_match", status: "placed", ingest_state: "approved", uncertainty_flags: [],
    ...(operationId ? { authority_operation_id: operationId } : {}), ...overrides };
}

function timelineFor(records: HammerVisualPlacementRecord[]): HammerVisualTimelineState {
  return createEmptyVisualTimelineState({ updated_at: NOW,
    assets: records.map((item, index) => migrateLegacyPlacementRecordToAsset({ record: item, asset_id: item.asset_id ?? `asset:${index}`, updated_at: NOW })),
    clips: records.map((item, index) => migrateLegacyPlacementRecordToClip({ record: item, asset_id: item.asset_id ?? `asset:${index}`, updated_at: NOW })),
  });
}

function operationId(graph: HammerEditorialAuthorityGraph): string {
  const id = graph.operations[0]?.operation_id;
  assert.ok(id);
  return id;
}

function evaluate(graph: HammerEditorialAuthorityGraph, visualTimeline: HammerVisualTimelineState, unresolved: string[] = []) {
  const renderAssembly = buildHammerRenderAssembly({ canonicalGraph: graph, runtimeCapabilities: {
    preview_supported_operation_types: ["insert_broll", "audio_duck"],
    export_supported_operation_types: ["insert_broll", "audio_duck"],
    handoff_supported_operation_types: ["insert_broll", "audio_duck"],
  } });
  return { renderAssembly, gate: evaluateHammerReadinessGate({ renderAssembly, canonicalGraph: graph, visualTimeline,
    boundAttentionQueue: [], unresolvedBrollSuggestionOperationIds: unresolved }) };
}

test("aligned B-roll contributes no readiness blocker", () => {
  const graph = graphWith([broll()]);
  const { gate } = evaluate(graph, timelineFor([record(operationId(graph))]));
  assert.equal(gate.blockingReasons.some((reason) => reason.code.startsWith("broll_")), false);
});

test("timeline-only Preview projection blocks handoff without becoming render intent", () => {
  const graph = graphWith([]);
  const timeline = timelineFor([record()]);
  const before = JSON.stringify({ graph, timeline });
  const { gate, renderAssembly } = evaluate(graph, timeline);
  assert.equal(gate.status, "blocked");
  assert.equal(gate.readyForQuench, false);
  assert.equal(gate.blockingReasons[0]?.code, "broll_timeline_clip_without_operation");
  assert.equal(gate.blockingReasons[0]?.clipId, "clip:broll:1");
  assert.equal(renderAssembly.export_timeline.visual_layers.some((layer) => layer.kind === "broll"), false);
  assert.equal(JSON.stringify({ graph, timeline }), before);
});

test("graph-only resolved intent still assembles but blocks handoff without reconstructing a clip", () => {
  const graph = graphWith([broll()]);
  const timeline = timelineFor([]);
  const before = JSON.stringify({ graph, timeline });
  const { gate, renderAssembly } = evaluate(graph, timeline);
  assert.equal(renderAssembly.export_timeline.visual_layers.some((layer) => layer.kind === "broll"), true);
  assert.equal(gate.status, "blocked");
  assert.equal(gate.blockingReasons.some((reason) => reason.code === "broll_operation_without_timeline_clip"), true);
  assert.equal(JSON.stringify({ graph, timeline }), before);
});

test("all typed pair divergence remains blocking and deterministically ordered", () => {
  const graph = graphWith([broll()]);
  const id = operationId(graph);
  const timeline = timelineFor([
    record(id, { asset_ref: "assets/broll/wrong.mp4", asset_path: "assets/broll/wrong.mp4",
      storage_key: "assets/broll/wrong.mp4", start_sec: 2.01, anchor_segment_id: "segment:wrong" }),
    record(id, { placement_id: "clip:broll:2", asset_id: "asset:broll:2" }),
  ]);
  const first = evaluate(graph, timeline).gate.blockingReasons.filter((reason) => reason.code.startsWith("broll_"));
  const second = evaluate(graph, timeline).gate.blockingReasons.filter((reason) => reason.code.startsWith("broll_"));
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.map((reason) => reason.code)), new Set([
    "broll_anchor_mismatch", "broll_asset_binding_mismatch", "broll_duplicate_operation_projection", "broll_timing_mismatch",
  ]));
});

test("lifecycle and linked-duck divergence block while legitimate history passes", () => {
  const active = graphWith([broll({ companion_audio_duck_operation_id: "operation:missing" })]);
  assert.equal(evaluate(active, timelineFor([record(operationId(active))])).gate.blockingReasons
    .some((reason) => reason.code === "broll_linked_duck_divergence"), true);
  const reverted = graphWith([broll()]);
  reverted.operations[0] = { ...reverted.operations[0]!, lifecycle: "reverted" };
  assert.equal(evaluate(reverted, timelineFor([record(operationId(reverted))])).gate.blockingReasons
    .some((reason) => reason.code === "broll_stale_projection"), true);
  assert.equal(evaluate(reverted, timelineFor([])).gate.blockingReasons
    .some((reason) => reason.code.startsWith("broll_")), false);
});

test("unresolved graph-only suggestions remain review-only and ordinary images remain outside the gate", () => {
  const unresolved = graphWith([broll({ asset_binding_state: "unresolved" })]);
  const unresolvedId = operationId(unresolved);
  const unresolvedGate = evaluate(unresolved, timelineFor([]), [unresolvedId]).gate;
  assert.equal(unresolvedGate.blockingReasons.some((reason) => reason.code.startsWith("broll_")), false);
  assert.equal(unresolvedGate.reviewReasons.some((reason) => reason.code === "unresolved_broll_intent"), true);

  const stillTimeline = timelineFor([record(undefined, { visual_mode: "illustrative" })]);
  stillTimeline.assets[0] = { ...stillTimeline.assets[0]!, kind: "image" };
  assert.equal(evaluate(graphWith([]), stillTimeline).gate.blockingReasons.some((reason) => reason.code.startsWith("broll_")), false);
});
