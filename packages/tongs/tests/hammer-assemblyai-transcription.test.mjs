import assert from "node:assert/strict";
import test from "node:test";
import {
  HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME,
  HAMMER_ASSEMBLYAI_MODEL,
  HAMMER_ASSEMBLYAI_SECRET_NAME,
  HammerAssemblyAiBoundaryError,
  HammerAssemblyAiSubmissionUnknownError,
  assertHammerAssemblyAiExecutionInactive,
  fingerprintHammerAssemblyAiRequest,
  resolveHammerAssemblyAiServerCredential,
  resolveHammerAssemblyAiSourceAuthority,
  submitHammerAssemblyAiOnce,
  verifyHammerAssemblyAiEvidence,
} from "../dist/providers/hammer-assemblyai-transcription.js";

const SHA = "e909a63e45577e1b22901a8b88cf1c44a2a6a0f0e2ed277dd575e4e69a3117ed";
const sourceEvidence = {
  completionId: "0cb6a77c-0c15-49f0-99ac-8d15fdd515aa",
  mediaRevision: 1,
  mediaPath: "recordings/Episode_21d16d6a_2026-10-27_19-31-03.webm",
  mediaHash: SHA,
  completionEvidence: {
    artifact_validation: {
      path: "recordings/Episode_21d16d6a_2026-10-27_19-31-03.webm",
      bytes: 5_341_606,
      sha256: SHA,
      duration_ms: 47_308,
      content_type: "video/webm;codecs=vp9,opus",
    },
    canonical_media_verification: {
      bytes: 5_341_606,
      sha256: SHA,
      source: "trusted_tongs_storage_readback",
      duration_ms: 47_279,
      content_type: "video/webm;codecs=vp9,opus",
      has_audio_stream: true,
      has_video_stream: true,
      probe_implementation: "ffprobe:tongs-runtime",
    },
  },
};

test("trusted server readback is the only duration authority", () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  assert.equal(source.durationMs, 47_279);
  assert.equal(source.mediaSha256, SHA);
  assert.equal(source.verificationSource, "trusted_tongs_storage_readback");
  assert.throws(
    () => resolveHammerAssemblyAiSourceAuthority({
      ...sourceEvidence,
      completionEvidence: {
        ...sourceEvidence.completionEvidence,
        canonical_media_verification: {
          ...sourceEvidence.completionEvidence.canonical_media_verification,
          source: "browser_metadata",
        },
      },
    }),
    (error) => error instanceof HammerAssemblyAiBoundaryError && error.code === "untrusted_source_evidence",
  );
});

test("request fingerprint binds exact recording and provider terms", () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  const first = fingerprintHammerAssemblyAiRequest({
    workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
    workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
    canonicalRecordingId: "ad411785-20a5-4305-9b89-9ae3c768e940",
    recordingRevisionId: "b67d0986-178f-4fcc-be4a-0bb979cb77eb",
    source,
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, fingerprintHammerAssemblyAiRequest({
    workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
    workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
    canonicalRecordingId: "ad411785-20a5-4305-9b89-9ae3c768e940",
    recordingRevisionId: "00000000-0000-4000-8000-000000000000",
    source,
  }));
});

test("canonical server secret wins while legacy local name remains compatible", () => {
  const canonical = resolveHammerAssemblyAiServerCredential({
    [HAMMER_ASSEMBLYAI_SECRET_NAME]: "canonical-test-secret",
    [HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME]: "legacy-test-secret",
  });
  assert.equal(canonical.configured, true);
  assert.equal(canonical.variableName, HAMMER_ASSEMBLYAI_SECRET_NAME);
  assert.equal(canonical.read(), "canonical-test-secret");
  const legacy = resolveHammerAssemblyAiServerCredential({
    [HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME]: "legacy-test-secret",
  });
  assert.equal(legacy.variableName, HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME);
});

test("production gate remains inactive", () => {
  assert.throws(
    () => assertHammerAssemblyAiExecutionInactive(),
    (error) => error instanceof HammerAssemblyAiBoundaryError && error.code === "hammer_assemblyai_inactive",
  );
});

test("authorized primitive submits once and never retries an ambiguous request", async () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  const authorization = {
    activation: "authorized",
    operationId: "assemblyai:operation",
    reservationId: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: "a".repeat(64),
    source,
    model: HAMMER_ASSEMBLYAI_MODEL,
    maximumProviderAttempts: 1,
    acceptedCustomerChargeMicros: 10_000,
    completeWholesaleCeilingMicros: 4_523,
  };
  let calls = 0;
  let unknowns = 0;
  await assert.rejects(
    submitHammerAssemblyAiOnce({
      authorization,
      audioUrl: "https://signed.invalid/canonical.webm",
      transport: {
        async submit() { calls += 1; throw new Error("socket_closed_after_write"); },
        async read() { throw new Error("not called"); },
      },
      async onSubmissionUnknown() { unknowns += 1; },
    }),
    HammerAssemblyAiSubmissionUnknownError,
  );
  assert.equal(calls, 1);
  assert.equal(unknowns, 1);
});

test("evidence verifier rejects attempts while execution is inactive and settlement before persistence", () => {
  const result = verifyHammerAssemblyAiEvidence({
    operation: {
      state: "completed",
      providerExecutionAuthorized: false,
      maximumProviderAttempts: 1,
      acceptedCustomerChargeMicros: 10_000,
      completeWholesaleCeilingMicros: 4_523,
      canonicalTranscriptId: null,
      settledAt: "2026-10-28T00:00:00Z",
    },
    reservationState: "settled",
    aggregateState: "settled",
    providerAttempts: [{ attemptNumber: 1, state: "completed", providerRequestId: "provider-1" }],
    stages: ["settled"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.sort(), [
    "attempt_while_execution_inactive",
    "settlement_before_canonical_persistence",
  ]);
});
