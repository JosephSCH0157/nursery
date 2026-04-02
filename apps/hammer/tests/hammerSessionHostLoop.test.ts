import assert from "node:assert/strict";
import {
  resolveHammerReloadFailure,
  resolveHammerReloadSuccess,
  resolveHammerSaveFailure,
  resolveHammerSaveSuccess,
} from "../src/editor/hammerSessionHostLoop";

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    historyRecoveryStatus: "Snapshot fallback: payload unavailable. Opened with full history replay.",
    presenceConflictDetail: "Another editing session is active. Reload before continuing.",
  };
  const after = resolveHammerReloadFailure(before);
  assert.deepEqual(after, before);
}

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    historyRecoveryStatus: "Snapshot fallback: payload unavailable. Opened with full history replay.",
    presenceConflictDetail: "Another editing session is active. Reload before continuing.",
  };
  const after = resolveHammerReloadSuccess(before);
  assert.equal(after.hasPendingSaveChanges, false);
  assert.equal(after.saveFailureMessage, null);
  assert.equal(after.historyRecoveryStatus, null);
  assert.equal(after.presenceConflictDetail, null);
}

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    historyRecoveryStatus: null,
    presenceConflictDetail: null,
  };
  const after = resolveHammerSaveSuccess(before);
  assert.equal(after.hasPendingSaveChanges, false);
  assert.equal(after.saveFailureMessage, null);
}

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: null,
    historyRecoveryStatus: null,
    presenceConflictDetail: null,
  };
  const after = resolveHammerSaveFailure(before, "Failed to save Hammer persistence.");
  assert.equal(after.hasPendingSaveChanges, true);
  assert.equal(after.saveFailureMessage, "Failed to save Hammer persistence.");
}

console.log("Hammer session host loop tests passed.");
