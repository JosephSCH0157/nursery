import assert from "node:assert/strict";
import test from "node:test";
import { classifyHammerRuntimeProject } from "../src/app/hammerRuntimeData";

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
