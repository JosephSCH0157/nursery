import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkpieceRecordingTruth,
  isEligibleHammerRecordingTruthCandidate,
  resolveHammerCanonicalMediaChange,
} from "../dist/workpiece-commit-api.js";

const ANVIL_20S_FIXTURE = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workpieceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  canonicalMediaPath: "recordings/imports/fixture/original.webm",
  canonicalMediaId: "kept-take:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  newerCapturePath: "recordings/fixture-newer-anvil-capture.webm",
};

test("Anvil 20s regression: an unkept completion is ineligible for Hammer recording truth", () => {
  assert.notEqual(ANVIL_20S_FIXTURE.workspaceId, "494c2ae5-9037-4208-b898-fab4898ab430");
  assert.notEqual(ANVIL_20S_FIXTURE.workpieceId, "93dacc5a-e9f0-41f8-bc58-0b6ab9b199c2");
  assert.equal(isEligibleHammerRecordingTruthCandidate({ keep_id: null, source_kind: "anvil_capture" }), false);
});

test("explicitly kept and deliberately adopted recordings are eligible", () => {
  assert.equal(isEligibleHammerRecordingTruthCandidate({
    keep_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    source_kind: "anvil_capture",
  }), true);
  assert.equal(isEligibleHammerRecordingTruthCandidate({ keep_id: null, source_kind: "hammer_import" }), true);
});

test("differing eligible media requires supersession instead of rewriting sealed authority", () => {
  assert.equal(resolveHammerCanonicalMediaChange({
    canonicalStatus: "sealed",
    sealedAt: "2026-08-13T20:00:31.681Z",
    canonicalMediaPath: ANVIL_20S_FIXTURE.canonicalMediaPath,
    canonicalMediaId: ANVIL_20S_FIXTURE.canonicalMediaId,
    recordedMediaPath: ANVIL_20S_FIXTURE.newerCapturePath,
    recordedMediaId: "capture-session:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  }), "supersession_required");
});

test("unchanged sealed media and differing draft media do not require supersession", () => {
  assert.equal(resolveHammerCanonicalMediaChange({
    canonicalStatus: "sealed",
    sealedAt: "2026-08-13T20:00:31.681Z",
    canonicalMediaPath: ANVIL_20S_FIXTURE.canonicalMediaPath,
    canonicalMediaId: ANVIL_20S_FIXTURE.canonicalMediaId,
    recordedMediaPath: ANVIL_20S_FIXTURE.canonicalMediaPath,
    recordedMediaId: ANVIL_20S_FIXTURE.canonicalMediaId,
  }), "unchanged");
  assert.equal(resolveHammerCanonicalMediaChange({
    canonicalStatus: "draft",
    sealedAt: null,
    canonicalMediaPath: ANVIL_20S_FIXTURE.canonicalMediaPath,
    canonicalMediaId: ANVIL_20S_FIXTURE.canonicalMediaId,
    recordedMediaPath: ANVIL_20S_FIXTURE.newerCapturePath,
    recordedMediaId: "capture-session:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  }), "reconcile");
});

test("legacy sealed canonical authority remains recorded without becoming a kept take", () => {
  const canonicalRecording = {
    id: "6c5b0d00-f775-4611-ac67-284dd9ae7d39",
    status: "sealed",
    media_id: "capture-session:ffffffff-ffff-4fff-8fff-ffffffffffff",
    media_path: ANVIL_20S_FIXTURE.canonicalMediaPath,
    media_content_type: "video/webm",
    media_bytes: 2048,
    media_duration_ms: 20_000,
    sealed_at: "2026-08-15T12:49:05.093Z",
  };
  assert.deepEqual(buildWorkpieceRecordingTruth({
    workpieceId: ANVIL_20S_FIXTURE.workpieceId,
    eligibleCandidate: null,
    canonicalRecording,
  }), {
    workpiece_id: ANVIL_20S_FIXTURE.workpieceId,
    recorded: true,
    latest_kept_take: null,
    canonical_recording: canonicalRecording,
  });
});

test("without canonical authority only an eligible candidate projects recorded truth", () => {
  assert.equal(buildWorkpieceRecordingTruth({
    workpieceId: ANVIL_20S_FIXTURE.workpieceId,
    eligibleCandidate: null,
    canonicalRecording: null,
  }).recorded, false);
  assert.equal(buildWorkpieceRecordingTruth({
    workpieceId: ANVIL_20S_FIXTURE.workpieceId,
    eligibleCandidate: {
      event_id: null,
      completion_id: "11111111-aaaa-4aaa-8aaa-111111111111",
      keep_id: "22222222-aaaa-4aaa-8aaa-222222222222",
      created_at: "2026-08-18T12:00:00Z",
      file_path: "recordings/kept.webm",
      recording_session_id: null,
      anvil_capture_session_id: null,
      content_type: "video/webm",
      bytes: 100,
      duration_ms: 20_000,
      original_name: "kept.webm",
    },
    canonicalRecording: null,
  }).recorded, true);
});
