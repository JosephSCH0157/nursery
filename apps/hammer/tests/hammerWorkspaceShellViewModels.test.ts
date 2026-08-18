import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("view-model composition invokes exactly the five bounded builders in established order", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const composer = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellViewModels.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  const builders = ["buildTimelineDockVM", "buildSourceBayVM", "buildPreviewBayVM", "buildToolbarVM", "buildToolBayVM"];
  const invocationPositions = builders.map((builder) => composer.indexOf(`=> ${builder}(input)`));
  assert.equal(invocationPositions.every((position) => position >= 0), true);
  assert.deepEqual([...invocationPositions].sort((left, right) => left - right), invocationPositions);
  assert.equal(builders.every((builder) => !shell.includes(`${builder}(`)), true);
  assert.equal((shell.match(/createHammerWorkspaceShellViewModelComposition\(\)/g) ?? []).length, 1);
  for (const method of ["timelineDock", "sourceBay", "previewBay", "toolbar", "toolBay"] as const) {
    assert.equal(shell.includes(`workspaceViewModelComposition.${method}({`), true);
  }
  for (const legacy of ["composeHammerTimelineDockViewModel", "composeHammerSourceBayViewModel", "composeHammerPreviewBayViewModel", "composeHammerToolbarViewModel", "composeHammerToolBayViewModel"] as const) {
    assert.equal(shell.includes(legacy), false);
  }
  assert.match(composer, /HammerWorkspaceShellComposedViewModels/);
});

test("view-model composition owns no authority, effects, persistence, mutation, or JSX", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const composer = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellViewModels.ts"), "utf8");
  assert.match(composer, /View-model composition receives explicit readonly state and stable commands/);
  assert.doesNotMatch(composer, /useState|useReducer|useEffect|useLayoutEffect|useRef|setTimeout|fetch\(|createPortal|return\s*\(/);
  assert.doesNotMatch(composer, /Persistence|Artifact|Snapshot|HistoryController|AutomaticPlacementCommand|SourceDeskController/);
});
