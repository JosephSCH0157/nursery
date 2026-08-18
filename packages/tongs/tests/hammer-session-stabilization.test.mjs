import assert from "node:assert/strict";
import test from "node:test";
import {
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
