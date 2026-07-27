import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Draft } from "../src/domain/draft";
import type { Revision } from "../src/domain/revision";
import type { BarStockSpark } from "../src/lib/barstock-sparks";
import type { HearthReadyScript } from "../src/lib/hearth-ready-scripts";
import type { HearthWorkpieceSummary } from "../src/lib/hearth-workpieces";
import {
  buildHearthCollectionViewModel,
  collectionStatus,
} from "../src/routes/hearth-shell/buildHearthCollectionViewModel";

const WORKSPACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORKPIECE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function workpiece(patch: Partial<HearthWorkpieceSummary> = {}): HearthWorkpieceSummary {
  return {
    workpieceId: WORKPIECE_A,
    workspaceId: WORKSPACE_A,
    title: "Episode One",
    label: "Episode One",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    createdAtMs: 1,
    updatedAtMs: 2,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    isArchived: false,
    ...patch,
  };
}

function ready(patch: Partial<HearthReadyScript> = {}): HearthReadyScript {
  return {
    id: `ready:${WORKPIECE_A}`,
    workspaceId: WORKSPACE_A,
    workpieceId: WORKPIECE_A,
    path: "script/script.published.md",
    primaryScriptPath: "script/script.published.md",
    scriptPaths: ["script/script.published.md"],
    title: "Episode One",
    updatedAt: "2026-01-02T00:00:00.000Z",
    contentCategory: null,
    markedReadyBy: null,
    markedReadyAt: null,
    queueRank: null,
    hiddenAt: null,
    hiddenBy: null,
    scriptRevision: 1,
    scriptHash: "hash",
    transitionId: "transition",
    ...patch,
  };
}

function projection(patch: Parameters<typeof buildHearthCollectionViewModel>[0] extends infer T ? Partial<T> : never = {}) {
  return buildHearthCollectionViewModel({
    identity: { workspaceId: WORKSPACE_A, workpieceId: WORKPIECE_A },
    sparks: [],
    workpieces: [workpiece()],
    drafts: [],
    revisions: [],
    readyScripts: [],
    readyScriptsWorkspaceId: WORKSPACE_A,
    activeDraftId: null,
    sessionActiveDraftId: null,
    selectedSparkId: null,
    searchText: "",
    sortKey: "updated",
    showArchived: false,
    deferCollections: false,
    ...patch,
  });
}

test("one canonical workpiece produces exactly one row despite domain descendants", () => {
  const drafts = [
    { id: WORKPIECE_A, title: "Draft A", body: "one", createdAt: 1, updatedAt: 2 },
    { id: "draft-revision-shadow", title: "Draft B", body: "two", createdAt: 2, updatedAt: 3 },
  ] as Draft[];
  const revisions = [
    { id: "revision-a", draftId: WORKPIECE_A },
    { id: "revision-b", draftId: WORKPIECE_A },
  ] as Revision[];

  const view = projection({ drafts, revisions, readyScripts: [ready()] });
  assert.equal(view.workpieceNavItems.length, 1);
  assert.equal(view.workpieceNavItems[0]?.workpieceId, WORKPIECE_A);
});

test("production-like artifacts cannot enter the workpiece projection", () => {
  const noisyInputs = [
    { id: "thumbnail-candidate" },
    { id: "image-map-revision" },
    { id: "operation-receipt" },
  ];
  const view = projection({ revisions: noisyInputs as Revision[] });
  assert.deepEqual(view.workpieceNavItems.map((row) => row.workpieceId), [WORKPIECE_A]);
});

test("workspace-scoped Ready data never leaks into a new workspace", () => {
  const view = projection({
    identity: { workspaceId: WORKSPACE_B, workpieceId: null },
    readyScripts: [ready()],
    readyScriptsWorkspaceId: WORKSPACE_A,
  });
  assert.deepEqual(view.readyScriptsForDisplay, []);
  assert.equal(view.readyTotalCount, 0);
});

test("failure remains distinct from successful empty collection", () => {
  assert.deepEqual(collectionStatus({
    loading: false,
    error: "permission denied",
    count: 0,
    scoped: true,
  }), { kind: "error", message: "permission denied" });
  assert.deepEqual(collectionStatus({
    loading: false,
    error: null,
    count: 0,
    scoped: true,
  }), { kind: "ready", empty: true });
});

test("archive visibility changes without changing durable identity", () => {
  const archived = workpiece({
    archivedAt: "2026-01-03T00:00:00.000Z",
    isArchived: true,
  });
  assert.deepEqual(projection({ workpieces: [archived] }).filteredWorkpieceNavItems, []);
  const restored = workpiece();
  assert.equal(restored.workpieceId, archived.workpieceId);
  assert.deepEqual(
    projection({ workpieces: [restored] }).filteredWorkpieceNavItems.map((row) => row.workpieceId),
    [WORKPIECE_A],
  );
});

test("Ready hide and restore are reversible and do not imply workflow authority", () => {
  const hidden = ready({ hiddenAt: "2026-01-03T00:00:00.000Z" });
  const hiddenView = projection({ readyScripts: [hidden] });
  assert.equal(hiddenView.readyTotalCount, 0);
  assert.equal(hiddenView.removedReadyCount, 1);

  const restoredView = projection({ readyScripts: [ready()] });
  assert.equal(restoredView.readyTotalCount, 1);
  assert.equal(restoredView.activeReadyScript?.workpieceId, WORKPIECE_A);
  assert.equal("approved" in restoredView.activeReadyScript!, false);
  assert.equal("scheduled" in restoredView.activeReadyScript!, false);
  assert.equal("recording" in restoredView.activeReadyScript!, false);
  assert.equal("published" in restoredView.activeReadyScript!, false);
});

test("Spark projection is deterministic and never replaces a forged workpiece", () => {
  const forged: BarStockSpark = {
    id: "spark-a",
    body: "seed",
    createdAt: 1,
    updatedAt: 2,
    status: "forged",
    links: { hearthWorkpieceId: WORKPIECE_A, hearthDraftId: WORKPIECE_A },
  };
  const view = projection({ sparks: [forged], selectedSparkId: "spark-a" });
  assert.equal(view.selectedSpark?.id, "spark-a");
  assert.equal(view.selectedSpark?.links?.hearthWorkpieceId, WORKPIECE_A);
  assert.deepEqual(view.workpieceNavItems.map((row) => row.workpieceId), [WORKPIECE_A]);
});

test("search, archive filtering, and sorting preserve current rail behavior", () => {
  const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const second = workpiece({
    workpieceId: secondId,
    title: "Alpha Episode",
    label: "Alpha Episode",
    updatedAtMs: 3,
  });
  assert.deepEqual(
    projection({ workpieces: [workpiece(), second], sortKey: "title" })
      .filteredWorkpieceNavItems.map((row) => row.title),
    ["Alpha Episode", "Episode One"],
  );
  assert.deepEqual(
    projection({ workpieces: [workpiece(), second], searchText: "alpha" })
      .filteredWorkpieceNavItems.map((row) => row.workpieceId),
    [secondId],
  );
});

test("desktop and mobile consumers receive the same collection projection", () => {
  const desktop = projection();
  const mobile = projection();
  assert.deepEqual(mobile, desktop);
});

test("HearthShell delegates collection repositories to the controller boundary", async () => {
  const shell = await readFile(
    new URL("../src/routes/HearthShell.tsx", import.meta.url),
    "utf8",
  );
  const controller = await readFile(
    new URL("../src/routes/hearth-shell/useHearthCollectionController.ts", import.meta.url),
    "utf8",
  );

  const runtimeRepositoryImports = shell
    .split(/\r?\n/)
    .filter((line) => /^import\b/.test(line))
    .filter((line) => !/^import type\b/.test(line))
    .filter((line) => /hearth-workpieces|hearth-ready-scripts|hearth-workpiece|hearth-barstock-sparks/.test(line));
  assert.deepEqual(runtimeRepositoryImports, []);
  assert.match(shell, /useHearthSparkCollectionState/);
  assert.match(shell, /useHearthEpisodeCollectionState/);
  assert.match(shell, /useHearthReadyCollectionState/);
  assert.match(shell, /useHearthCollectionViewModel/);
  assert.match(controller, /listHearthWorkpieces/);
  assert.match(controller, /listHearthReadyScripts/);
});

test("collection controller excludes editorial and production ownership", async () => {
  const controller = await readFile(
    new URL("../src/routes/hearth-shell/useHearthCollectionController.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    controller,
    /useHearthAutosave|useApprovalFlow|DraftHydration|ChatWorkspace|EpisodePackage|Thumbnail|ImageMap|Broll|ReleasePrep/,
  );
  assert.doesNotMatch(controller, /resolveWorkspaceId|resolveWorkpieceId/);
});

test("controller contract exposes explicit state, commands, and status sections", async () => {
  const contract = await readFile(
    new URL("../src/routes/hearth-shell/hearth-collection-contracts.ts", import.meta.url),
    "utf8",
  );
  assert.match(contract, /export type HearthCollectionController = \{\s*state:/);
  assert.match(contract, /\n  commands:/);
  assert.match(contract, /\n  status:/);
  assert.doesNotMatch(contract, /setDraft|setApproval|setRevision|setProduction/);
});
