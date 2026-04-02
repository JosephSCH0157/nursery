import assert from "node:assert/strict";
import { applyHammerSessionAction } from "../src/editor/hammerSessionActions";
import { deriveHammerSessionState } from "../src/editor/hammerSessionState";
import { createHammerPrepState } from "../src/prep/hammerPrep";

function buildState(args: {
  failedMessage: string | null;
  hasPendingChanges: boolean;
  lastSavedAt?: string | null;
  isSaving?: boolean;
}) {
  return deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: args.isSaving ?? false,
      hasPendingChanges: args.hasPendingChanges,
      failedMessage: args.failedMessage,
      lastSavedAt: args.lastSavedAt ?? "2026-04-02T16:20:00.000Z",
    },
    recoveryState: null,
    mediaPrepOutputs: null,
    editorVisible: true,
  });
}

{
  const before = buildState({
    failedMessage: "Failed to save Hammer persistence.",
    hasPendingChanges: true,
  });
  assert.equal(before.status, "save_failed");

  const transition = applyHammerSessionAction({
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  }, "retry_save");

  const duringRetry = buildState({
    failedMessage: transition.saveFailureMessage,
    hasPendingChanges: transition.hasPendingSaveChanges,
  });
  assert.equal(duringRetry.status, "unsaved_changes");
  assert.notEqual(duringRetry.humanLabel, "Saved");

  const afterSuccess = buildState({
    failedMessage: null,
    hasPendingChanges: false,
  });
  assert.equal(afterSuccess.status, "saved");
}

{
  const transition = applyHammerSessionAction({
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  }, "retry_save");

  const afterFailure = buildState({
    failedMessage: "Failed to save Hammer persistence.",
    hasPendingChanges: transition.hasPendingSaveChanges,
  });
  assert.equal(afterFailure.status, "save_failed");
  assert.notEqual(afterFailure.humanLabel, "Saved");
}

console.log("Hammer save failure tests passed.");
