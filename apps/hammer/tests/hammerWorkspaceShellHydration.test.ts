import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(path.resolve(testDir, "../src/editor/HammerWorkspaceShell.tsx"), "utf8");
const controller = readFileSync(path.resolve(testDir, "../src/editor/useHammerWorkspaceShellHydration.ts"), "utf8");

assert.ok(
  shell.includes("useHammerWorkspaceShellHydration({"),
  "workspace shell must register the hydration controller",
);
assert.ok(
  shell.indexOf("onHistoryRecoveryStatusChangeRef.current?.(historyStatus)")
    < shell.indexOf("useHammerWorkspaceShellHydration({"),
  "hydration effects must remain registered after history-status synchronization",
);
assert.ok(
  shell.indexOf("useHammerWorkspaceShellHydration({")
    < shell.indexOf("useHammerWorkspaceShellRouting({"),
  "hydration effects must remain registered before pass normalization",
);
assert.ok(
  controller.includes("const hydrationKey = `${workspaceId}:${workpieceId}`"),
  "initial editor hydration must remain guarded by workspace/workpiece identity",
);
assert.ok(
  controller.includes("hydratedVisualPreviewSettingsRef.current === workpieceId"),
  "visual preview hydration must remain one-shot per workpiece",
);
assert.ok(
  controller.includes("audioPolishHasLocalEditsRef.current ? current : null"),
  "incoming audio hydration must preserve local edits",
);
assert.ok(
  controller.includes("applyLinkedSelectionStateRef.current?.({"),
  "initial linked selection must use the stable deferred controller callback",
);

console.log("Hammer workspace hydration controller tests passed.");
