import assert from "node:assert/strict";
import test from "node:test";
import type { HammerEditorialAuthorityGraph } from "../../../packages/contracts/hammer/editorial-authority.contract";
import {
  persistHammerRevisionEditorialAuthority,
  serializeHammerRevisionEditorialAuthorityArtifact,
  type HammerEditorialAuthorityTransport,
} from "../src/persistence/hammerRevisionEditorialAuthorityWriter";
import type { HammerRecordingRevisionRecord } from "../src/persistence/hammerRecordingRevisionPersistence";

const FLORIDA_IDS = new Set([
  "494c2ae5-9037-4208-b898-fab4898ab430",
  "85d076d6-54e6-4b56-ab60-5eff4c87cdd0",
  "6c5b0d00-f775-4611-ac67-284dd9ae7d39",
  "f642b5d9-cec2-4656-804e-49bb33bc0cb5",
]);
const ids = {
  workspace: "10000000-0000-4000-8000-000000000001",
  workpiece: "20000000-0000-4000-8000-000000000002",
  recording: "30000000-0000-4000-8000-000000000003",
  revision: "40000000-0000-4000-8000-000000000004",
};
assert.equal(Object.values(ids).some((id) => FLORIDA_IDS.has(id)), false);

const authority: HammerEditorialAuthorityGraph = {
  schema_version: 1, graph_id: "fixture-authority", graph_version: 1,
  workspace_id: ids.workspace, workpiece_id: ids.workpiece, session_id: "fixture-session",
  source_transcript_id: "fixture-transcript", operation_order: [], operations: [],
  created_at: "2026-08-18T00:00:00.000Z", updated_at: "2026-08-18T00:00:00.000Z",
};
const revision = (): HammerRecordingRevisionRecord => ({
  id: ids.revision, workspace_id: ids.workspace, workpiece_id: ids.workpiece,
  canonical_recording_id: ids.recording, status: "active", label: null,
  editor_session_path: null, revision_transcript_path: null, audio_polish_path: null,
  visual_timeline_path: null, visual_placements_path: null, history_path: null,
  snapshots_manifest_path: null, editorial_authority_path: null,
  editorial_authority_fingerprint: null, editorial_authority_revision: 0,
  updated_at: "2026-08-18T00:00:00.000Z",
});

function fixture(options: { acknowledgement?: "fail" | "ambiguous" | "foreign"; compensationFails?: boolean; originalArtifact?: boolean } = {}) {
  let row = revision();
  const original = options.originalArtifact
    ? { hash: "b".repeat(64), updatedAt: "file-1", bytes: new Uint8Array([1, 2, 3]) }
    : { hash: null, updatedAt: null, bytes: null };
  let artifact: { hash: string | null; updatedAt: string | null; bytes: Uint8Array | null } = { ...original };
  const calls: string[] = [];
  const transport: HammerEditorialAuthorityTransport = {
    async readRevision() { calls.push("read-revision"); return row; },
    async readArtifact() { calls.push("read"); return { state: { hash: artifact.hash, updatedAt: artifact.updatedAt }, bytes: artifact.bytes }; },
    async writeArtifact(_path, bytes, expected) {
      calls.push("write"); assert.equal(expected, artifact.updatedAt);
      const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
      artifact = { hash: [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, "0")).join(""), updatedAt: "file-2", bytes };
      return { hash: artifact.hash, updatedAt: artifact.updatedAt };
    },
    async deleteArtifact(_path, expected) {
      calls.push("compensate"); assert.equal(expected, "file-2");
      if (options.compensationFails) throw new Error("compensation race");
      artifact = { ...original };
    },
    async acknowledgePointer({ path, fingerprint, expected }) {
      calls.push("ack"); assert.equal(expected.revisionUpdatedAt, row.updated_at);
      if (options.acknowledgement === "fail") throw new Error("CAS conflict");
      if (options.acknowledgement === "foreign") {
        row = { ...row, editorial_authority_path: "foreign", updated_at: "rev-foreign" };
        throw new Error("CAS conflict");
      }
      row = { ...row, editorial_authority_path: path, editorial_authority_fingerprint: fingerprint, editorial_authority_revision: 1, updated_at: "rev-2" };
      if (options.acknowledgement === "ambiguous") throw new Error("response lost");
      return row;
    },
  };
  return { transport, calls, getRow: () => row, getArtifact: () => artifact };
}

test("deterministic artifact serialization is identity-bound", () => {
  const artifact = { schema_version: 1 as const, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, authority };
  assert.deepEqual(serializeHammerRevisionEditorialAuthorityArtifact(artifact), serializeHammerRevisionEditorialAuthorityArtifact({ ...artifact }));
  assert.match(new TextDecoder().decode(serializeHammerRevisionEditorialAuthorityArtifact(artifact)), /"recording_revision_id":"40000000/);
});

test("isolated fixture proves artifact write then pointer CAS then readback", async () => {
  const h = fixture();
  const result = await persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: revision(), authority, transport: h.transport });
  assert.equal(result.disposition, "committed");
  assert.deepEqual(h.calls, ["read", "read-revision", "read", "read-revision", "write", "ack", "read", "read-revision"]);
  assert.equal(h.getRow().editorial_authority_fingerprint, h.getArtifact().hash);
});

test("ambiguous acknowledgement resolves by readback without retry", async () => {
  const h = fixture({ acknowledgement: "ambiguous" });
  const result = await persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: revision(), authority, transport: h.transport });
  assert.equal(result.disposition, "committed");
  assert.equal(h.calls.filter((call) => call === "ack").length, 1);
});

test("failed pointer CAS compensates only the fixture artifact", async () => {
  const h = fixture({ acknowledgement: "fail" });
  await assert.rejects(() => persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: revision(), authority, transport: h.transport }), /compensated/);
  assert.equal(h.getArtifact().hash, null);
  assert.equal(h.calls.includes("compensate"), true);
});

test("failed pointer CAS restores an overwritten fixture artifact", async () => {
  const h = fixture({ acknowledgement: "fail", originalArtifact: true });
  await assert.rejects(() => persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: revision(), authority, transport: h.transport }), /compensated/);
  assert.equal(h.getArtifact().hash, "b".repeat(64));
  assert.equal(h.getArtifact().updatedAt, "file-1");
});

test("foreign concurrent state is preserved and compensation conflict is classified", async () => {
  const foreign = fixture({ acknowledgement: "foreign" });
  await assert.rejects(() => persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: revision(), authority, transport: foreign.transport }), /changed during/);
  assert.equal(foreign.calls.includes("compensate"), false);
  const conflict = fixture({ acknowledgement: "fail", compensationFails: true });
  await assert.rejects(() => persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: revision(), authority, transport: conflict.transport }), /compensation failed/);
});

test("stale or cross-identity revisions fail before fixture writes", async () => {
  const h = fixture();
  await assert.rejects(() => persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: { ...revision(), workpiece_id: "50000000-0000-4000-8000-000000000005" }, authority, transport: h.transport }), /identities/);
  await assert.rejects(() => persistHammerRevisionEditorialAuthority({ target: { workspaceId: ids.workspace, workpieceId: ids.workpiece }, canonicalRecordingId: ids.recording, revision: { ...revision(), status: "superseded" }, authority, transport: h.transport }), /active/);
  assert.equal(h.calls.includes("write"), false);
});
