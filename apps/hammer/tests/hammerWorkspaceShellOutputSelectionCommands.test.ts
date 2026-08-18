import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import type { HammerDerivedTextLayer } from "../src/persistence/hammerPersistenceContract";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type { HammerEditorStateSerializable } from "../src/editor/hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "../src/editor/hammerWorkspaceShellHistoryController";
import {
  clearInvalidHammerOutputSelection,
  selectHammerOutputLayerForExport,
} from "../src/editor/hammerWorkspaceShellOutputSelectionCommands";

const layers: HammerDerivedTextLayer[] = [{
  layer_id: "layer-clean",
  recipe_ref: "macro:podcast_cleanup.v1",
  macro_kind: "filler_cleanup",
  status: "active",
  created_at: "2026-08-18T12:00:00.000Z",
  based_on_transcript_id: "tx1",
  summary: { changed_segment_count: 1, removal_count: 1, untouched_segment_count: 0 },
  changes: [],
}];

function state(): HammerEditorStateSerializable {
  return {
    transcriptSegments: [{ segment_id: "s1", speaker: "Host", text: "truth", start_sec: 0, end_sec: 1 }],
    visualPlacements: null, visualTimeline: null, audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(), editorialAuthorityGraph: null,
    outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: "s1",
    playheadSec: 0, transcriptTimingHint: null,
  };
}

function fixture() {
  const mutations: HammerHistoryMutationArgs[] = [];
  let current = state();
  const applyHistoryMutation = (mutation: HammerHistoryMutationArgs) => {
    mutations.push(mutation);
    current = mutation.computeAfter(current);
  };
  return { mutations, applyHistoryMutation, getState: () => current };
}

test("output selection preserves canonical identity, history intent, and input immutability", () => {
  const subject = fixture();
  const beforeLayers = structuredClone(layers);
  assert.equal(selectHammerOutputLayerForExport({ layerId: "layer-clean", layers,
    currentSelection: subject.getState().outputSelection, applyHistoryMutation: subject.applyHistoryMutation }), true);
  assert.deepEqual(subject.getState().outputSelection,
    { layerId: "layer-clean", sourceRecipeRef: "macro:podcast_cleanup.v1" });
  assert.equal(subject.getState().transcriptSegments[0]?.text, "truth");
  assert.deepEqual(layers, beforeLayers);
  const mutation = subject.mutations[0];
  assert.deepEqual({ label: mutation?.label, kind: mutation?.kind, toolId: mutation?.toolId,
    immediate: mutation?.immediatePersist },
  { label: "Set export output to macro:podcast_cleanup.v1 output", kind: "output_selection", toolId: "export", immediate: true });
});

test("raw, missing, duplicate, and invalid selections preserve established guards", () => {
  const subject = fixture();
  assert.equal(selectHammerOutputLayerForExport({ layerId: "missing", layers,
    currentSelection: subject.getState().outputSelection, applyHistoryMutation: subject.applyHistoryMutation }), false);
  assert.equal(subject.mutations.length, 0);
  assert.equal(clearInvalidHammerOutputSelection({ layers,
    currentSelection: { layerId: "missing", sourceRecipeRef: "stale" },
    applyHistoryMutation: subject.applyHistoryMutation }), true);
  assert.deepEqual(subject.getState().outputSelection, { layerId: null, sourceRecipeRef: null });
  assert.equal(subject.mutations[0]?.label, "Clear invalid export output selection");
  assert.equal(clearInvalidHammerOutputSelection({ layers,
    currentSelection: { layerId: null, sourceRecipeRef: null },
    applyHistoryMutation: subject.applyHistoryMutation }), false);
});

test("output-selection authority excludes release, artifact I/O, persistence, and shell construction", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const owner = fs.readFileSync(path.join(root, "src/editor/hammerWorkspaceShellOutputSelectionCommands.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  assert.doesNotMatch(owner, /\b(?:saveHammer|upload|onWorkspaceSnapshotChange|buildHammerRelease|buildHammerWorkspaceShellReleasePackage|renderBuiltSrt|renderBuiltVtt)\s*\(/);
  assert.doesNotMatch(shell, /kind:\s*["']output_selection["']|Clear invalid export output selection|Set export output to Raw transcript/);
});
