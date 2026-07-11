import assert from "node:assert/strict";
import {
  evaluateAutomaticPlacementAuthority,
  type PlacementFaceEvidence,
  type PlacementMatteEvidence,
} from "../src/features/auto-placement";

const safeCandidate = { kind: "safe" } as const;
const currentMatte = { kind: "current", foreground: "detected" } as const;
const currentFaces = { kind: "current", faceCount: 2 } as const;

function testCurrentEvidenceAllowsOnlyAnExplicitlySafeCandidate() {
  const decision = evaluateAutomaticPlacementAuthority({
    matte: currentMatte,
    faceAnalysis: currentFaces,
    candidate: safeCandidate,
    diagnostics: "available",
  });
  assert.deepEqual(decision, {
    kind: "commit_allowed",
    automaticCommitAllowed: true,
    manualPlacementAvailable: true,
    diagnosticsAvailable: true,
    matteForeground: "detected",
    faceAnalysisOutcome: "faces_detected",
  });
  assert.equal(Object.isFrozen(decision), true);
}

function testSuccessfulZeroFacesAndAllBackgroundRemainValidEvidence() {
  const decision = evaluateAutomaticPlacementAuthority({
    matte: { kind: "current", foreground: "all_background" },
    faceAnalysis: { kind: "current", faceCount: 0 },
    candidate: safeCandidate,
    diagnostics: "available",
  });
  assert.equal(decision.kind, "commit_allowed");
  if (decision.kind !== "commit_allowed") throw new Error("Expected commit authority.");
  assert.equal(decision.matteForeground, "all_background");
  assert.equal(decision.faceAnalysisOutcome, "successful_zero_faces");
}

function testEveryNonCurrentMatteStateRefusesAutomaticCommit() {
  const expected = {
    unavailable: "matte_unavailable",
    failed: "matte_failed",
    stale: "matte_stale",
    wrong_frame: "matte_wrong_frame",
  } as const;
  for (const [kind, reason] of Object.entries(expected)) {
    const matte: PlacementMatteEvidence = {
      kind: kind as Exclude<PlacementMatteEvidence["kind"], "current">,
      reason: `matte ${kind}`,
    };
    const decision = evaluateAutomaticPlacementAuthority({
      matte,
      faceAnalysis: currentFaces,
      candidate: safeCandidate,
      diagnostics: "available",
    });
    assert.equal(decision.kind, "refused");
    if (decision.kind !== "refused") throw new Error("Expected refusal.");
    assert.equal(decision.reason, reason);
    assert.equal(decision.automaticCommitAllowed, false);
    assert.equal(decision.manualPlacementAvailable, true);
  }
}

function testEveryNonCurrentFaceStateRefusesAutomaticCommit() {
  const expected = {
    unavailable: "face_analysis_unavailable",
    failed: "face_analysis_failed",
    stale: "face_analysis_stale",
    wrong_frame: "face_analysis_wrong_frame",
  } as const;
  for (const [kind, reason] of Object.entries(expected)) {
    const faceAnalysis: PlacementFaceEvidence = {
      kind: kind as Exclude<PlacementFaceEvidence["kind"], "current">,
      reason: `face ${kind}`,
    };
    const decision = evaluateAutomaticPlacementAuthority({
      matte: currentMatte,
      faceAnalysis,
      candidate: safeCandidate,
      diagnostics: "available",
    });
    assert.equal(decision.kind, "refused");
    if (decision.kind !== "refused") throw new Error("Expected refusal.");
    assert.equal(decision.reason, reason);
    assert.equal(decision.manualPlacementAvailable, true);
  }
}

function testMalformedCurrentFaceEvidenceFailsClosed() {
  for (const faceCount of [-1, 0.5, Number.NaN]) {
    const decision = evaluateAutomaticPlacementAuthority({
      matte: currentMatte,
      faceAnalysis: { kind: "current", faceCount },
      candidate: safeCandidate,
      diagnostics: "available",
    });
    assert.equal(decision.kind, "refused");
    if (decision.kind !== "refused") throw new Error("Expected refusal.");
    assert.equal(decision.reason, "face_analysis_failed");
  }
}

function testCandidateEvaluationMustCompleteAndFindASafeCandidate() {
  const notEvaluated = evaluateAutomaticPlacementAuthority({
    matte: currentMatte,
    faceAnalysis: currentFaces,
    candidate: { kind: "not_evaluated", reason: "resolver did not execute" },
    diagnostics: "available",
  });
  assert.equal(notEvaluated.kind, "refused");
  if (notEvaluated.kind !== "refused") throw new Error("Expected refusal.");
  assert.equal(notEvaluated.reason, "candidate_evaluation_not_completed");

  const noSafeCandidate = evaluateAutomaticPlacementAuthority({
    matte: currentMatte,
    faceAnalysis: currentFaces,
    candidate: { kind: "no_safe_candidate", reason: "scale fallback exhausted" },
    diagnostics: "available",
  });
  assert.equal(noSafeCandidate.kind, "refused");
  if (noSafeCandidate.kind !== "refused") throw new Error("Expected refusal.");
  assert.equal(noSafeCandidate.reason, "no_safe_placement");
}

function testDiagnosticsAvailabilityNeverChangesProductionAuthority() {
  const withDiagnostics = evaluateAutomaticPlacementAuthority({
    matte: currentMatte,
    faceAnalysis: currentFaces,
    candidate: safeCandidate,
    diagnostics: "available",
  });
  const withoutDiagnostics = evaluateAutomaticPlacementAuthority({
    matte: currentMatte,
    faceAnalysis: currentFaces,
    candidate: safeCandidate,
    diagnostics: "unavailable",
  });
  assert.equal(withDiagnostics.kind, "commit_allowed");
  assert.equal(withoutDiagnostics.kind, "commit_allowed");
  assert.equal(withoutDiagnostics.diagnosticsAvailable, false);
}

function testDependencyFailurePriorityIsDeterministic() {
  const decision = evaluateAutomaticPlacementAuthority({
    matte: { kind: "stale", reason: "matte belongs to frame A" },
    faceAnalysis: { kind: "wrong_frame", reason: "faces belong to frame C" },
    candidate: safeCandidate,
    diagnostics: "unavailable",
  });
  assert.equal(decision.kind, "refused");
  if (decision.kind !== "refused") throw new Error("Expected refusal.");
  assert.equal(decision.reason, "matte_stale");
  assert.equal(decision.diagnosticsAvailable, false);
  assert.equal(decision.manualPlacementAvailable, true);
}

try {
  testCurrentEvidenceAllowsOnlyAnExplicitlySafeCandidate();
  testSuccessfulZeroFacesAndAllBackgroundRemainValidEvidence();
  testEveryNonCurrentMatteStateRefusesAutomaticCommit();
  testEveryNonCurrentFaceStateRefusesAutomaticCommit();
  testMalformedCurrentFaceEvidenceFailsClosed();
  testCandidateEvaluationMustCompleteAndFindASafeCandidate();
  testDiagnosticsAvailabilityNeverChangesProductionAuthority();
  testDependencyFailurePriorityIsDeterministic();
  console.log("Hammer auto-placement authority policy tests passed.");
} catch (error) {
  console.error("Hammer auto-placement authority policy tests failed:", error);
  process.exitCode = 1;
}
