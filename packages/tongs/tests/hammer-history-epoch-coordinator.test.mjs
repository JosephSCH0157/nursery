import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  buildHammerHistoryArchivePath,
  buildHammerHistoryEpochPath,
  canonicalHammerHistoryEpochBytes,
  coordinateHammerHistoryEpoch,
} from "../dist/hammer-history-epoch-coordinator.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (value) => new TextEncoder().encode(value);
const components = Object.freeze({
  transcript: "1".repeat(64),
  visual_timeline: "2".repeat(64),
  visual_placements: "3".repeat(64),
  audio: "4".repeat(64),
  editorial_authority: "5".repeat(64),
});

function fixture() {
  const ids = { workspace: randomUUID(), workpiece: randomUUID(), recording: randomUUID(), revision: randomUUID(), epoch: randomUUID(), user: randomUUID() };
  const predecessorBytes = text('{"legacy":"divergent"}');
  const predecessorSha = sha(predecessorBytes);
  const predecessorPath = `hammer/revisions/${ids.revision}/history.v1.json`;
  const archivePath = buildHammerHistoryArchivePath(ids.revision, predecessorSha);
  const epochPath = buildHammerHistoryEpochPath(ids.revision, ids.epoch);
  const revisionToken = "2026-08-19T15:26:50.828229Z";
  const predecessorToken = "2026-08-18T15:26:50.828229Z";
  const request = {
    workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision,
    initiatingUserId: ids.user, idempotencyKey: `history-epoch:${ids.epoch}`,
    expectedRevisionUpdatedAt: revisionToken, expectedHistoryPath: predecessorPath,
    expectedPredecessor: { revision: 80, updatedAt: predecessorToken, sha256: predecessorSha, bytes: predecessorBytes.length },
    epochPath,
    envelope: {
      schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: ids.epoch,
      workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision,
      base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: components },
      creation: { reason: "legacy_history_unrecoverable", created_at: "2026-08-19T16:00:00.123456Z", initiating_user_id: ids.user },
      predecessor: { original_path: predecessorPath, archive_path: archivePath, sha256: predecessorSha, bytes: predecessorBytes.length, registry_revision: 80, registry_updated_at: predecessorToken },
      history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] },
      boundary: { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." },
    },
  };
  const state = {
    pointer: predecessorPath,
    revisionToken,
    candidates: new Map(), operations: new Map(), writes: 0, commits: 0, compensations: 0,
    failCreateType: null, commitMode: "success", mutateBeforeCompensation: false,
  };
  const registry = (path, fileType, bytes, hash, operationId, revision = 1, updatedAt = `2026-08-19T16:01:00.00000${revision}Z`) => ({
    registry: { path, fileType, contentType: "application/json", hashAlgo: "sha256", sha256: hash, bytes: bytes.length, revision, updatedAt,
      storageBucket: "forge-workpieces", storageKey: `workpieces/${ids.workpiece}/${path}` },
    bytes: new Uint8Array(bytes), operationId,
  });
  const predecessor = registry(predecessorPath, "hammer_revision_artifact", predecessorBytes, predecessorSha, null, 80, predecessorToken);
  const adapter = {
    async readOperation({ idempotencyKey }) { return state.operations.get(idempotencyKey) ?? { outcome: "absent" }; },
    async readPreflight() {
      return { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision,
        activeRevisionId: ids.revision, revisionStatus: "active", revisionUpdatedAt: state.revisionToken, historyPath: state.pointer,
        predecessor: predecessor.registry, predecessorBytes: new Uint8Array(predecessorBytes) };
    },
    async readCandidate({ path }) { return state.candidates.get(path) ?? null; },
    async createCandidate({ path, fileType, bytes, sha256, operationId }) {
      if (state.failCreateType === fileType) throw new Error("synthetic create failure");
      assert.equal(state.candidates.has(path), false, "createCandidate is create-only");
      const created = registry(path, fileType, bytes, sha256, operationId);
      state.candidates.set(path, created); state.writes += 1; return created;
    },
    async commit({ request: commitRequest, archive, epoch, operationFingerprint }) {
      state.commits += 1;
      if (state.commitMode === "conflict" || state.commitMode === "stale-replacement") {
        if (state.commitMode === "stale-replacement") {
          const current = state.candidates.get(epoch.path);
          state.candidates.set(epoch.path, { ...current, bytes: text("replacement"), operationId: "foreign" });
        }
        return { outcome: "conflict", code: "history_epoch_pointer_conflict", terminal: true, retryable: false };
      }
      const committed = { outcome: "committed", epoch_id: ids.epoch, transition_id: randomUUID(), history_path: epoch.path,
        revision_updated_at: "2026-08-19T16:02:00.123456Z", operation_fingerprint: operationFingerprint };
      state.pointer = epoch.path; state.revisionToken = committed.revision_updated_at; state.operations.set(commitRequest.idempotencyKey, committed);
      if (state.commitMode === "ambiguous") throw new Error("lost RPC response");
      assert.equal(archive.sha256, predecessorSha);
      return committed;
    },
    async compensate({ operationId, candidate }) {
      state.compensations += 1;
      const current = state.candidates.get(candidate.registry.path);
      if (!current) return "absent";
      if (state.pointer === candidate.registry.path || current.operationId !== operationId
        || current.registry.updatedAt !== candidate.registry.updatedAt || current.registry.sha256 !== candidate.registry.sha256
        || sha(current.bytes) !== candidate.registry.sha256) return "stale_or_referenced";
      state.candidates.delete(candidate.registry.path); return "removed";
    },
  };
  return { ids, request, state, adapter, archivePath, epochPath, predecessorBytes, predecessor, registry };
}

test("successful archive, epoch staging, RPC commit, and independent replay", async () => {
  const f = fixture();
  const first = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(first.outcome, "committed"); assert.equal(f.state.writes, 2); assert.equal(f.state.commits, 1);
  const second = await coordinateHammerHistoryEpoch({ request: structuredClone(f.request), adapter: f.adapter });
  assert.equal(second.outcome, "already_committed"); assert.equal(f.state.writes, 2); assert.equal(f.state.commits, 1);
});

test("existing byte-identical candidates are reused without writes", async () => {
  const f = fixture();
  const epochBytes = canonicalHammerHistoryEpochBytes(f.request.envelope);
  f.state.candidates.set(f.archivePath, f.registry(f.archivePath, "hammer_history_archive", f.predecessorBytes, sha(f.predecessorBytes), "prior"));
  f.state.candidates.set(f.epochPath, f.registry(f.epochPath, "hammer_history_epoch", epochBytes, sha(epochBytes), "prior"));
  const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(result.outcome, "committed"); assert.equal(f.state.writes, 0); assert.equal(f.state.compensations, 0);
});

test("mismatched existing candidate fails before RPC and preserves it", async () => {
  const f = fixture();
  f.state.candidates.set(f.archivePath, f.registry(f.archivePath, "hammer_history_archive", text("foreign"), sha(text("foreign")), "foreign"));
  const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(result.outcome, "conflict"); assert.equal(result.code, "history_epoch_staged_object_conflict");
  assert.equal(f.state.commits, 0); assert.equal(f.state.candidates.has(f.archivePath), true);
});

for (const [name, mutate, code] of [
  ["revision token", (f) => { f.state.revisionToken = "2026-08-19T15:26:50.828230Z"; }, "history_epoch_revision_token_conflict"],
  ["pointer", (f) => { f.state.pointer = "foreign/history.json"; }, "history_epoch_pointer_conflict"],
  ["identity", (f) => { f.request.canonicalRecordingId = randomUUID(); }, "history_epoch_envelope_identity_conflict"],
]) test(`stale ${name} fails closed`, async () => {
  const f = fixture(); mutate(f); const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter }); assert.equal(result.code, code); assert.equal(f.state.writes, 0);
});

for (const [name, change] of [
  ["predecessor token", { updatedAt: "2026-08-18T15:26:50.828230Z", envelope: "registry_updated_at" }],
  ["predecessor revision", { revision: 81, envelope: "registry_revision" }],
  ["predecessor hash", { sha256: "b".repeat(64), envelope: "sha256" }],
  ["predecessor size", { bytes: 999, envelope: "bytes" }],
]) test(`stale ${name} metadata fails against the verified registry`, async () => {
  const f = fixture();
  const field = Object.keys(change).find((key) => key !== "envelope");
  f.request.expectedPredecessor[field] = change[field];
  f.request.envelope.predecessor[change.envelope] = change[field];
  if (field === "sha256") f.request.envelope.predecessor.archive_path = buildHammerHistoryArchivePath(f.ids.revision, change.sha256);
  const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(result.code, "history_epoch_predecessor_registry_conflict");
  assert.equal(f.state.writes, 0);
});

test("ambiguous commit resolves through operation readback without retry", async () => {
  const f = fixture(); f.state.commitMode = "ambiguous";
  const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(result.outcome, "committed"); assert.equal(f.state.commits, 1); assert.equal(f.state.compensations, 0);
});

test("pre-commit failure compensates only candidates created by this operation", async () => {
  const f = fixture(); f.state.commitMode = "conflict";
  const foreignPath = "hammer/foreign.json"; f.state.candidates.set(foreignPath, f.registry(foreignPath, "hammer_history_epoch", text("foreign"), sha(text("foreign")), "foreign"));
  const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(result.code, "history_epoch_pointer_conflict"); assert.equal(f.state.compensations, 2);
  assert.equal(f.state.candidates.size, 1); assert.equal(f.state.candidates.has(foreignPath), true);
});

test("stale compensation preserves replacement bytes and reports terminal conflict", async () => {
  const f = fixture(); f.state.commitMode = "stale-replacement";
  const result = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(result.code, "history_epoch_compensation_conflict"); assert.equal(f.state.candidates.get(f.epochPath).operationId, "foreign");
});

test("archive-only partial failure is compensated and a later call recovers", async () => {
  const f = fixture(); f.state.failCreateType = "hammer_history_epoch";
  const failed = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(failed.code, "history_epoch_staging_failed"); assert.equal(f.state.candidates.size, 0);
  f.state.failCreateType = null;
  const recovered = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter }); assert.equal(recovered.outcome, "committed");
});

test("epoch-only owned failure preserves reused archive and remains recoverable", async () => {
  const f = fixture();
  f.state.candidates.set(f.archivePath, f.registry(f.archivePath, "hammer_history_archive", f.predecessorBytes, sha(f.predecessorBytes), "prior"));
  f.state.commitMode = "conflict";
  const failed = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(failed.code, "history_epoch_pointer_conflict"); assert.equal(f.state.candidates.has(f.archivePath), true); assert.equal(f.state.candidates.has(f.epochPath), false);
  f.state.commitMode = "success";
  const recovered = await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter }); assert.equal(recovered.outcome, "committed");
});

test("microsecond timestamp tokens remain byte-for-byte lossless", async () => {
  const f = fixture(); let seen;
  const original = f.adapter.commit;
  f.adapter.commit = async (args) => { seen = args.request; return original(args); };
  await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter });
  assert.equal(seen.expectedRevisionUpdatedAt, "2026-08-19T15:26:50.828229Z");
  assert.equal(seen.expectedPredecessor.updatedAt, "2026-08-18T15:26:50.828229Z");
});

test("strict envelope validation rejects non-empty history and non-canonical paths", async () => {
  const f = fixture(); f.request.envelope.history.entries.push({ id: "invented" });
  assert.equal((await coordinateHammerHistoryEpoch({ request: f.request, adapter: f.adapter })).code, "history_epoch_initial_ledger_not_empty");
  const g = fixture(); g.request.epochPath = `${g.epochPath}.wrong`;
  assert.equal((await coordinateHammerHistoryEpoch({ request: g.request, adapter: g.adapter })).code, "history_epoch_path_invalid");
});
