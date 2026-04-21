import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function run() {
  const selectionSource = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/useHammerWorkspaceShellSelection.ts",
    "utf-8",
  );
  const shellSource = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );
  const sourceBaySource = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShellSourceBay.tsx",
    "utf-8",
  );
  const viewModelSource = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/hammerWorkspaceShellViewModels.ts",
    "utf-8",
  );

  assert.ok(
    selectionSource.includes("allowSurfaceSwitch?: boolean;")
      && selectionSource.includes("if (nextArgs.revealUI && nextArgs.allowSurfaceSwitch && placement)"),
    "Expected explicit allowSurfaceSwitch guard before revealVisualSelectionUI to keep passive sync non-navigating.",
  );

  assert.ok(
    shellSource.includes("allowSurfaceSwitch: true"),
    "Expected explicit timeline visual clip selections in HammerWorkspaceShell to opt into surface switches.",
  );
  assert.ok(
    sourceBaySource.includes("allowSurfaceSwitch: true"),
    "Expected explicit Source Bay visual clip actions to opt into surface switches.",
  );
  assert.ok(
    viewModelSource.includes("allowSurfaceSwitch: true"),
    "Expected explicit preview/timeline visual clip actions in view models to opt into surface switches.",
  );

  // eslint-disable-next-line no-console
  console.log("Hammer visual selection navigation guard tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer visual selection navigation guard tests failed:", error);
  process.exit(1);
});
