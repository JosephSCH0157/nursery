import assert from "node:assert/strict";
import test from "node:test";
import { appendRecoveryHistoryEntryOnce, executeHammerVisualRecovery, planHammerVisualRecovery, type HammerRecoveryArtifactSet } from "../src/recovery/hammerVisualRecoveryCoordinator";

const original = { visual_timeline: "ot", visual_placements: "op", history: "oh" };
const intended = { visual_timeline: "it", visual_placements: "ip", history: "ih" };

test("recovery coordinator covers sequential and ambiguous outcomes", () => {
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: original }), { action: "resume", write: ["visual_timeline", "visual_placements", "history"] });
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: { ...original, visual_timeline: "it" } }), { action: "resume", write: ["visual_placements", "history"] });
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: { ...intended, history: "oh" } }), { action: "resume", write: ["history"] });
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: intended }), { action: "complete", write: [] });
});

test("recovery coordinator safely compensates a committed prefix", () => {
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: { ...original, visual_timeline: "it" }, preferCompensation: true }), { action: "compensate", restore: ["visual_timeline"] });
});

test("foreign mutation requires abort", () => {
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: { ...original, visual_placements: "foreign" } }), { action: "abort", foreign: ["visual_placements"] });
});

test("repeated ambiguous completion creates no writes or duplicate history", () => {
  assert.deepEqual(planHammerVisualRecovery({ original, intended, observed: intended }), { action: "complete", write: [] });
  const entry = { entry_id: "recovery-1" };
  const once = appendRecoveryHistoryEntryOnce({ entries: [], entry });
  const twice = appendRecoveryHistoryEntryOnce({ entries: once, entry });
  assert.equal(twice, once);
  assert.equal(twice.length, 1);
});

function versions(prefix: "o" | "i"): HammerRecoveryArtifactSet<string> {
  return {
    visual_timeline: { hash: `${prefix}t`, updatedAt: `${prefix}t-at`, data: `${prefix}t-data` },
    visual_placements: { hash: `${prefix}p`, updatedAt: `${prefix}p-at`, data: `${prefix}p-data` },
    history: { hash: `${prefix}h`, updatedAt: `${prefix}h-at`, data: `${prefix}h-data` },
  };
}

test("persistence adapter sends original CAS values for the untouched suffix", async () => {
  const originalSet = versions("o");
  const intendedSet = versions("i");
  let server = { ...originalSet, visual_timeline: intendedSet.visual_timeline };
  const calls: Array<{ key: string; expectedPreviousUpdatedAt: string }> = [];
  const result = await executeHammerVisualRecovery({
    original: originalSet, intended: intendedSet,
    adapter: {
      readAll: async () => server,
      write: async (call) => {
        calls.push(call);
        const next = intendedSet[call.key];
        server = { ...server, [call.key]: next };
        return next;
      },
    },
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(calls, [
    { key: "visual_placements", expectedPreviousUpdatedAt: "op-at", data: "ip-data" },
    { key: "history", expectedPreviousUpdatedAt: "oh-at", data: "ih-data" },
  ]);
  assert.equal(result.writes, 2);
});

test("compensation compares against recovery-written versions", async () => {
  const originalSet = versions("o");
  const intendedSet = versions("i");
  let server = { ...originalSet, visual_timeline: intendedSet.visual_timeline };
  const calls: Array<{ key: string; expectedPreviousUpdatedAt: string }> = [];
  const result = await executeHammerVisualRecovery({
    original: originalSet, intended: intendedSet, preferCompensation: true,
    adapter: {
      readAll: async () => server,
      write: async (call) => {
        calls.push(call);
        const next = originalSet[call.key];
        server = { ...server, [call.key]: next };
        return next;
      },
    },
  });
  assert.equal(result.status, "compensated");
  assert.deepEqual(calls, [{ key: "visual_timeline", expectedPreviousUpdatedAt: "it-at", data: "ot-data" }]);
  assert.equal(result.compensations, 1);
});

test("CAS conflict stops the untouched suffix", async () => {
  const originalSet = versions("o");
  const intendedSet = versions("i");
  let calls = 0;
  const result = await executeHammerVisualRecovery({
    original: originalSet, intended: intendedSet,
    adapter: {
      readAll: async () => originalSet,
      write: async () => { calls += 1; throw new Error("cas_conflict"); },
    },
  });
  assert.equal(result.status, "conflict");
  assert.equal(calls, 1);
  assert.equal(result.writes, 1);
});

test("ambiguous committed write rereads before resuming and completed replay performs zero writes", async () => {
  const originalSet = versions("o");
  const intendedSet = versions("i");
  let server = originalSet;
  let calls = 0;
  let reads = 0;
  const adapter = {
    readAll: async () => { reads += 1; return server; },
    write: async (call: { key: "visual_timeline" | "visual_placements" | "history"; data: string; expectedPreviousUpdatedAt: string }) => {
      calls += 1;
      const next = intendedSet[call.key];
      server = { ...server, [call.key]: next };
      if (calls === 1) throw new Error("response_lost");
      return next;
    },
  };
  const first = await executeHammerVisualRecovery({ original: originalSet, intended: intendedSet, adapter });
  assert.equal(first.status, "complete");
  assert.equal(calls, 3);
  assert.ok(reads >= 3);
  const callsBeforeReplay = calls;
  const replay = await executeHammerVisualRecovery({ original: originalSet, intended: intendedSet, adapter });
  assert.equal(replay.status, "complete");
  assert.equal(calls, callsBeforeReplay);
  assert.equal(replay.writes, 0);
});
