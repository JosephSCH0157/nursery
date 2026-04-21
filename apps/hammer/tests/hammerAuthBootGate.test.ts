import assert from "node:assert/strict";
import {
  resolveHammerAuthBootGateViewModel,
  shouldRunHammerTongsBootEffects,
} from "../src/editor/hammerAuthBootGate";

{
  assert.equal(
    shouldRunHammerTongsBootEffects({
      persistenceMode: "disabled",
      authState: "missing",
    }),
    true,
  );
  assert.deepEqual(
    resolveHammerAuthBootGateViewModel({
      persistenceMode: "disabled",
      authState: "missing",
    }),
    { kind: "none", message: null },
  );
}

{
  assert.equal(
    shouldRunHammerTongsBootEffects({
      persistenceMode: "canonical",
      authState: "resolving",
    }),
    false,
  );
  assert.deepEqual(
    resolveHammerAuthBootGateViewModel({
      persistenceMode: "canonical",
      authState: "resolving",
    }),
    { kind: "holding", message: "Waiting for authentication…" },
  );
}

{
  assert.equal(
    shouldRunHammerTongsBootEffects({
      persistenceMode: "canonical",
      authState: "missing",
    }),
    false,
  );
  assert.deepEqual(
    resolveHammerAuthBootGateViewModel({
      persistenceMode: "canonical",
      authState: "missing",
    }),
    { kind: "blocked", message: "Sign in required to load Hammer workspace data." },
  );
}

{
  assert.equal(
    shouldRunHammerTongsBootEffects({
      persistenceMode: "canonical",
      authState: "ready",
    }),
    true,
  );
  assert.deepEqual(
    resolveHammerAuthBootGateViewModel({
      persistenceMode: "canonical",
      authState: "ready",
    }),
    { kind: "none", message: null },
  );
}

// eslint-disable-next-line no-console
console.log("Hammer auth boot gate tests passed.");
