import assert from "node:assert/strict";
import {
  buildHammerHistoryEpochHeadPath,
  buildHammerHistoryEpochHeadRequest,
  buildHammerHistoryEpochPath,
  buildHammerHistoryEpochRequest,
  commitHammerHistoryEpochHead,
  loadHammerHistoryComponentAuthority,
  loadHammerRevisionHistoryHydration,
  readHammerHistoryOperation,
  serializeHammerHistoryEpochEnvelope,
  serializeHammerHistoryEpochHeadEnvelope,
  serializeHammerHistoryTransitionRequest,
  startHammerHistoryEpoch,
  type HammerHistoryEpochEnvelopeV1,
  type HammerHistoryEpochHeadEnvelopeV1,
} from "../src/lib/hammerHistoryEpochApi";

const ids = { workspace: "11111111-1111-4111-8111-111111111111", workpiece: "22222222-2222-4222-8222-222222222222", recording: "33333333-3333-4333-8333-333333333333", revision: "44444444-4444-4444-8444-444444444444", epoch: "55555555-5555-4555-8555-555555555555", head: "66666666-6666-4666-8666-666666666666", parent: "77777777-7777-4777-8777-777777777777", user: "88888888-8888-4888-8888-888888888888", transition: "99999999-9999-4999-8999-999999999999" };
const token = "2026-08-19T14:00:00.123456Z";
const hashes = Object.fromEntries(["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"].map((key, index) => [key, String(index + 1).repeat(64)])) as HammerHistoryEpochEnvelopeV1["base"]["component_sha256"];
const boundary = { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." } as const;
const anchorPath = buildHammerHistoryEpochPath(ids.revision, ids.epoch);
const identity = { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision, historyPath: anchorPath, revisionUpdatedAt: token };
const epoch: HammerHistoryEpochEnvelopeV1 = { schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: ids.epoch, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: hashes }, creation: { reason: "legacy_history_unrecoverable", created_at: "2026-08-19T14:01:00.123456Z", initiating_user_id: ids.user }, predecessor: { original_path: `hammer/revisions/${ids.revision}/history.v1.json`, archive_path: `hammer/revisions/${ids.revision}/history/archive/${"a".repeat(64)}.history.v1.json`, sha256: "a".repeat(64), bytes: 208379, registry_revision: 7, registry_updated_at: "2026-08-19T13:59:59.654321Z" }, history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] }, boundary };
const authority = Object.fromEntries(Object.keys(hashes).map((key, index) => [key, { workpiece_id: ids.workpiece, path: `hammer/revisions/${ids.revision}/${key}.json`, sha256: String(index + 4).repeat(64).slice(0, 64), bytes: 20 + index, registry_revision: index + 1, registry_updated_at: `2026-08-19T14:00:0${index}.12345${index}Z`, content_type: "application/json" }])) as HammerHistoryEpochHeadEnvelopeV1["result"]["component_authority"];
function head(sequence = 1): HammerHistoryEpochHeadEnvelopeV1 {
  const headId = sequence === 1 ? ids.head : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const parentId = sequence === 1 ? null : ids.parent;
  return { schema: "forge.hammer-history-epoch-head", schema_version: 1, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, epoch_id: ids.epoch, head_id: headId, sequence, creation: { created_at: "2026-08-19T14:02:00.123456Z", initiating_user_id: ids.user }, epoch_anchor: { path: anchorPath, sha256: "b".repeat(64) }, parent: { head_id: parentId, path: parentId ? buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, parentId) : anchorPath, sha256: "c".repeat(64), registry_revision: 9, registry_updated_at: "2026-08-19T14:01:59.654321Z" }, base: epoch.base, result: { editor_state_hash: "hammer-state:2345bcde", component_authority: authority }, history: { version: 1, workpieceId: ids.workpiece, sessionId: `epoch:${ids.epoch}`, baseRevisionId: epoch.base.editor_state_hash, createdAt: "2026-08-19T14:01:00.123456Z", updatedAt: "2026-08-19T14:02:00.123456Z", headEntryId: "entry-1", entries: [{ id: "entry-1", parentEntryId: null, timestamp: "2026-08-19T14:01:30.123456Z", kind: "editor_state_change", label: "edit", forwardPatch: [{ op: "replace", path: "/playheadSec", value: 1 }], inversePatch: [{ op: "replace", path: "/playheadSec", value: 0 }], baseStateHash: "hammer-state:1234abcd", resultStateHash: "hammer-state:2345bcde" }], checkpoints: [], undoStack: ["entry-1"], redoStack: [], metadata: {} }, boundary };
}
async function digest(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function response(data: unknown, path: string, serialized?: string) { const text = serialized ?? JSON.stringify(data); return new Response(JSON.stringify({ ok: true, data, file_row: { path, hash_algo: "sha256", hash_value: await digest(text), bytes: new TextEncoder().encode(text).length, revision: 11, updated_at: "2026-08-19T14:03:00.999999Z", storage_bucket: "forge-workpieces", storage_key: `workpieces/${ids.workpiece}/${path}` } }), { status: 200, headers: { "content-type": "application/json" } }); }
const success = { outcome: "committed", head_id: ids.head, transition_id: ids.transition, history_path: buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, ids.head), revision_updated_at: "2026-08-19T14:04:00.000001Z", operation_fingerprint: "d".repeat(64) };

async function testExactPointerLegacyAndZeroWrites() {
  const pointer = `custom/exact/${ids.revision}/ledger.json`; const calls: Array<{ url: string; method: string }> = [];
  const legacy = { version: 1, workpieceId: ids.workpiece, sessionId: "legacy-session", baseRevisionId: "legacy-base", createdAt: token, updatedAt: token, headEntryId: null, entries: [], checkpoints: [], undoStack: [], redoStack: [], metadata: {} };
  const fetcher = async (url: string, options: { method?: string }) => { calls.push({ url, method: options.method ?? "GET" }); return new Response(JSON.stringify({ ok: true, data: legacy, file_row: {} }), { status: 200 }); };
  const result = await loadHammerRevisionHistoryHydration({ ...identity, historyPath: pointer, fetcher: fetcher as never });
  assert.equal(result.ok && result.hydration.kind, "legacy_history"); assert.equal(calls[0]?.url.includes(encodeURIComponent(pointer)), true); assert.equal(calls[0]?.url.includes(`hammer%2Frevisions%2F${ids.revision}%2Fhistory.v1.json`), false); assert.deepEqual(calls.map((call) => call.method), ["GET"]);
}

async function testEpochAndHeads() {
  const epochSerialized = serializeHammerHistoryEpochEnvelope(epoch);
  const anchor = await loadHammerRevisionHistoryHydration({ ...identity, fetcher: (async () => response(epoch, anchorPath, epochSerialized)) as never });
  assert.equal(anchor.ok && anchor.hydration.kind, "epoch_anchor"); if (anchor.ok && anchor.hydration.kind === "epoch_anchor") { assert.equal(anchor.hydration.sequence, 0); assert.equal(anchor.hydration.document.entries.length, 0); assert.equal(anchor.hydration.durable_basis.revision_updated_at, token); assert.equal(anchor.hydration.durable_basis.registry.updated_at, "2026-08-19T14:03:00.999999Z"); }
  for (const sequence of [1, 2]) { const envelope = head(sequence); const path = buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, envelope.head_id); const serialized = serializeHammerHistoryEpochHeadEnvelope(envelope); const loaded = await loadHammerRevisionHistoryHydration({ ...identity, historyPath: path, fetcher: (async () => response(envelope, path, serialized)) as never }); assert.equal(loaded.ok && loaded.hydration.kind, "epoch_head"); if (loaded.ok && loaded.hydration.kind === "epoch_head") { assert.equal(loaded.hydration.sequence, sequence); assert.equal(loaded.hydration.document.entries.length, 1); assert.equal(loaded.hydration.parent.registry_updated_at, "2026-08-19T14:01:59.654321Z"); } }
}

async function testFailClosedMatrix() {
  const mutations: Array<[string, (value: any) => void]> = [
    ["wrong epoch", (v) => { v.epoch_id = ids.parent; }], ["wrong parent", (v) => { v.parent.path = "wrong"; }], ["wrong sequence", (v) => { v.sequence = 1; v.parent.head_id = ids.parent; }], ["wrong path", (v) => { v.head_id = ids.parent; }], ["identity", (v) => { v.workspace_id = ids.parent; }], ["component", (v) => { v.result.component_authority.audio.sha256 = "bad"; }], ["boundary", (v) => { v.boundary.traversable = true; }],
  ];
  for (const [, mutate] of mutations) { const value: any = structuredClone(head()); mutate(value); const path = buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, ids.head); const serialized = serializeHammerHistoryEpochHeadEnvelope(value); const loaded = await loadHammerRevisionHistoryHydration({ ...identity, historyPath: path, fetcher: (async () => response(value, path, serialized)) as never }); assert.equal(loaded.ok, false); }
  const registryMismatch = await loadHammerRevisionHistoryHydration({ ...identity, fetcher: (async () => { const r = await response(epoch, anchorPath, serializeHammerHistoryEpochEnvelope(epoch)); const body = await r.json() as any; body.file_row.revision = 0; return new Response(JSON.stringify(body)); }) as never }); assert.equal(!registryMismatch.ok && registryMismatch.classification, "registry_conflict");
  const missing = await loadHammerRevisionHistoryHydration({ ...identity, fetcher: (async () => new Response(JSON.stringify({ ok: true, exists: false }), { status: 404 })) as never }); assert.equal(!missing.ok && missing.classification, "missing");
  const malformed = await loadHammerRevisionHistoryHydration({ ...identity, fetcher: (async () => new Response("not-json")) as never }); assert.equal(!malformed.ok && malformed.classification, "malformed");
  const unsupported = { ...epoch, schema_version: 2 }; const unsupportedResult = await loadHammerRevisionHistoryHydration({ ...identity, fetcher: (async () => response(unsupported, anchorPath)) as never }); assert.equal(!unsupportedResult.ok && unsupportedResult.classification, "unsupported");
  const schema = { schema: "forge.future-history", schema_version: 1 }; const schemaResult = await loadHammerRevisionHistoryHydration({ ...identity, fetcher: (async () => response(schema, anchorPath)) as never }); assert.equal(!schemaResult.ok && schemaResult.classification, "unsupported");
}

async function testBuildersAndTransport() {
  const epochRequest = buildHammerHistoryEpochRequest({ canonical_recording_id: ids.recording, idempotency_key: "history-epoch-operation-0001", expected_revision_updated_at: token, expected_history_path: epoch.predecessor.original_path, expected_predecessor: { revision: 7, updated_at: epoch.predecessor.registry_updated_at, sha256: epoch.predecessor.sha256, bytes: epoch.predecessor.bytes }, envelope: epoch });
  const headEnvelope = head(); const headRequest = buildHammerHistoryEpochHeadRequest({ canonical_recording_id: ids.recording, idempotency_key: "history-head-operation-0001", expected_revision_updated_at: token, expected_history_path: anchorPath, expected_parent: { head_id: null, sha256: headEnvelope.parent.sha256, revision: headEnvelope.parent.registry_revision, updated_at: headEnvelope.parent.registry_updated_at, sequence: 0 }, envelope: headEnvelope });
  assert.equal(epochRequest.epoch_path, anchorPath); assert.equal(headRequest.head_path, buildHammerHistoryEpochHeadPath(ids.revision, ids.epoch, ids.head)); assert.equal(serializeHammerHistoryTransitionRequest(structuredClone(headRequest)), serializeHammerHistoryTransitionRequest(headRequest));
  const direct = async () => new Response(JSON.stringify({ ok: true, data: success }), { status: 200 });
  assert.equal((await commitHammerHistoryEpochHead({ ...identity, request: headRequest, fetcher: direct as never })).outcome, "committed");
  const terminal = async () => new Response(JSON.stringify({ ok: true, data: { outcome: "conflict", code: "history_epoch_head_pointer_conflict", terminal: true, retryable: false } }), { status: 409 });
  assert.equal((await startHammerHistoryEpoch({ ...identity, request: epochRequest, fetcher: terminal as never })).outcome, "conflict");
  let calls = 0; const ambiguous = async () => { calls++; if (calls === 1) throw new Error("lost"); return new Response(JSON.stringify({ ok: true, data: success }), { status: 200 }); };
  assert.equal((await commitHammerHistoryEpochHead({ ...identity, request: headRequest, fetcher: ambiguous as never })).outcome, "committed"); assert.equal(calls, 2);
  const invalidThenAbsent = async () => { calls++; return calls % 2 ? new Response(JSON.stringify({ ok: true, data: { bad: true } })) : new Response(JSON.stringify({ ok: true, data: { outcome: "absent" } })); };
  calls = 0; const invalid = await startHammerHistoryEpoch({ ...identity, request: epochRequest, fetcher: invalidThenAbsent as never }); assert.equal(invalid.outcome, "conflict"); assert.equal(invalid.outcome === "conflict" && invalid.code, "history_transition_ambiguous_absent");
  const status = await readHammerHistoryOperation({ ...identity, idempotencyKey: headRequest.idempotency_key, kind: "head", headId: ids.head, fetcher: direct as never }); assert.equal(status.outcome, "committed");
}

async function testDivergentLegacyNeverMutates() {
  const calls: string[] = []; const divergent = { version: 1, workpieceId: ids.workpiece, sessionId: "florida-style-synthetic", baseRevisionId: "hammer-state:deadbeef", createdAt: token, updatedAt: token, headEntryId: "missing", entries: [], checkpoints: [], undoStack: [], redoStack: [] };
  const result = await loadHammerRevisionHistoryHydration({ ...identity, historyPath: `hammer/revisions/${ids.revision}/history.v1.json`, fetcher: (async (_url: string, options: { method?: string }) => { calls.push(options.method ?? "GET"); return new Response(JSON.stringify({ ok: true, data: divergent, file_row: {} })); }) as never });
  assert.equal(result.ok && result.hydration.kind, "legacy_history"); assert.deepEqual(calls, ["GET"]); // Replay divergence remains the existing controller verifier's responsibility; hydration never starts an epoch.
}

async function testPromotedComponentAuthority() {
  const paths = Object.fromEntries(Object.keys(hashes).map((component) => [component, `hammer/revisions/${ids.revision}/${component}.json`])) as Record<keyof typeof hashes, string>;
  const calls: string[] = [];
  const promoted = await loadHammerHistoryComponentAuthority({ workpieceId: ids.workpiece, paths, fetcher: (async (url: string, options: { method?: string }) => {
    calls.push(options.method ?? "GET");
    const path = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("path")!);
    const component = Object.entries(paths).find(([, value]) => value === path)![0];
    const responseValue = await response({ component }, path);
    const body = await responseValue.json() as { file_row: { storage_key: string } };
    body.file_row.storage_key = `workpieces/${ids.workpiece}/hammer/staging/history-atomic/${ids.head}/${component}.json`;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as never });
  assert.equal(promoted.visual_timeline.path, paths.visual_timeline);
  assert.deepEqual(calls, ["GET", "GET", "GET", "GET", "GET"]);

  await assert.rejects(() => loadHammerHistoryComponentAuthority({ workpieceId: ids.workpiece, paths, fetcher: (async (url: string) => {
    const path = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("path")!);
    const responseValue = await response({}, path); const body = await responseValue.json() as { file_row: { storage_key: string } };
    body.file_row.storage_key = `workpieces/${ids.workpiece}/hammer/staging/history-atomic/${ids.head}/visual_timeline.json`;
    return new Response(JSON.stringify(body));
  }) as never }), /registry authority is invalid/);
}

async function run() { await testExactPointerLegacyAndZeroWrites(); await testEpochAndHeads(); await testFailClosedMatrix(); await testBuildersAndTransport(); await testDivergentLegacyNeverMutates(); await testPromotedComponentAuthority(); console.log("Hammer history epoch API tests passed."); }
run().catch((error) => { console.error("Hammer history epoch API tests failed:", error); process.exit(1); });
