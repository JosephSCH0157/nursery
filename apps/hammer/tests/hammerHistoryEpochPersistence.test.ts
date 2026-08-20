import assert from "node:assert/strict";
import test from "node:test";
import { createHammerHistoryEpochPersistenceAuthority } from "../src/editor/hammerHistoryEpochPersistence";
import type { HammerEditorStateSerializable, HammerHistoryDocumentV1 } from "../src/editor/hammerWorkspaceHistory";
import type { HammerHistoryComponentAuthority, HammerHistoryEpochEnvelopeV1, HammerHistoryEpochHeadTransportRequest, HammerRevisionHistoryHydration } from "../src/lib/hammerHistoryEpochApi";
import { verifyEpochAnchorBaseHash } from "../src/editor/hammerHistoryHashCompatibility";
import { hashEditorState, hashEditorStateLegacy } from "../src/editor/hammerWorkspaceHistory";

const ids = { workspace: "11111111-1111-4111-8111-111111111111", workpiece: "22222222-2222-4222-8222-222222222222", recording: "33333333-3333-4333-8333-333333333333", revision: "44444444-4444-4444-8444-444444444444", epoch: "55555555-5555-4555-8555-555555555555", user: "66666666-6666-4666-8666-666666666666" };
const hashes = Object.fromEntries(["audio", "editorial_authority", "transcript", "visual_placements", "visual_timeline"].map((key, index) => [key, String(index + 1).repeat(64)])) as HammerHistoryEpochEnvelopeV1["base"]["component_sha256"];
const components = Object.fromEntries(Object.keys(hashes).map((key, index) => [key, { workpiece_id: ids.workpiece, path: `hammer/revisions/${ids.revision}/${key}.json`, sha256: String(index + 4).repeat(64).slice(0, 64), bytes: 20 + index, registry_revision: index + 1, registry_updated_at: `2026-08-19T14:00:0${index}.12345${index}Z`, content_type: "application/json" }])) as HammerHistoryComponentAuthority;
const anchorPath = `hammer/revisions/${ids.revision}/history/epochs/${ids.epoch}.v1.json`;
const registry = (path: string, sequence = 0) => ({ path, sha256: String(sequence + 7).repeat(64).slice(0, 64), bytes: 100 + sequence, revision: 9 + sequence, updated_at: `2026-08-19T14:01:0${sequence}.123456Z`, storage_bucket: "forge-workpieces", storage_key: `workpieces/${ids.workpiece}/${path}` });
const state = (playheadSec = 0): HammerEditorStateSerializable => ({ transcriptSegments: [], visualPlacements: null, visualTimeline: null, audioEdit: null, studioRack: { schema_version: 1, modules: [] } as never, editorialAuthorityGraph: null as never, outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: null, playheadSec, transcriptTimingHint: null });
const document = (): HammerHistoryDocumentV1 => ({ version: 1, workpieceId: ids.workpiece, sessionId: `epoch:${ids.epoch}`, baseRevisionId: "hammer-state:1234abcd", createdAt: "2026-08-19T14:01:00.123456Z", updatedAt: "2026-08-19T14:02:00.123456Z", headEntryId: null, entries: [], checkpoints: [], undoStack: [], redoStack: [], metadata: {} });
const boundary = { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." } as const;
const anchor: Extract<HammerRevisionHistoryHydration, { kind: "epoch_anchor" }> = { kind: "epoch_anchor", pointer: anchorPath, sequence: 0, document: document(), epoch: { schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: ids.epoch, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, base: { editor_state_hash: "hammer-state:1234abcd", component_sha256: hashes }, creation: { reason: "legacy_history_unrecoverable", created_at: "2026-08-19T14:01:00.123456Z", initiating_user_id: ids.user }, predecessor: { original_path: "legacy", archive_path: `hammer/revisions/${ids.revision}/history/archive/${"a".repeat(64)}.history.v1.json`, sha256: "a".repeat(64), bytes: 1, registry_revision: 1, registry_updated_at: "2026-08-19T14:00:00.123456Z" }, history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] }, boundary }, durable_basis: { revision_updated_at: "2026-08-19T14:01:00.654321Z", history_path: anchorPath, registry: registry(anchorPath) } };

function fixture(options: { conflictAt?: number; holdFirst?: boolean; legacyBase?: boolean } = {}) {
  const requests: HammerHistoryEpochHeadTransportRequest[] = []; const releases: Array<() => void> = []; let id = 10;
  const authority = createHammerHistoryEpochPersistenceAuthority({
    createId: () => `${String(id++).padStart(8, "0")}-0000-4000-8000-000000000000`, now: () => "2026-08-19T14:02:00.123456Z", initiatingUserId: () => ids.user, resolveComponentAuthority: async () => components,
    commitHead: async ({ request }) => { requests.push(request); if (options.holdFirst && requests.length === 1) await new Promise<void>((resolve) => releases.push(resolve)); if (options.conflictAt === requests.length) return { outcome: "conflict", code: "history_epoch_head_pointer_conflict", terminal: true, retryable: false }; return { outcome: "committed", history_path: request.head_path, revision_updated_at: `2026-08-19T14:02:0${requests.length}.654321Z`, operation_fingerprint: "f".repeat(64), head_id: request.envelope.head_id, transition_id: `${String(80 + requests.length).padStart(8, "0")}-0000-4000-8000-000000000000` }; },
    loadHydration: async (input) => { const request = requests.at(-1)!; return { ok: true, status: 200, hydration: { kind: "epoch_head", pointer: input.historyPath, epoch_id: ids.epoch, head_id: request.envelope.head_id, sequence: request.envelope.sequence, document: request.envelope.history, parent: request.envelope.parent, epoch_anchor: request.envelope.epoch_anchor, base: request.envelope.base, result: request.envelope.result, boundary, durable_basis: { revision_updated_at: input.revisionUpdatedAt, history_path: input.historyPath, registry: registry(input.historyPath, request.envelope.sequence) } } } as const; },
  });
  authority.install(anchor, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision }, options.legacyBase ? { canonicalHash: "hammer-state:abcdef12", algorithm: "json-stringify-v0" } : undefined);
  return { authority, requests, releases };
}

test("anchor first edit and overlapping later edit serialize against acknowledged parents", async () => {
  const f = fixture({ holdFirst: true }); const first = f.authority.enqueue(document(), state(1)); const second = f.authority.enqueue(document(), state(2));
  await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(f.requests.length, 1); assert.equal(f.requests[0]!.expected_parent.sequence, 0); assert.equal(f.requests[0]!.expected_history_path, anchorPath);
  f.releases[0]!(); await first; await second;
  assert.equal(f.requests[1]!.expected_parent.sequence, 1); assert.equal(f.requests[1]!.expected_history_path, f.requests[0]!.head_path); assert.notEqual(f.requests[1]!.envelope.head_id, f.requests[0]!.envelope.head_id); assert.equal(f.authority.getState()!.basis.sequence, 2);
});

test("terminal conflict leaves durable basis unchanged and local state pending", async () => {
  const f = fixture({ conflictAt: 1 }); const before = structuredClone(f.authority.getState()!.basis); const result = await f.authority.enqueue(document(), state(1));
  assert.equal(result.outcome, "conflict"); assert.deepEqual(f.authority.getState()!.basis, before); assert.equal(f.authority.getState()!.lastConflict, "history_epoch_head_pointer_conflict");
});

test("reload invalidates an in-flight operation without installing a false durable head", async () => {
  const f = fixture({ holdFirst: true }); const operation = f.authority.enqueue(document(), state(1)); await new Promise((resolve) => setTimeout(resolve, 0));
  f.authority.install(anchor, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision }); f.releases[0]!(); assert.equal((await operation).outcome, "conflict"); assert.equal(f.authority.getState()!.basis.sequence, 0);
});

test("first head after a verified legacy anchor records an unambiguous canonical boundary", async () => {
  const f = fixture({ legacyBase: true });
  const result = await f.authority.enqueue(document(), state(1));
  assert.equal(result.outcome, "committed");
  assert.deepEqual(f.requests[0]!.envelope.base, {
    editor_state_hash: "hammer-state:1234abcd",
    component_sha256: hashes,
    hash_algorithm: "json-stringify-v0",
    canonical_editor_state_hash: "hammer-state:abcdef12",
  });
  assert.equal(f.requests[0]!.envelope.result.hash_algorithm, "canonical-json-v1");
  assert.equal(f.authority.getState()!.basis.canonicalEpochBaseHash, "hammer-state:abcdef12");
});

test("legacy anchor acceptance requires exact legacy reconstruction and pinned component authority", async () => {
  const canonical = state(0);
  const legacy = Object.fromEntries(Object.entries(canonical).reverse()) as HammerEditorStateSerializable;
  const expectedHash = hashEditorStateLegacy(legacy);
  const matchingComponents = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, { ...value, sha256: hashes[key as keyof typeof hashes] }])) as HammerHistoryComponentAuthority;
  assert.equal(hashEditorState(canonical), hashEditorState(legacy));
  const accepted = await verifyEpochAnchorBaseHash({ expectedHash, canonicalState: canonical, legacyReconstruction: legacy,
    workpieceId: ids.workpiece, componentPaths: Object.fromEntries(Object.keys(hashes).map((key) => [key, components[key as keyof typeof components].path])) as never,
    componentHashes: hashes, loadComponentAuthority: async () => matchingComponents });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.ok && accepted.match.algorithm, "json-stringify-v0");

  const forged = await verifyEpochAnchorBaseHash({ expectedHash: "hammer-state:00000000", canonicalState: canonical,
    legacyReconstruction: legacy, workpieceId: ids.workpiece, componentPaths: null, componentHashes: hashes });
  assert.equal(forged.ok, false);
  const drifted = structuredClone(matchingComponents) as Record<string, { sha256: string }>;
  drifted.audio!.sha256 = "f".repeat(64);
  const rejected = await verifyEpochAnchorBaseHash({ expectedHash, canonicalState: canonical, legacyReconstruction: legacy,
    workpieceId: ids.workpiece, componentPaths: Object.fromEntries(Object.keys(hashes).map((key) => [key, components[key as keyof typeof components].path])) as never,
    componentHashes: hashes, loadComponentAuthority: async () => drifted as HammerHistoryComponentAuthority });
  assert.equal(rejected.ok, false);
});
