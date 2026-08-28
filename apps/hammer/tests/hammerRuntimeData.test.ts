import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHammerLaunchContextFromRecordingTruth,
  classifyHammerRuntimeProject,
  describeHammerRecordingDecisionStatus,
  extractHammerWorkpieceRecordingTruth,
  projectHammerRecordingTruth,
  readHammerStoredActiveWorkspaceId,
} from "../src/app/hammerRuntimeData";

test("recording decision diagnostics distinguish pending and discarded Anvil takes", () => {
  assert.equal(describeHammerRecordingDecisionStatus("completed_pending"), "Recording saved; Keep decision missing");
  assert.equal(describeHammerRecordingDecisionStatus("discarded"), "Take discarded in Anvil");
  assert.equal(describeHammerRecordingDecisionStatus("kept"), null);
  assert.equal(describeHammerRecordingDecisionStatus("none"), null);
});

const FLORIDA_CANONICAL = {
  id: "6c5b0d00-f775-4611-ac67-284dd9ae7d39",
  status: "sealed",
  media_id: "capture-session:4d85f684-1c96-4bf5-bd32-5619777d606a",
  media_path: "recordings/Episode_fixture_2026-08-15_08-42-01.webm",
  media_content_type: "video/webm;codecs=vp9,opus",
  media_bytes: 91774859,
  media_duration_ms: 494890,
  sealed_at: "2026-08-15T12:49:05.093Z",
};

test("classifyHammerRuntimeProject keeps workspace-only items below the ready line", () => {
  const result = classifyHammerRuntimeProject({
    hasCanonicalRecording: false,
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
    hasCanonicalRecording: false,
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
    hasCanonicalRecording: false,
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
    hasRecording: true,
    hasCanonicalRecording: false,
    hasKeptTake: true,
    canonicalRecording: null,
    latestKeptTakePath: "recordings/session-a.wav",
    latestKeptTake: {
      completionId: null,
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

test("Florida-shaped sealed canonical authority drives recording status, preview, readiness, and bootstrap", () => {
  const recordingTruth = extractHammerWorkpieceRecordingTruth({
    recorded: true,
    latest_kept_take: null,
    canonical_recording: FLORIDA_CANONICAL,
  });
  assert.equal(recordingTruth.hasRecording, true);
  assert.equal(recordingTruth.hasCanonicalRecording, true);
  assert.equal(recordingTruth.hasKeptTake, false);
  assert.equal(recordingTruth.latestKeptTake, null);

  const projection = projectHammerRecordingTruth(recordingTruth);
  assert.equal(projection.hasRecording, true);
  assert.equal(projection.mediaPath, FLORIDA_CANONICAL.media_path);
  assert.equal(projection.mediaKind, "recording_video");
  assert.equal(projection.mediaDurationMs, FLORIDA_CANONICAL.media_duration_ms);

  const readiness = classifyHammerRuntimeProject({
    hasCanonicalRecording: true,
    hasKeptTake: false,
    hasEditorSession: false,
    hasStructuredTranscript: false,
    hasVisualPlacements: false,
    hasAudioPolish: false,
    hasEditPlan: false,
  });
  assert.equal(readiness.isEditReady, true);
  assert.deepEqual(readiness.editReadyReasons, ["Canonical recording available"]);

  const launch = buildHammerLaunchContextFromRecordingTruth({
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workpieceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    recordingTruth,
    workspaceMapping: null,
  });
  assert.equal(launch?.media.ref.media_id, FLORIDA_CANONICAL.media_id);
  assert.equal(launch?.media.ref.local_relpath, FLORIDA_CANONICAL.media_path);
});

test("canonical media remains authoritative when a different candidate is also projected", () => {
  const recordingTruth = extractHammerWorkpieceRecordingTruth({
    recorded: true,
    canonical_recording: FLORIDA_CANONICAL,
    latest_kept_take: {
      completion_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      event_id: null,
      created_at: "2026-08-18T12:00:00Z",
      file_path: "recordings/newer-eligible.webm",
      recording_session_id: null,
      anvil_capture_session_id: "newer-capture",
      content_type: "video/webm",
      bytes: 100,
      duration_ms: 20_000,
      original_name: "newer-eligible.webm",
    },
  });
  const launch = buildHammerLaunchContextFromRecordingTruth({
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workpieceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    recordingTruth,
    workspaceMapping: null,
  });
  assert.equal(launch?.media.ref.media_id, FLORIDA_CANONICAL.media_id);
  assert.equal(launch?.media.ref.local_relpath, FLORIDA_CANONICAL.media_path);
  assert.equal(projectHammerRecordingTruth(recordingTruth).mediaPath, FLORIDA_CANONICAL.media_path);
  assert.equal(projectHammerRecordingTruth(recordingTruth).hasNewerKeptTake, true);
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
