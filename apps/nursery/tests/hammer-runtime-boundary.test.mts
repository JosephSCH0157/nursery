import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(TEST_DIR, relativePath), "utf8");
}

test("live Hammer editor route mounts the production runtime entry", () => {
  const routeSource = readWorkspaceFile("../src/routes/HammerEditor.tsx");

  assert.match(routeSource, /@hammer\/app\/HammerEditorRuntime/);
  assert.doesNotMatch(routeSource, /TranscriptSeekMock/);
});

test("Hammer keeps dev surfaces behind a dev-only route gate", () => {
  const routeTableSource = readWorkspaceFile("../src/main.tsx");
  const shellSource = readWorkspaceFile("../src/routes/HammerStandalone.tsx");

  assert.match(routeTableSource, /import\.meta\.env\.DEV/);
  assert.match(routeTableSource, /path="dev\/editor"/);
  assert.match(shellSource, /import\.meta\.env\.DEV/);
});

test("Hammer standalone header no longer advertises fake production chrome", () => {
  const shellSource = readWorkspaceFile("../src/routes/HammerStandalone.tsx");

  assert.doesNotMatch(shellSource, /AI ready/);
  assert.doesNotMatch(shellSource, /Forge User/);
});

test("Hammer standalone owns workspace resolution instead of requiring an upstream reopen flow", () => {
  const shellSource = readWorkspaceFile("../src/routes/HammerStandalone.tsx");
  const librarySource = readWorkspaceFile("../src/routes/Hammer.tsx");

  assert.match(shellSource, /listMyWorkspaces/);
  assert.match(shellSource, /loadHammerWorkpieceManifestContext/);
  assert.doesNotMatch(librarySource, /reopen Hammer/i);
});
