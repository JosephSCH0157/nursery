import assert from "node:assert/strict";
import { test } from "node:test";
import type { HammerCanonicalRecordingIdentityV2 } from "@forge/contracts/hammer/canonical-transcript-v2.contract";
import {
  adaptAssemblyAiUniversal35Pro,
  adaptDeepgramNova3,
  HammerTranscriptEvidenceError,
  projectCanonicalTranscriptV2ToHammerV1Editor,
  validateHammerCanonicalTranscriptV2,
} from "../src/transcript/hammerSingleProviderTranscript";
import {
  assertHammerTranscriptionProviderExecutionAuthorized,
  buildInactiveHammerTranscriptionFinancialPlan,
} from "../src/transcript/hammerInactiveTranscriptionFinancialPlan";

const recording: HammerCanonicalRecordingIdentityV2 = {
  workspace_id: "workspace-1",
  workpiece_id: "workpiece-1",
  canonical_recording_id: "recording-1",
  recording_revision_id: "revision-1",
  media_signature: "cloud:recording-1:revision-1",
  media_sha256: "a".repeat(64),
  media_bytes: 4_200_000,
  duration_ms: 12_000,
};

const baseContext = {
  transcriptId: "transcript-1",
  recording,
  model: "universal-3-5-pro",
  modelVersion: "universal-3-5-pro",
  diarizationModelVersion: "assemblyai-speaker-labels-u3.5",
  providerRequestId: "aai-request-1",
  responseSha256: "b".repeat(64),
  submittedAt: "2026-10-28T12:00:00.000Z",
  completedAt: "2026-10-28T12:00:10.000Z",
};

const assemblyFixture = {
  id: "aai-request-1",
  status: "completed",
  speech_model: "universal-3-5-pro",
  audio_duration: 12,
  text: "Welcome back. Yeah, thanks.",
  utterances: [
    {
      speaker: "A", start: 500, end: 3200, confidence: 0.96, text: "Welcome back.",
      words: [
        { text: "Welcome", start: 500, end: 1300, confidence: 0.97, speaker: "A" },
        { text: "back.", start: 1400, end: 2200, confidence: 0.95, speaker: "A" },
      ],
    },
    {
      speaker: "B", start: 4100, end: 5900, confidence: 0.92, text: "Yeah, thanks.",
      words: [
        { text: "Yeah,", start: 4100, end: 4700, confidence: 0.9, speaker: "B" },
        { text: "thanks.", start: 4800, end: 5600, confidence: 0.94, speaker: "B" },
      ],
    },
  ],
};

const deepgramFixture = {
  metadata: { request_id: "dg-request-1", duration: 12 },
  results: {
    utterances: [
      {
        id: "utterance-1", speaker: 0, start: 0.5, end: 3.2, confidence: 0.96, transcript: "Welcome back.",
        words: [
          { word: "welcome", punctuated_word: "Welcome", start: 0.5, end: 1.3, confidence: 0.97, speaker: 0 },
          { word: "back", punctuated_word: "back.", start: 1.4, end: 2.2, confidence: 0.95, speaker: 0 },
        ],
      },
      {
        id: "utterance-2", speaker: 1, start: 4.1, end: 5.9, confidence: 0.92, transcript: "Yeah, thanks.",
        words: [
          { word: "yeah", punctuated_word: "Yeah,", start: 4.1, end: 4.7, confidence: 0.9, speaker: 1 },
          { word: "thanks", punctuated_word: "thanks.", start: 4.8, end: 5.6, confidence: 0.94, speaker: 1 },
        ],
      },
    ],
  },
};

test("AssemblyAI Universal-3.5 Pro fixture becomes complete canonical transcript evidence", () => {
  const transcript = adaptAssemblyAiUniversal35Pro(assemblyFixture, baseContext);
  assert.equal(transcript.provider.provider, "assemblyai");
  assert.equal(transcript.provider.model, "universal-3-5-pro");
  assert.deepEqual(transcript.speakers.map((speaker) => speaker.provider_label), ["A", "B"]);
  assert.equal(transcript.words.length, 4);
  assert.deepEqual(transcript.segments.map((segment) => segment.speaker_id), ["speaker_01", "speaker_02"]);
  assert.equal(transcript.recording.canonical_recording_id, recording.canonical_recording_id);
});

test("Deepgram Nova-3 fixture is supported without creating a second alignment pipeline", () => {
  const transcript = adaptDeepgramNova3(deepgramFixture, {
    ...baseContext,
    model: "nova-3",
    modelVersion: "nova-3",
    diarizationModelVersion: "v2",
    providerRequestId: "dg-request-1",
  });
  assert.equal(transcript.provider.provider, "deepgram");
  assert.deepEqual(transcript.speakers.map((speaker) => speaker.provider_label), ["0", "1"]);
  assert.equal(transcript.segments[1]?.start_ms, 4100);
});

test("canonical v2 projects into Hammer's existing transcript-native editor shape", () => {
  const transcript = adaptAssemblyAiUniversal35Pro(assemblyFixture, baseContext);
  const projected = projectCanonicalTranscriptV2ToHammerV1Editor(transcript);
  assert.deepEqual(projected.segments[0], {
    segment_id: "segment_000001",
    start_sec: 0.5,
    end_sec: 3.2,
    speaker: "speaker_01",
    text: "Welcome back.",
  });
  assert.equal(projected.speakerMap.schema_version, 1);
  assert.deepEqual(projected.speakerMap.default_labels, ["speaker_01", "speaker_02"]);
});

test("incomplete, inconsistent, and untrustworthy provider evidence is rejected", () => {
  assert.throws(
    () => adaptAssemblyAiUniversal35Pro({ ...assemblyFixture, status: "processing" }, baseContext),
    (error) => error instanceof HammerTranscriptEvidenceError && error.code === "provider_incomplete",
  );
  assert.throws(
    () => adaptAssemblyAiUniversal35Pro({ ...assemblyFixture, audio_duration: 30 }, baseContext),
    (error) => error instanceof HammerTranscriptEvidenceError && error.code === "media_duration_mismatch",
  );
  const wrongSpeaker = structuredClone(assemblyFixture);
  wrongSpeaker.utterances[0]!.words[0]!.speaker = "B";
  assert.throws(
    () => adaptAssemblyAiUniversal35Pro(wrongSpeaker, baseContext),
    (error) => error instanceof HammerTranscriptEvidenceError && error.code === "speaker_evidence_mismatch",
  );
  const missingWords = structuredClone(assemblyFixture);
  missingWords.utterances[0]!.words = [];
  assert.throws(
    () => adaptAssemblyAiUniversal35Pro(missingWords, baseContext),
    (error) => error instanceof HammerTranscriptEvidenceError && error.code === "missing_collection",
  );
});

test("canonical validation rejects dropped word evidence", () => {
  const transcript = adaptAssemblyAiUniversal35Pro(assemblyFixture, baseContext);
  const malformed = structuredClone(transcript);
  malformed.segments[0]!.word_ids.pop();
  assert.throws(
    () => validateHammerCanonicalTranscriptV2(malformed),
    (error) => error instanceof HammerTranscriptEvidenceError && error.code === "incomplete_word_evidence",
  );
});

test("inactive financial plan binds duration, one attempt, 33 percent markup, and whole-credit rounding", () => {
  const plan = buildInactiveHammerTranscriptionFinancialPlan({
    recording: { ...recording, duration_ms: 61_000 },
    provider: "assemblyai",
    model: "universal-3-5-pro",
    costEvidence: {
      evidenceId: "reviewed-cost-evidence-1",
      provider: "assemblyai",
      model: "universal-3-5-pro",
      currency: "USD",
      supplierRateMicrosPerHour: 240_000,
      billingIncrementMs: 1_000,
      minimumBillableMs: 1_000,
      supportingCostCeilingMicros: 1_000,
      effectiveAt: "2026-10-28T00:00:00.000Z",
      reviewedAt: "2026-10-28T00:00:00.000Z",
    },
  });
  assert.equal(plan.billableDurationMs, 61_000);
  assert.equal(plan.supplierCeilingMicros, 4_067);
  assert.equal(plan.completeWholesaleCeilingMicros, 5_067);
  assert.equal(plan.targetCustomerValueMicros, 6_740);
  assert.equal(plan.customerCreditUnits, 2);
  assert.equal(plan.customerChargeMicros, 10_000);
  assert.equal(plan.maximumProviderAttempts, 1);
  assert.equal(plan.providerExecutionAuthorized, false);
  assert.equal(plan.publishable, false);
  assert.throws(
    () => assertHammerTranscriptionProviderExecutionAuthorized(plan),
    /hammer_single_provider_transcription_inactive/,
  );
});

test("inactive financial plan uses exact hourly micro arithmetic for short recordings", () => {
  const sharedEvidence = {
    evidenceId: "reviewed-hourly-cost-evidence",
    provider: "assemblyai" as const,
    model: "universal-3-5-pro",
    currency: "USD" as const,
    billingIncrementMs: 1_000,
    minimumBillableMs: 1_000,
    supportingCostCeilingMicros: 0,
    effectiveAt: "2026-10-28T00:00:00.000Z",
    reviewedAt: "2026-10-28T00:00:00.000Z",
  };
  const combined = buildInactiveHammerTranscriptionFinancialPlan({
    recording: { ...recording, duration_ms: 47_279 },
    provider: "assemblyai",
    model: "universal-3-5-pro",
    costEvidence: { ...sharedEvidence, supplierRateMicrosPerHour: 230_000 },
  });
  assert.equal(combined.billableDurationMs, 48_000);
  assert.equal(combined.supplierCeilingMicros, 3_067);
  assert.equal(combined.targetCustomerValueMicros, 4_080);
  assert.equal(combined.customerCreditUnits, 1);

  const subCentOperation = buildInactiveHammerTranscriptionFinancialPlan({
    recording: { ...recording, duration_ms: 47_279 },
    provider: "assemblyai",
    model: "universal-3-5-pro",
    costEvidence: { ...sharedEvidence, supplierRateMicrosPerHour: 20_000 },
  });
  assert.equal(subCentOperation.supplierCeilingMicros, 267);
  assert.equal(subCentOperation.targetCustomerValueMicros, 356);
  assert.equal(subCentOperation.customerCreditUnits, 1);
});

test("financial planning fails closed on provider evidence or duration mismatch", () => {
  assert.throws(() => buildInactiveHammerTranscriptionFinancialPlan({
    recording,
    provider: "assemblyai",
    model: "universal-3-5-pro",
    costEvidence: {
      evidenceId: "wrong-provider",
      provider: "deepgram",
      model: "nova-3",
      currency: "USD",
      supplierRateMicrosPerHour: 258_000,
      billingIncrementMs: 1_000,
      minimumBillableMs: 1_000,
      supportingCostCeilingMicros: 0,
      effectiveAt: "2026-10-28T00:00:00.000Z",
      reviewedAt: "2026-10-28T00:00:00.000Z",
    },
  }), /transcription_cost_evidence_mismatch/);
  assert.throws(() => buildInactiveHammerTranscriptionFinancialPlan({
    recording: { ...recording, duration_ms: 0 },
    provider: "assemblyai",
    model: "universal-3-5-pro",
    costEvidence: {
      evidenceId: "evidence",
      provider: "assemblyai",
      model: "universal-3-5-pro",
      currency: "USD",
      supplierRateMicrosPerHour: 240_000,
      billingIncrementMs: 1_000,
      minimumBillableMs: 1_000,
      supportingCostCeilingMicros: 0,
      effectiveAt: "2026-10-28T00:00:00.000Z",
      reviewedAt: "2026-10-28T00:00:00.000Z",
    },
  }), /recording_duration_ms_invalid/);
});
