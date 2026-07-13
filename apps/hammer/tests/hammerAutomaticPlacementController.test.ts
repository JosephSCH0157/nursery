import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalAutomaticPlacementResult } from "../src/features/auto-placement";
import type { FaceAnalysisFrameRef } from "../src/features/eye-contact-assist/types";
import {
  resolveHammerAutomaticPlacementCommand,
} from "../src/editor/hammerAutomaticPlacementController";

const frame: FaceAnalysisFrameRef = Object.freeze({
  sourceIdentity: "source-a",
  sourcePresentationTimeSec: 3,
  width: 1000,
  height: 500,
  coordinateSpace: "placement_source_pixels",
  geometricRevision: "1000x500:identity",
  captureEpoch: "capture-1",
  captureRevision: 1,
  inferenceTimestampMs: 1_000,
});

function acceptedAuthority(): CanonicalAutomaticPlacementResult {
  return Object.freeze({
    requestedFrameRef: frame,
    decision: Object.freeze({
      kind: "commit_allowed",
      automaticCommitAllowed: true,
      manualPlacementAvailable: true,
      diagnosticsAvailable: true,
      matteForeground: "detected",
      faceAnalysisOutcome: "faces_detected",
    }),
    placement: {
      rect: { x: 100, y: 50, width: 200, height: 100 },
      zone: "upper_left",
      score: 1,
      candidateCountConsidered: 1,
      reasons: [],
    },
    speakerMaskBounds: [],
    headSafeBounds: [],
  });
}

const currentDisplay = Object.freeze({
  sourceIdentity: "source-a",
  sourcePresentationTimeSec: 3,
  width: 1000,
  height: 500,
  coordinateSpace: "placement_source_pixels" as const,
  geometricRevision: "1000x500:identity",
  playbackActive: false,
});

test("automatic placement controller refuses without mutating history", () => {
  let mutations = 0;
  const result = resolveHammerAutomaticPlacementCommand({
    selectedPlacementId: "placement-1",
    authorityResult: null,
    displayedFrame: currentDisplay,
  });
  if (result.kind === "commit") mutations += 1;
  assert.equal(result.kind, "refused");
  assert.equal(mutations, 0);
});

test("automatic placement controller rejects frame-A evidence on frame B", () => {
  const result = resolveHammerAutomaticPlacementCommand({
    selectedPlacementId: "placement-1",
    authorityResult: acceptedAuthority(),
    displayedFrame: { ...currentDisplay, sourcePresentationTimeSec: 4 },
  });
  assert.deepEqual(result, {
    kind: "refused",
    status: "Automatic placement refused: the displayed frame changed (presentation_time_changed). Manual placement remains available.",
    invalidateEvidence: true,
  });
});

test("automatic placement controller emits exactly one canonical commit command", () => {
  const result = resolveHammerAutomaticPlacementCommand({
    selectedPlacementId: "placement-1",
    authorityResult: acceptedAuthority(),
    displayedFrame: currentDisplay,
  });
  assert.deepEqual(result, {
    kind: "commit",
    placementId: "placement-1",
    transform: { leftPct: 10, topPct: 10, widthPct: 20, heightPct: 20 },
    zone: "upper_left",
  });
});
