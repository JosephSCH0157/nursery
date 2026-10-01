import assert from "node:assert/strict";
import test from "node:test";
import {
  HammerShortsOperationIdentity,
  hammerShortsLogicalRequestRetryKey,
  type HammerShortsLogicalRequestIdentityInput,
} from "../src/editor/hammerShortsOperationIdentity";

const request: HammerShortsLogicalRequestIdentityInput = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  parent_workpiece_id: "22222222-2222-4222-8222-222222222222",
  basis_lock_id: "33333333-3333-4333-8333-333333333333",
  basis_fingerprint: "a".repeat(64),
  goal: "standalone",
  duration_preset: "about_30s",
  minimum_duration_sec: 20,
  maximum_duration_sec: 40,
  target_candidate_count: 4,
  output_segments: [{
    segment_id: "segment-1", text: "First moment", output_start_sec: 0, output_end_sec: 10,
    source_start_sec: 3, source_end_sec: 13,
  }],
};

function identity(): HammerShortsOperationIdentity {
  let sequence = 0;
  return new HammerShortsOperationIdentity(() => `hammer-shorts-discovery:test-${++sequence}`);
}

test("equivalent concurrent submissions share one operation and one execution", async () => {
  const controller = identity();
  const key = hammerShortsLogicalRequestRetryKey(request);
  let executions = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const execute = async (operationId: string) => {
    executions += 1;
    await blocked;
    return operationId;
  };
  const first = controller.run(key, execute);
  const second = controller.run(key, execute);
  assert.equal(first, second);
  release();
  assert.equal(await first, "hammer-shorts-discovery:test-1");
  assert.equal(executions, 1);
});
test("failed or interrupted equivalent retry retains its logical operation", async () => {
  const controller = identity();
  const key = hammerShortsLogicalRequestRetryKey(request);
  const observed: string[] = [];
  await assert.rejects(controller.run(key, async (operationId) => {
    observed.push(operationId);
    throw new Error("response_interrupted");
  }), /response_interrupted/);
  const recovered = await controller.run(key, async (operationId) => {
    observed.push(operationId);
    return operationId;
  });
  assert.deepEqual(observed, ["hammer-shorts-discovery:test-1", "hammer-shorts-discovery:test-1"]);
  assert.equal(recovered, "hammer-shorts-discovery:test-1");
});

test("changed cost-affecting input cannot reuse a pending operation", async () => {
  const controller = identity();
  const firstKey = hammerShortsLogicalRequestRetryKey(request);
  await assert.rejects(controller.run(firstKey, async () => { throw new Error("response_interrupted"); }));
  const changedKey = hammerShortsLogicalRequestRetryKey({ ...request, target_candidate_count: 3 });
  assert.notEqual(firstKey, changedKey);
  assert.equal(
    await controller.run(changedKey, async (operationId) => operationId),
    "hammer-shorts-discovery:test-2",
  );
});

test("successful completion retires retry identity so another click is an intentional run", async () => {
  const controller = identity();
  const key = hammerShortsLogicalRequestRetryKey(request);
  const first = await controller.run(key, async (operationId) => operationId);
  const second = await controller.run(key, async (operationId) => operationId);
  assert.equal(first, "hammer-shorts-discovery:test-1");
  assert.equal(second, "hammer-shorts-discovery:test-2");
});
