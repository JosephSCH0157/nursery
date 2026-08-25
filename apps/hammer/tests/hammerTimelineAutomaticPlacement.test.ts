import assert from "node:assert/strict";
import test from "node:test";
import type { PlacementFrameEvidence } from "../src/features/auto-placement/placementFrameAnalysisAuthority";
import { resolveTimelinePlacementResult, timelinePlacementEntriesEqual } from "../src/editor/useHammerTimelineAutomaticPlacement";

const frameRef = Object.freeze({ captureEpoch: "epoch", captureRevision: 1, sourceIdentity: "media", sourcePresentationTimeSec: 20,
  inferenceTimestampMs: 1, width: 1000, height: 1000, coordinateSpace: "placement_source_pixels" as const, geometricRevision: "1000x1000" });
const alphaMask = new Uint8ClampedArray(1000 * 1000);
for (let y = 300; y < 700; y += 1) for (let x = 300; x < 700; x += 1) alphaMask[(y * 1000) + x] = 255;
const evidence: PlacementFrameEvidence = Object.freeze({ requestId: "p:r1", placementId: "p", expectedMediaRevision: "m1", frameRef,
  faceResult: { kind: "success", frameRef, faces: [], warnings: [] }, matteResult: { kind: "success", frameRef,
    matte: { width: 1000, height: 1000, alphaMask, featherPx: 0, temporalWeight: 0, quality: "medium",
      metadata: { providerName: "test", confidenceScore: 1, warnings: [] } },
    speakerMaskBounds: [{ x: 300, y: 300, width: 400, height: 400 }] } });

test("timeline analysis leaves safe canonical geometry unchanged", () => {
  assert.deepEqual(resolveTimelinePlacementResult({ leftPct: 4, topPct: 4, widthPct: 20, heightPct: 20 }, evidence), { status: "safe-existing" });
});

test("timeline analysis resolves unsafe canonical geometry without mutating it", () => {
  const canonical = { leftPct: 35, topPct: 35, widthPct: 20, heightPct: 20 };
  const result = resolveTimelinePlacementResult(canonical, evidence);
  assert.equal(result.status, "resolved-safe");
  assert.deepEqual(canonical, { leftPct: 35, topPct: 35, widthPct: 20, heightPct: 20 });
  if (result.status === "resolved-safe") assert.notDeepEqual(result.transform, canonical);
});

test("same-reference tail item publishes waiting-evidence to resolved-safe transition", () => {
  const item = Object.freeze({ placementId: "tail", sessionIdentity: "session", sourceIdentity: "media", compositionPresentationTimeSec: 20,
    canonicalRevision: "c1", mediaRevision: "m1", geometryRevision: "g1" });
  const waiting = Object.freeze([{ item, status: "waiting-evidence" as const }]);
  const resolved = Object.freeze([{ item, status: "resolved-safe" as const,
    resolvedTransform: { leftPct: 5, topPct: 5, widthPct: 20, heightPct: 20 } }]);
  assert.equal(timelinePlacementEntriesEqual(waiting, resolved), false);
  assert.equal(timelinePlacementEntriesEqual(resolved, resolved), true);
});
