import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { buildHammerHistoryEpochHeadPath, canonicalHammerHistoryEpochHeadBytes, coordinateHammerHistoryEpochHead } from "../dist/hammer-history-epoch-head-coordinator.js";

const ids = { workspace: randomUUID(), workpiece: randomUUID(), recording: randomUUID(), revision: randomUUID(), epoch: randomUUID(), user: randomUUID() };
const hashes = Object.fromEntries(["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"].map((k, i) => [k, String(i + 1).repeat(64)]));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const token = "2026-08-19T14:00:00.123456Z";
const anchorPath = `hammer/revisions/${ids.revision}/history/epochs/${ids.epoch}.v1.json`;
const anchorBytes = new TextEncoder().encode('{"anchor":true}');

function authority() {
  return Object.fromEntries(Object.keys(hashes).map((key, i) => [key, { workpiece_id: ids.workpiece, path: `hammer/revisions/${ids.revision}/${key}.json`, sha256: String(i + 4).repeat(64).slice(0, 64), bytes: 20 + i, registry_revision: i + 1, registry_updated_at: `2026-08-19T14:00:0${i}.12345${i}Z`, content_type: "application/json" }]));
}
function history(kind = "edit", count = 1) {
  const entries = Array.from({ length: count }, (_, i) => ({ id: `${kind}-${i}`, parentEntryId: i ? `${kind}-${i - 1}` : null, timestamp: `2026-08-19T14:01:0${i}.123456Z`, kind: "editor_state_change", label: kind, forwardPatch: [{ op: "replace", path: "/playheadSec", value: i + 1 }], inversePatch: [{ op: "replace", path: "/playheadSec", value: i }] }));
  return { version: 1, workpieceId: ids.workpiece, sessionId: `session:${ids.epoch}`, baseRevisionId: "hammer-state:1234abcd", createdAt: token, updatedAt: "2026-08-19T14:01:09.123456Z", headEntryId: entries.at(-1)?.id ?? null, entries, checkpoints: [], undoStack: entries.map((e) => e.id), redoStack: [], metadata: {} };
}
function fixture(options = {}) {
  const headId = options.headId ?? randomUUID(); const sequence = options.sequence ?? 1; const parentHeadId = options.parentHeadId ?? null;
  const parentPath = options.parentPath ?? anchorPath; const parentBytes = options.parentBytes ?? anchorBytes;
  const parentRegistry = { path: parentPath, fileType: parentHeadId ? "hammer_history_epoch_head" : "hammer_history_epoch", contentType: "application/json", hashAlgo: "sha256", sha256: sha(parentBytes), bytes: parentBytes.length, revision: options.parentRevision ?? 7, updatedAt: options.parentUpdatedAt ?? token, storageBucket: "forge", storageKey: `workpieces/${ids.workpiece}/${parentPath}` };
  const envelope = { schema: "forge.hammer-history-epoch-head", schema_version: 1, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, epoch_id: ids.epoch, head_id: headId, sequence,
    creation: { created_at: "2026-08-19T14:01:10.654321Z", initiating_user_id: ids.user }, epoch_anchor: { path: anchorPath, sha256: sha(anchorBytes) },
    parent: { head_id: parentHeadId, path: parentPath, sha256: parentRegistry.sha256, registry_revision: parentRegistry.revision, registry_updated_at: parentRegistry.updatedAt },
    base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: hashes }, result: { editor_state_hash: `hammer-state:${sequence.toString(16).padStart(8, "0")}`, component_authority: authority() }, history: options.history ?? history(options.kind, options.entryCount ?? 1),
    boundary: { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." } };
  const request = { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision, initiatingUserId: ids.user, idempotencyKey: options.operation ?? `history-head:${headId}`, expectedRevisionUpdatedAt: options.revisionToken ?? token, expectedHistoryPath: parentPath, expectedParent: { headId: parentHeadId, sha256: parentRegistry.sha256, revision: parentRegistry.revision, updatedAt: parentRegistry.updatedAt, sequence: sequence - 1 }, headPath: buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, headId), envelope };
  const state = { pointer: parentPath, revisionToken: token, parentHeadId, parentSequence: sequence - 1, candidates: new Map([[parentPath, { registry: parentRegistry, bytes: parentBytes, operationId: null }]]), operations: new Map(), writes: 0, compensations: 0, commitCalls: 0, ambiguous: options.ambiguous ?? false, conflict: options.conflict ?? null };
  const adapter = {
    async readOperation(r) { const value = state.operations.get(r.idempotencyKey); if (!value) return { outcome: "absent" }; if (r.operationFingerprint && r.operationFingerprint !== value.operation_fingerprint) return { outcome: "conflict", code: "history_epoch_head_idempotency_conflict", terminal: true, retryable: false }; return value; },
    async readPreflight() { return { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision, activeRevisionId: options.activeRevisionId ?? ids.revision, revisionStatus: options.status ?? "active", revisionUpdatedAt: state.revisionToken, historyPath: state.pointer, epoch: { epochId: ids.epoch, path: anchorPath, sha256: sha(anchorBytes), baseEditorStateHash: "hammer-state:1234abcd", baseComponentSha256: hashes }, parent: state.candidates.get(state.pointer), parentHeadId: state.parentHeadId, parentSequence: state.parentSequence }; },
    async readCandidate({ path }) { return state.candidates.get(path) ?? null; },
    async createCandidate({ path, bytes, sha256, operationId }) { state.writes++; const candidate = { registry: { path, fileType: "hammer_history_epoch_head", contentType: "application/json", hashAlgo: "sha256", sha256, bytes: bytes.length, revision: 11 + state.writes, updatedAt: "2026-08-19T14:02:00.999999Z", storageBucket: "forge", storageKey: `workpieces/${ids.workpiece}/${path}` }, bytes, operationId }; state.candidates.set(path, candidate); return candidate; },
    async commit({ request: r, operationFingerprint }) { state.commitCalls++; if (state.conflict) return { outcome: "conflict", code: state.conflict, terminal: true, retryable: false }; const result = { outcome: "committed", head_id: r.envelope.head_id, transition_id: randomUUID(), history_path: r.headPath, revision_updated_at: "2026-08-19T14:02:01.000001Z", operation_fingerprint: operationFingerprint }; state.operations.set(r.idempotencyKey, result); state.pointer = r.headPath; state.parentHeadId = r.envelope.head_id; state.parentSequence = r.envelope.sequence; if (state.ambiguous) throw new Error("lost response"); return result; },
    async compensate({ candidate }) { state.compensations++; const current = state.candidates.get(candidate.registry.path); if (state.pointer === candidate.registry.path || current !== candidate) return "stale_or_referenced"; state.candidates.delete(candidate.registry.path); return "removed"; },
  };
  return { request, adapter, state };
}

test("anchor advances to first immutable head and exact replay writes nothing", async () => {
  const f = fixture(); const anchorBefore = new Uint8Array(anchorBytes);
  assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "committed");
  assert.equal(f.state.pointer, f.request.headPath); assert.equal(f.state.writes, 1); assert.deepEqual(anchorBytes, anchorBefore);
  assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "already_committed"); assert.equal(f.state.writes, 1); assert.equal(f.state.commitCalls, 1);
});

test("verified legacy base discriminator commits a canonical result without weakening the epoch boundary", async () => {
  const f = fixture();
  f.request.envelope.base.hash_algorithm = "json-stringify-v0";
  f.request.envelope.base.canonical_editor_state_hash = "hammer-state:abcdef12";
  f.request.envelope.result.hash_algorithm = "canonical-json-v1";
  const result = await coordinateHammerHistoryEpochHead(f);
  assert.equal(result.outcome, "committed");
  assert.equal(f.state.commitCalls, 1);
  assert.equal(f.request.envelope.base.editor_state_hash, "hammer-state:1234abcd");
});

test("same idempotency key with altered bytes is a terminal conflict", async () => {
  const f = fixture(); assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "committed");
  f.request.envelope.history.updatedAt = "2026-08-19T14:01:09.123455Z";
  const replay = await coordinateHammerHistoryEpochHead(f);
  assert.equal(replay.code, "history_epoch_head_idempotency_conflict"); assert.equal(f.state.writes, 1); assert.equal(f.state.commitCalls, 1);
});

test("head one advances to head two without mutating its parent", async () => {
  const parentId = randomUUID(); const parentPath = buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, parentId); const parentBytes = new TextEncoder().encode('{"head":1}');
  const f = fixture({ sequence: 2, parentHeadId: parentId, parentPath, parentBytes }); const before = new Uint8Array(parentBytes);
  assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "committed"); assert.deepEqual(parentBytes, before); assert.equal(f.state.writes, 1);
});

test("undo and redo are durable later heads", async () => {
  for (const [kind, sequence] of [["undo", 3], ["redo", 4]]) {
    const parentId = randomUUID(); const parentPath = buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, parentId);
    const f = fixture({ kind, sequence, parentHeadId: parentId, parentPath, parentBytes: new TextEncoder().encode(`{"${kind}":true}`) });
    assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "committed");
  }
});

test("rapid edits are coalesced by the caller into one deterministic candidate", async () => {
  const f = fixture({ entryCount: 3 }); const a = canonicalHammerHistoryEpochHeadBytes(f.request.envelope); const b = canonicalHammerHistoryEpochHeadBytes(structuredClone(f.request.envelope));
  assert.deepEqual(a, b); assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "committed"); assert.equal(f.state.writes, 1);
});

test("existing exact candidate is reused and mismatch is rejected before RPC", async () => {
  const exact = fixture(); const bytes = canonicalHammerHistoryEpochHeadBytes(exact.request.envelope); exact.state.candidates.set(exact.request.headPath, { registry: { path: exact.request.headPath, fileType: "hammer_history_epoch_head", contentType: "application/json", hashAlgo: "sha256", sha256: sha(bytes), bytes: bytes.length, revision: 20, updatedAt: token, storageBucket: "forge", storageKey: "existing" }, bytes, operationId: null });
  assert.equal((await coordinateHammerHistoryEpochHead(exact)).outcome, "committed"); assert.equal(exact.state.writes, 0);
  const bad = fixture(); bad.state.candidates.set(bad.request.headPath, { registry: { ...exact.state.candidates.get(exact.request.headPath).registry, path: bad.request.headPath }, bytes: new TextEncoder().encode("different"), operationId: null });
  const result = await coordinateHammerHistoryEpochHead(bad); assert.equal(result.code, "history_epoch_head_staged_object_conflict"); assert.equal(bad.state.commitCalls, 0);
});

for (const [name, mutate, code] of [
  ["skipped sequence", (f) => { f.request.envelope.sequence = 3; }, "history_epoch_head_sequence_conflict"],
  ["wrong parent", (f) => { f.request.envelope.parent.path = "wrong"; }, "history_epoch_head_parent_conflict"],
  ["stale pointer", (f) => { f.state.pointer = "replacement"; }, "history_epoch_head_pointer_conflict"],
  ["stale revision token", (f) => { f.state.revisionToken = "2026-08-19T14:00:00.123455Z"; }, "history_epoch_head_revision_token_conflict"],
  ["stale parent tuple", (f) => { f.state.candidates.get(f.state.pointer).registry.revision++; }, "history_epoch_head_parent_registry_conflict"],
  ["component authority", (f) => { f.request.envelope.result.component_authority.audio.sha256 = "bad"; }, "history_epoch_head_component_authority_conflict"],
  ["inactive revision", (f) => { f.adapter.readPreflight = async () => ({ ...(await fixture().adapter.readPreflight()), revisionStatus: "superseded" }); }, "history_epoch_head_identity_conflict"],
]) test(`${name} fails closed`, async () => { const f = fixture(); mutate(f); const result = await coordinateHammerHistoryEpochHead(f); assert.equal(result.code, code); assert.equal(f.state.writes, 0); });

test("ambiguous commit resolves only through operation readback", async () => { const f = fixture({ ambiguous: true }); assert.equal((await coordinateHammerHistoryEpochHead(f)).outcome, "committed"); assert.equal(f.state.compensations, 0); });
test("terminal precommit conflict compensates only the owned candidate", async () => { const f = fixture({ conflict: "history_epoch_head_pointer_conflict" }); const result = await coordinateHammerHistoryEpochHead(f); assert.equal(result.code, "history_epoch_head_pointer_conflict"); assert.equal(f.state.compensations, 1); assert.equal(f.state.candidates.has(f.request.headPath), false); });
test("stale compensation preserves replacement state", async () => { const f = fixture({ conflict: "history_epoch_head_pointer_conflict" }); const original = f.adapter.commit; f.adapter.commit = async (args) => { const result = await original(args); f.state.candidates.set(f.request.headPath, { ...f.state.candidates.get(f.request.headPath), bytes: new TextEncoder().encode("replacement") }); return result; }; await coordinateHammerHistoryEpochHead(f); assert.equal(f.state.candidates.has(f.request.headPath), true); });
test("microsecond registry timestamps are passed losslessly", async () => { const f = fixture(); let seen; const original = f.adapter.commit; f.adapter.commit = async (args) => { seen = args.candidate.updatedAt; return original(args); }; await coordinateHammerHistoryEpochHead(f); assert.equal(seen, "2026-08-19T14:02:00.999999Z"); });
