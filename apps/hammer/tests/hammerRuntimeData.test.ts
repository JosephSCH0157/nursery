import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHammerLaunchContextFromRecordingTruth,
  classifyHammerRuntimeProject,
  extractHammerWorkpieceRecordingTruth,
  readHammerStoredActiveWorkspaceId,
} from "../src/app/hammerRuntimeData";

test("classifyHammerRuntimeProject keeps workspace-only items below the ready line", () => {
  const result = classifyHammerRuntimeProject({
    hasKeptTake: false,
    hasEditorSession: false,
    hasStructuredTranscript: false,
    hasVisualPlacements: false,
    hasAudioPolish: false,
    hasEditPlan: false,
  });

  assert.equal(result.isEditReady, false);
  assert.deepEqual(result.editReadyReasons, []);
});

test("classifyHammerRuntimeProject moves kept-take workpieces above the ready line", () => {
  const result = classifyHammerRuntimeProject({
    hasKeptTake: true,
    hasEditorSession: false,
    hasStructuredTranscript: false,
    hasVisualPlacements: false,
    hasAudioPolish: false,
    hasEditPlan: false,
  });

  assert.equal(result.isEditReady, true);
  assert.deepEqual(result.editReadyReasons, ["Kept take available"]);
});

test("classifyHammerRuntimeProject treats persisted Hammer artifacts as edit-ready even without recordings", () => {
  const result = classifyHammerRuntimeProject({
    hasKeptTake: false,
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

test("extractHammerWorkpieceRecordingTruth reads kept-take truth from API payloads", () => {
  const result = extractHammerWorkpieceRecordingTruth({
    workpiece_id: "11111111-1111-4111-8111-111111111111",
    recorded: true,
    latest_kept_take: {
      event_id: 7,
      created_at: "2026-03-17T16:00:00.000Z",
      file_path: "recordings/session-a.wav",
      recording_session_id: "session-a",
      anvil_capture_session_id: "capture-a",
      content_type: "audio/wav",
      bytes: 2048,
      duration_ms: 120000,
      original_name: "session-a.wav",
    },
  });

  assert.deepEqual(result, {
    hasKeptTake: true,
    latestKeptTakePath: "recordings/session-a.wav",
    latestKeptTake: {
      eventId: 7,
      createdAt: "2026-03-17T16:00:00.000Z",
      filePath: "recordings/session-a.wav",
      recordingSessionId: "session-a",
      anvilCaptureSessionId: "capture-a",
      contentType: "audio/wav",
      bytes: 2048,
      durationMs: 120000,
      originalName: "session-a.wav",
    },
  });
});

test("buildHammerLaunchContextFromRecordingTruth synthesizes a canonical first-open launch context", () => {
  const recordingTruth = extractHammerWorkpieceRecordingTruth({
    workpiece_id: "11111111-1111-4111-8111-111111111111",
    recorded: true,
    latest_kept_take: {
      event_id: 7,
      created_at: "2026-03-17T16:00:00.000Z",
      file_path: "recordings/session-a.wav",
      recording_session_id: "session-a",
      anvil_capture_session_id: "capture-a",
      content_type: "audio/wav",
      bytes: 2048,
      duration_ms: 120000,
      original_name: "session-a.wav",
    },
  });

  const launchContext = buildHammerLaunchContextFromRecordingTruth({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workpieceId: "22222222-2222-4222-8222-222222222222",
    recordingTruth,
    workspaceMapping: {
      workspace_id: "11111111-1111-4111-8111-111111111111",
      local_root_abs: "D:\\ForgeMedia\\workspace",
    },
  });

  assert.deepEqual(launchContext, {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    workpiece_id: "22222222-2222-4222-8222-222222222222",
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: "transcript_seed:22222222-2222-4222-8222-222222222222",
      segments: [],
      label: "pending transcript",
    },
    media: {
      kind: "tongs-stub",
      ref: {
        media_id: "recording-session:session-a",
        kind: "recording_audio",
        source_hint: "local",
        local_relpath: "recordings/session-a.wav",
        byte_size: 2048,
        duration_ms: 120000,
      },
      workspace_mapping: {
        workspace_id: "11111111-1111-4111-8111-111111111111",
        local_root_abs: "D:\\ForgeMedia\\workspace",
      },
      label: "session-a.wav",
    },
    preview_mode: "edit-aware",
  });
});

test("buildHammerLaunchContextFromRecordingTruth preserves canonical kept takes without a local workspace mapping", () => {
  const recordingTruth = extractHammerWorkpieceRecordingTruth({
    workpiece_id: "11111111-1111-4111-8111-111111111111",
    recorded: true,
    latest_kept_take: {
      event_id: 7,
      created_at: "2026-03-17T16:00:00.000Z",
      file_path: "recordings/session-a.wav",
      recording_session_id: "session-a",
      anvil_capture_session_id: "capture-a",
      content_type: "audio/wav",
      bytes: 2048,
      duration_ms: 120000,
      original_name: "session-a.wav",
    },
  });

  const launchContext = buildHammerLaunchContextFromRecordingTruth({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workpieceId: "22222222-2222-4222-8222-222222222222",
    recordingTruth,
    workspaceMapping: null,
  });

  assert.deepEqual(launchContext, {
    workspace_id: "11111111-1111-4111-8111-111111111111",
    workpiece_id: "22222222-2222-4222-8222-222222222222",
    source_mode: "tongs",
    transcript: {
      kind: "tongs-stub",
      transcript_id: "transcript_seed:22222222-2222-4222-8222-222222222222",
      segments: [],
      label: "pending transcript",
    },
    media: {
      kind: "tongs-stub",
      ref: {
        media_id: "recording-session:session-a",
        kind: "recording_audio",
        source_hint: "cloud",
        local_relpath: "recordings/session-a.wav",
        cloud_uri: "tongs://workpieces/22222222-2222-4222-8222-222222222222/recordings/session-a.wav",
        byte_size: 2048,
        duration_ms: 120000,
      },
      label: "session-a.wav",
    },
    preview_mode: "edit-aware",
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
