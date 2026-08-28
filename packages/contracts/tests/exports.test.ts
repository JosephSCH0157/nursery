import assert from "node:assert/strict";
import test from "node:test";

test("contracts package exposes its existing runtime surfaces", async () => {
  const paths = await import("@forge/contracts/workpiece-paths");
  const readiness = await import("@forge/contracts/hammer/quench-readiness-taxonomy.contract");
  const releaseCommit = await import("@forge/contracts/hammer/release-commit.contract");
  assert.equal(typeof paths, "object");
  assert.deepEqual(readiness.HAMMER_QUENCH_CANONICAL_READINESS_STATUSES, ["ready", "needs_review", "blocked"]);
  assert.equal(releaseCommit.HAMMER_RELEASE_COMMIT_CONTRACT_VERSION, "forge.hammer-release-commit.v1");
});
