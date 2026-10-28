import assert from "node:assert/strict";
import test from "node:test";
import {
  HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY,
  HammerAssemblyAiResourceBoundaryError,
  HammerAssemblyAiResourceGuard,
  assertHammerAssemblyAiDirectSourceUrl,
  assertHammerAssemblyAiPayloadSize,
  certifyHammerAssemblyAiCapacity,
  fingerprintHammerAssemblyAiCapacityEvidence,
  planHammerAssemblyAiFailureRelief,
} from "../dist/server/hammer-assemblyai-resource-policy.js";

const checkedAt = "2026-10-28T12:00:00.000Z";
const now = new Date("2026-10-28T12:05:00.000Z");

function capacity(overrides = {}) {
  const evidence = {
    checkedAt,
    expiresAt: "2026-10-28T13:00:00.000Z",
    netlify: {
      plan: "pro",
      remainingCreditsMicrounits: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredNetlifyCreditsMicrounits,
    },
    supabase: {
      plan: "pro",
      spendCapEnabled: true,
      remainingUncachedEgressBytes: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredSupabaseEgressBytes,
      remainingDatabaseBytes: HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes,
    },
    activeHammerOperationCount: 0,
    ...overrides,
  };
  return {
    ...evidence,
    evidenceSha256: fingerprintHammerAssemblyAiCapacityEvidence(evidence),
  };
}

function isCode(code) {
  return (error) => error instanceof HammerAssemblyAiResourceBoundaryError && error.code === code;
}

function signedSourceUrl(expiresAt = "2026-10-28T13:00:00.000Z", objectPath = HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactStorageObjectPath) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: Math.floor(Date.parse(expiresAt) / 1_000) })}.fixture-signature`;
  return `https://wtvdjndyxegudufrompx.supabase.co/storage/v1/object/sign/${HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactStorageBucket}/${objectPath}?token=${token}`;
}

function fullEpisodeFixture() {
  const durationMs = HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceDurationMs;
  const wordCount = HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.fixtureCertification.maximumWords;
  const words = Array.from({ length: wordCount }, (_, index) => ({
    text: `token${String(index).padStart(4, "0")}`,
    start: Math.floor(index * durationMs / wordCount),
    end: Math.floor((index + 1) * durationMs / wordCount),
    confidence: 0.999,
    speaker: String.fromCharCode(65 + (Math.floor(index / 12) % 8)),
  }));
  const utterances = [];
  for (let index = 0; index < words.length; index += 12) {
    const utteranceWords = words.slice(index, index + 12);
    utterances.push({
      speaker: utteranceWords[0].speaker,
      start: utteranceWords[0].start,
      end: utteranceWords.at(-1).end,
      confidence: 0.999,
      text: utteranceWords.map((word) => word.text).join(" "),
      words: utteranceWords,
    });
  }
  const text = words.map((word) => word.text).join(" ");
  const provider = {
    id: "fixture-full-episode",
    status: "completed",
    audio_duration: durationMs / 1_000,
    speech_model: "universal-3-5-pro",
    speaker_labels: true,
    text,
    words,
    utterances,
  };
  const canonical = {
    schema: "forge.hammer.canonical-transcript.v2",
    duration_ms: durationMs,
    text,
    utterances: utterances.map((utterance) => ({
      speaker: utterance.speaker,
      start_ms: utterance.start,
      end_ms: utterance.end,
      text: utterance.text,
      words: utterance.words.map((word) => ({
        text: word.text,
        start_ms: word.start,
        end_ms: word.end,
        confidence_micros: 999_000,
      })),
    })),
  };
  return { provider, canonical };
}

test("draft private policy stays inactive and preserves the owner-selected financial limits", () => {
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.revision, 2);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.lifecycleState, "draft_review");
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.supportingCostCeilingMicros, 6_000);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.supportingFailureLossCeilingMicros, 6_000);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumConcurrentOperations, 1);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderAttempts, 1);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.automaticRetries, 0);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.publishable, false);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.providerExecutionAuthorized, false);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceBytes, 120_617_428);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceDurationMs, 603_848);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumSourceEgressBytes, 241_234_856);
  assert.equal(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.requiredSupabaseEgressBytes, 243_332_008);
});

test("capacity evidence must be fresh, hashed, and sufficient for the complete operation", () => {
  assert.equal(certifyHammerAssemblyAiCapacity(capacity(), now).netlify.plan, "pro");
  assert.throws(
    () => certifyHammerAssemblyAiCapacity(capacity({ netlify: { plan: "pro", remainingCreditsMicrounits: 1 } }), now),
    isCode("netlify_capacity_unverified"),
  );
  assert.throws(
    () => certifyHammerAssemblyAiCapacity(capacity({ expiresAt: "2026-10-28T12:04:59.000Z" }), now),
    isCode("capacity_evidence_not_current"),
  );
  assert.throws(
    () => certifyHammerAssemblyAiCapacity({ ...capacity(), evidenceSha256: "unverified" }, now),
    isCode("capacity_evidence_hash_invalid"),
  );
  assert.throws(
    () => certifyHammerAssemblyAiCapacity(capacity({ activeHammerOperationCount: 1 }), now),
    isCode("hammer_concurrency_capacity_unverified"),
  );
});

test("only an exact project-scoped signed Supabase source URL is accepted", () => {
  const accepted = assertHammerAssemblyAiDirectSourceUrl(
    signedSourceUrl(),
    "wtvdjndyxegudufrompx",
    now,
  );
  assert.equal(accepted.protocol, "https:");
  assert.throws(
    () => assertHammerAssemblyAiDirectSourceUrl("https://proxy.example/source.webm", "wtvdjndyxegudufrompx"),
    isCode("source_transport_not_direct"),
  );
  assert.throws(
    () => assertHammerAssemblyAiDirectSourceUrl(signedSourceUrl("2026-10-28T12:35:14.000Z"), "wtvdjndyxegudufrompx", now),
    isCode("source_url_validity_insufficient"),
  );
  assert.throws(
    () => assertHammerAssemblyAiDirectSourceUrl(signedSourceUrl(undefined, "workpieces/wrong/source.webm"), "wtvdjndyxegudufrompx", now),
    isCode("source_transport_not_direct"),
  );
});

test("full-episode provider and canonical fixtures fit the retained byte limits with measured headroom", () => {
  const { provider, canonical } = fullEpisodeFixture();
  const providerBytes = Buffer.byteLength(JSON.stringify(provider));
  const canonicalBytes = Buffer.byteLength(JSON.stringify(canonical));
  assert.equal(provider.words.length, 3_624);
  assert.equal(provider.utterances.length, 302);
  assert.equal(providerBytes, HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.fixtureCertification.measuredProviderPayloadBytes);
  assert.equal(canonicalBytes, HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.fixtureCertification.measuredCanonicalTranscriptBytes);
  assert.ok(providerBytes < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderPayloadBytes);
  assert.ok(canonicalBytes < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumCanonicalTranscriptBytes);
  assert.ok(canonicalBytes * 20 < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes);
});

test("source reads, invocations, polling, readback, and persistence fail closed at their bounds", () => {
  const guard = new HammerAssemblyAiResourceGuard(new Date(checkedAt));
  guard.recordSourceRead(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceBytes);
  guard.recordSourceRead(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceBytes);
  assert.throws(
    () => guard.recordSourceRead(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.exactSourceBytes),
    isCode("source_read_limit_exceeded"),
  );
  for (let i = 0; i < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumFunctionInvocations; i += 1) {
    guard.recordFunctionInvocation(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumFunctionDurationMs);
  }
  assert.throws(() => guard.recordFunctionInvocation(1), isCode("function_capacity_exhausted"));
  for (let i = 0; i < HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumProviderPolls; i += 1) {
    guard.recordProviderPoll(now);
  }
  assert.throws(() => guard.recordProviderPoll(now), isCode("provider_poll_limit_exceeded"));
  guard.recordTranscriptReadback(1_048_576);
  guard.recordTranscriptReadback(1_048_576);
  assert.throws(() => guard.recordTranscriptReadback(1), isCode("transcript_readback_limit_exceeded"));
  guard.recordPersistence(HAMMER_ASSEMBLYAI_FIRST_OPERATION_POLICY.maximumPersistenceBytes);
  assert.throws(() => guard.recordPersistence(1), isCode("persistence_capacity_exhausted"));
});

test("payloads and reconciliation stop at deterministic byte and time limits", () => {
  assert.equal(assertHammerAssemblyAiPayloadSize("x".repeat(64), 64), 64);
  assert.throws(
    () => assertHammerAssemblyAiPayloadSize("é".repeat(33), 65, "provider_payload_size_exceeded"),
    isCode("provider_payload_size_exceeded"),
  );
  const guard = new HammerAssemblyAiResourceGuard(new Date(checkedAt));
  guard.assertWithinReconciliationWindow(new Date("2026-10-28T12:30:00.000Z"));
  assert.throws(
    () => guard.assertWithinReconciliationWindow(new Date("2026-10-28T12:30:00.001Z")),
    isCode("reconciliation_window_exceeded"),
  );
});

test("the resource guard admits one provider attempt and rejects concurrent or replayed attempts", () => {
  const guard = new HammerAssemblyAiResourceGuard(new Date(checkedAt));
  guard.recordProviderAttempt();
  assert.throws(() => guard.recordProviderAttempt(), isCode("provider_attempt_limit_exceeded"));
  assert.equal(guard.snapshot().providerAttempts, 1);
});

test("failure relief charges the customer zero, retains supplier exposure, and never retries", () => {
  assert.deepEqual(planHammerAssemblyAiFailureRelief("persistence_failure"), {
    customerChargeMicros: 0,
    releaseReservation: true,
    retainSupplierExposure: true,
    automaticRetry: false,
    returnToHaltNew: true,
    terminalState: "failed",
  });
  assert.deepEqual(planHammerAssemblyAiFailureRelief("submission_unknown"), {
    customerChargeMicros: 0,
    releaseReservation: false,
    retainSupplierExposure: true,
    automaticRetry: false,
    returnToHaltNew: true,
    terminalState: "submission_unknown",
  });
});
