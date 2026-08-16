import assert from "node:assert/strict";
import test from "node:test";
import {
  appendUniquePaths,
  createFallbackEditPlan,
  deriveAssetKind,
  formatBytes,
  inferPlaybackMimeTypeFromPath,
  resolveMediaRef,
  resolveMediaMapSuggestionType,
  resolveWorkspaceMapping,
} from "../src/editor/hammerWorkspaceShellMediaUtils";
import type { HammerLaunchContext } from "../../../packages/contracts/hammer/launch-context.contract";

function launchContext(media: HammerLaunchContext["media"]): HammerLaunchContext {
  return {
    workspace_id: "workspace-1",
    workpiece_id: "workpiece-1",
    session_id: "session-1",
    media,
    transcript: { kind: "tongs-stub", transcript_id: "transcript-1", segments: [] },
  };
}

test("media helpers preserve path order and classify known assets", () => {
  assert.deepEqual(appendUniquePaths(["a"], [" a ", "b", null, "c", "b"]), ["a", "b", "c"]);
  assert.equal(deriveAssetKind({ visualMode: "contextual_data_composite", assetPath: null }), "reference_clip");
  assert.equal(deriveAssetKind({ visualMode: null, assetPath: "assets/photo.webp" }), "image");
  assert.equal(deriveAssetKind({ visualMode: null, assetPath: "assets/clip.mov" }), "broll");
  assert.equal(deriveAssetKind({ visualMode: null, assetPath: "assets/voice.wav" }), "audio");
  assert.equal(inferPlaybackMimeTypeFromPath({ path: "recording.MOV", kind: "recording_video" }), "video/quicktime");
  assert.equal(inferPlaybackMimeTypeFromPath({ path: "recording", kind: "recording_audio" }), "audio/mpeg");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.deepEqual(resolveMediaMapSuggestionType("Revenue increased 20%"), {
    type: "reference_clip",
    reason: "numbers detected",
  });
});

test("launch media helpers clone canonical references and build the same fallback identity", () => {
  const context = launchContext({
    kind: "tongs-stub",
    ref: { kind: "recording_video", cloud_uri: "tongs://recording" },
    workspace_mapping: { workspace_id: "workspace-1", role: "primary", media_ref: "tongs://recording" },
  });
  assert.deepEqual(resolveMediaRef(context), context.media.kind === "tongs-stub" ? context.media.ref : null);
  assert.notEqual(resolveMediaRef(context), context.media.kind === "tongs-stub" ? context.media.ref : null);
  assert.deepEqual(resolveWorkspaceMapping(context), context.media.kind === "tongs-stub" ? context.media.workspace_mapping : null);

  const plan = createFallbackEditPlan(context, "transcript-1", "edit-aware");
  assert.equal(plan.edit_plan_id, "workpiece-1:plan");
  assert.equal(plan.session_id, "session-1");
  assert.equal(plan.source_transcript_id, "transcript-1");
  assert.deepEqual(plan.instructions, []);
});
