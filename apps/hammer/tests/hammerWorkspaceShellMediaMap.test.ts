import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import { projectEditorialAuthorityGraphFromEditPlan } from "../src/editor/hammerRenderAssembly";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "../src/editor/hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "../src/editor/hammerWorkspaceShellHistoryController";
import { createHammerMediaMapMutationCommands } from "../src/editor/hammerWorkspaceShellMediaMapCommands";
import { deriveHammerBrollSuggestionItems, deriveHammerMediaMapBeats, deriveHammerResolvedBrollBindings } from "../src/editor/useHammerWorkspaceShellMediaMap";

function commandFixture() {
  let state: HammerEditorStateSerializable = {
    transcriptSegments: [{ segment_id: "s1", speaker: "Host", text: "Show it", start_sec: 0, end_sec: 5 }],
    visualPlacements: null,
    visualTimeline: null,
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: projectEditorialAuthorityGraphFromEditPlan({
      editPlan: {
        edit_plan_id: "plan1", version: "1", created_at: "2026-08-18T00:00:00.000Z",
        updated_at: "2026-08-18T00:00:00.000Z", source_transcript_id: "tx1", instructions: [{
          instruction_id: "b1", segment_id: "s1", type: "insert_broll", asset_ref: "unresolved:intent1",
          start_sec: 1, end_sec: 3, intent_source: "hearth_suggestion", intent_ref: "intent1",
          intent_description: "Show product", asset_binding_state: "unresolved", duck_preference: "none",
          companion_audio_duck_operation_id: null, created_at: "2026-08-18T00:00:00.000Z",
        }],
      },
      workspaceId: "ws1", workpieceId: "wp1", sessionId: "session1",
    }),
    outputSelection: { layerId: null, sourceRecipeRef: null },
    selectedSegmentId: "s1",
    playheadSec: 1,
    transcriptTimingHint: null,
  };
  const mutations: HammerHistoryMutationArgs[] = [];
  const applyHistoryMutation = (mutation: HammerHistoryMutationArgs): HammerHistoryEntry => {
    mutations.push(mutation);
    state = mutation.computeAfter(state);
    return { id: `e${mutations.length}`, parentEntryId: null, timestamp: "2026-08-18T00:00:00.000Z",
      kind: mutation.kind ?? "editor_state_change", label: mutation.label, forwardPatch: [], inversePatch: [] };
  };
  const commands = createHammerMediaMapMutationCommands({
    applyHistoryMutation,
    transcriptDurationSec: 5,
    transcriptSegments: state.transcriptSegments,
    placementsBySegmentId: new Map(),
    createPlacementId: () => "placement1",
    identity: { workpieceId: "wp1", workspaceId: "ws1", sessionId: "session1", transcriptSourceId: "tx1" },
    setMediaMapBeats: () => undefined,
    setRemovedMediaMapSegmentIds: () => undefined,
    setTimingHint: () => undefined,
  });
  return { commands, mutations, getState: () => state };
}

test("identical transcript inputs produce deterministic ordered media-map beats without mutation", () => {
  const segments = [
    { segment_id: "s1", text: "Show the product on screen." },
    { segment_id: "s2", text: "According to the cited report." },
  ] as never;
  const before = structuredClone(segments);
  const args = { current: [], segments, removedSegmentIds: ["s2"], placementsBySegmentId: new Map([["s1", { id: "p1", kind: "broll" }]]) };
  const first = deriveHammerMediaMapBeats(args);
  const second = deriveHammerMediaMapBeats(args);
  assert.deepEqual(first, second);
  assert.deepEqual(segments, before);
  assert.equal(first[0]?.id, "map:s1");
  assert.equal(first[0]?.linkedPlacementId, "p1");
});

test("B-roll suggestions remain distinct by resolved state and preserve binding identity", () => {
  const graph = { operations: [{ operation_id: "op1", lifecycle: "active", instruction: {
    type: "insert_broll", segment_id: "s1", start_sec: 1, end_sec: 3, asset_ref: "asset.png",
    asset_binding_state: "resolved", duck_preference: "auto",
  } }] } as never;
  const suggestions = deriveHammerBrollSuggestionItems(graph);
  assert.equal(suggestions.length, 1);
  const bindings = deriveHammerResolvedBrollBindings(suggestions, { placements: [{
    authority_operation_id: "op1", placement_id: "p1", asset_ref: "bound.png",
  }] } as never);
  assert.equal(bindings[0]?.assetRef, "bound.png");
  assert.equal(bindings[0]?.linkedPlacementId, "p1");
});

test("manual B-roll acceptance preserves canonical binding, timing, identity, and history intent", () => {
  const fixture = commandFixture();
  fixture.commands.resolveHearthBrollSuggestion({ operationId: "op:b1", assetPath: "assets/product.mp4", label: "Product" });
  const state = fixture.getState();
  const operation = state.editorialAuthorityGraph?.operations.find((item) => item.operation_id === "op:b1");
  assert.equal(operation?.instruction.type, "insert_broll");
  if (operation?.instruction.type === "insert_broll") {
    assert.deepEqual({ asset: operation.instruction.asset_ref, binding: operation.instruction.asset_binding_state,
      start: operation.instruction.start_sec, end: operation.instruction.end_sec },
    { asset: "assets/product.mp4", binding: "resolved", start: 1, end: 3 });
  }
  assert.deepEqual(state.visualTimeline?.clips.map((clip) => ({ id: clip.clip_id, operation: clip.authority_operation_id,
    start: clip.start_sec, end: clip.end_sec, mode: clip.visual_mode })),
  [{ id: "placement1", operation: "op:b1", start: 1, end: 3, mode: "broll" }]);
  assert.deepEqual({ label: fixture.mutations[0]?.label, kind: fixture.mutations[0]?.kind,
    toolId: fixture.mutations[0]?.toolId, affected: fixture.mutations[0]?.affectedPlacementIds,
    immediate: fixture.mutations[0]?.immediatePersist },
  { label: "Resolve Hearth B-roll suggestion", kind: "visual_adjustment", toolId: "video",
    affected: ["placement1"], immediate: true });
  assert.equal(deriveHammerBrollSuggestionItems(state.editorialAuthorityGraph).filter((item) => item.bindingState === "unresolved").length, 0);
});

test("resolved binding move, replace, and revert preserve operation identity and selection rules", () => {
  const fixture = commandFixture();
  fixture.commands.resolveHearthBrollSuggestion({ operationId: "op:b1", assetPath: "assets/product.mp4", label: "Product" });
  fixture.commands.moveResolvedBrollBinding("op:b1", 1);
  fixture.commands.replaceResolvedBrollBinding("op:b1", "assets/replacement.mp4");
  let state = fixture.getState();
  const operation = state.editorialAuthorityGraph?.operations.find((item) => item.operation_id === "op:b1");
  if (operation?.instruction.type !== "insert_broll") assert.fail("expected resolved B-roll operation");
  assert.deepEqual({ id: operation.operation_id, asset: operation.instruction.asset_ref,
    start: operation.instruction.start_sec, end: operation.instruction.end_sec },
  { id: "op:b1", asset: "assets/replacement.mp4", start: 2, end: 4 });
  assert.deepEqual(state.visualTimeline?.clips.map((clip) => [clip.clip_id, clip.start_sec, clip.end_sec]),
    [["placement1", 2, 4]]);
  fixture.commands.revertResolvedBrollBinding("op:b1");
  state = fixture.getState();
  assert.equal(state.editorialAuthorityGraph?.operations.find((item) => item.operation_id === "op:b1")?.lifecycle, "reverted");
  assert.deepEqual(state.visualTimeline?.clips, []);
  assert.deepEqual(fixture.mutations.slice(1).map((mutation) => mutation.label), [
    "Move resolved b-roll binding", "Replace resolved b-roll asset", "Revert resolved b-roll binding",
  ]);
});

test("visual anchor refinement preserves canonical timeline and history intent", () => {
  const fixture = commandFixture();
  fixture.commands.resolveHearthBrollSuggestion({ operationId: "op:b1", assetPath: "assets/product.mp4", label: "Product" });
  fixture.commands.commitVisualAnchorRefinement({
    clipId: "placement1",
    anchorText: "  refined anchor  ",
    anchorLabel: "  Product detail  ",
    detached: true,
    label: "Refine visual anchor",
  });
  const clip = fixture.getState().visualTimeline?.clips.find((candidate) => candidate.clip_id === "placement1");
  assert.deepEqual({
    text: clip?.anchor_hint.anchor_text,
    label: clip?.anchor_hint.anchor_label,
    detached: clip?.anchor_hint.detached,
  }, { text: "refined anchor", label: "Product detail", detached: true });
  const mutation = fixture.mutations.at(-1);
  assert.deepEqual({
    label: mutation?.label,
    kind: mutation?.kind,
    toolId: mutation?.toolId,
    affected: mutation?.affectedPlacementIds,
    immediate: mutation?.immediatePersist,
  }, {
    label: "Refine visual anchor",
    kind: "visual_adjustment",
    toolId: "video",
    affected: ["placement1"],
    immediate: true,
  });
});

test("media-map authority excludes loading, placement mutation, view models, persistence, and shorts", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const authority = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellMediaMap.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const commands = fs.readFileSync(path.join(root, "src/editor/hammerWorkspaceShellMediaMapCommands.ts"), "utf8");
  assert.match(authority, /Media-map authority derives beats, suggestions, removal state/);
  assert.doesNotMatch(authority, /loadWorkpiece|uploadWorkpiece|resolveHammerAutomaticPlacementCommand|buildSourceBayVM|onWorkspaceSnapshotChange|shortCandidate/i);
  assert.doesNotMatch(authority, /setEditableVisualTimeline|applyVisualTimelineAction/);
  assert.doesNotMatch(shell, /const \[mediaMapBeats|const \[removedMediaMapSegmentIds|operations\.flatMap\(\(operation\)/);
  assert.doesNotMatch(shell, /deriveHammerBoundObjects|deriveHammerBoundAttentionQueue|boundObjectById = useMemo/);
  assert.doesNotMatch(shell, /resolveInsertBrollSuggestionInGraph|updateResolvedInsertBrollOperationInGraph|synchronizeLinkedAudioDuckForBrollOperation/);
  assert.doesNotMatch(commands, /resolveHammerAutomaticPlacementCommand|loadWorkpiece|uploadWorkpiece|SourceDesk|shortCandidate/i);
});
