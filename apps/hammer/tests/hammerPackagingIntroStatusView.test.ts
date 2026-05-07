import assert from "node:assert/strict";
import { derivePackagingIntroStatusView } from "../src/editor/HammerWorkspaceShellToolBay";

async function testNoSelectedIntroDisablesApplyAndExplainsSourceDesk() {
  const view = derivePackagingIntroStatusView({
    selectedIntroAssetId: null,
    selectedIntroPath: null,
    introPlaced: false,
  });

  assert.equal(view.selectionStatusLine, "No intro selected in Source Desk.");
  assert.equal(view.canApply, false);
  assert.equal(view.canRemove, false);
  assert.equal(view.applyActionLabel, "Apply Selected Intro to Timeline");
  assert.equal(view.removeActionLabel, "Remove Intro from Timeline");
}

async function testSelectedIntroNotPlacedEnablesApply() {
  const view = derivePackagingIntroStatusView({
    selectedIntroAssetId: "asset:intro",
    selectedIntroPath: "assets/uploads/introoutro/123-intro.mp4",
    introPlaced: false,
  });

  assert.equal(
    view.selectionStatusLine,
    "Selected intro from Source Desk: assets/uploads/introoutro/123-intro.mp4",
  );
  assert.equal(view.placementStatusLine, "Timeline packaging intro: not placed.");
  assert.equal(view.canApply, true);
  assert.equal(view.canRemove, false);
}

async function testPlacedIntroEnablesRemove() {
  const view = derivePackagingIntroStatusView({
    selectedIntroAssetId: "asset:intro",
    selectedIntroPath: "assets/uploads/introoutro/123-intro.mp4",
    introPlaced: true,
  });

  assert.equal(view.placementStatusLine, "Timeline packaging intro: placed.");
  assert.equal(view.canApply, true);
  assert.equal(view.canRemove, true);
}

async function testUnresolvedSelectionStaysReadOnlyAndBlocksApply() {
  const view = derivePackagingIntroStatusView({
    selectedIntroAssetId: "asset:missing",
    selectedIntroPath: null,
    introPlaced: false,
  });

  assert.equal(
    view.selectionStatusLine,
    "Selected intro from Source Desk is unresolved (asset:missing).",
  );
  assert.equal(view.canApply, false);
  assert.equal(view.canRemove, false);
}

async function run() {
  await testNoSelectedIntroDisablesApplyAndExplainsSourceDesk();
  await testSelectedIntroNotPlacedEnablesApply();
  await testPlacedIntroEnablesRemove();
  await testUnresolvedSelectionStaysReadOnlyAndBlocksApply();
  // eslint-disable-next-line no-console
  console.log("Hammer packaging intro status view tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer packaging intro status view tests failed:", error);
  process.exit(1);
});

