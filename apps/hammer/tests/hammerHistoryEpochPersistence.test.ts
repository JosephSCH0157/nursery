import assert from "node:assert/strict";
import test from "node:test";
import { buildHammerHistoryEpochCommitDraft, createHammerHistoryEpochPersistenceAuthority } from "../src/editor/hammerHistoryEpochPersistence";
import { HAMMER_EDITOR_STATE_HASH_ALGORITHM, cloneEditorState, createHammerHistoryController, hashEditorState, hashEditorStateLegacy, type HammerEditorStateSerializable, type HammerHistoryDocumentV1 } from "../src/editor/hammerWorkspaceHistory";
import { verifyEpochAnchorBaseHash } from "../src/editor/hammerHistoryHashCompatibility";
import { commitHammerHistoryAtomic, fingerprintHammerHistoryAtomicRequest, hammerHistoryAtomicInternals, loadHammerHistoryAtomicComponentBasis, type HammerHistoryAtomicComponentBasis, type HammerHistoryAtomicRequest } from "../src/lib/hammerHistoryAtomicApi";
import { validateHammerHistoryEpochHeadEnvelope, type HammerHistoryComponentAuthority, type HammerHistoryEpochEnvelopeV1, type HammerRevisionHistoryHydration } from "../src/lib/hammerHistoryEpochApi";

const ids = { workspace: "11111111-1111-4111-8111-111111111111", workpiece: "22222222-2222-4222-8222-222222222222", recording: "33333333-3333-4333-8333-333333333333", revision: "44444444-4444-4444-8444-444444444444", epoch: "55555555-5555-4555-8555-555555555555", user: "66666666-6666-4666-8666-666666666666" };
const componentNames = ["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"] as const;
const anchorPath = `hammer/revisions/${ids.revision}/history/epochs/${ids.epoch}.v1.json`;
const boundary = { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." } as const;
const placement = (id: string) => ({ placement_id: id, entry_id: "synthetic-entry", anchor_segment_id: "synthetic-segment", matched_segment_ids: ["synthetic-segment"], anchor_text: "Entire seasons lost.", asset_ref: "synthetic-asset", asset_id: null, asset_path: null, storage_key: null, label: "unresolved", visual_mode: "cutaway", start_sec: 10, end_sec: 12, confidence: 0.3, timing_source: "transcript_match" as const, status: "uncertain" as const, uncertainty_flags: ["low_confidence"] });
const state = (placementIds: string[]): HammerEditorStateSerializable => cloneEditorState({ transcriptSegments: [], visualPlacements: { schema_version: 1, status: "prepared", source_refs: ["synthetic"], uncertainty_flags: placementIds.length ? ["low_confidence"] : [], placements: placementIds.map(placement) }, visualTimeline: { version: 2, assets: [], clips: [], lanes: [] } as never, audioEdit: null, studioRack: { schema_version: 1, modules: [] } as never, editorialAuthorityGraph: null as never, outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: null, playheadSec: 0, transcriptTimingHint: null });
const beforeState = state(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
const afterState = state([]);
const waitUntil = async (predicate: () => boolean) => { for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 2)); assert.equal(predicate(), true); };
const bounded = async <T>(value: Promise<T>, label: string): Promise<T> => Promise.race([value, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 1_000))]);

function document(editorState = afterState): HammerHistoryDocumentV1 {
  const entryId = "77777777-7777-4777-8777-777777777777";
  return { version: 1, workpieceId: ids.workpiece, sessionId: `epoch:${ids.epoch}`, baseRevisionId: "hammer-state:1234abcd", createdAt: "2026-08-19T14:01:00.123456Z", updatedAt: "2026-08-19T14:02:00.123456Z", headEntryId: entryId,
    entries: [{ id: entryId, parentEntryId: null, timestamp: "2026-08-19T14:02:00.123456Z", kind: "visual_adjustment", label: "Remove unresolved placement", forwardPatch: [{ op: "replace", path: "/visualPlacements", value: editorState.visualPlacements }], inversePatch: [{ op: "replace", path: "/visualPlacements", value: beforeState.visualPlacements }], affectedPlacementIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], baseStateHash: hashEditorState(beforeState), resultStateHash: hashEditorState(editorState) }], checkpoints: [], undoStack: [entryId], redoStack: [], metadata: {} };
}

async function componentBasis(): Promise<HammerHistoryAtomicComponentBasis> {
  const values = { audio: { schema_version: 1, audio_edit: null }, editorial_authority: { schema_version: 1, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, authority: null }, transcript: { schema_version: 1, segments: [] }, visual_placements: beforeState.visualPlacements, visual_timeline: beforeState.visualTimeline } as const;
  const rows = await Promise.all(componentNames.map(async (component, index) => {
    const bytes = hammerHistoryAtomicInternals.encode(values[component]); const sha256 = await hammerHistoryAtomicInternals.sha256(bytes); const path = `hammer/revisions/${ids.revision}/${component}.json`; const updatedAt = `2026-08-19 14:00:0${index}.12345${index}+00`;
    return [component, { data: values[component], bytes, authority: { workpiece_id: ids.workpiece, path, sha256, bytes: bytes.byteLength, registry_revision: index + 1, registry_updated_at: updatedAt, content_type: "application/json" as const }, registry: { path, sha256, bytes: bytes.byteLength, revision: index + 1, updated_at: updatedAt, storage_bucket: "forge-workpieces", storage_key: `workpieces/${ids.workpiece}/${path}` } }] as const;
  }));
  return Object.fromEntries(rows) as HammerHistoryAtomicComponentBasis;
}

function projected(current: HammerHistoryAtomicComponentBasis, editorState: HammerEditorStateSerializable) {
  return Object.fromEntries(componentNames.map((component) => [component, component === "visual_placements" ? editorState.visualPlacements : current[component].data])) as Readonly<Record<(typeof componentNames)[number], unknown>>;
}

async function fixture(options: { conflictAt?: number; holdFirst?: boolean; legacyBase?: boolean } = {}) {
  let current = await componentBasis(); const componentHashes = Object.fromEntries(componentNames.map((component) => [component, current[component].registry.sha256])) as HammerHistoryEpochEnvelopeV1["base"]["component_sha256"];
  const registry = { path: anchorPath, sha256: "7".repeat(64), bytes: 100, revision: 9, updated_at: "2026-08-19 14:01:00.123456+00", storage_bucket: "forge-workpieces", storage_key: `workpieces/${ids.workpiece}/${anchorPath}` };
  const anchorDocument = document(beforeState); anchorDocument.headEntryId = null; anchorDocument.entries = []; anchorDocument.undoStack = [];
  const anchor: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" }> = { kind: "epoch_anchor", pointer: anchorPath, sequence: 0, document: anchorDocument, epoch: { schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: ids.epoch, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: componentHashes }, creation: { reason: "legacy_history_unrecoverable", created_at: "2026-08-19T14:01:00.123456Z", initiating_user_id: ids.user }, predecessor: { original_path: "legacy", archive_path: `hammer/revisions/${ids.revision}/history/archive/${"a".repeat(64)}.history.v1.json`, sha256: "a".repeat(64), bytes: 1, registry_revision: 1, registry_updated_at: "2026-08-19 14:00:00.123456+00" }, history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] }, boundary }, durable_basis: { revision_updated_at: "2026-08-19 14:01:00.654321+00", history_path: anchorPath, registry } };
  const requests: HammerHistoryAtomicRequest[] = []; const releases: Array<() => void> = []; let id = 10;
  const authority = createHammerHistoryEpochPersistenceAuthority({
    createId: () => `${String(id++).padStart(8, "0")}-0000-4000-8000-000000000000`, now: () => "2026-08-19T14:02:00.123456Z", initiatingUserId: () => ids.user,
    resolveComponents: async (editorState) => ({ current, projected: projected(current, editorState) }),
    commitAtomic: async ({ request }) => {
      requests.push(request); if (options.holdFirst && requests.length === 1) await new Promise<void>((resolve) => releases.push(resolve));
      if (options.conflictAt === requests.length) return { outcome: "conflict", code: "history_epoch_head_pointer_conflict", terminal: true, retryable: false };
      const nextRows = { ...current } as Record<string, HammerHistoryAtomicComponentBasis[(typeof componentNames)[number]]>;
      for (const change of request.component_changes) nextRows[change.component] = { data: JSON.parse(new TextDecoder().decode(change.serialized_bytes)), bytes: change.serialized_bytes, authority: { workpiece_id: ids.workpiece, path: change.path, sha256: change.next.sha256, bytes: change.next.bytes, registry_revision: change.next.revision, registry_updated_at: change.next.updated_at, content_type: "application/json" }, registry: { path: change.path, sha256: change.next.sha256, bytes: change.next.bytes, revision: change.next.revision, updated_at: change.next.updated_at, storage_bucket: change.next.storage_bucket, storage_key: change.next.storage_key } };
      current = nextRows as HammerHistoryAtomicComponentBasis;
      return { outcome: "committed", history_path: request.head.path, revision_updated_at: `2026-08-19 14:02:0${requests.length}.654321+00`, operation_fingerprint: request.operation_fingerprint, head_id: request.head.head_id, transition_id: `${String(80 + requests.length).padStart(8, "0")}-0000-4000-8000-000000000000` };
    },
  });
  authority.install(anchor, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision }, options.legacyBase ? { canonicalHash: "hammer-state:abcdef12", algorithm: "json-stringify-v0" } : undefined);
  return { authority, requests, releases, anchor, componentHashes };
}

test("anchor mutation atomically includes only the byte-changed placement component", async () => {
  const f = await fixture(); const result = await f.authority.enqueue(document(), afterState);
  assert.equal(result.outcome, "committed"); assert.deepEqual(f.requests[0]!.component_changes.map((change) => change.component), ["visual_placements"]);
  assert.equal(f.requests[0]!.parent.bytes, 100); assert.equal(f.requests[0]!.expected_revision_updated_at, "2026-08-19 14:01:00.654321+00"); assert.equal(f.requests[0]!.component_changes[0]!.expected.updated_at, "2026-08-19 14:00:03.123453+00"); assert.equal(f.authority.getState()!.basis.sequence, 1);
  assert.equal(f.requests[0]!.component_changes[0]!.next.updated_at, "2026-08-19T14:02:00.123456+00:00"); assert.equal(f.requests[0]!.head.registry_updated_at, "2026-08-19T14:02:00.123456+00:00");
});

test("overlapping mutations are single-flight and latest-pending uses the acknowledged parent", async () => {
  const f = await fixture({ holdFirst: true }); const first = f.authority.enqueue(document(), afterState); await waitUntil(() => f.releases.length === 1);
  const latestState = state(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]); const second = f.authority.enqueue(document(latestState), latestState); const third = f.authority.enqueue(document(latestState), latestState);
  assert.equal(f.requests.length, 1); f.releases[0]!(); await first; await second; await third;
  assert.equal(f.requests.length, 2); assert.equal(f.requests[1]!.parent.sequence, 1); assert.equal(f.requests[1]!.parent.path, f.requests[0]!.head.path); assert.equal(f.authority.getState()!.basis.sequence, 2);
});

test("overlapping equivalent autosaves share one atomic acknowledgement", async () => {
  const f = await fixture({ holdFirst: true }); const first = f.authority.enqueue(document(), afterState); await waitUntil(() => f.releases.length === 1);
  const second = f.authority.enqueue({ ...document(), updatedAt: "2026-08-19T14:02:01.123456Z" }, afterState); const third = f.authority.enqueue(document(), afterState); f.releases[0]!();
  assert.equal((await first).outcome, "committed"); assert.equal((await second).outcome, "committed"); assert.equal((await third).outcome, "committed"); assert.equal(f.requests.length, 1); assert.equal(f.authority.getState()!.basis.sequence, 1);
});

test("terminal conflict preserves the frozen durable basis and local operation", async () => {
  const f = await fixture({ conflictAt: 1 }); const before = structuredClone(f.authority.getState()!.basis); const result = await f.authority.enqueue(document(), afterState);
  assert.equal(result.outcome, "conflict"); assert.deepEqual(f.authority.getState()!.basis, before); assert.equal(f.authority.getState()!.lastConflict, "history_epoch_head_pointer_conflict");
});

test("reload invalidates an in-flight acknowledgement without installing its head", async () => {
  const f = await fixture({ holdFirst: true }); const operation = f.authority.enqueue(document(), afterState); await waitUntil(() => f.releases.length === 1);
  f.authority.install(f.anchor, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision }); f.releases[0]!(); assert.equal((await operation).outcome, "conflict"); assert.equal(f.authority.getState()!.basis.sequence, 0);
});

test("first atomic head after a verified legacy anchor preserves the dual hash boundary", async () => {
  const f = await fixture({ legacyBase: true }); const result = await f.authority.enqueue(document(), afterState);
  assert.equal(result.outcome, "committed"); assert.deepEqual(f.requests[0]!.envelope.base, { editor_state_hash: "hammer-state:1234abcd", component_sha256: f.componentHashes, hash_algorithm: "json-stringify-v0", canonical_editor_state_hash: "hammer-state:abcdef12" }); assert.equal((f.requests[0]!.envelope.result as { hash_algorithm: string }).hash_algorithm, HAMMER_EDITOR_STATE_HASH_ALGORITHM);
});

test("sequence-zero reopen, edit, reopen, undo, and redo preserve the atomic component chain", async () => {
  const f = await fixture({ legacyBase: true }); assert.equal((await f.authority.enqueue(document(), afterState)).outcome, "committed");
  const first = f.requests[0]!; const firstEnvelope = validateHammerHistoryEpochHeadEnvelope(first.envelope, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision, historyPath: first.head.path, revisionUpdatedAt: "2026-08-19 14:02:01.654321+00" });
  assert.ok(firstEnvelope); assert.equal(firstEnvelope.result.editor_state_hash, hashEditorState(afterState));
  const controller = createHammerHistoryController({ document: structuredClone(firstEnvelope.history), initialState: afterState });
  assert.ok(controller.undo()); assert.deepEqual(controller.getState(), beforeState); const undoResult = await bounded(f.authority.enqueue(controller.document, controller.getState()), "undo commit"); assert.equal(undoResult.outcome, "committed", JSON.stringify(undoResult));
  assert.ok(controller.redo()); assert.equal(hashEditorState(controller.getState()), hashEditorState(afterState)); assert.equal((await bounded(f.authority.enqueue(controller.document, controller.getState()), "redo commit")).outcome, "committed");
  assert.deepEqual(f.requests.map((request) => request.parent.sequence), [0, 1, 2]); assert.deepEqual(f.requests.map((request) => request.component_changes.map((change) => change.component)), [["visual_placements"], ["visual_placements"], ["visual_placements"]]);
  assert.equal(f.requests[1]!.component_changes[0]!.expected.storage_key, f.requests[0]!.component_changes[0]!.next.storage_key); assert.equal(f.requests[2]!.component_changes[0]!.expected.storage_key, f.requests[1]!.component_changes[0]!.next.storage_key);
  for (const request of f.requests) assert.ok(validateHammerHistoryEpochHeadEnvelope(request.envelope, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision, historyPath: request.head.path, revisionUpdatedAt: "2026-08-19 14:02:03.654321+00" }));
});

test("identical projected bytes are rejected before staging a meaningless head", async () => {
  const f = await fixture(); const result = await f.authority.enqueue(document(beforeState), beforeState);
  assert.deepEqual(result, { outcome: "conflict", code: "history_epoch_atomic_no_component_change", terminal: true, retryable: false }); assert.equal(f.requests.length, 0);
});

test("draft fingerprint binds parent byte count and every staged byte", async () => {
  const f = await fixture(); const basis = f.authority.getState()!.basis; const current = await componentBasis();
  const request = await buildHammerHistoryEpochCommitDraft({ document: document(), state: afterState, basis, headId: "99999999-9999-4999-8999-999999999999", idempotencyKey: "hammer-head:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-08-19T14:02:00.123456Z", initiatingUserId: ids.user, components: current, projectedComponents: projected(current, afterState) });
  const altered = structuredClone(request) as unknown as { parent: { bytes: number }; operation_fingerprint: string }; altered.parent.bytes += 1;
  assert.notEqual(await fingerprintHammerHistoryAtomicRequest(altered as never), request.operation_fingerprint);
});

test("authenticated atomic transport emits exact base64 fields and validates exact readback identity", async () => {
  const f = await fixture(); const current = await componentBasis(); const request = await buildHammerHistoryEpochCommitDraft({ document: document(), state: afterState, basis: f.authority.getState()!.basis, headId: "99999999-9999-4999-8999-999999999999", idempotencyKey: "hammer-head:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-08-19T14:02:00.123456Z", initiatingUserId: ids.user, components: current, projectedComponents: projected(current, afterState) });
  let body: Record<string, unknown> | null = null; const success = { outcome: "committed", history_path: request.head.path, revision_updated_at: "2026-08-19 14:02:01.654321+00", operation_fingerprint: request.operation_fingerprint, head_id: request.head.head_id, transition_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const fetcher = async (_url: string, options: { json?: unknown }) => { body = options.json as Record<string, unknown>; return new Response(JSON.stringify({ ok: true, data: success }), { status: 200 }); };
  assert.equal((await commitHammerHistoryAtomic({ workspaceId: ids.workspace, workpieceId: ids.workpiece, revisionId: ids.revision, request, fetcher: fetcher as never })).outcome, "committed");
  const wireHead = body!.head as Record<string, unknown>; assert.equal("serialized_bytes" in wireHead, false); assert.equal(typeof wireHead.serialized_bytes_base64, "string");
  const mismatch = await commitHammerHistoryAtomic({ workspaceId: ids.workspace, workpieceId: ids.workpiece, revisionId: ids.revision, request, fetcher: (async () => new Response(JSON.stringify({ ok: true, data: { ...success, operation_fingerprint: "f".repeat(64) } }), { status: 200 })) as never });
  assert.deepEqual(mismatch, { outcome: "conflict", code: "history_epoch_atomic_transport_ambiguous", terminal: true, retryable: false });
  const ambiguous = await commitHammerHistoryAtomic({ workspaceId: ids.workspace, workpieceId: ids.workpiece, revisionId: ids.revision, request, fetcher: (async () => new Response(JSON.stringify({ ok: true, data: { outcome: "ambiguous_unresolved", code: "history_epoch_atomic_commit_ambiguous", terminal: true, retryable: false } }), { status: 409 })) as never });
  assert.deepEqual(ambiguous, { outcome: "conflict", code: "history_epoch_atomic_commit_ambiguous", terminal: true, retryable: false });
});

test("component basis reads accept exact canonical and promoted authority but reject foreign lanes", async () => {
  const current = await componentBasis(); const paths = Object.fromEntries(componentNames.map((component) => [component, current[component].registry.path])) as Record<(typeof componentNames)[number], string>;
  const promotedOperation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const fetcher = async (url: string) => { const path = decodeURIComponent(new URL(url, "http://localhost").searchParams.get("path")!); const component = componentNames.find((name) => paths[name] === path)!; const row = current[component]; const storageKey = component === "visual_placements" ? `workpieces/${ids.workpiece}/hammer/staging/history-atomic/${promotedOperation}/${component}.json` : row.registry.storage_key; return new Response(JSON.stringify({ ok: true, data: row.data, file_row: { path, hash_algo: "sha256", hash_value: row.registry.sha256, bytes: row.registry.bytes, revision: row.registry.revision, updated_at: row.registry.updated_at, storage_bucket: "forge-workpieces", storage_key: storageKey } }), { status: 200 }); };
  const loaded = await loadHammerHistoryAtomicComponentBasis({ workpieceId: ids.workpiece, paths, fetcher: fetcher as never }); assert.equal(loaded.visual_placements.registry.storage_key.includes(promotedOperation), true);
  await assert.rejects(() => loadHammerHistoryAtomicComponentBasis({ workpieceId: ids.workpiece, paths, fetcher: (async (url: string) => { const response = await fetcher(url); const payload = await response.json() as { file_row: { storage_key: string } }; payload.file_row.storage_key = `workpieces/${ids.workpiece}/hammer/staging/history-atomic/${promotedOperation}/transcript.json`; return new Response(JSON.stringify(payload), { status: 200 }); }) as never }), /registry authority is invalid/);
});

test("legacy anchor acceptance requires exact reconstruction and pinned component authority", async () => {
  const canonical = beforeState; const legacy = Object.fromEntries(Object.entries(canonical).reverse()) as HammerEditorStateSerializable; const expectedHash = hashEditorStateLegacy(legacy); const current = await componentBasis();
  const hashes = Object.fromEntries(componentNames.map((key) => [key, current[key].registry.sha256])) as HammerHistoryEpochEnvelopeV1["base"]["component_sha256"]; const authority = Object.fromEntries(componentNames.map((key) => [key, current[key].authority])) as HammerHistoryComponentAuthority;
  assert.equal(hashEditorState(canonical), hashEditorState(legacy)); const accepted = await verifyEpochAnchorBaseHash({ expectedHash, canonicalState: canonical, legacyReconstruction: legacy, workpieceId: ids.workpiece, componentPaths: Object.fromEntries(componentNames.map((key) => [key, current[key].registry.path])) as never, componentHashes: hashes, loadComponentAuthority: async () => authority });
  assert.equal(accepted.ok, true); assert.equal(accepted.ok && accepted.match.algorithm, "json-stringify-v0"); const rejected = await verifyEpochAnchorBaseHash({ expectedHash: "hammer-state:00000000", canonicalState: canonical, legacyReconstruction: legacy, workpieceId: ids.workpiece, componentPaths: null, componentHashes: hashes }); assert.equal(rejected.ok, false);
});
