import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { TongsCommitService } from "../dist/workpiece-commit-api.js";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const WORKPIECE = "22222222-2222-4222-8222-222222222222";
const AUTHORITY = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const PATH = "recordings/take.webm";

function fixture(overrides = {}) {
  const bytes = overrides.storedBytes ?? new Uint8Array([1, 2, 3, 4]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const media = {
    revision: 1, hash_value: hash, bytes: bytes.length, content_type: "video/webm",
    storage_bucket: "forge-workpieces", storage_key: `workpieces/${WORKPIECE}/${PATH}`,
    ...overrides.media,
  };
  const rpcCalls = [];
  const rows = {
    recording_capture_authorities: { id: AUTHORITY, workspace_id: WORKSPACE, workpiece_id: overrides.authorityWorkpiece ?? WORKPIECE },
    workpiece_files: media,
    workspaces: { id: WORKSPACE, created_by: USER },
    workspace_members: { role: "editor" },
  };
  const supabase = {
    auth: { async getUser() { return { data: { user: { id: USER } }, error: null }; } },
    schema() {
      return {
        from(table) {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: rows[table] ?? null, error: null }; } };
        },
        async rpc(name, args) { rpcCalls.push({ name, args }); return { data: { outcome: "saved", completion: { id: "55555555-5555-4555-8555-555555555555" } }, error: null }; },
      };
    },
    storage: { from() { return { async download() { return overrides.missingObject ? { data: null, error: { statusCode: 404 } } : { data: new Blob([bytes]), error: null }; } }; } },
  };
  const inspected = overrides.inspected ?? { bytes, mimeType: "video/webm", width: 640, height: 360, durationMs: 1000, hasAudioStream: true, hasVideoStream: true };
  const runtime = { async inspectMedia() { if (overrides.probeError) throw new Error(overrides.probeError); return inspected; } };
  const service = new TongsCommitService(supabase, "forge-workpieces", null, null, null, null, null, runtime);
  const input = {
    capture_authority_id: AUTHORITY, media_path: PATH, expected_media_revision: 1,
    expected_media_hash: hash, expected_media_bytes: bytes.length, expected_media_content_type: "video/webm",
    idempotency_key: "completion-operation-1", completion_evidence: { browser_claim: { ok: true } }, user_access_token: "token",
    ...overrides.input,
  };
  return { service, input, rpcCalls };
}

test("valid canonical readback and AV probe mint trusted verification before completion", async () => {
  const { service, input, rpcCalls } = fixture();
  const result = await service.transitionAnvilTakeCompletedV3(WORKPIECE, input);
  assert.equal(result.outcome, "saved");
  assert.equal(rpcCalls[0].name, "recording_transition_take_completed_verified");
  assert.equal(rpcCalls[0].args.p_has_audio_stream, true);
  assert.equal(rpcCalls[0].args.p_has_video_stream, true);
  assert.equal(rpcCalls[0].args.p_completed_by, USER);
});

for (const [name, overrides, code] of [
  ["tampered hash", { input: { expected_media_hash: "a".repeat(64) } }, "canonical_metadata_mismatch"],
  ["truncated canonical object", { storedBytes: new Uint8Array([1, 2]), media: { bytes: 4 }, input: { expected_media_bytes: 4 } }, "canonical_storage_readback_mismatch"],
  ["metadata content type mismatch", { media: { content_type: "audio/wav" } }, "canonical_metadata_mismatch"],
  ["missing audio", { inspected: { mimeType: "video/webm", durationMs: 1000, hasAudioStream: false, hasVideoStream: true } }, "canonical_media_streams_invalid"],
  ["wrong workpiece binding", { authorityWorkpiece: "99999999-9999-4999-8999-999999999999" }, "capture_authority_mismatch"],
  ["browser/server disagreement", { input: { completion_evidence: { artifact_validation: { ok: true } } }, probeError: "invalid data" }, "canonical_media_probe_failed"],
]) {
  test(`${name} fails closed without completion RPC`, async () => {
    const { service, input, rpcCalls } = fixture(overrides);
    await assert.rejects(() => service.transitionAnvilTakeCompletedV3(WORKPIECE, input), (error) => error.code === code);
    assert.equal(rpcCalls.length, 0);
  });
}
