import assert from "node:assert/strict";
import { applyHammerSessionAction } from "../src/editor/hammerSessionActions";
import { deriveHammerSessionState } from "../src/editor/hammerSessionState";
import { createHammerPrepState } from "../src/prep/hammerPrep";

{
  const before = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: true,
      failedMessage: null,
      lastSavedAt: "2026-04-02T16:20:00.000Z",
    },
    recoveryState: {
      recoveryAvailable: true,
      detail: "Snapshot fallback: payload unavailable. Opened with full history replay.",
    },
    mediaPrepOutputs: null,
    editorVisible: true,
  });
  assert.equal(before.status, "recovery_available");

  const action = applyHammerSessionAction({
    hasPendingSaveChanges: true,
    saveFailureMessage: null,
    reloadRequestNonce: 0,
    saveRetryNonce: 0,
  }, "reload_latest");
  assert.equal(action.reloadRequestNonce, 1);

  const afterSuccessfulReload = deriveHammerSessionState({
    prepState: createHammerPrepState("prepared", "ready_for_next_step"),
    saveState: {
      isSaving: false,
      hasPendingChanges: false,
      failedMessage: null,
      lastSavedAt: "2026-04-02T16:24:00.000Z",
    },
    recoveryState: null,
    mediaPrepOutputs: null,
    editorVisible: true,
  });
  assert.equal(afterSuccessfulReload.status, "saved");
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
      recoveryAvailable: true,
      detail: "Snapshot fallback: payload unavailable. Opened with full history replay.",
    },
    mediaPrepOutputs: null,
    editorVisible: true,
  });
  assert.equal(afterFailedReload.status, "recovery_available");
  assert.notEqual(afterFailedReload.humanLabel, "Saved");
}

console.log("Hammer persistence recovery tests passed.");
