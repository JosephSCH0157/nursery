import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HAMMER_ASSEMBLYAI_LEGACY_SECRET_NAME,
  HAMMER_ASSEMBLYAI_MODEL,
  HAMMER_ASSEMBLYAI_SECRET_NAME,
  HammerAssemblyAiBoundaryError,
  HammerAssemblyAiSubmissionUnknownError,
  assertHammerAssemblyAiExecutionInactive,
  createHammerAssemblyAiHttpTransport,
  fingerprintHammerAssemblyAiRequest,
  resolveHammerAssemblyAiServerCredential,
  resolveHammerAssemblyAiSourceAuthority,
  readBoundedHammerAssemblyAiResult,
  submitBoundedHammerAssemblyAiOnce,
  verifyHammerAssemblyAiEvidence,
} from "../dist/server/hammer-assemblyai-transcription.js";
import {
  HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY,
  HammerAssemblyAiResourceBoundaryError,
  HammerAssemblyAiResourceGuard,
  fingerprintHammerAssemblyAiCapacityEvidence,
} from "../dist/server/hammer-assemblyai-resource-policy.js";

const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const WORKPIECE_ID = "21d16d6a-905b-491e-8761-028789612ae5";
const RECORDING_ID = "4cc846e3-187c-46d9-8733-e7402488236c";
const REVISION_ID = "9c991aa7-f551-4f03-a4d6-41eb40ef81ec";
const COMPLETION_ID = "bf67d649-1bc2-44ba-9a33-783b3ab523ea";
const SHA = "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24";
const MEDIA_PATH = "recordings/Episode_21d16d6a_2026-10-28_13-35-19.webm";
const sourceEvidence = {
  completionId: COMPLETION_ID,
  mediaRevision: 1,
  mediaPath: MEDIA_PATH,
  mediaHash: SHA,
  completionEvidence: {
    artifact_validation: {
      path: MEDIA_PATH,
      bytes: 120_617_428,
      sha256: SHA,
      duration_ms: 603_848,
      content_type: "video/webm;codecs=vp9,opus",
    },
    canonical_media_verification: {
      bytes: 120_617_428,
      sha256: SHA,
      source: "trusted_tongs_storage_readback",
      duration_ms: 603_848,
      content_type: "video/webm;codecs=vp9,opus",
      has_audio_stream: true,
      has_video_stream: true,
      probe_implementation: "ffprobe:tongs-runtime",
    },
  },
};

function currentCapacityEvidence() {
  const evidence = {
    checkedAt: "2026-10-28T12:00:00.000Z",
    expiresAt: "2026-10-28T13:00:00.000Z",
    netlify: { plan: "pro", remainingCreditsMicrounits: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredNetlifyCreditsMicrounits },
    supabase: {
      plan: "pro",
      spendCapEnabled: true,
      remainingUncachedEgressBytes: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredSupabaseEgressBytes,
      remainingDatabaseBytes: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes,
    },
    activeHammerOperationCount: 0,
  };
  return { ...evidence, evidenceSha256: fingerprintHammerAssemblyAiCapacityEvidence(evidence) };
}

function signedSourceUrl(expiresAt = "2026-10-28T13:00:00.000Z") {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: Math.floor(Date.parse(expiresAt) / 1_000) })}.fixture-signature`;
  return `https://wtvdjndyxegudufrompx.supabase.co/storage/v1/object/sign/${HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactStorageBucket}/${HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactStorageObjectPath}?token=${token}`;
}

function executionAuthorization(source) {
  const identity = {
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    canonicalRecordingId: RECORDING_ID,
    recordingRevisionId: REVISION_ID,
    source,
  };
  return {
    activation: "authorized",
    operationId: "assemblyai:bounded-operation",
    reservationId: "11111111-1111-4111-8111-111111111111",
    requestFingerprint: fingerprintHammerAssemblyAiRequest(identity),
    ...identity,
    model: HAMMER_ASSEMBLYAI_MODEL,
    maximumProviderAttempts: 1,
    fundingSource: "customer",
    acceptedCustomerChargeMicros: 10_000,
    completeWholesaleCeilingMicros: 4_523,
  };
}

test("browser-visible Tongs exports exclude the server-only AssemblyAI boundary", () => {
  const sourceIndex = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const builtIndex = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
  const packageManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.doesNotMatch(sourceIndex, /hammer-assemblyai-(?:transcription|resource-policy)/);
  assert.doesNotMatch(builtIndex, /hammer-assemblyai-(?:transcription|resource-policy)|node:(?:crypto|buffer)|ASSEMBLYAI_API_KEY/);
  assert.equal(
    packageManifest.exports["./server/hammer-assemblyai-transcription"].import,
    "./dist/server/hammer-assemblyai-transcription.js",
  );
});

test("trusted server readback is the only duration authority", () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  assert.equal(source.durationMs, 603_848);
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
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    canonicalRecordingId: RECORDING_ID,
    recordingRevisionId: REVISION_ID,
    source,
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, fingerprintHammerAssemblyAiRequest({
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    canonicalRecordingId: RECORDING_ID,
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

test("server HTTP transport reads the opaque credential only at call time and never retries", async () => {
  let credentialReads = 0;
  let fetchCalls = 0;
  const requests = [];
  const transport = createHammerAssemblyAiHttpTransport({
    credential: {
      configured: true,
      variableName: HAMMER_ASSEMBLYAI_SECRET_NAME,
      read() { credentialReads += 1; return "test-secret-never-logged"; },
    },
    baseUrl: "https://assemblyai.invalid/",
    async fetchImpl(url, init) {
      fetchCalls += 1;
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "transcript_1", status: "queued" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(credentialReads, 0);
  const response = await transport.submit({
    audio_url: "https://signed.invalid/source.webm",
    speech_models: [HAMMER_ASSEMBLYAI_MODEL],
    speaker_labels: true,
  });
  assert.deepEqual(response, { id: "transcript_1", status: "queued" });
  assert.equal(credentialReads, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(requests[0].url, "https://assemblyai.invalid/v2/transcript");
  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body.speech_models, [HAMMER_ASSEMBLYAI_MODEL]);
  assert.equal(body.speaker_labels, true);
});

test("bounded submission submits once and never retries an ambiguous request", async () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  const authorization = executionAuthorization(source);
  let calls = 0;
  let unknowns = 0;
  const resources = new HammerAssemblyAiResourceGuard(new Date("2026-10-28T12:00:00.000Z"));
  await assert.rejects(
    submitBoundedHammerAssemblyAiOnce({
      authorization,
      audioUrl: signedSourceUrl(),
      projectRef: "wtvdjndyxegudufrompx",
      capacityEvidence: currentCapacityEvidence(),
      resources,
      transport: {
        async submit() { calls += 1; throw new Error("socket_closed_after_write"); },
        async read() { throw new Error("not called"); },
      },
      now: new Date("2026-10-28T12:05:00.000Z"),
      clock: (() => { const values = [100, 101]; return () => values.shift() ?? 101; })(),
      async onSubmissionUnknown() { unknowns += 1; },
    }),
    HammerAssemblyAiSubmissionUnknownError,
  );
  assert.equal(calls, 1);
  assert.equal(unknowns, 1);
  assert.equal(resources.snapshot().providerAttempts, 1);
});

test("bounded submission requires current capacity, direct source transport, and the certified recording", async () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  const authorization = executionAuthorization(source);
  const resources = new HammerAssemblyAiResourceGuard(new Date("2026-10-28T12:00:00.000Z"));
  let calls = 0;
  const response = await submitBoundedHammerAssemblyAiOnce({
    authorization,
    audioUrl: signedSourceUrl(),
    projectRef: "wtvdjndyxegudufrompx",
    capacityEvidence: currentCapacityEvidence(),
    resources,
    transport: {
      async submit() { calls += 1; return { id: "transcript_1", status: "queued" }; },
      async read() { throw new Error("not called"); },
    },
    now: new Date("2026-10-28T12:05:00.000Z"),
    clock: (() => { const values = [100, 101]; return () => values.shift() ?? 101; })(),
    async onSubmissionUnknown() { throw new Error("not called"); },
  });
  assert.deepEqual(response, { id: "transcript_1", status: "queued" });
  assert.equal(calls, 1);
  assert.deepEqual(resources.snapshot(), {
    sourceReads: 1,
    sourceEgressBytes: 120_617_428,
    functionInvocations: 1,
    aggregateFunctionDurationMs: 1,
    providerPolls: 0,
    providerAttempts: 1,
    transcriptReadbacks: 0,
    persistenceBytes: 0,
  });
});

test("bounded submission rejects a changed recording identity before provider execution", async () => {
  const source = resolveHammerAssemblyAiSourceAuthority(sourceEvidence);
  const authorization = {
    ...executionAuthorization(source),
    recordingRevisionId: "00000000-0000-4000-8000-000000000000",
  };
  let calls = 0;
  await assert.rejects(
    submitBoundedHammerAssemblyAiOnce({
      authorization,
      audioUrl: signedSourceUrl(),
      projectRef: "wtvdjndyxegudufrompx",
      capacityEvidence: currentCapacityEvidence(),
      resources: new HammerAssemblyAiResourceGuard(new Date("2026-10-28T12:00:00.000Z")),
      transport: {
        async submit() { calls += 1; return { id: "must-not-run", status: "queued" }; },
        async read() { throw new Error("not called"); },
      },
      now: new Date("2026-10-28T12:05:00.000Z"),
      async onSubmissionUnknown() { throw new Error("not called"); },
    }),
    (error) => error instanceof HammerAssemblyAiBoundaryError && error.code === "uncertified_first_operation_source",
  );
  assert.equal(calls, 0);
});

test("bounded provider reads reject oversized evidence and consume one poll without retry", async () => {
  const resources = new HammerAssemblyAiResourceGuard(new Date("2026-10-28T12:00:00.000Z"));
  let reads = 0;
  await assert.rejects(
    readBoundedHammerAssemblyAiResult({
      transcriptId: "transcript_1",
      resources,
      transport: {
        async submit() { throw new Error("not called"); },
        async read() { reads += 1; return { text: "x".repeat(1_048_576) }; },
      },
      now: new Date("2026-10-28T12:05:00.000Z"),
      clock: (() => { const values = [100, 101]; return () => values.shift() ?? 101; })(),
    }),
    (error) => error instanceof HammerAssemblyAiResourceBoundaryError && error.code === "provider_payload_size_exceeded",
  );
  assert.equal(reads, 1);
  assert.equal(resources.snapshot().providerPolls, 1);
  assert.equal(resources.snapshot().functionInvocations, 1);
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
