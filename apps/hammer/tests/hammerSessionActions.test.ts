import assert from "node:assert/strict";
import { deriveHammerSessionState } from "../src/editor/hammerSessionState";
import { applyHammerSessionAction } from "../src/editor/hammerSessionActions";
import { createHammerPrepState } from "../src/prep/hammerPrep";

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  };
  const after = applyHammerSessionAction(before, "retry_save");
  assert.equal(after.saveFailureMessage, null);
  assert.equal(after.saveRetryNonce, 1);
  assert.equal(after.reloadRequestNonce, 0);

  const state = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: after.hasPendingSaveChanges,
      failedMessage: after.saveFailureMessage,
      lastSavedAt: "2026-04-02T16:20:00.000Z",
    },
    recoveryState: null,
    mediaPrepOutputs: null,
    editorVisible: true,
  });
  assert.equal(state.status, "unsaved_changes");
  assert.notEqual(state.humanLabel, "Saved");
}

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: "Failed to save Hammer persistence.",
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  };
  const after = applyHammerSessionAction(before, "reload_latest");
  assert.equal(after.reloadRequestNonce, 1);
  assert.equal(after.saveRetryNonce, 0);
  assert.equal(after.saveFailureMessage, before.saveFailureMessage);

  const state = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: after.hasPendingSaveChanges,
      failedMessage: after.saveFailureMessage,
      lastSavedAt: "2026-04-02T16:20:00.000Z",
    },
    recoveryState: {
      reloadRequired: true,
      conflictDetected: true,
      detail: "Another editing session is active. Reload before continuing.",
    },
    mediaPrepOutputs: null,
    editorVisible: true,
  });
  assert.equal(state.status, "reload_required");
  assert.notEqual(state.humanLabel, "Saved");
}

{
  const before = {
    hasPendingSaveChanges: true,
    saveFailureMessage: null,
    reloadRequestNonce: 0,
    saveRetryNonce: 1,
  };
  const after = applyHammerSessionAction(before, "retry_save");
  assert.equal(after.saveRetryNonce, 2);
  assert.equal(after.hasPendingSaveChanges, true);
}

console.log("Hammer session action tests passed.");
