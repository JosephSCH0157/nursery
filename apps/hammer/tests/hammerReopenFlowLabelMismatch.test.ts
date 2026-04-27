import assert from "node:assert/strict";
import { resolveHammerRecordingIdentityStatus } from "../src/editor/hammerRecordingIdentity";
import { deriveHammerIssueDiagnostics } from "../src/editor/hammerIssueDiagnostics";

/**
 * Integration test: Reopen flow with label change but same canonical media path.
 *
 * Scenario:
 * - A session was persisted with canonicalWorkpieceLabel="Camera A" and
 *   canonical media_path="takes/episode-alpha.wav"
 * - On reopen, the episode title changed to "Episode Title (Updated)"
 * - The canonical media_path remains "takes/episode-alpha.wav" (from Tongs)
 *
 * Expected behavior:
 * - Recording identity shows: advisory label mismatch, NO actual recording mismatch
 * - History replay hydrates (no early-return gate)
 * - Diagnostics: shows only advisory "capture label mismatch", not blocking error
 * - Operator sees clear advisory message, can proceed with replay
 */
async function testReopenFlowWithLabelChangeButSameCanonicalPath() {
  // === Setup: Prior session state ===
  const priorSessionLabel = "Camera A";
  const priorCanonicalMediaPath = "takes/episode-alpha.wav";
  const priorMediaRef = {
    media_id: "media_canonical_1",
    kind: "recording_audio" as const,
    local_relpath: "takes/episode-alpha.wav",
    cloud_uri: null,
    source_hint: null,
    sha256: null,
    byte_size: null,
    duration_ms: null,
  };

  // === Reopen state: Same canonical binding, different label ===
  const reopenLabel = "Episode Title (Updated)";
  const reopenCanonicalMediaPath = "takes/episode-alpha.wav";
  // Media ref reflects the same canonical binding
  const reopenMediaRef = priorMediaRef;

  // === Step 1: Verify recording identity classification ===
  // This is the core classifier that drives all downstream behavior
  const identityStatus = resolveHammerRecordingIdentityStatus({
    canonicalWorkpieceLabel: reopenLabel,
    legacyCaptureLabel: priorSessionLabel,
    canonicalMediaPath: reopenCanonicalMediaPath,
    mediaRef: reopenMediaRef,
  });

  assert.equal(
    identityStatus.hasActualRecordingMismatch,
    false,
    "Should NOT flag actual recording mismatch when canonical path is unchanged",
  );

  assert.ok(
    identityStatus.labelMismatchWarning,
    "Should flag advisory label mismatch when title changes",
  );

  assert.equal(
    identityStatus.actualRecordingMismatchWarning,
    null,
    "Should NOT set actual recording mismatch warning when paths match",
  );

  // === Step 2: Verify history controller would NOT early-return ===
  // The history controller checks: if (args.actualRecordingMismatchWarning) { return; }
  // Since actualRecordingMismatchWarning is null, the guard does NOT trigger
  const historyControllerWouldEarlyReturn = identityStatus.actualRecordingMismatchWarning != null;
  assert.equal(
    historyControllerWouldEarlyReturn,
    false,
    "History controller should NOT early-return when actual recording mismatch is null",
  );

  // === Step 3: Verify diagnostics issue classification ===
  const diagnostics = deriveHammerIssueDiagnostics({
    sessionState: {
      status: "idle",
      reasonCodes: [],
      humanLabel: "Ready",
      detail: null,
      isBlocking: false,
      isDegraded: false,
    },
    mediaPrepOutputs: null,
    mediaLabelMismatchWarning: identityStatus.labelMismatchWarning,
    actualRecordingMismatchWarning: identityStatus.actualRecordingMismatchWarning,
    jobsStatusUnavailable: null,
  });

  // Capture label vs episode title mismatch is intentionally suppressed as a diagnostic:
  // it is an internal label and must not appear as a "Fix available issues" prompt.
  const blockingIssues = diagnostics.filter((issue) => issue.severity === "error");
  const advisoryIssues = diagnostics.filter((issue) => issue.severity === "warning");

  assert.equal(
    blockingIssues.length,
    0,
    "Should have NO blocking (error) issues when only label differs",
  );

  assert.equal(
    advisoryIssues.length,
    0,
    "Should have NO advisory (warning) issues for a label-only mismatch — capture label is an internal field",
  );

  const labelMismatchIssue = diagnostics.find((issue) => issue.id === "media_label_mismatch");
  assert.equal(
    labelMismatchIssue,
    undefined,
    "Should NOT emit media_label_mismatch diagnostic — capture filename must not produce a Fix prompt",
  );

  // === Step 4: Verify NO actual recording mismatch issue ===
  const actualMismatchIssue = diagnostics.find((issue) => issue.id === "actual_recording_mismatch");
  assert.equal(
    actualMismatchIssue,
    undefined,
    "Should NOT create actual_recording_mismatch issue when canonical path matches",
  );

  // === Step 5: Integration semantics ===
  // Summarize the expected behavior on reopen
  const reopenBehavior = {
    labelChanged: priorSessionLabel !== reopenLabel,
    canonicalPathUnchanged: priorCanonicalMediaPath === reopenCanonicalMediaPath,
    canonicalBindingIntact: identityStatus.hasActualRecordingMismatch === false,
    historyReplayEnabled: !historyControllerWouldEarlyReturn,
    hasBlockingIssue: blockingIssues.length > 0,
    hasAdvisoryIssue: advisoryIssues.length > 0,
  };

  assert.deepEqual(
    reopenBehavior,
    {
      labelChanged: true,
      canonicalPathUnchanged: true,
      canonicalBindingIntact: true,
      historyReplayEnabled: true,
      hasBlockingIssue: false,
      hasAdvisoryIssue: false,
    },
    "Reopen behavior must match expected semantics: capture label mismatch is suppressed, replay enabled",
  );
}

/**
 * Contrast case: Reopen with ACTUAL recording mismatch (should block replay).
 *
 * Scenario:
 * - Prior session had persisted mediaRef with local_relpath="takes/episode-alpha.wav"
 * - On reopen, canonical media_path from fresh Tongs query is "takes/episode-beta.wav"
 *
 * Expected:
 * - Recording identity shows: actual recording mismatch, blocking
 * - History controller WOULD early-return (replay suppressed)
 * - Diagnostics: shows error-severity "actual_recording_mismatch"
 */
async function testReopenFlowWithActualMediaPathChange() {
  // Prior session persisted this mediaRef
  const priorPersistedMediaRef = {
    media_id: "media_old",
    kind: "recording_audio" as const,
    local_relpath: "takes/episode-alpha.wav",
    cloud_uri: null,
    source_hint: null,
    sha256: null,
    byte_size: null,
    duration_ms: null,
  };

  // On reopen, fresh Tongs query returns different canonical path
  const reopenCanonicalMediaPath = "takes/episode-beta.wav";

  const identityStatus = resolveHammerRecordingIdentityStatus({
    canonicalWorkpieceLabel: "Episode Title",
    legacyCaptureLabel: "Episode Title",
    canonicalMediaPath: reopenCanonicalMediaPath,
    mediaRef: priorPersistedMediaRef,  // Still has old path from prior session
  });

  assert.equal(
    identityStatus.hasActualRecordingMismatch,
    true,
    "Should flag actual recording mismatch when canonical path diverges from persisted mediaRef",
  );

  assert.equal(
    identityStatus.labelMismatchWarning,
    null,
    "Should NOT flag label mismatch when labels match",
  );

  assert.ok(
    identityStatus.actualRecordingMismatchWarning,
    "Should set actual recording mismatch warning",
  );

  // === History controller WOULD early-return ===
  const historyControllerWouldEarlyReturn = identityStatus.actualRecordingMismatchWarning != null;
  assert.equal(
    historyControllerWouldEarlyReturn,
    true,
    "History controller MUST early-return when actual recording mismatch exists",
  );

  // === Diagnostics should show blocking error ===
  const diagnostics = deriveHammerIssueDiagnostics({
    sessionState: {
      status: "idle",
      reasonCodes: [],
      humanLabel: "Ready",
      detail: null,
      isBlocking: false,
      isDegraded: false,
    },
    mediaPrepOutputs: null,
    mediaLabelMismatchWarning: null,
    actualRecordingMismatchWarning: identityStatus.actualRecordingMismatchWarning,
    jobsStatusUnavailable: null,
  });

  const blockingIssues = diagnostics.filter((issue) => issue.severity === "error");
  assert.ok(
    blockingIssues.length > 0,
    "Should have blocking error issue when actual recording mismatch exists",
  );

  const actualMismatchIssue = blockingIssues.find((issue) => issue.id === "actual_recording_mismatch");
  assert.ok(
    actualMismatchIssue,
    "Should create actual_recording_mismatch error issue",
  );

  assert.ok(
    actualMismatchIssue?.summary.includes("History replay stays blocked"),
    "Blocking issue must explain that replay is blocked",
  );
}

async function run() {
  await testReopenFlowWithLabelChangeButSameCanonicalPath();
  await testReopenFlowWithActualMediaPathChange();
  // eslint-disable-next-line no-console
  console.log("Hammer reopen flow label mismatch tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer reopen flow label mismatch tests failed:", error);
  process.exit(1);
});
