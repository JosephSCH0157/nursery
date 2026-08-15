import assert from "node:assert/strict";
import {
  computeIngestFinalStatus,
  evaluateRegisteredTranscriptPointer,
  isSealRaceRecoverable,
} from "../src/ingest/hammerIngestDecisions";

async function main(): Promise<void> {
  // Pointer evaluation: definitive missing file -> definitive_failure true.
  const missingFile = evaluateRegisteredTranscriptPointer({
    pointerPath: "hammer/transcript/structured.v1.json",
    artifact: { path: "hammer/transcript/structured.v1.json", updated_at: null, data: null },
  });
  assert.equal(missingFile.definitive_failure, true);
  assert.equal(missingFile.rejection_reason, "missing_file");

  // Pointer evaluation: transient snapshot missing -> NOT definitive (do not clear).
  const transient = evaluateRegisteredTranscriptPointer({
    pointerPath: "hammer/transcript/structured.v1.json",
    artifact: null,
  });
  assert.equal(transient.definitive_failure, false);
  assert.equal(transient.rejection_reason, "missing_artifact_snapshot");

  // Pointer evaluation: invalid content -> definitive.
  const invalidContent = evaluateRegisteredTranscriptPointer({
    pointerPath: "hammer/transcript/structured.v1.json",
    artifact: { path: "hammer/transcript/structured.v1.json", updated_at: "2026-04-14T00:00:00.000Z", data: null },
  });
  assert.equal(invalidContent.definitive_failure, true);
  assert.equal(invalidContent.rejection_reason, "invalid_content");

  // Pointer evaluation: empty segments -> definitive.
  const emptySegments = evaluateRegisteredTranscriptPointer({
    pointerPath: "hammer/transcript/structured.v1.json",
    artifact: {
      path: "hammer/transcript/structured.v1.json",
      updated_at: "2026-04-14T00:00:00.000Z",
      data: {
        schema_version: 1,
        transcript_id: "t_01",
        media_id: null,
        media_signature: null,
        prepared_at: "2026-04-14T00:00:00.000Z",
        structure: "speaker_turns",
        source_media_ref: null,
        diarization: {
          label_scheme: "forge-neutral-speakers.v1",
          labels: [],
          raw_labels: [],
          version: null,
          provider: "openai",
          provider_request_id: null,
          model: null,
        },
        confidence_flags: [],
        segments: [],
      },
    },
  });
  assert.equal(emptySegments.load_ok, true);
  assert.equal(emptySegments.segment_count, 0);
  assert.equal(emptySegments.definitive_failure, true);
  assert.equal(emptySegments.rejection_reason, "empty_segments");

  const staleMedia = evaluateRegisteredTranscriptPointer({
    pointerPath: "hammer/transcript/structured.v1.json",
    canonicalMediaId: "capture-session:new-recording",
    artifact: {
      path: "hammer/transcript/structured.v1.json",
      updated_at: "2026-08-14T00:00:00.000Z",
      data: {
        schema_version: 1,
        transcript_id: "transcript_old_recording",
        media_id: "capture-session:first-recording",
        media_signature: null,
        prepared_at: "2026-08-13T00:00:00.000Z",
        structure: "speaker_turns",
        source_media_ref: null,
        diarization: {
          label_scheme: "forge-neutral-speakers.v1",
          labels: ["S1"],
          raw_labels: ["speaker_0"],
          version: null,
          provider: "openai",
          provider_request_id: null,
          model: null,
        },
        confidence_flags: [],
        segments: [{ segment_id: "old-1", speaker: "S1", start_sec: 0, end_sec: 1, text: "Old recording." }],
      },
    },
  });
  assert.equal(staleMedia.load_ok, false);
  assert.equal(staleMedia.definitive_failure, true);
  assert.equal(staleMedia.rejection_reason, "media_identity_mismatch");

  // Seal race recovery helper.
  assert.equal(isSealRaceRecoverable("canonical_recording_already_sealed"), true);
  assert.equal(isSealRaceRecoverable("file_conflict"), true);
  assert.equal(isSealRaceRecoverable("invalid_canonical_baseline_path"), false);

  // Final status helper.
  assert.equal(computeIngestFinalStatus({ base: "prepared_transcript", audioStatus: null, visualStatus: null }), "prepared_transcript");
  assert.equal(computeIngestFinalStatus({ base: "prepared_transcript", audioStatus: "failed", visualStatus: "prepared" }), "degraded");
  assert.equal(computeIngestFinalStatus({ base: "reused_transcript", audioStatus: "prepared", visualStatus: "not_started" }), "degraded");
  assert.equal(computeIngestFinalStatus({ base: "blocked", audioStatus: "failed", visualStatus: "not_started" }), "blocked");

  console.log("Hammer ingest decision tests passed.");
}

main().catch((error) => {
  console.error("Hammer ingest decision tests failed:", error);
  process.exit(1);
});

