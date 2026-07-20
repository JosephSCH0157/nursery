import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseBarStockRepository } from "../src/lib/bar-stock-repository";
import { makeAssignment } from "../src/lib/assignments";
import { makeSpark } from "../src/lib/model";

function rpcClient(response: { data: unknown; error: unknown }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      schema() {
        return {
          rpc: async (name: string, args: Record<string, unknown>) => {
            calls.push({ name, args });
            return response;
          },
        };
      },
    } as any,
  };
}

test("repository create uses only the validated assignment RPC and preserves acknowledgement", async () => {
  const assignment = makeAssignment("Canonical", { id: crypto.randomUUID() });
  const mock = rpcClient({
    data: { outcome: "saved", row: { id: assignment.id, title: assignment.name, revision: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } },
    error: null,
  });
  const repository = createSupabaseBarStockRepository(mock.client);
  const result = await repository.createAssignment({ workspaceId: crypto.randomUUID(), userId: crypto.randomUUID() }, assignment, "import-key");
  assert.equal(result.outcome, "saved");
  assert.equal(result.row?.revision, 1);
  assert.equal(mock.calls[0]?.name, "barstock_apply_assignment");
  assert.equal(mock.calls[0]?.args.p_expected_revision, null);
  assert.equal(mock.calls[0]?.args.p_import_key, "import-key");
});

test("repository compare-and-swap forwards the canonical server revision", async () => {
  const spark = makeSpark("Intent", null, { revision: 7 });
  const mock = rpcClient({ data: { outcome: "stale", row: { ...spark, assignment_id: null, revision: 8, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" } }, error: null });
  const repository = createSupabaseBarStockRepository(mock.client);
  const result = await repository.updateSpark({ workspaceId: crypto.randomUUID(), userId: crypto.randomUUID() }, spark, 7);
  assert.equal(result.outcome, "stale");
  assert.equal(result.row?.revision, 8);
  assert.equal(mock.calls[0]?.name, "barstock_apply_spark");
  assert.equal(mock.calls[0]?.args.p_expected_revision, 7);
});

test("repository fails closed on unavailable or malformed migration contracts", async () => {
  const assignment = makeAssignment("No contract");
  const missing = rpcClient({ data: null, error: { code: "PGRST202", message: "function not found" } });
  const unavailable = await createSupabaseBarStockRepository(missing.client).createAssignment(
    { workspaceId: crypto.randomUUID(), userId: crypto.randomUUID() }, assignment, "key",
  );
  assert.equal(unavailable.outcome, "unavailable");

  const malformed = rpcClient({ data: true, error: null });
  const failed = await createSupabaseBarStockRepository(malformed.client).createSpark(
    { workspaceId: crypto.randomUUID(), userId: crypto.randomUUID() }, makeSpark("x", null), "key",
  );
  assert.equal(failed.outcome, "failed");
});
