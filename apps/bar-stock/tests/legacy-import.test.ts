import assert from "node:assert/strict";
import test from "node:test";
import { importLegacyBrowserData } from "../src/lib/bar-stock-persistence";
import { readLegacyImport } from "../src/lib/legacy-import";
import type { BarStockRepository } from "../src/lib/bar-stock-repository";
import type { RetryStorage } from "../src/lib/retry-cache";

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
    getAssignmentWorkpieceLink: async () => null,
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
  assert.equal(result.pending, 1);
  assert.ok(storage.getItem(`barstock_sparks_v2:${workspaceId}`));
  assert.equal(storage.getItem(`barstock_legacy_import_v3:${workspaceId}`), null);
});
