import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BROWSER_FIXTURE_NAMESPACE,
  BROWSER_FIXTURE_SCHEMA,
  assertNonProductionTarget,
  deterministicFixtureUuid,
  sanitizeFixtureDiagnostic,
  validateBrowserFixtureManifest,
  verifyBrowserFixtureRecords,
  createFixtureArtifactReader,
  type BrowserFixtureManifest,
} from "../scripts/browser-fixture-authority.mts";

function verifierFixture() {
  const id = (key: string) => deterministicFixtureUuid(`local:${key}`);
  const manifest: BrowserFixtureManifest = { schema_version: BROWSER_FIXTURE_SCHEMA, fixture_namespace: BROWSER_FIXTURE_NAMESPACE, project_ref: "local", user_id: id("user"), org_id: id("org"), workspace_id: id("workspace"), hearth_workpiece_id: id("hearth"), ready_workpiece_ids: [id("ready:1"), id("ready:2")], hammer_workpiece_id: id("hammer"), hammer_recording_id: id("hammer:recording"), hammer_revision_id: id("hammer:revision"), artifact_hashes: {}, provisioned_at: new Date(0).toISOString(), verified_at: null };
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const media = Buffer.from("synthetic fixture media");
  const recording = { id: manifest.hammer_recording_id, workspace_id: manifest.workspace_id, workpiece_id: manifest.hammer_workpiece_id, media_id: "fixture-media", media_path: "recordings/browser-fixture.wav", media_signature: hash(media), media_bytes: media.length, media_duration_ms: 30000, status: "sealed", sealed_at: "2026-09-01T00:00:00Z", baseline_transcript_path: "hammer/transcript.json" };
  const revision = { id: manifest.hammer_revision_id, workspace_id: manifest.workspace_id, workpiece_id: manifest.hammer_workpiece_id, canonical_recording_id: manifest.hammer_recording_id, status: "active", revision_transcript_path: recording.baseline_transcript_path, editor_session_path: "hammer/editor.json", audio_polish_path: "hammer/audio.json", visual_timeline_path: "hammer/visual.json", visual_placements_path: "hammer/placements.json", history_path: "hammer/history.json", editorial_authority_path: "hammer/authority.json" };
  const transcript = { media_id: recording.media_id, media_signature: recording.media_signature, source_media_ref: { media_id: recording.media_id, sha256: recording.media_signature, cloud_uri: recording.media_path, byte_size: recording.media_bytes, duration_ms: recording.media_duration_ms }, segments: Array.from({ length: 8 }, (_, index) => ({ segment_id: `segment-${index}` })) };
  const membership = { user_id: manifest.user_id, workspace_id: manifest.workspace_id, role: "owner" };
  const episodes = [manifest.hearth_workpiece_id, ...manifest.ready_workpiece_ids, manifest.hammer_workpiece_id].map((workpieceId) => ({ id: workpieceId, workspace_id: manifest.workspace_id, canonical_recording_id: workpieceId === manifest.hammer_workpiece_id ? recording.id : null, active_revision_id: workpieceId === manifest.hammer_workpiece_id ? revision.id : null }));
  const tables: Record<string, Array<Record<string, unknown>>> = { account_balances: [{ user_id: manifest.user_id, plan_item_id: "creator", plan_entitled: true }], workspace_members: [membership], episodes, current_workpiece_ready_scripts: manifest.ready_workpiece_ids.map((workpieceId) => ({ workspace_id: manifest.workspace_id, workpiece_id: workpieceId, script_path: "script/script.md" })), recording_revisions: [revision], canonical_recordings: [recording], workpiece_files: [] };
  const objects = new Map<string, Buffer>();
  function artifact(workpieceId: string, filePath: string, bytes: Buffer) {
    const storageKey = `workpieces/${workpieceId}/${filePath}`;
    const row = { workpiece_id: workpieceId, path: filePath, storage_bucket: "forge-workpieces", storage_key: storageKey, hash_algo: "sha256", hash_value: hash(bytes), bytes: bytes.length };
    const previous = tables.workpiece_files.findIndex((file) => file.storage_key === storageKey);
    if (previous === -1) tables.workpiece_files.push(row); else tables.workpiece_files[previous] = row;
    manifest.artifact_hashes[`${workpieceId}:${filePath}`] = row.hash_value;
    objects.set(storageKey, bytes);
  }
  for (const workpieceId of [manifest.hearth_workpiece_id, ...manifest.ready_workpiece_ids]) artifact(workpieceId, "script/script.md", Buffer.from("[s1]Fixture[/s1]"));
  artifact(manifest.hearth_workpiece_id, "hearth/drafts.v1.json", Buffer.from("{}"));
  for (const [key, value] of Object.entries(revision)) if (key.endsWith("_path")) artifact(manifest.hammer_workpiece_id, value, Buffer.from("{}"));
  artifact(manifest.hammer_workpiece_id, revision.revision_transcript_path, Buffer.from(JSON.stringify(transcript)));
  artifact(manifest.hammer_workpiece_id, recording.media_path, media);
  const downloads: string[] = [];
  const denied = new Set<string>();
  const client = {
    schema(name: string) { assert.equal(name, "tongs"); return this; },
    from(table: string) {
      let rows = tables[table]; assert.ok(rows, table);
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[key])); return query; },
        async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      }; return query;
    },
    storage: { from() { throw new Error("Workpiece byte reads must exercise authenticated Tongs, not direct Storage."); } },
  } as unknown as SupabaseClient;
  const readArtifact = createFixtureArtifactReader(async (request) => {
    assert.equal(request.headers.get("x-forge-user-authorization"), "Bearer fixture-token");
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("encoding"), "binary");
    const workpieceId = url.pathname.split("/")[3];
    const key = `workpieces/${workpieceId}/${url.searchParams.get("path")}`;
    downloads.push(key);
    if (denied.has(key)) return new Response(null, { status: 403 });
    const bytes = objects.get(key);
    return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 });
  }, "fixture-token");
  return { client, manifest, membership, episodes, revision, recording, transcript, tables, objects, downloads, denied, artifact, readArtifact };
}

test("valid fixture verifies all 12 objects through authenticated Tongs", async () => {
  const fixture = verifierFixture();
  validateBrowserFixtureManifest(fixture.manifest, "local");
  const evidence = await verifyBrowserFixtureRecords(fixture.client, fixture.manifest, fixture.readArtifact);
  assert.notEqual(fixture.manifest.hearth_workpiece_id, fixture.manifest.hammer_workpiece_id);
  assert.equal(evidence.transcriptSegments, 8);
  assert.equal(evidence.verifiedObjects, 12);
  assert.equal(fixture.downloads.length, 12);
});

const rejections: Array<[string, (fixture: ReturnType<typeof verifierFixture>) => void, RegExp]> = [
  ["member is not owner", (f) => { f.membership.role = "editor"; }, /owner membership/],
  ["required path is null", (f) => { Object.assign(f.revision, { history_path: null }); }, /artifact path/],
  ["required path is empty", (f) => { f.revision.editor_session_path = ""; }, /artifact path/],
  ["stale recording pointer", (f) => { f.episodes[3]!.canonical_recording_id = "stale"; }, /pointers/],
  ["stale revision pointer", (f) => { f.episodes[3]!.active_revision_id = "stale"; }, /pointers/],
  ["inactive revision", (f) => { f.revision.status = "archived"; }, /revision identity\/status/],
  ["wrong revision identity", (f) => { f.revision.id = "wrong"; }, /revision identity\/status/],
  ["cross-workspace revision", (f) => { f.revision.workspace_id = "wrong"; }, /revision identity\/status/],
  ["cross-workpiece revision", (f) => { f.revision.workpiece_id = f.manifest.hearth_workpiece_id; }, /revision identity\/status/],
  ["cross-recording revision", (f) => { f.revision.canonical_recording_id = "wrong"; }, /revision identity\/status/],
  ["unsealed recording", (f) => { f.recording.status = "pending"; }, /canonical recording/],
  ["cross-workspace recording", (f) => { f.recording.workspace_id = "wrong"; }, /canonical recording/],
  ["transcript media identity mismatch", (f) => { f.transcript.media_id = "wrong"; f.artifact(f.manifest.hammer_workpiece_id, f.revision.revision_transcript_path, Buffer.from(JSON.stringify(f.transcript))); }, /transcript\/media identity/],
  ["transcript media signature mismatch", (f) => { f.transcript.source_media_ref.sha256 = "wrong"; f.artifact(f.manifest.hammer_workpiece_id, f.revision.revision_transcript_path, Buffer.from(JSON.stringify(f.transcript))); }, /transcript\/media identity/],
  ["Storage denied to authenticated account", (f) => { f.denied.add(`workpieces/${f.manifest.hammer_workpiece_id}/${f.revision.history_path}`); }, /Authenticated fixture Storage/],
  ["Storage object missing", (f) => { f.objects.delete(`workpieces/${f.manifest.hammer_workpiece_id}/${f.recording.media_path}`); }, /Authenticated fixture Storage/],
  ["corrupt downloaded bytes", (f) => { f.objects.set(`workpieces/${f.manifest.hammer_workpiece_id}/${f.revision.history_path}`, Buffer.from("corrupt")); }, /bytes\/hash mismatch/],
  ["registry object missing", (f) => { f.tables.workpiece_files.pop(); }, /registry is incomplete/],
  ["manifest hash mismatch", (f) => { f.manifest.artifact_hashes[`${f.manifest.hearth_workpiece_id}:script/script.md`] = "wrong"; }, /registry\/manifest/],
  ["cross-workpiece storage key", (f) => { f.tables.workpiece_files[0]!.storage_key = "workpieces/other/script/script.md"; }, /registry\/manifest/],
  ["Hearth and Hammer conflated", (f) => { f.manifest.hammer_workpiece_id = f.manifest.hearth_workpiece_id; }, /identities must differ/],
];
for (const [name, mutate, message] of rejections) test(`fixture verifier rejects ${name}`, async () => {
  const fixture = verifierFixture(); mutate(fixture);
  await assert.rejects(verifyBrowserFixtureRecords(fixture.client, fixture.manifest, fixture.readArtifact), message);
});

test("artifact reader requires actor authority and never retries a denied request", async () => {
  assert.throws(() => createFixtureArtifactReader(async () => new Response(), ""), /token is missing/);
  let calls = 0;
  const read = createFixtureArtifactReader(async () => { calls += 1; return new Response(null, { status: 401 }); }, "expired-token");
  await assert.rejects(read("fixture", "script/script.md"), /HTTP 401/);
  assert.equal(calls, 1);
});

test("Hammer fixture timeline uses the current packaging source authority", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /source_mode:\s*["']packaging["']/);
  assert.match(source, /packaging:\s*\{\s*version:\s*1,\s*intro_asset_id:\s*null,\s*outro_asset_id:\s*null/);
  assert.doesNotMatch(source, /source_mode:\s*["']canonical["']/);
});

test("Hammer fixture seeds a reusable canonical speaker-turn transcript", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /structure:\s*["']speaker_turns["']/);
  assert.match(source, /label_scheme:\s*["']forge-neutral-speakers\.v1["']/);
  assert.match(source, /speaker:\s*index % 2 \? ["']S2["'] : ["']S1["']/);
  assert.match(source, /media_signature:\s*mediaSignature/);
});

test("browser episode provisioning exercises the canonical storage-tier contract", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /from\(["']episodes["']\)\.upsert\(\{[^}]*lifecycle_state:\s*["']active["'][^}]*storage_tier:\s*["']hot["']/s);
  assert.doesNotMatch(source, /storage_tier\s*\?\?|storage_tier\s*:\s*undefined/);
});

test("Hearth fixtures seed recording-valid speaker blocks", async () => {
  const source = await readFile(new URL("../scripts/browser-fixture-authority.mts", import.meta.url), "utf8");
  assert.match(source, /const fixtureScript = \(label: string\) => `\[s1\]\\n/);
  assert.match(source, /\\n\[\/s1\]\\n`/);
  assert.match(source, /const script = fixtureScript\(episode\.label\)/);
  assert.match(source, /body:\s*handoffScript/);
  assert.match(source, /hearth\/drafts\.v1\.json/);
});

test("non-production guard allows local and explicit remote project refs", () => {
  assert.equal(assertNonProductionTarget("http://127.0.0.1:54321", null), "local");
  assert.equal(assertNonProductionTarget("https://test-project.supabase.co", "other,test-project"), "test-project");
  assert.throws(() => assertNonProductionTarget("https://production.supabase.co", "test-project"), /Refusing browser fixture mutation/);
  assert.throws(() => assertNonProductionTarget("https://example.com", "example"), /Unsupported Supabase host/);
});

test("deterministic fixture UUIDs are stable, distinct, and valid v5 UUIDs", () => {
  const first = deterministicFixtureUuid("workspace");
  assert.equal(first, deterministicFixtureUuid("workspace"));
  assert.notEqual(first, deterministicFixtureUuid("hammer"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("diagnostics recursively redact every credential-shaped field", () => {
  const sanitized = sanitizeFixtureDiagnostic({ password: "secret", nested: { access_token: "token", serviceKey: "key", harmless: "ok" } });
  assert.deepEqual(sanitized, { password: "[redacted]", nested: { access_token: "[redacted]", serviceKey: "[redacted]", harmless: "ok" } });
});

test("manifest validation binds schema, project, identities, and two Ready candidates", () => {
  const id = (key: string) => deterministicFixtureUuid(key);
  const prefix = "test-project";
  const manifest = { schema_version: BROWSER_FIXTURE_SCHEMA, fixture_namespace: BROWSER_FIXTURE_NAMESPACE, project_ref: prefix, user_id: id("user"), org_id: id(`${prefix}:org`), workspace_id: id(`${prefix}:workspace`), hearth_workpiece_id: id(`${prefix}:hearth`), ready_workpiece_ids: [id(`${prefix}:ready:1`), id(`${prefix}:ready:2`)], hammer_workpiece_id: id(`${prefix}:hammer`), hammer_recording_id: id(`${prefix}:hammer:recording`), hammer_revision_id: id(`${prefix}:hammer:revision`), artifact_hashes: {}, provisioned_at: new Date(0).toISOString(), verified_at: null };
  assert.equal(validateBrowserFixtureManifest(manifest, "test-project").workspace_id, manifest.workspace_id);
  assert.throws(() => validateBrowserFixtureManifest({ ...manifest, project_ref: "wrong" }, "test-project"), /different Supabase project/);
  assert.throws(() => validateBrowserFixtureManifest({ ...manifest, ready_workpiece_ids: [id("one")] }), /invalid Ready workpieces/);
  assert.throws(() => validateBrowserFixtureManifest({ ...manifest, schema_version: "v0" }), /obsolete/);
});
