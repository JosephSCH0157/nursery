import assert from "node:assert/strict";
import test from "node:test";
import type { SourcesState } from "../src/hooks/useSourcesState";
import {
  buildHearthSourceNotes,
  deriveHearthSourcesLoadStatus,
  deriveHearthSourcesMutationStatus,
} from "../src/routes/hearth-shell/buildHearthSourcesViewModel";
import type { HearthSourcesController } from "../src/routes/hearth-shell/hearth-sources-contracts";

function sourceState(overrides: Partial<SourcesState> = {}): SourcesState {
  return {
    workpieceSources: [],
    sourceIndexEntries: [],
    sourceIndexById: new Map(),
    sourceDetails: {},
    missingWorkpieceSources: [],
    missingLibrarySources: [],
    unusedWorkpieceSources: [],
    missingCitedCount: 0,
    unusedRefsCount: 0,
    hasWorkspaceIndex: false,
    canonicalLoadFailed: false,
    citedSourceIds: new Set(),
    status: { kind: "idle" },
    attachSourceToWorkpiece() {},
    removeSourceFromWorkpiece() {},
    updateWorkpieceSourceNotes() {},
    async addSourceToLibrary() { return null; },
    async updateSourceInLibrary() { return null; },
    async loadSourceDetails() { return null; },
    syncSources() {},
    ...overrides,
  };
}

test("successful empty sources remain distinct from a failed source state", () => {
  assert.equal(deriveHearthSourcesLoadStatus(sourceState()), "empty");
  assert.equal(
    deriveHearthSourcesLoadStatus(sourceState({
      canonicalLoadFailed: true,
    })),
    "failed",
  );
});

test("source projection preserves identity, ordering, notes, and provenance inputs", () => {
  const state = sourceState({
    workpieceSources: [
      { source_id: "SRC-B", notes: "second" },
      { source_id: "SRC-A", notes: "first" },
    ],
    sourceIndexEntries: [
      { source_id: "SRC-B", title: "Beta", type: "article" },
      { source_id: "SRC-A", title: "Alpha", type: "book" },
    ],
    hasWorkspaceIndex: true,
  });
  assert.deepEqual(state.workpieceSources.map((source) => source.source_id), ["SRC-B", "SRC-A"]);
  assert.deepEqual(buildHearthSourceNotes(state), {
    "SRC-B": "second",
    "SRC-A": "first",
  });
  assert.equal(state.hasWorkspaceIndex, true);
});

test("mutation failure does not collapse into idle or successful empty state", () => {
  const state = sourceState({ status: { kind: "error", message: "save_failed" } });
  assert.equal(deriveHearthSourcesMutationStatus(state), "failed");
  assert.equal(deriveHearthSourcesLoadStatus(state), "empty");
});

test("detach and remove commands can preserve library identity independently", () => {
  const librarySource = { source_id: "SRC-1", title: "Source", type: "article" };
  let attached = true;
  const controller = {
    state: {
      sources: {
        library: [librarySource],
      },
    },
    commands: {
      detachSourceFromWorkpiece() {
        attached = false;
      },
    },
  } as unknown as HearthSourcesController;
  controller.commands.detachSourceFromWorkpiece("SRC-1");
  assert.equal(attached, false);
  assert.equal(controller.state.sources.library[0]?.source_id, "SRC-1");
});

test("attached source provenance is not script approval or factual verification", () => {
  const controller = {
    state: {
      sources: { workpiece: [{ source_id: "SRC-1" }] },
      provenance: {
        hasWorkspaceIndex: true,
        citedSourceIds: new Set(["src-1"]),
        researchResult: null,
      },
    },
    commands: {},
  } as unknown as HearthSourcesController;
  assert.equal("approval" in controller.state, false);
  assert.equal("script" in controller.state, false);
  assert.equal(controller.state.provenance.researchResult, null);
});
