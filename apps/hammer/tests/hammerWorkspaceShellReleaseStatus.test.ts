import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("release comparison and readiness remain in coordinated slot-preserving authority hooks", () => {
  const owner = readFileSync(new URL("../src/editor/hammerWorkspaceShellReleaseStatus.ts", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf8");
  for (const decision of [
    "compareHammerPreparedReleasePackageToCurrent", "resolvePodcastMasterUiStatus",
    "evaluateHammerReadinessGate", "deriveHammerReleaseHandoffPosture",
  ] as const) {
    assert.match(owner, new RegExp(`${decision}\\s*\\(`));
    assert.doesNotMatch(shell, new RegExp(`${decision}\\s*\\(`));
  }
  const comparisonSlot = shell.indexOf("useHammerWorkspaceShellReleaseComparison({");
  const boundObjectsSlot = shell.indexOf("useHammerMediaMapBoundObjects({");
  const readinessSlot = shell.indexOf("useHammerWorkspaceShellReleaseReadiness({");
  assert.ok(comparisonSlot >= 0 && comparisonSlot < boundObjectsSlot && boundObjectsSlot < readinessSlot);
  assert.doesNotMatch(owner, /\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage|setEditable[A-Z]|createPortal)\b/);
});
