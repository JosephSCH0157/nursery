import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHammerAutomaticPlacementEvidenceLifecycle, deriveHammerAutoPlacementDiagnostics } from "../src/editor/useHammerWorkspaceShellAutomaticPlacement";
import { resolveHammerAutomaticPlacementCommand } from "../src/editor/hammerAutomaticPlacementController";

test("placement evidence requests capture immutable inputs and reject stale or duplicate application", () => {
  const lifecycle = createHammerAutomaticPlacementEvidenceLifecycle("workpiece-a|timeline-1");
  const mutable = { assets: ["a", "b"], evidence: { revision: 1 } };
  const first = lifecycle.begin(mutable);
  mutable.assets.push("c"); mutable.evidence.revision = 2;
  assert.deepEqual(first.request, { assets: ["a", "b"], evidence: { revision: 1 } });
  const second = lifecycle.begin(mutable);
  assert.equal(lifecycle.accepts(first), false);
  assert.equal(lifecycle.accepts(second), true);
  assert.equal(lifecycle.markApplied(second), true);
  assert.equal(lifecycle.markApplied(second), false);
  lifecycle.reset("workpiece-b|timeline-1");
  assert.equal(lifecycle.accepts(second), false);
});

test("conservative fallback crosses the canonical resolver unchanged", () => {
  const transform = { leftPct: 4, topPct: 6, widthPct: 36, heightPct: 26 };
  assert.deepEqual(resolveHammerAutomaticPlacementCommand({
    selectedPlacementId: "placement-1", authorityResult: null, displayedFrame: null,
    fallback: { transform, zone: "conservative_corner" },
  }), { kind: "commit", placementId: "placement-1", transform, zone: "conservative_corner" });
});

test("diagnostic projection retains gate precedence and fallback values", () => {
  assert.deepEqual(deriveHammerAutoPlacementDiagnostics({ enabled: false }), {
    diagnosticsEnabled: false, resolvedPlacementExists: false, diagnosticsResolvedPlacement: false,
    candidateCount: 0, maskBoundsCount: 0, currentFrameAvailable: false,
    segmentationMaskAvailable: false, resolverStatus: "disabled", resolverReason: "diagnostics disabled",
    selectedScale: null, scaleAttempts: [],
  });
});

test("authority owns lifecycle while forbidding direct timeline and persistence mutation", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const authority = fs.readFileSync(path.join(root, "src/editor/useHammerWorkspaceShellAutomaticPlacement.ts"), "utf8");
  const shell = fs.readFileSync(path.join(root, "src/editor/HammerWorkspaceShell.tsx"), "utf8");
  assert.match(authority, /Every canonical placement mutation must be resolved through[\s\S]*resolveHammerAutomaticPlacementCommand/);
  assert.equal((authority.match(/resolveHammerAutomaticPlacementCommand\(/g) ?? []).length, 4);
  assert.equal((authority.match(/commitTransform\(/g) ?? []).length, 1, "only explicit Apply may commit canonical geometry");
  assert.doesNotMatch(authority, /setEditableVisualTimeline|applyVisualTimelineAction|onWorkspaceSnapshotChange|saveHammer/);
  assert.doesNotMatch(shell, /resolveHammerAutomaticPlacementCommand\(/);
  assert.match(shell, /useHammerAutomaticPlacementLifecycle\(/);
});
