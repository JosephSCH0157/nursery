import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileTranscriptReuseVisualPlacements,
  shouldEnsureVisualPlacementsOnTranscriptReuse,
} from "../src/editor/hammerPrepReusePolicy";
import type { HammerPersistenceSnapshot } from "../src/persistence/hammerPersistenceContract";

test("the transcript-reuse path with a canonical timeline performs zero compatibility placement work or writes", async () => {
  let ensureCalls = 0;
  let artifactWrites = 0;
  const snapshot = { visual_timeline: { data: { version: 2 } } } as unknown as HammerPersistenceSnapshot;
  const result = await reconcileTranscriptReuseVisualPlacements({
    snapshot,
    ensure: async () => {
      ensureCalls += 1;
      artifactWrites += 1;
      return snapshot;
    },
  });
  assert.equal(result, snapshot);
  assert.equal(ensureCalls, 0);
  assert.equal(artifactWrites, 0);
});

test("placement derivation remains available only when canonical timeline authority is absent", () => {
  assert.equal(shouldEnsureVisualPlacementsOnTranscriptReuse(null), true);
  assert.equal(shouldEnsureVisualPlacementsOnTranscriptReuse({ visual_timeline: { data: null } } as unknown as HammerPersistenceSnapshot), true);
});
