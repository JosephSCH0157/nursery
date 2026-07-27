import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthMobileNavigationViewModel } from "../src/routes/hearth-shell/buildHearthMobileNavigationViewModel";
import type { HearthMobileNavigationViewModelInput } from "../src/routes/hearth-shell/hearth-mobile-navigation-contracts";

function input(): HearthMobileNavigationViewModelInput {
  const noop = () => {};
  return {
    isMobile: true,
    mobileOverlayView: "editor",
    activeDraftTitle: "Episode One",
    closeMobileOverlay: noop,
    openReadyInMobileOverlay: noop,
    isActiveWorkpieceArchived: false,
    hasActiveWorkpiece: true,
    activeWorkpieceId: "workpiece-1",
    restoringWorkpieceIds: [],
    onRestoreWorkpiece: noop,
    hasActiveDraft: true,
    isSaving: false,
    onDeleteDraftBuffer: noop,
    onSaveDraft: noop,
    refreshReadyScripts: noop,
    isReadyScriptsLoading: false,
    renderFocusContent: () => "Editor content",
    renderReadyContent: () => "Ready content",
  };
}

test("mobile editor preserves identity projection and supplied navigation commands", () => {
  const source = input();
  const model = buildHearthMobileNavigationViewModel(source);

  assert.equal(model.activeDraftTitle, "Episode One");
  assert.equal(model.mobileOverlayView, "editor");
  assert.equal(model.closeMobileOverlay, source.closeMobileOverlay);
  assert.equal(model.openReadyInMobileOverlay, source.openReadyInMobileOverlay);
});

test("empty titles remain supplied for the existing renderer fallback", () => {
  const editor = buildHearthMobileNavigationViewModel({
    ...input(),
    activeDraftTitle: "   ",
  });
  assert.equal(editor.activeDraftTitle, "   ");

  const ready = buildHearthMobileNavigationViewModel({
    ...input(),
    mobileOverlayView: "ready",
  });
  assert.equal(ready.mobileOverlayView, "ready");
});

test("restore progress formatting is pure, explicit, and fail closed", () => {
  const restoring = buildHearthMobileNavigationViewModel({
    ...input(),
    isActiveWorkpieceArchived: true,
    restoringWorkpieceIds: ["workpiece-1"],
  });
  assert.equal(restoring.restoreButtonLabel, "Restoring...");
  assert.equal(restoring.restoreButtonDisabled, true);
  assert.equal(Object.isFrozen(restoring), true);

  const absent = buildHearthMobileNavigationViewModel({
    ...input(),
    isActiveWorkpieceArchived: true,
    hasActiveWorkpiece: false,
    activeWorkpieceId: null,
  });
  assert.equal(absent.restoreButtonLabel, "Restore Workpiece");
  assert.equal(absent.restoreButtonDisabled, true);
  assert.equal("complete" in absent, false);
  assert.equal("releaseReady" in absent, false);
});

test("desktop visibility passes through and commands are never reconstructed", () => {
  const source = input();
  const hidden = buildHearthMobileNavigationViewModel({
    ...source,
    isMobile: false,
  });
  assert.equal(hidden.isMobile, false);
  assert.equal(hidden.onSaveDraft, source.onSaveDraft);
  assert.equal(hidden.refreshReadyScripts, source.refreshReadyScripts);
});

test("enabled presentation actions invoke each supplied command exactly once", () => {
  let opens = 0;
  let closes = 0;
  const model = buildHearthMobileNavigationViewModel({
    ...input(),
    openReadyInMobileOverlay: () => { opens += 1; },
    closeMobileOverlay: () => { closes += 1; },
  });

  model.openReadyInMobileOverlay();
  model.closeMobileOverlay();
  assert.equal(opens, 1);
  assert.equal(closes, 1);
});
