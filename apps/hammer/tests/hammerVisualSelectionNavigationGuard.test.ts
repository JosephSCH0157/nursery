import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function run() {
  const selectionSource = await readFile(
    new URL("../src/editor/useHammerWorkspaceShellSelection.ts", import.meta.url),
    "utf-8",
  );
  const shellSource = await readFile(
    new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url),
    "utf-8",
  );
  const sourceBaySource = await readFile(
    new URL("../src/editor/HammerWorkspaceShellSourceBay.tsx", import.meta.url),
    "utf-8",
  );
  const viewModelSource = await readFile(
    new URL("../src/editor/hammerWorkspaceShellViewModels.ts", import.meta.url),
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
