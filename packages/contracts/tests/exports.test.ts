import assert from "node:assert/strict";
import test from "node:test";

test("contracts package exposes its existing runtime surfaces", async () => {
  const paths = await import("@forge/contracts/workpiece-paths");
  const readiness = await import("@forge/contracts/hammer/quench-readiness-taxonomy.contract");
  assert.equal(typeof paths, "object");
  assert.deepEqual(readiness.HAMMER_QUENCH_CANONICAL_READINESS_STATUSES, ["ready", "needs_review", "blocked"]);
});
