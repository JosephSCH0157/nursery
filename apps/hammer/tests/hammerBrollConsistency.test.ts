import assert from "node:assert/strict";
import test from "node:test";
import type { HammerEditInstruction } from "../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditorialAuthorityGraph } from "../../../packages/contracts/hammer/editorial-authority.contract";
import { evaluateHammerBrollConsistency } from "../src/editor/hammerBrollConsistency";
import { deriveHammerBrollConsistencyIssueDiagnostics } from "../src/editor/hammerIssueDiagnostics";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import { createEmptyVisualTimelineState } from "../src/visuals/model/hammerVisualDefaults";
import { migrateLegacyPlacementRecordToAsset, migrateLegacyPlacementRecordToClip } from "../src/visuals/model/hammerVisualMigrations";
import type { HammerVisualTimelineState } from "../src/visuals/model/hammerVisualTypes";
import type { HammerVisualPlacementRecord } from "../src/persistence/hammerPersistenceContract";

const NOW = "2026-08-25T12:00:00.000Z";

function graphWith(instructions: HammerEditInstruction[]): HammerEditorialAuthorityGraph {
  return projectEditorialAuthorityGraphFromEditPlan({
    editPlan: {
      edit_plan_id: "plan:broll-consistency",
      version: "1",
      created_at: NOW,
      updated_at: NOW,
      source_transcript_id: "transcript:1",
      preview_mode: "edit-aware",
      instructions,
      workspace_id: "workspace:1",
      workpiece_id: "workpiece:1",
      session_id: "session:1",
    },
    workspaceId: "workspace:1",
    workpieceId: "workpiece:1",
    sessionId: "session:1",
    nowIso: NOW,
  });
}

function brollInstruction(overrides: Partial<Extract<HammerEditInstruction, { type: "insert_broll" }>> = {}): Extract<HammerEditInstruction, { type: "insert_broll" }> {
  return {
    instruction_id: "instruction:broll:1",
    segment_id: "segment:1",
    type: "insert_broll",
    asset_ref: "assets/broll/grove.mp4",
    start_sec: 2,
    end_sec: 5,
    asset_binding_state: "resolved",
    duck_preference: "none",
    companion_audio_duck_operation_id: null,
    created_at: NOW,
    ...overrides,
  };
}

function placement(operationId?: string, overrides: Partial<HammerVisualPlacementRecord> = {}): HammerVisualPlacementRecord {
  return {
    placement_id: "clip:broll:1",
    entry_id: "entry:broll:1",
    anchor_segment_id: "segment:1",
    matched_segment_ids: ["segment:1"],
    anchor_text: "Orange groves.",
    asset_ref: "assets/broll/grove.mp4",
    asset_id: "asset:broll:1",
    asset_path: "assets/broll/grove.mp4",
    storage_key: "assets/broll/grove.mp4",
    label: "Grove",
    visual_mode: "b_roll",
    start_sec: 2,
    end_sec: 5,
    confidence: 1,
    timing_source: "transcript_match",
    status: "placed",
    ingest_state: "approved",
    uncertainty_flags: [],
    ...(operationId ? { authority_operation_id: operationId } : {}),
    ...overrides,
  };
}

function timelineFor(records: HammerVisualPlacementRecord[]): HammerVisualTimelineState {
  const assets = records.map((record, index) => migrateLegacyPlacementRecordToAsset({
    record,
    asset_id: record.asset_id ?? `asset:${index}`,
    updated_at: NOW,
  }));
  const clips = records.map((record, index) => migrateLegacyPlacementRecordToClip({
    record,
    asset_id: record.asset_id ?? `asset:${index}`,
    updated_at: NOW,
  }));
  return createEmptyVisualTimelineState({ updated_at: NOW, assets, clips });
}

function operationId(graph: HammerEditorialAuthorityGraph): string {
  const id = graph.operations[0]?.operation_id;
  assert.ok(id);
  return id;
}

test("aligned operation and clip produce no findings", () => {
  const graph = graphWith([brollInstruction()]);
  const result = evaluateHammerBrollConsistency({ graph, visualTimeline: timelineFor([placement(operationId(graph))]) });
  assert.deepEqual(result, { status: "aligned", findings: [] });
});

test("orphan and missing projection are classified independently", () => {
  const graph = graphWith([brollInstruction()]);
  const orphan = evaluateHammerBrollConsistency({ graph: graphWith([]), visualTimeline: timelineFor([placement()]) });
  assert.deepEqual(orphan.findings.map((finding) => finding.code), ["timeline_clip_without_operation"]);
  const missing = evaluateHammerBrollConsistency({ graph, visualTimeline: timelineFor([]) });
  assert.deepEqual(missing.findings.map((finding) => finding.code), ["operation_without_timeline_clip"]);
});

test("duplicate projection is detected by stable operation identity", () => {
  const graph = graphWith([brollInstruction()]);
  const id = operationId(graph);
  const result = evaluateHammerBrollConsistency({
    graph,
    visualTimeline: timelineFor([
      placement(id),
      placement(id, { placement_id: "clip:broll:2", asset_id: "asset:broll:2" }),
    ]),
  });
  assert.equal(result.findings.some((finding) => finding.code === "duplicate_operation_projection"), true);
});

test("wrong operation type is not accepted as B-roll authority", () => {
  const graph = graphWith([{
    instruction_id: "instruction:mute:1",
    segment_id: "segment:1",
    type: "mute",
    created_at: NOW,
  }]);
  const result = evaluateHammerBrollConsistency({ graph, visualTimeline: timelineFor([placement(operationId(graph))]) });
  assert.deepEqual(result.findings.map((finding) => finding.code), ["wrong_operation_type"]);
});

test("asset, timing, and anchor divergence are reported separately", () => {
  const graph = graphWith([brollInstruction()]);
  const result = evaluateHammerBrollConsistency({
    graph,
    visualTimeline: timelineFor([placement(operationId(graph), {
      asset_ref: "assets/broll/wrong.mp4",
      asset_path: "assets/broll/wrong.mp4",
      storage_key: "assets/broll/wrong.mp4",
      start_sec: 2.01,
      anchor_segment_id: "segment:wrong",
    })]),
  });
  assert.deepEqual(result.findings.map((finding) => finding.code), [
    "anchor_mismatch",
    "asset_binding_mismatch",
    "timing_mismatch",
  ]);
});

test("unresolved and inactive operations cannot retain visual projections", () => {
  const unresolvedGraph = graphWith([brollInstruction({ asset_binding_state: "unresolved" })]);
  const unresolved = evaluateHammerBrollConsistency({
    graph: unresolvedGraph,
    visualTimeline: timelineFor([placement(operationId(unresolvedGraph))]),
  });
  assert.equal(unresolved.findings.some((finding) => finding.code === "unresolved_operation_has_clip"), true);

  const inactiveGraph = graphWith([brollInstruction()]);
  inactiveGraph.operations[0] = { ...inactiveGraph.operations[0]!, lifecycle: "reverted" };
  const inactive = evaluateHammerBrollConsistency({
    graph: inactiveGraph,
    visualTimeline: timelineFor([placement(operationId(inactiveGraph))]),
  });
  assert.equal(inactive.findings.some((finding) => finding.code === "stale_projection"), true);
});

test("linked duck identity, lifecycle, and timing must agree", () => {
  const graph = graphWith([
    brollInstruction({ companion_audio_duck_operation_id: "operation:missing-duck" }),
  ]);
  const result = evaluateHammerBrollConsistency({ graph, visualTimeline: timelineFor([placement(operationId(graph))]) });
  assert.equal(result.findings.some((finding) => finding.code === "linked_duck_divergence"), true);

  const alignedGraph = graphWith([
    brollInstruction(),
    {
      instruction_id: "instruction:duck:1",
      segment_id: "segment:1",
      type: "audio_duck",
      start_sec: 2,
      end_sec: 5,
      duck_gain_db: -9,
      created_at: NOW,
    },
  ]);
  const broll = alignedGraph.operations[0]!;
  const duck = alignedGraph.operations[1]!;
  assert.equal(broll.instruction.type, "insert_broll");
  assert.equal(duck.instruction.type, "audio_duck");
  if (broll.instruction.type !== "insert_broll" || duck.instruction.type !== "audio_duck") assert.fail("expected B-roll and duck operations");
  alignedGraph.operations[0] = {
    ...broll,
    instruction: { ...broll.instruction, companion_audio_duck_operation_id: duck.operation_id },
  };
  alignedGraph.operations[1] = {
    ...duck,
    instruction: { ...duck.instruction, linked_broll_operation_id: broll.operation_id },
  };
  const aligned = evaluateHammerBrollConsistency({
    graph: alignedGraph,
    visualTimeline: timelineFor([placement(broll.operation_id)]),
  });
  assert.equal(aligned.findings.some((finding) => finding.code === "linked_duck_divergence"), false);
});

test("timing tolerance and finding order are deterministic", () => {
  const graph = graphWith([brollInstruction()]);
  const id = operationId(graph);
  const withinTolerance = evaluateHammerBrollConsistency({
    graph,
    visualTimeline: timelineFor([placement(id, { start_sec: 2.0005, end_sec: 4.9995 })]),
  });
  assert.equal(withinTolerance.findings.some((finding) => finding.code === "timing_mismatch"), false);
  const first = evaluateHammerBrollConsistency({ graph: graphWith([]), visualTimeline: timelineFor([
    placement(undefined, { placement_id: "clip:z", asset_id: "asset:z" }),
    placement(undefined, { placement_id: "clip:a", asset_id: "asset:a" }),
  ]) });
  const second = evaluateHammerBrollConsistency({ graph: graphWith([]), visualTimeline: timelineFor([
    placement(undefined, { placement_id: "clip:a", asset_id: "asset:a" }),
    placement(undefined, { placement_id: "clip:z", asset_id: "asset:z" }),
  ]) });
  assert.deepEqual(first, second);
});

test("diagnostic projection is presentation-only and exposes no repair action", () => {
  const consistency = evaluateHammerBrollConsistency({ graph: graphWith([]), visualTimeline: timelineFor([placement()]) });
  const issues = deriveHammerBrollConsistencyIssueDiagnostics(consistency.findings);
  assert.deepEqual(issues.map((issue) => ({
    severity: issue.severity,
    title: issue.title,
    canAutoFix: issue.canAutoFix,
    fixActionId: issue.fixActionId,
    affectedAreas: issue.affectedAreas,
  })), [{
    severity: "warning",
    title: "B-roll projection has no canonical operation",
    canAutoFix: false,
    fixActionId: null,
    affectedAreas: ["visuals", "preview_fidelity", "export"],
  }]);
});
