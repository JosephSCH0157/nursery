import assert from "node:assert/strict";
import test from "node:test";
import { assignmentOperation, importLegacyBrowserData, reconcileWorkspacePersistence, sparkOperation } from "../src/lib/bar-stock-persistence";
import { legacyAssignmentIsSatisfied, legacySparkIsSatisfied, readLegacyImport } from "../src/lib/legacy-import";
import type { BarStockRepository, BarStockSnapshot } from "../src/lib/bar-stock-repository";
import { loadRetryCache, saveRetryCache, type BarStockRetryOperation, type RetryStorage } from "../src/lib/retry-cache";

class MemoryStorage implements RetryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function acknowledgingRepository(seen: string[]): BarStockRepository {
  return {
    hydrateWorkspace: async () => ({ assignments: [], sparks: [], links: {} }),
    list: async () => ({ assignments: [], sparks: [], links: {} }),
    createAssignment: async (_scope, row, key) => { seen.push(key); return { outcome: "saved", row: { ...row, revision: 1 } }; },
    updateAssignment: async () => ({ outcome: "failed", row: null, error: "unused" }),
    archiveAssignment: async () => ({ outcome: "failed", row: null, error: "unused" }),
    deleteAssignment: async () => ({ outcome: "failed", row: null, error: "unused" }),
    createSpark: async (_scope, row, key) => { seen.push(key); return { outcome: "saved", row: { ...row, revision: 1 } }; },
    updateSpark: async () => ({ outcome: "failed", row: null, error: "unused" }),
    archiveSpark: async () => ({ outcome: "failed", row: null, error: "unused" }),
    hasAssignmentEpisodeLinks: async () => false,
  };
}

test("legacy import isolates malformed rows and derives deterministic identity", async () => {
  const storage = new MemoryStorage();
  const workspaceId = crypto.randomUUID();
  storage.setItem(`barstock_assignments_v2:${workspaceId}`, JSON.stringify([{ id: "old-project", name: "Project", createdAt: 1, updatedAt: 2 }, null]));
  storage.setItem(`barstock_sparks_v2:${workspaceId}`, JSON.stringify([{ id: "old-spark", body: "Idea", assignmentId: "old-project", createdAt: 1, updatedAt: 2 }, { nope: true }]));
  const first = await readLegacyImport(storage, workspaceId);
  const second = await readLegacyImport(storage, workspaceId);
  assert.equal(first.malformed, 2);
  assert.equal(first.assignments[0]?.canonical.id, second.assignments[0]?.canonical.id);
  assert.equal(first.sparks[0]?.canonical.id, second.sparks[0]?.canonical.id);
  assert.equal(first.sparks[0]?.canonical.assignmentId, first.assignments[0]?.canonical.id);
});

test("legacy completion is recorded only after all valid rows are acknowledged", async () => {
  const storage = new MemoryStorage();
  const workspaceId = crypto.randomUUID();
  storage.setItem(`barstock_sparks_v2:${workspaceId}`, JSON.stringify([{ id: "legacy", body: "Idea", createdAt: 1, updatedAt: 2 }]));
  const seen: string[] = [];
  const result = await importLegacyBrowserData({ repository: acknowledgingRepository(seen), storage, scope: { workspaceId, userId: crypto.randomUUID() }, online: true });
  assert.equal(result.imported, 1);
  assert.deepEqual(seen, ["legacy:spark:legacy"]);
  assert.equal(storage.getItem(`barstock_sparks_v2:${workspaceId}`), null);
  assert.ok(storage.getItem(`barstock_legacy_import_v3:${workspaceId}`));
});

test("unacknowledged legacy rows remain replayable and do not receive a completion marker", async () => {
  const storage = new MemoryStorage();
  const workspaceId = crypto.randomUUID();
  storage.setItem(`barstock_sparks_v2:${workspaceId}`, JSON.stringify([{ id: "legacy", body: "Idea" }]));
  const repo = acknowledgingRepository([]);
  repo.createSpark = async () => ({ outcome: "unavailable", row: null, error: "offline" });
  const result = await importLegacyBrowserData({ repository: repo, storage, scope: { workspaceId, userId: crypto.randomUUID() }, online: true });
  const replay = await importLegacyBrowserData({ repository: repo, storage, scope: { workspaceId, userId: crypto.randomUUID() }, online: true });
  assert.equal(result.pending, 1);
  assert.equal(replay.pending, 1);
  assert.equal(loadRetryCache(storage, workspaceId).length, 1);
  assert.ok(storage.getItem(`barstock_sparks_v2:${workspaceId}`));
  assert.equal(storage.getItem(`barstock_legacy_import_v3:${workspaceId}`), null);
});

test("legacy equivalence preserves inferred names and forward Spark lifecycle", () => {
  const assignment = {
    id: crypto.randomUUID(), name: "Imported Project", revision: 0, createdAt: 1, updatedAt: 2,
  };
  assert.equal(legacyAssignmentIsSatisfied(assignment, { ...assignment, name: "Canonical project", revision: 4 }, true), true);
  assert.equal(legacyAssignmentIsSatisfied(assignment, { ...assignment, name: "Canonical project", revision: 4 }, false), false);
  assert.equal(legacyAssignmentIsSatisfied({ ...assignment, name: "Derived title" }, { ...assignment, name: "Canonical project", revision: 4 }, true), false);

  const spark = {
    id: crypto.randomUUID(), revision: 0, createdAt: 1, updatedAt: 2,
    assignmentId: assignment.id, body: "Idea", title: " Title ", tags: ["one", "two"],
    status: "raw" as const, source: "import" as const, pinned: false,
  };
  const canonical = { ...spark, revision: 5, title: "Title", status: "forged" as const, source: "typed" as const };
  assert.equal(legacySparkIsSatisfied(spark, canonical), true);
  assert.equal(legacySparkIsSatisfied({ ...spark, body: "Changed" }, canonical), false);
  assert.equal(legacySparkIsSatisfied({ ...spark, tags: ["two", "one"] }, canonical), false);
  assert.equal(legacySparkIsSatisfied({ ...spark, status: "graduated" }, { ...canonical, status: "forged" }), true);
  assert.equal(legacySparkIsSatisfied({ ...spark, status: "graduated" }, { ...canonical, status: "warming" }), false);
});

function operationForLegacyRow(workspaceId: string, row: Awaited<ReturnType<typeof readLegacyImport>>["assignments"][number] | Awaited<ReturnType<typeof readLegacyImport>>["sparks"][number]): BarStockRetryOperation {
  if ("name" in row.canonical) {
    const operation = assignmentOperation({ workspaceId, action: "create", assignment: row.canonical });
    operation.idempotencyKey = row.importKey;
    return operation;
  }
  const operation = sparkOperation({ workspaceId, action: "create", spark: row.canonical });
  operation.idempotencyKey = row.importKey;
  return operation;
}

function snapshotRepository(snapshot: BarStockSnapshot, mutationKeys: string[]): BarStockRepository {
  const repo = acknowledgingRepository(mutationKeys);
  repo.hydrateWorkspace = async () => snapshot;
  return repo;
}

test("captured legacy shape clears 61 operations for 50 satisfied entities without canonical writes", async () => {
  const storage = new MemoryStorage();
  const workspaceId = crypto.randomUUID();
  const assignmentIds = [crypto.randomUUID(), crypto.randomUUID()];
  const sourceRows = Array.from({ length: 48 }, (_, index) => ({
    id: crypto.randomUUID(),
    assignmentId: assignmentIds[index % assignmentIds.length],
    body: `Legacy idea ${index}`,
    tags: index % 2 === 0 ? ["even"] : [],
    status: "raw",
    source: "import",
    pinned: index % 3 === 0,
    createdAt: 1_000 + index,
    updatedAt: 2_000 + index,
  }));
  const sourceKey = `barstock_sparks_v2:${workspaceId}`;
  storage.setItem(sourceKey, JSON.stringify(sourceRows));

  const legacy = await readLegacyImport(storage, workspaceId);
  assert.equal(legacy.assignments.length, 2);
  assert.equal(legacy.sparks.length, 48);
  const current = [...legacy.assignments, ...legacy.sparks].map((row) => ({
    ...operationForLegacyRow(workspaceId, row), attempts: 1, lastError: "Canonical write returned conflict.",
  })) as BarStockRetryOperation[];
  const duplicateCounts = [3, 2, 2, 1, 1, 1, 1];
  const duplicateTargets = current.slice(0, duplicateCounts.length);
  const historical = duplicateTargets.flatMap((operation, targetIndex) => (
    Array.from({ length: duplicateCounts[targetIndex] }, (_, versionIndex) => {
      const intent = { ...operation.intent, updatedAt: operation.intent.updatedAt + ((versionIndex + 1) * 10_000) };
      const historicalOperation = operation.kind === "assignment"
        ? assignmentOperation({ workspaceId, action: "create", assignment: intent })
        : sparkOperation({ workspaceId, action: "create", spark: intent });
      historicalOperation.idempotencyKey = operation.idempotencyKey;
      return { ...historicalOperation, attempts: 8 + versionIndex, lastError: "Canonical write returned conflict." } as BarStockRetryOperation;
    })
  ));
  saveRetryCache(storage, workspaceId, [...current, ...historical]);
  assert.equal(loadRetryCache(storage, workspaceId).length, 61);

  const snapshot: BarStockSnapshot = {
    assignments: legacy.assignments.map((row, index) => ({ ...row.canonical, name: `Canonical project ${index + 1}`, revision: 3 })),
    sparks: legacy.sparks.map((row, index) => ({
      ...row.canonical,
      revision: 4,
      status: index < 2 ? "forged" : row.canonical.status,
      source: "typed",
    })),
    links: {},
  };
  const mutationKeys: string[] = [];
  const result = await reconcileWorkspacePersistence({
    repository: snapshotRepository(snapshot, mutationKeys),
    storage,
    scope: { workspaceId, userId: crypto.randomUUID() },
    online: true,
  });

  assert.equal(result.executions.length, 50);
  assert.equal(result.executions.every((execution) => execution.acknowledged), true);
  assert.equal(result.remainingRetryCount, 0);
  assert.deepEqual(mutationKeys, []);
  assert.equal(storage.getItem(sourceKey), null);
  assert.ok(storage.getItem(`barstock_legacy_import_v3:${workspaceId}`));
  assert.deepEqual(result.snapshot, snapshot);
});

test("genuine legacy divergence retains one authoritative retry and blocks completion without multiplying", async () => {
  const storage = new MemoryStorage();
  const workspaceId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const sourceKey = `barstock_assignments_v2:${workspaceId}`;
  storage.setItem(sourceKey, JSON.stringify([{ id: assignmentId, name: "Legacy name", createdAt: 1, updatedAt: 2 }]));
  const canonical = { id: assignmentId, name: "Canonical name", revision: 2, createdAt: 1, updatedAt: 3 };
  const mutationKeys: string[] = [];
  const repo = snapshotRepository({ assignments: [canonical], sparks: [], links: {} }, mutationKeys);

  const first = await reconcileWorkspacePersistence({ repository: repo, storage, scope: { workspaceId, userId: crypto.randomUUID() }, online: true });
  const second = await reconcileWorkspacePersistence({ repository: repo, storage, scope: { workspaceId, userId: crypto.randomUUID() }, online: true });

  assert.equal(first.remainingRetryCount, 1);
  assert.equal(second.remainingRetryCount, 1);
  assert.equal(loadRetryCache(storage, workspaceId)[0]?.attempts, 2);
  assert.deepEqual(mutationKeys, []);
  assert.ok(storage.getItem(sourceKey));
  assert.equal(storage.getItem(`barstock_legacy_import_v3:${workspaceId}`), null);
});

test("malformed legacy data blocks completion after valid intents are satisfied", async () => {
  const storage = new MemoryStorage();
  const workspaceId = crypto.randomUUID();
  const sparkId = crypto.randomUUID();
  const sourceKey = `barstock_sparks_v2:${workspaceId}`;
  storage.setItem(sourceKey, JSON.stringify([{ id: sparkId, body: "Idea", createdAt: 1, updatedAt: 2 }, null]));
  const legacy = await readLegacyImport(storage, workspaceId);
  const snapshot = { assignments: [], sparks: [{ ...legacy.sparks[0].canonical, revision: 1, source: "typed" as const }], links: {} };

  const result = await reconcileWorkspacePersistence({
    repository: snapshotRepository(snapshot, []), storage,
    scope: { workspaceId, userId: crypto.randomUUID() }, online: true,
  });

  assert.equal(result.legacy.malformed, 1);
  assert.equal(result.legacy.pending, 0);
  assert.ok(storage.getItem(sourceKey));
  assert.equal(storage.getItem(`barstock_legacy_import_v3:${workspaceId}`), null);
});
