import assert from "node:assert/strict";
import { applyHammerSessionAction } from "../src/editor/hammerSessionActions";
import { deriveHammerSessionState } from "../src/editor/hammerSessionState";
import { createHammerPrepState } from "../src/prep/hammerPrep";

{
  const before = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: true,
      hasPendingChanges: true,
      failedMessage: null,
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
  assert.equal(before.status, "reload_required");
  assert.notEqual(before.humanLabel, "Saving");

  const action = applyHammerSessionAction({
    hasPendingSaveChanges: true,
    saveFailureMessage: null,
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  }, "reload_latest");
  assert.equal(action.reloadRequestNonce, 1);

  const afterResolvedReload = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: false,
      failedMessage: null,
      lastSavedAt: "2026-04-02T16:25:00.000Z",
    },
    recoveryState: {
      reloadRequired: false,
      conflictDetected: false,
      detail: null,
    },
    mediaPrepOutputs: null,
    editorVisible: true,
  });
  assert.equal(afterResolvedReload.status, "saved");
}

{
  const action = applyHammerSessionAction({
    hasPendingSaveChanges: true,
    saveFailureMessage: null,
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  }, "reload_latest");
  assert.equal(action.reloadRequestNonce, 1);

  const afterFailedReload = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: true,
      failedMessage: null,
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
  assert.equal(afterFailedReload.status, "reload_required");
}

console.log("Hammer conflict recovery tests passed.");
