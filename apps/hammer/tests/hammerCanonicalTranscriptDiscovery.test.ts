import assert from "node:assert/strict";
import test from "node:test";
import { readHammerCanonicalTranscriptV2 } from "../src/persistence/hammerRecordingRevisionPersistence";

const workspaceId = "cc5478ff-37be-403e-824c-467fa7da061e";
const workpieceId = "21d16d6a-905b-491e-8761-028789612ae5";
const recordingId = "4cc846e3-187c-46d9-8733-e7402488236c";
const revisionId = "9c991aa7-f551-4f03-a4d6-41eb40ef81ec";
const transcriptId = "60d9c5ea-8cd5-4d4b-b103-06e734d4204a";
const sha = "595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24";
const target = { workspaceId, workpieceId };
const canonical = { id: recordingId, workspace_id: workspaceId, workpiece_id: workpieceId, status: "sealed" as const, media_path: "recording.mp4", media_id: "media-1", media_signature: sha, sealed_at: null, baseline_transcript_path: null, baseline_speaker_map_path: null, baseline_timing_path: null };
const revision = { id: revisionId, workspace_id: workspaceId, workpiece_id: workpieceId, canonical_recording_id: recordingId, status: "active" as const, label: null, editor_session_path: null, revision_transcript_path: null, audio_polish_path: null, visual_timeline_path: null, visual_placements_path: null, history_path: null, snapshots_manifest_path: null, editorial_authority_path: null, editorial_authority_fingerprint: null, editorial_authority_revision: 0, updated_at: "2026-11-06T00:00:00Z" };

function foundPayload(speakers = ["A"]) {
  return {
    ok: true,
    data: {
      outcome: "found",
      canonical_transcript: {
        id: transcriptId,
        operation_id: "66666666-6666-4666-8666-666666666666",
        artifact_path: `hammer/recordings/${recordingId}/baseline/transcript.v2.json`,
        persisted_at: "2026-11-06T00:00:01Z",
        transcript_json: {
          schema: "forge.hammer.canonical-transcript.v2",
          schema_version: "2",
          recording: { canonical_recording_id: recordingId, recording_revision_id: revisionId, completion_id: "bf67d649-1bc2-44ba-9a33-783b3ab523ea", media_sha256: sha, duration_ms: 603848 },
          provider: { provider: "assemblyai", model: "universal-3-5-pro", provider_request_id: "6e10e8a4-provider", speaker_labels: true },
          text: "Why is gasoline so expensive?",
          segments: speakers.map((speaker, index) => ({ id: `segment-${index + 1}`, text: index === 0 ? "Why is gasoline so expensive?" : "Because oil trades globally.", start_ms: index === 0 ? 5320 : 8000, end_ms: index === 0 ? 7900 : 10000, speaker })),
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
    assert.equal(result.data.transcript.segments[0]?.start_sec, 5.32);
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

test("ordinary-open discovery projects a multi-speaker writer transcript without prep", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  const runtime = globalThis as typeof globalThis & { window?: unknown; __forgeTongsApiToken?: string; localStorage?: { getItem(key: string): string | null; key(index: number): string | null; length: number } };
  runtime.window = runtime;
  runtime.__forgeTongsApiToken = "test-api-token";
  runtime.localStorage = { getItem: () => JSON.stringify({ access_token: "test-user-token" }), key: () => null, length: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(JSON.stringify(foundPayload(["A", "B"])), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await readHammerCanonicalTranscriptV2(target, canonical, revision);
    assert.equal(result.ok, true);
    if (!result.ok || result.data.outcome !== "found") assert.fail("expected transcript-v2");
    assert.deepEqual(result.data.speaker_map.default_labels, ["A", "B"]);
    assert.equal(result.data.transcript.segments.length, 2);
    assert.equal(requests.some((request) => request.includes("/api/hammer/prep/transcript")), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete runtime.__forgeTongsApiToken;
    delete runtime.localStorage;
    delete runtime.window;
  }
});

test("ordinary-open discovery rejects a genuine embedded recording mismatch", async () => {
  const originalFetch = globalThis.fetch;
  const runtime = globalThis as typeof globalThis & { window?: unknown; __forgeTongsApiToken?: string; localStorage?: { getItem(key: string): string | null; key(index: number): string | null; length: number } };
  runtime.window = runtime;
  runtime.__forgeTongsApiToken = "test-api-token";
  runtime.localStorage = { getItem: () => JSON.stringify({ access_token: "test-user-token" }), key: () => null, length: 0 };
  const payload = foundPayload();
  payload.data.canonical_transcript.transcript_json.recording.recording_revision_id = "00000000-0000-4000-8000-000000000000";
  globalThis.fetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;
  try {
    const result = await readHammerCanonicalTranscriptV2(target, canonical, revision);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("mismatched identity must fail");
    assert.equal(result.error_code, "hammer_canonical_transcript_validation_failed");
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
