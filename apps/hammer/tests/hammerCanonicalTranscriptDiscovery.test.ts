import assert from "node:assert/strict";
import test from "node:test";
import { readHammerCanonicalTranscriptV2 } from "../src/persistence/hammerRecordingRevisionPersistence";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workpieceId = "22222222-2222-4222-8222-222222222222";
const recordingId = "33333333-3333-4333-8333-333333333333";
const revisionId = "44444444-4444-4444-8444-444444444444";
const transcriptId = "55555555-5555-4555-8555-555555555555";
const sha = "a".repeat(64);
const target = { workspaceId, workpieceId };
const canonical = { id: recordingId, workspace_id: workspaceId, workpiece_id: workpieceId, status: "sealed" as const, media_path: "recording.mp4", media_id: "media-1", media_signature: sha, sealed_at: null, baseline_transcript_path: null, baseline_speaker_map_path: null, baseline_timing_path: null };
const revision = { id: revisionId, workspace_id: workspaceId, workpiece_id: workpieceId, canonical_recording_id: recordingId, status: "active" as const, label: null, editor_session_path: null, revision_transcript_path: null, audio_polish_path: null, visual_timeline_path: null, visual_placements_path: null, history_path: null, snapshots_manifest_path: null, editorial_authority_path: null, editorial_authority_fingerprint: null, editorial_authority_revision: 0, updated_at: "2026-11-06T00:00:00Z" };

function foundPayload() {
  return {
    ok: true,
    data: {
      outcome: "found",
      canonical_transcript: {
        id: transcriptId,
        operation_id: "66666666-6666-4666-8666-666666666666",
        artifact_path: `hammer/recordings/${recordingId}/baseline/transcript.v2.json`,
        transcript_json: {
          schema_version: 2,
          transcript_id: transcriptId,
          structure: "speaker_turns_with_words",
          prepared_at: "2026-11-06T00:00:00Z",
          recording: { workspace_id: workspaceId, workpiece_id: workpieceId, canonical_recording_id: recordingId, recording_revision_id: revisionId, media_signature: sha, media_sha256: sha, media_bytes: 1000, duration_ms: 2000 },
          provider: { provider: "assemblyai", model: "universal-3-5-pro", model_version: "universal-3-5-pro", diarization_model_version: "speaker-labels", provider_request_id: "provider-1", response_sha256: "b".repeat(64), submitted_at: "2026-11-06T00:00:00Z", completed_at: "2026-11-06T00:00:01Z", reported_audio_duration_ms: 2000 },
          speakers: [{ speaker_id: "speaker_01", provider_label: "A", display_name: null }],
          words: [{ word_id: "word_000001", text: "Hello", start_ms: 0, end_ms: 500, speaker_id: "speaker_01", confidence: 0.99 }],
          segments: [{ segment_id: "segment_000001", text: "Hello", start_ms: 0, end_ms: 500, speaker_id: "speaker_01", confidence: 0.99, word_ids: ["word_000001"] }],
        },
      },
    },
  };
}

test("ordinary-open discovery projects transcript-v2 without touching the prep endpoint", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  const runtime = globalThis as typeof globalThis & { window?: unknown; __forgeTongsApiToken?: string; localStorage?: { getItem(key: string): string | null; key(index: number): string | null; length: number } };
  runtime.window = runtime;
  runtime.__forgeTongsApiToken = "test-api-token";
  runtime.localStorage = { getItem: (key) => key === "forge-auth" ? JSON.stringify({ access_token: "test-user-token" }) : null, key: () => null, length: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(JSON.stringify(foundPayload()), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await readHammerCanonicalTranscriptV2(target, canonical, revision);
    assert.equal(result.ok, true);
    if (!result.ok || result.data.outcome !== "found") assert.fail("expected transcript-v2");
    assert.equal(result.data.transcript.transcript_id, transcriptId);
    assert.equal(result.data.transcript.segments[0]?.start_sec, 0);
    assert.equal(requests.length, 1);
    assert.match(requests[0]!, /\/hammer\/canonical-transcript$/);
    assert.equal(requests.some((request) => request.includes("/api/hammer/prep/transcript")), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete runtime.__forgeTongsApiToken;
    delete runtime.localStorage;
    delete runtime.window;
  }
});

test("a failed discovery remains unverifiable and a later retry can recover the same transcript", async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  const runtime = globalThis as typeof globalThis & { window?: unknown; __forgeTongsApiToken?: string; localStorage?: { getItem(key: string): string | null; key(index: number): string | null; length: number } };
  runtime.window = runtime;
  runtime.__forgeTongsApiToken = "test-api-token";
  runtime.localStorage = { getItem: (key) => key === "forge-auth" ? JSON.stringify({ access_token: "test-user-token" }) : null, key: () => null, length: 0 };
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ error: { code: "hammer_canonical_transcript_read_failed", message: "temporary read failure" } }), { status: 502 })
      : new Response(JSON.stringify(foundPayload()), { status: 200 });
  }) as typeof fetch;
  try {
    const first = await readHammerCanonicalTranscriptV2(target, canonical, revision);
    assert.equal(first.ok, false);
    const retry = await readHammerCanonicalTranscriptV2(target, canonical, revision);
    assert.equal(retry.ok, true);
    if (!retry.ok) assert.fail("retry should recover");
    assert.equal(retry.data.outcome, "found");
  } finally {
    globalThis.fetch = originalFetch;
    delete runtime.__forgeTongsApiToken;
    delete runtime.localStorage;
    delete runtime.window;
  }
});
