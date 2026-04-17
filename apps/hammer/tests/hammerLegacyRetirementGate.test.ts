import assert from "node:assert/strict";
import {
  DEFAULT_HAMMER_LEGACY_RETIREMENT_GATE_CRITERIA,
  evaluateHammerLegacyRetirementGate,
} from "../src/persistence/hammerLegacyRetirementGate";

function testGateBlocksUntilStabilityWindowIsLargeEnough() {
  const result = evaluateHammerLegacyRetirementGate({
    telemetry: {
      reopen_attempts: DEFAULT_HAMMER_LEGACY_RETIREMENT_GATE_CRITERIA.min_reopen_attempts - 1,
      reopen_hydration_failures: 0,
      editorial_authority_missing_after_reopen: 0,
      reason_loss_events: 0,
      hammer_quench_parity_mismatches: 0,
      legacy_projection_activations: 0,
    },
  });
  assert.equal(result.ready, false);
  assert.equal(result.blockers.includes("insufficient_stability_window"), true);
}

function testGateBlocksWhenAnyCriticalSignalRegresses() {
  const result = evaluateHammerLegacyRetirementGate({
    telemetry: {
      reopen_attempts: DEFAULT_HAMMER_LEGACY_RETIREMENT_GATE_CRITERIA.min_reopen_attempts + 25,
      reopen_hydration_failures: 1,
      editorial_authority_missing_after_reopen: 1,
      reason_loss_events: 1,
      hammer_quench_parity_mismatches: 2,
      legacy_projection_activations: 3,
    },
  });
  assert.equal(result.ready, false);
  assert.equal(result.blockers.includes("reopen_hydration_failures_exceeded"), true);
  assert.equal(result.blockers.includes("editorial_authority_missing_after_reopen"), true);
  assert.equal(result.blockers.includes("reason_loss_detected"), true);
  assert.equal(result.blockers.includes("hammer_quench_parity_mismatch_detected"), true);
  assert.equal(result.blockers.includes("legacy_projection_activity_detected"), true);
}

function testGatePassesAtOrBeyondDefaultCriteria() {
  const result = evaluateHammerLegacyRetirementGate({
    telemetry: {
      reopen_attempts: DEFAULT_HAMMER_LEGACY_RETIREMENT_GATE_CRITERIA.min_reopen_attempts,
      reopen_hydration_failures: 0,
      editorial_authority_missing_after_reopen: 0,
      reason_loss_events: 0,
      hammer_quench_parity_mismatches: 0,
      legacy_projection_activations: 0,
    },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
}

function run() {
  testGateBlocksUntilStabilityWindowIsLargeEnough();
  testGateBlocksWhenAnyCriticalSignalRegresses();
  testGatePassesAtOrBeyondDefaultCriteria();
  // eslint-disable-next-line no-console
  console.log("Hammer legacy retirement gate tests passed.");
}

run();
