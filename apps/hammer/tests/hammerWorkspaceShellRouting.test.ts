import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(path.resolve(testDir, "../src/editor/HammerWorkspaceShell.tsx"), "utf8");
const controller = readFileSync(path.resolve(testDir, "../src/editor/useHammerWorkspaceShellRouting.ts"), "utf8");

assert.ok(shell.includes("useHammerWorkspaceShellRouting({"));
assert.ok(controller.includes('nextTool === "polish"'));
assert.ok(controller.includes('preferredPass: "visual_finishing"'));
assert.ok(controller.includes('nextTool === "images"'));
assert.ok(controller.includes('preferredPass: "image_placement"'));
assert.ok(controller.includes('selectEditorMode("broll", { preferredPass: "image_animation"'));
assert.ok(controller.includes('console.debug("[HammerModeRouting] selectPass"'));
assert.ok(controller.includes('console.debug("[HammerModeRouting] state"'));
assert.ok(controller.indexOf("setCurrentPass(passId)") < controller.indexOf("setEditorMode(resolveEditorModeFromPass(passId))"));

console.log("Hammer workspace shell routing controller tests passed.");
