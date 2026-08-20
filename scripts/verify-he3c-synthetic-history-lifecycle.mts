import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createTongsCommitService } from "../packages/tongs/src/workpiece-commit-api.ts";
import { serializeHammerRevisionEditorialAuthorityArtifact } from "../apps/hammer/src/persistence/hammerRevisionEditorialAuthorityWriter.ts";
import { createEmptyVisualTimelineState } from "../apps/hammer/src/visuals/model/hammerVisualDefaults.ts";
import { createDefaultHammerStudioRackState } from "../apps/hammer/src/editor/hammerStudioRack.ts";
import { createHammerHistoryController, hashEditorState, type HammerEditorStateSerializable, type HammerHistoryDocumentV1 } from "../apps/hammer/src/editor/hammerWorkspaceHistory.ts";
import { buildHammerHistoryEpochRequest, loadHammerHistoryComponentAuthority, loadHammerRevisionHistoryHydration, serializeHammerHistoryEpochEnvelope, startHammerHistoryEpoch, type HammerHistoryComponentPaths, type HammerHistoryEpochEnvelopeV1 } from "../apps/hammer/src/lib/hammerHistoryEpochApi.ts";
import { createHammerHistoryEpochPersistenceAuthority, startAndHydrateHammerHistoryEpoch } from "../apps/hammer/src/editor/hammerHistoryEpochPersistence.ts";

const projectId = process.env.FORGE_DISPOSABLE_PROJECT_ID ?? "";
const workdir = process.env.FORGE_DISPOSABLE_WORKDIR ?? "";
const apiPort = Number(process.env.FORGE_HE3C_TONGS_PORT ?? "57560");
const root = fileURLToPath(new URL("..", import.meta.url));
assert.match(projectId, /^forge-he3-[a-z0-9-]+$/);
assert.ok(workdir.includes(projectId));
assert.notEqual(projectId, "nursery");
assert.notEqual(projectId, "wtvdjndyxegudufrompx");
assert.ok(Number.isInteger(apiPort) && apiPort > 20000 && apiPort < 65535);

const ids = Object.freeze({
  workspace: "a3100000-0000-4000-8000-000000000001",
  otherWorkspace: "a3200000-0000-4000-8000-000000000002",
  workpiece: "a3300000-0000-4000-8000-000000000003",
  recording: "a3400000-0000-4000-8000-000000000004",
  revision: "a3500000-0000-4000-8000-000000000005",
  epoch: "a3600000-0000-4000-8000-000000000006",
  head: "a3700000-0000-4000-8000-000000000007",
  graph: "a3800000-0000-4000-8000-000000000008",
  transcript: "a3900000-0000-4000-8000-000000000009",
});
const forbidden = Object.freeze([
  "wtvdjndyxegudufrompx", "494c2ae5-9037-4208-b898-fab4898ab430",
  "85d076d6-54e6-4b56-ab60-5eff4c87cdd0", "6c5b0d00-f775-4611-ac67-284dd9ae7d39",
  "f642b5d9-cec2-4656-804e-49bb33bc0cb5", "93dacc5a-e9f0-41f8-bc58-0b6ab9b199c2",
]);
for (const value of Object.values(ids)) assert.ok(!forbidden.includes(value));

const fixed = Object.freeze({
  created: "2026-08-20T10:00:00.123456Z",
  registry: "2026-08-20T10:00:01.654321Z",
  revision: "2026-08-20T10:00:02.987654Z",
  edited: "2026-08-20T10:01:00.111222Z",
});
const paths = Object.freeze({
  transcript: `hammer/revisions/${ids.revision}/transcript.revision.v1.json`,
  visual_timeline: `hammer/revisions/${ids.revision}/visual-timeline.v1.json`,
  visual_placements: `hammer/revisions/${ids.revision}/visual-placements.v1.json`,
  audio: `hammer/revisions/${ids.revision}/audio-polish.v1.json`,
  editor_session: `hammer/revisions/${ids.revision}/editor-session.v1.json`,
  editorial_authority: `hammer/revisions/${ids.revision}/editorial-authority.v1.json`,
  history: `hammer/revisions/${ids.revision}/history.v1.json`,
});

function localEnv(): Record<string, string> {
  const text = execFileSync("supabase", ["status", "--workdir", workdir, "-o", "env"], { encoding: "utf8" });
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => { const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim()); return match ? [[match[1], match[2]]] : []; }));
}
function assertLoopback(raw: string): URL {
  for (const value of forbidden) assert.ok(!raw.includes(value), `forbidden identity/host in request: ${value}`);
  const url = new URL(raw);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname), `non-loopback request refused: ${url.origin}`);
  return url;
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, child) => child && typeof child === "object" && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonical(value));
const sha = (value: Uint8Array): string => crypto.createHash("sha256").update(value).digest("hex");

async function principal(admin: SupabaseClient, apiUrl: string, anonKey: string, label: string) {
  const email = `he3c-${label}@example.invalid`; const password = `HE3c-${label}-Only-2026!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error); assert.ok(created.data.user);
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error); assert.ok(signed.data.session);
  return { id: created.data.user.id, token: signed.data.session.access_token, email, password };
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) { try { const response = await fetch(url); if (response.status > 0) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error("local Tongs server did not start");
}
function startServer(env: Record<string, string>): ChildProcess {
  assertLoopback(env.API_URL); const host = "127.0.0.1";
  return spawn(process.execPath, [fileURLToPath(new URL("../packages/tongs/dev/commit-api-server.mjs", import.meta.url))], { cwd: root, env: { ...process.env, TONGS_SUPABASE_URL: env.API_URL, TONGS_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY, TONGS_ALLOW_UNSAFE_NO_TOKEN: "1", TONGS_API_HOST: host, TONGS_API_PORT: String(apiPort) }, stdio: ["ignore", "pipe", "pipe"] });
}

async function main() {
  const env = localEnv(); const supabaseUrl = assertLoopback(env.API_URL).origin;
  assert.ok(env.ANON_KEY && env.SERVICE_ROLE_KEY);
  const tongsOrigin = assertLoopback(`http://127.0.0.1:${apiPort}`).origin;
  const admin = createClient(supabaseUrl, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await principal(admin, supabaseUrl, env.ANON_KEY, "owner");
  const viewer = await principal(admin, supabaseUrl, env.ANON_KEY, "viewer");
  const outsider = await principal(admin, supabaseUrl, env.ANON_KEY, "outsider");
  const org = await admin.schema("tongs").from("orgs").insert({ name: "HE-3C Synthetic Org", created_by: owner.id }).select("id").single(); assert.ifError(org.error);
  const otherOrg = await admin.schema("tongs").from("orgs").insert({ name: "HE-3C Other Org", created_by: outsider.id }).select("id").single(); assert.ifError(otherOrg.error);
  assert.ifError((await admin.schema("tongs").from("workspaces").insert([{ id: ids.workspace, name: "HE-3C Synthetic", created_by: owner.id, org_id: org.data.id }, { id: ids.otherWorkspace, name: "HE-3C Cross", created_by: outsider.id, org_id: otherOrg.data.id }])).error);
  assert.ifError((await admin.schema("tongs").from("workspace_members").upsert([{ workspace_id: ids.workspace, user_id: owner.id, role: "owner", created_by: owner.id }, { workspace_id: ids.workspace, user_id: viewer.id, role: "viewer", created_by: owner.id }, { workspace_id: ids.otherWorkspace, user_id: outsider.id, role: "owner", created_by: outsider.id }])).error);
  assert.ifError((await admin.schema("tongs").from("episodes").insert({ id: ids.workpiece, workspace_id: ids.workspace, label: "HE-3 Synthetic Divergent History" })).error);
  assert.ifError((await admin.schema("tongs").from("canonical_recordings").insert({ id: ids.recording, workspace_id: ids.workspace, workpiece_id: ids.workpiece, status: "sealed", media_path: "synthetic/he3c.wav", media_id: "synthetic:he3c", created_by: owner.id, updated_by: owner.id, sealed_at: fixed.created })).error);

  const transcriptSegments = [{ id: "synthetic-segment-1", start: 0, end: 4, text: "Synthetic history begins here.", speaker: "Synthetic Host" }] as never[];
  const timeline = createEmptyVisualTimelineState({ updated_at: fixed.created });
  const placements = { version: 1, workpiece_id: ids.workpiece, placements: [], uncertainty_flags: [] };
  const audio = { version: 1, workpiece_id: ids.workpiece, cuts: [], gain_db: 0 };
  const session = { schema_version: 1, workpiece_id: ids.workpiece, recording_revision_id: ids.revision, playhead_sec: 0 };
  const authority = { schema_version: 1 as const, graph_id: ids.graph, graph_version: 1, workspace_id: ids.workspace, workpiece_id: ids.workpiece, session_id: "synthetic-session", source_transcript_id: ids.transcript, operation_order: [], operations: [], created_at: fixed.created, updated_at: fixed.created };
  const authorityBytes = serializeHammerRevisionEditorialAuthorityArtifact({ schema_version: 1, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, authority });
  const state: HammerEditorStateSerializable = { transcriptSegments: transcriptSegments as never, visualPlacements: placements as never, visualTimeline: timeline, audioEdit: audio as never, studioRack: createDefaultHammerStudioRackState(), editorialAuthorityGraph: authority, outputSelection: { layerId: null, sourceRecipeRef: null }, selectedSegmentId: null, playheadSec: 0, transcriptTimingHint: null };
  const baseHash = hashEditorState(state);
  const reverseObjectKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseObjectKeys)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).reverse().map((key) => [key, reverseObjectKeys((value as Record<string, unknown>)[key])])) : value;
  const reorderedReopenState = { ...state, visualTimeline: reverseObjectKeys(state.visualTimeline) as typeof state.visualTimeline };
  assert.equal(hashEditorState(reorderedReopenState), baseHash);
  const history: HammerHistoryDocumentV1 = { version: 1, workpieceId: ids.workpiece, sessionId: "synthetic-divergent-session", baseRevisionId: "hammer-state:deadbeef", createdAt: fixed.created, updatedAt: fixed.created, headEntryId: "synthetic-entry-1", entries: [{ id: "synthetic-entry-1", parentEntryId: null, timestamp: fixed.created, kind: "editor_state_change", label: "Synthetic divergent edit", forwardPatch: [{ op: "replace", path: "/playheadSec", value: 1 }], inversePatch: [{ op: "replace", path: "/playheadSec", value: 0 }], baseStateHash: "hammer-state:bad0cafe", resultStateHash: "hammer-state:bad0caff" }], checkpoints: [], undoStack: ["synthetic-entry-1"], redoStack: [], metadata: {} };
  const seeded = new Map<string, Uint8Array>([[paths.transcript, bytes({ schema_version: 1, transcript_id: ids.transcript, workpiece_id: ids.workpiece, segments: transcriptSegments })], [paths.visual_timeline, bytes(timeline)], [paths.visual_placements, bytes(placements)], [paths.audio, bytes(audio)], [paths.editor_session, bytes(session)], [paths.editorial_authority, authorityBytes], [paths.history, bytes(history)]]);
  const service = createTongsCommitService({ supabaseUrl, supabaseServiceRoleKey: env.SERVICE_ROLE_KEY });
  for (const [path, content] of seeded) await service.commitFile(ids.workpiece, { path, content_type: "application/json", text: new TextDecoder().decode(content), written_by: { tool: "hammer", tool_version: "he3c", lane: "synthetic-fixture" }, user_access_token: owner.token, event_name: "hammer.synthetic.fixture.saved.v1", correlation_id: `he3c:${path}` });
  const rows = await admin.schema("tongs").from("workpiece_files").select("path,hash_value,bytes,revision,updated_at,storage_bucket,storage_key").eq("workpiece_id", ids.workpiece); assert.ifError(rows.error);
  for (const row of rows.data) assert.ifError((await admin.schema("tongs").from("workpiece_files").update({ updated_at: fixed.registry }).eq("workpiece_id", ids.workpiece).eq("path", row.path)).error);
  const authorityHash = sha(authorityBytes);
  assert.ifError((await admin.schema("tongs").from("recording_revisions").insert({ id: ids.revision, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, status: "active", label: "HE-3C", editor_session_path: paths.editor_session, revision_transcript_path: paths.transcript, audio_polish_path: paths.audio, visual_timeline_path: paths.visual_timeline, visual_placements_path: paths.visual_placements, history_path: paths.history, editorial_authority_path: paths.editorial_authority, editorial_authority_fingerprint: authorityHash, editorial_authority_revision: 1, created_by: owner.id, updated_by: owner.id, updated_at: fixed.revision })).error);
  assert.ifError((await admin.schema("tongs").from("episodes").update({ canonical_recording_id: ids.recording, active_revision_id: ids.revision }).eq("id", ids.workpiece)).error);
  const persistedRevision = await admin.schema("tongs").from("recording_revisions").select("updated_at").eq("id", ids.revision).single();
  assert.ifError(persistedRevision.error); assert.equal(typeof persistedRevision.data.updated_at, "string");

  const server = startServer(env); const serverErrors: string[] = []; server.stderr?.on("data", (chunk) => serverErrors.push(String(chunk)));
  try {
    await waitForServer(`${tongsOrigin}/health`);
    const requestLog: Array<{ method: string; url: string }> = [];
    const request = async (urlOrPath: string, token: string | null, init: RequestInit & { json?: unknown } = {}) => { const url = assertLoopback(urlOrPath.startsWith("http") ? urlOrPath : `${tongsOrigin}${urlOrPath}`); const method = init.method ?? "GET"; requestLog.push({ method, url: url.toString() }); const headers = new Headers(init.headers); if (token) headers.set("x-forge-user-authorization", `Bearer ${token}`); if (init.json !== undefined) headers.set("content-type", "application/json"); return fetch(url, { ...init, headers, body: init.json === undefined ? init.body : JSON.stringify(init.json) }); };
    for (const [path, expected] of seeded) {
      for (const who of [owner, viewer]) { const response = await request(`/tongs/workpieces/${ids.workpiece}/read-file?path=${encodeURIComponent(path)}&encoding=base64`, who.token); assert.equal(response.status, 200); const body = await response.json(); const downloaded = Buffer.from(body.data.bytes_base64, "base64"); assert.deepEqual(downloaded, Buffer.from(expected)); }
      assert.equal((await request(`/tongs/workpieces/${ids.workpiece}/read-file?path=${encodeURIComponent(path)}&encoding=base64`, null)).status, 401);
      assert.equal((await request(`/tongs/workpieces/${ids.workpiece}/read-file?path=${encodeURIComponent(path)}&encoding=base64`, outsider.token)).status, 403);
    }
    const hammerFetcher = (token: string) => async (url: string, options: { method?: string; json?: unknown; timeoutMs?: number } = {}) => request(url, token, { method: options.method, json: options.json });
    const componentPaths: HammerHistoryComponentPaths = { audio: paths.audio, editorial_authority: paths.editorial_authority, transcript: paths.transcript, visual_placements: paths.visual_placements, visual_timeline: paths.visual_timeline };
    const ownerFetch = hammerFetcher(owner.token);
    const componentAuthority = await loadHammerHistoryComponentAuthority({ workpieceId: ids.workpiece, paths: componentPaths, fetcher: ownerFetch as never });
    const componentHashes = Object.fromEntries(Object.entries(componentAuthority).map(([key, value]) => [key, value.sha256])) as never;
    const historyRow = (await admin.schema("tongs").from("workpiece_files").select("path,hash_value,bytes,revision,updated_at").eq("workpiece_id", ids.workpiece).eq("path", paths.history).single()).data!;
    const epoch: HammerHistoryEpochEnvelopeV1 = { schema: "forge.hammer-history-epoch", schema_version: 1, epoch_id: ids.epoch, workspace_id: ids.workspace, workpiece_id: ids.workpiece, canonical_recording_id: ids.recording, recording_revision_id: ids.revision, base: { editor_state_hash: baseHash, component_sha256: componentHashes }, creation: { reason: "legacy_history_unrecoverable", created_at: fixed.edited, initiating_user_id: owner.id }, predecessor: { original_path: paths.history, archive_path: `hammer/revisions/${ids.revision}/history/archive/${historyRow.hash_value}.history.v1.json`, sha256: historyRow.hash_value, bytes: historyRow.bytes, registry_revision: historyRow.revision, registry_updated_at: historyRow.updated_at }, history: { entries: [], undo_stack: [], redo_stack: [], checkpoints: [] }, boundary: { prior_history_status: "unavailable", merged: false, traversable: false, statement: "Prior undo history is unavailable and was not merged into this epoch." } };
    assert.equal(serializeHammerHistoryEpochEnvelope(structuredClone(epoch)), serializeHammerHistoryEpochEnvelope(epoch));
    const epochRequest = buildHammerHistoryEpochRequest({ canonical_recording_id: ids.recording, idempotency_key: "hammer-epoch:he3c-deterministic-0001", expected_revision_updated_at: persistedRevision.data.updated_at, expected_history_path: paths.history, expected_predecessor: { revision: historyRow.revision, updated_at: historyRow.updated_at, sha256: historyRow.hash_value, bytes: historyRow.bytes }, envelope: epoch });
    const transition = await startHammerHistoryEpoch({ workspaceId: ids.workspace, workpieceId: ids.workpiece, revisionId: ids.revision, request: epochRequest, fetcher: ownerFetch as never }); assert.equal(transition.outcome, "committed", JSON.stringify(transition));
    const persistence = createHammerHistoryEpochPersistenceAuthority({ createId: (() => { const values = [ids.head, "a3a00000-0000-4000-8000-00000000000a"]; return () => values.shift()!; })(), now: () => fixed.edited, initiatingUserId: () => owner.id, resolveComponentAuthority: () => loadHammerHistoryComponentAuthority({ workpieceId: ids.workpiece, paths: componentPaths, fetcher: ownerFetch as never }), commitHead: (args) => import("../apps/hammer/src/lib/hammerHistoryEpochApi.ts").then(({ commitHammerHistoryEpochHead }) => commitHammerHistoryEpochHead({ ...args, fetcher: ownerFetch as never })), loadHydration: (args) => loadHammerRevisionHistoryHydration({ ...args, fetcher: ownerFetch as never }), startEpoch: (args) => startHammerHistoryEpoch({ ...args, fetcher: ownerFetch as never }) });
    const installed = await startAndHydrateHammerHistoryEpoch({ persistence, request: epochRequest, canonicalState: reorderedReopenState, maxUndoSteps: 100, loadHydration: (args) => loadHammerRevisionHistoryHydration({ ...args, fetcher: ownerFetch as never }) }); assert.equal(installed.result.outcome, "already_committed"); assert.ok(installed.controller && installed.hydration); persistence.install(installed.hydration!, { workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision });
    const controller = installed.controller!; assert.equal(controller.document.entries.length, 0); assert.equal(controller.canUndo(), false);
    const editedState = { ...controller.getState(), playheadSec: 2 };
    controller.applyMutation({ label: "Synthetic playhead edit", kind: "editor_state_change", nextState: editedState });
    const headResult = await persistence.enqueue(controller.document, controller.getState()); assert.equal(headResult.outcome, "committed", JSON.stringify(headResult));
    const revision = (await admin.schema("tongs").from("recording_revisions").select("history_path,updated_at").eq("id", ids.revision).single()).data!;
    const reopened = await loadHammerRevisionHistoryHydration({ workspaceId: ids.workspace, workpieceId: ids.workpiece, canonicalRecordingId: ids.recording, revisionId: ids.revision, historyPath: revision.history_path, revisionUpdatedAt: revision.updated_at, fetcher: ownerFetch as never }); assert.ok(reopened.ok && reopened.hydration.kind === "epoch_head");
    const reopenedController = createHammerHistoryController({ document: reopened.ok ? reopened.hydration.document : history, initialState: controller.getState(), maxUndoSteps: 100 }); assert.equal(reopenedController.canUndo(), true); reopenedController.undo(); assert.equal(reopenedController.getState().playheadSec, 0); assert.equal(reopenedController.canRedo(), true); reopenedController.redo(); assert.equal(reopenedController.getState().playheadSec, 2);
    assert.ok(requestLog.every((entry) => ["127.0.0.1", "localhost", "::1"].includes(new URL(entry.url).hostname))); assert.ok(requestLog.every((entry) => forbidden.every((value) => !entry.url.includes(value))));
    const finalRows = await admin.schema("tongs").from("workpiece_files").select("path,hash_value,bytes,revision,updated_at").eq("workpiece_id", ids.workpiece).order("path"); assert.ifError(finalRows.error);
    const evidence = { schema: "forge.he3c-synthetic-history-lifecycle.v1", project_id: projectId, identities: ids, principals: { owner: owner.id, viewer: viewer.id, outsider: outsider.id }, artifact_manifest: finalRows.data, initial_editor_state_hash: baseHash, reordered_reopen_state_hash: hashEditorState(reorderedReopenState), legacy_history: { path: paths.history, divergent: true, declared_base: history.baseRevisionId, entry_base: history.entries[0].baseStateHash }, authenticated_reads: { editor: "allowed", viewer: "allowed", anonymous: "denied", cross_workspace: "denied", byte_exact_artifacts: seeded.size }, lifecycle: { archive_anchor: transition.outcome, empty_anchor_entries: 0, head_commit: headResult.outcome, reopen: "epoch_head", undo_playhead: 0, redo_playhead: 2 }, request_count: requestLog.length, loopback_only: true, forbidden_identity_hits: 0, server_errors: serverErrors };
    console.log(JSON.stringify(evidence, null, 2));
  } finally { server.kill("SIGTERM"); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
