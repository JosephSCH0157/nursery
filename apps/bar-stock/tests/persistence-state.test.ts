import assert from "node:assert/strict";
import test from "node:test";
import { assignmentOperation, executeOperation, reconcileWorkspacePersistence } from "../src/lib/bar-stock-persistence";
import { makeAssignment } from "../src/lib/assignments";
import { loadRetryCache, type RetryStorage } from "../src/lib/retry-cache";
import type { BarStockRepository } from "../src/lib/bar-stock-repository";

class MemoryStorage implements RetryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function repository(result: any): BarStockRepository {
  return {
    hydrateWorkspace: async () => ({ assignments: [], sparks: [], links: {} }),
    list: async () => ({ assignments: [], sparks: [], links: {} }),
    createAssignment: async () => result,
    updateAssignment: async () => result,
    archiveAssignment: async () => result,
    deleteAssignment: async () => result,
    createSpark: async () => result,
    updateSpark: async () => result,
    archiveSpark: async () => result,
    hasAssignmentEpisodeLinks: async () => false,
  };
}

const scope = { workspaceId: crypto.randomUUID(), userId: crypto.randomUUID() };

test("only saved and duplicate acknowledgements remove retry intent", async () => {
  for (const outcome of ["saved", "duplicate"] as const) {
    const storage = new MemoryStorage();
    const assignment = makeAssignment("Intent");
    const operation = assignmentOperation({ workspaceId: scope.workspaceId, action: "create", assignment });
    const execution = await executeOperation({ repository: repository({ outcome, row: { ...assignment, revision: 1 } }), storage, scope, operation, online: true });
    assert.equal(execution.acknowledged, true);
    assert.equal(loadRetryCache(storage, scope.workspaceId).length, 0);
  }
});

test("denied, conflict, unavailable, and ambiguous failures retain actionable intent", async () => {
  for (const result of [
    { outcome: "denied", row: null },
    { outcome: "conflict", row: null },
    { outcome: "unavailable", row: null, error: "offline" },
    { outcome: "failed", row: null, error: "ambiguous" },
  ]) {
    const storage = new MemoryStorage();
    const operation = assignmentOperation({ workspaceId: scope.workspaceId, action: "create", assignment: makeAssignment("Intent") });
    const execution = await executeOperation({ repository: repository(result), storage, scope, operation, online: true });
    assert.equal(execution.acknowledged, false);
    assert.equal(loadRetryCache(storage, scope.workspaceId).length, 1);
  }
});

test("newer canonical state prevents retry and preserves local intent", async () => {
  const storage = new MemoryStorage();
  const intent = makeAssignment("Local", { revision: 2 });
  const operation = assignmentOperation({ workspaceId: scope.workspaceId, action: "update", assignment: intent });
  let calls = 0;
  const repo = repository({ outcome: "saved", row: null });
  repo.updateAssignment = async () => { calls++; return { outcome: "saved", row: null }; };
  const canonical = { ...intent, name: "Cloud", revision: 3 };
  const execution = await executeOperation({
    repository: repo, storage, scope, operation, online: true,
    snapshot: { assignments: [canonical], sparks: [], links: {} },
  });
  assert.equal(calls, 0);
  assert.equal(execution.state.status, "stale");
  if (execution.state.status === "stale") {
    assert.equal(execution.state.localIntent.name, "Local");
    assert.equal(execution.state.canonical.name, "Cloud");
  }
  assert.equal(loadRetryCache(storage, scope.workspaceId).length, 1);
});

test("offline operation remains pending in the non-canonical retry cache", async () => {
  const storage = new MemoryStorage();
  const operation = assignmentOperation({ workspaceId: scope.workspaceId, action: "create", assignment: makeAssignment("Offline") });
  const execution = await executeOperation({ repository: repository({ outcome: "saved", row: null }), storage, scope, operation, online: false });
  assert.equal(execution.state.status, "offline");
  assert.equal(loadRetryCache(storage, scope.workspaceId).length, 1);
});

test("workspace reconciliation attempts an unresolved operation once without refresh looping", async () => {
  const storage = new MemoryStorage();
  const assignment = makeAssignment("Denied intent");
  const operation = assignmentOperation({ workspaceId: scope.workspaceId, action: "create", assignment });
  await executeOperation({ repository: repository({ outcome: "saved", row: null }), storage, scope, operation, online: false });

  let mutationCalls = 0;
  let hydrationCalls = 0;
  const repo = repository({ outcome: "denied", row: null });
  repo.createAssignment = async () => {
    mutationCalls++;
    return { outcome: "denied", row: null };
  };
  repo.hydrateWorkspace = async () => {
    hydrationCalls++;
    return { assignments: [], sparks: [], links: {} };
  };

  const result = await reconcileWorkspacePersistence({ repository: repo, storage, scope, online: true });

  assert.equal(mutationCalls, 1);
  assert.equal(hydrationCalls, 1);
  assert.equal(result.executions.length, 1);
  assert.equal(result.executions[0]?.state.status, "denied");
  assert.equal(result.remainingRetryCount, 1);
});

test("workspace reconciliation rehydrates once after acknowledging pending intent", async () => {
  const storage = new MemoryStorage();
  const assignment = makeAssignment("Saved intent");
  const operation = assignmentOperation({ workspaceId: scope.workspaceId, action: "create", assignment });
  await executeOperation({ repository: repository({ outcome: "saved", row: null }), storage, scope, operation, online: false });

  let saved = false;
  let hydrationCalls = 0;
  const repo = repository({ outcome: "saved", row: null });
  repo.createAssignment = async () => {
    saved = true;
    return { outcome: "saved", row: { ...assignment, revision: 1 } };
  };
  repo.hydrateWorkspace = async () => {
    hydrationCalls++;
    return { assignments: saved ? [{ ...assignment, revision: 1 }] : [], sparks: [], links: {} };
  };

  const result = await reconcileWorkspacePersistence({ repository: repo, storage, scope, online: true });

  assert.equal(hydrationCalls, 2);
  assert.equal(result.executions[0]?.acknowledged, true);
  assert.equal(result.snapshot.assignments.length, 1);
  assert.equal(result.remainingRetryCount, 0);
});
