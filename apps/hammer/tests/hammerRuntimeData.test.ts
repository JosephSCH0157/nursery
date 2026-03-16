import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyHammerRuntimeProject,
  extractHammerWorkpieceManifestContext,
  readHammerStoredActiveWorkspaceId,
} from "../src/app/hammerRuntimeData";

test("classifyHammerRuntimeProject keeps workspace-only items below the ready line", () => {
  const result = classifyHammerRuntimeProject({
    hasRecordingMedia: false,
    hasEditorSession: false,
    hasStructuredTranscript: false,
    hasVisualPlacements: false,
    hasAudioPolish: false,
    hasEditPlan: false,
  });

  assert.equal(result.isEditReady, false);
  assert.deepEqual(result.editReadyReasons, []);
});

test("classifyHammerRuntimeProject moves recording-backed workpieces above the ready line", () => {
  const result = classifyHammerRuntimeProject({
    hasRecordingMedia: true,
    hasEditorSession: false,
    hasStructuredTranscript: false,
    hasVisualPlacements: false,
    hasAudioPolish: false,
    hasEditPlan: false,
  });

  assert.equal(result.isEditReady, true);
  assert.deepEqual(result.editReadyReasons, ["Recording available"]);
});

test("classifyHammerRuntimeProject treats persisted Hammer artifacts as edit-ready even without recordings", () => {
  const result = classifyHammerRuntimeProject({
    hasRecordingMedia: false,
    hasEditorSession: true,
    hasStructuredTranscript: true,
    hasVisualPlacements: false,
    hasAudioPolish: false,
    hasEditPlan: true,
  });

  assert.equal(result.isEditReady, true);
  assert.deepEqual(result.editReadyReasons, [
    "Hammer session saved",
    "Transcript artifact saved",
    "Edit plan saved",
  ]);
});

test("extractHammerWorkpieceManifestContext reads workspace truth and recording coverage from manifest data", () => {
  const result = extractHammerWorkpieceManifestContext({
    workspace_id: "11111111-1111-4111-8111-111111111111",
    files: {
      "recordings/session-a.wav": {},
      "assets/images/cover.png": {},
    },
  });

  assert.deepEqual(result, {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    hasRecordingMedia: true,
  });
});

test("readHammerStoredActiveWorkspaceId prefers Hammer-owned workspace cache before shared Forge keys", () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>([
    ["hammer_workspace_id_v1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["forge_workspace_id_v1", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    ["barstock_workspace_id", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
  ]);

  globalThis.window = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
    },
  } as Window & typeof globalThis;

  try {
    assert.equal(readHammerStoredActiveWorkspaceId(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  } finally {
    globalThis.window = previousWindow;
  }
});
