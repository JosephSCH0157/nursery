import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(path.resolve(testDir, "../src/editor/HammerWorkspaceShell.tsx"), "utf8");
const controller = readFileSync(path.resolve(testDir, "../src/editor/useHammerWorkspaceShellRouting.ts"), "utf8");

assert.ok(shell.includes("useHammerWorkspaceShellRouting({"));
assert.ok(controller.includes("resolveHammerToolBayRoute"));
assert.ok(controller.includes("applyHammerToolBayRouteDecision"));
assert.ok(controller.includes('intent: "manual_navigation"'));
assert.ok(controller.includes('intent: "current_pass"'));
assert.ok(controller.includes('console.debug("[HammerModeRouting] selectPass"'));
assert.ok(controller.includes('console.debug("[HammerModeRouting] state"'));
assert.ok(!controller.includes('nextTool === "polish"'));
assert.ok(!controller.includes('nextTool === "images"'));

console.log("Hammer workspace shell routing controller tests passed.");
