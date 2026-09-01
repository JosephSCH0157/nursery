import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getNurseryRoot, loadNurseryEnv } from "../playwright/helpers/hearth-phase4-fixtures.ts";

export const BROWSER_FIXTURE_SCHEMA = "forge.browser-fixtures.v1" as const;
export const BROWSER_FIXTURE_NAMESPACE = "forge-browser-release-v1";
export const DEFAULT_MANIFEST_PATH = "playwright/.cache/browser-fixtures.v1.json";
export const DEFAULT_RECEIPT_PATH = "playwright/.cache/browser-fixtures-verification.v1.json";
export const DEFAULT_AUTH_PATH = "playwright/.auth/state.json";

export type BrowserFixtureManifest = {
  schema_version: typeof BROWSER_FIXTURE_SCHEMA;
  fixture_namespace: typeof BROWSER_FIXTURE_NAMESPACE;
  project_ref: string;
  user_id: string;
  org_id: string;
  workspace_id: string;
  hearth_workpiece_id: string;
  ready_workpiece_ids: [string, string];
  hammer_workpiece_id: string;
  hammer_recording_id: string;
  hammer_revision_id: string;
  artifact_hashes: Record<string, string>;
  provisioned_at: string;
  verified_at: string | null;
};

type FixtureConfig = {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  email: string;
  password: string;
  projectRef: string;
  origin: string;
  manifestPath: string;
  receiptPath: string;
  authPath: string;
  bucket: string;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractSupabaseProjectRef(url: string): string {
  const parsed = new URL(url);
  if (["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) return "local";
  const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(parsed.hostname);
  if (!match?.[1]) throw new Error(`Unsupported Supabase host: ${parsed.hostname}`);
  return match[1].toLowerCase();
}

export function assertNonProductionTarget(url: string, allowlistRaw: string | null | undefined): string {
  const projectRef = extractSupabaseProjectRef(url);
  if (projectRef === "local") return projectRef;
  const allowlist = String(allowlistRaw ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (!allowlist.includes(projectRef)) {
    throw new Error(`Refusing browser fixture mutation for Supabase project ${projectRef}. Add only an approved non-production ref to FORGE_NONPROD_SUPABASE_PROJECT_REFS.`);
  }
  return projectRef;
}

export function deterministicFixtureUuid(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`${BROWSER_FIXTURE_NAMESPACE}:${key}`).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sanitizeFixtureDiagnostic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeFixtureDiagnostic);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/password|service.?key|access.?token|refresh.?token|authorization/i.test(key)) out[key] = "[redacted]";
    else out[key] = sanitizeFixtureDiagnostic(entry);
  }
  return out;
}

export function validateBrowserFixtureManifest(value: unknown, expectedProjectRef?: string): BrowserFixtureManifest {
  if (!value || typeof value !== "object") throw new Error("Browser fixture manifest is not an object.");
  const row = value as Record<string, unknown>;
  if (row.schema_version !== BROWSER_FIXTURE_SCHEMA || row.fixture_namespace !== BROWSER_FIXTURE_NAMESPACE) throw new Error("Browser fixture manifest version is obsolete.");
  const uuidKeys = ["user_id", "org_id", "workspace_id", "hearth_workpiece_id", "hammer_workpiece_id", "hammer_recording_id", "hammer_revision_id"];
  for (const key of uuidKeys) if (!/^[0-9a-f-]{36}$/i.test(String(row[key] ?? ""))) throw new Error(`Browser fixture manifest has invalid ${key}.`);
  if (!Array.isArray(row.ready_workpiece_ids) || row.ready_workpiece_ids.length !== 2 || row.ready_workpiece_ids.some((id) => !/^[0-9a-f-]{36}$/i.test(String(id)))) throw new Error("Browser fixture manifest has invalid Ready workpieces.");
  if (expectedProjectRef && row.project_ref !== expectedProjectRef) throw new Error("Browser fixture manifest belongs to a different Supabase project.");
  const projectRef = String(row.project_ref ?? "");
  const expectedIds = {
    org_id: deterministicFixtureUuid(`${projectRef}:org`), workspace_id: deterministicFixtureUuid(`${projectRef}:workspace`),
    hearth_workpiece_id: deterministicFixtureUuid(`${projectRef}:hearth`), hammer_workpiece_id: deterministicFixtureUuid(`${projectRef}:hammer`),
    hammer_recording_id: deterministicFixtureUuid(`${projectRef}:hammer:recording`), hammer_revision_id: deterministicFixtureUuid(`${projectRef}:hammer:revision`),
  };
  for (const [key, expected] of Object.entries(expectedIds)) if (row[key] !== expected) throw new Error(`Browser fixture manifest ${key} is outside the deterministic fixture namespace.`);
  const expectedReady = [deterministicFixtureUuid(`${projectRef}:ready:1`), deterministicFixtureUuid(`${projectRef}:ready:2`)];
  if (JSON.stringify(row.ready_workpiece_ids) !== JSON.stringify(expectedReady)) throw new Error("Browser fixture manifest Ready IDs are outside the deterministic fixture namespace.");
  return row as BrowserFixtureManifest;
}

function resolvePath(env: Record<string, string>, key: string, fallback: string): string {
  const configured = readString(env[key]);
  return path.resolve(getNurseryRoot(), configured ?? fallback);
}

export function loadFixtureConfig(): FixtureConfig {
  const env = loadNurseryEnv();
  const supabaseUrl = readString(env.TONGS_SUPABASE_URL) ?? readString(env.SUPABASE_URL) ?? readString(env.VITE_SUPABASE_URL);
  const anonKey = readString(env.TONGS_SUPABASE_ANON_KEY) ?? readString(env.SUPABASE_ANON_KEY) ?? readString(env.VITE_SUPABASE_ANON_KEY);
  const serviceKey = readString(env.TONGS_SERVICE_ROLE_KEY) ?? readString(env.SUPABASE_SERVICE_ROLE_KEY);
  const password = readString(env.FORGE_BROWSER_FIXTURE_PASSWORD) ?? readString(env.FORGE_CI_AUTH_PASSWORD);
  if (!supabaseUrl || !anonKey || !serviceKey || !password) throw new Error("Browser fixture provisioning requires Supabase URL, anon key, service-role key, and FORGE_BROWSER_FIXTURE_PASSWORD.");
  const projectRef = assertNonProductionTarget(supabaseUrl, env.FORGE_NONPROD_SUPABASE_PROJECT_REFS);
  return {
    supabaseUrl, anonKey, serviceKey, password, projectRef,
    email: readString(env.FORGE_BROWSER_FIXTURE_EMAIL) ?? `forge-browser-fixture-${projectRef}@example.invalid`,
    origin: new URL(readString(env.FORGE_TEST_BASE_URL) ?? readString(env.PLAYWRIGHT_BASE_URL) ?? "http://127.0.0.1:5173").origin,
    manifestPath: resolvePath(env, "FORGE_BROWSER_FIXTURE_MANIFEST", DEFAULT_MANIFEST_PATH),
    receiptPath: resolvePath(env, "FORGE_BROWSER_FIXTURE_RECEIPT", DEFAULT_RECEIPT_PATH),
    authPath: resolvePath(env, "PLAYWRIGHT_STORAGE_STATE", DEFAULT_AUTH_PATH),
    bucket: readString(env.TONGS_WORKPIECE_BUCKET) ?? "forge-workpieces",
  };
}

function sha256(bytes: Uint8Array | string): string { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value: unknown): Buffer { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }

async function requireSuccess<T extends { error: { message: string } | null }>(promise: PromiseLike<T>, label: string): Promise<T> {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

async function findOrCreateUser(admin: SupabaseClient, config: FixtureConfig): Promise<string> {
  let page = 1;
  while (page <= 20) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) throw listed.error;
    const users = listed.data.users as unknown as Array<{ id: string; email?: string | null; user_metadata?: Record<string, unknown> }>;
    const found = users.find((user) => user.email?.toLowerCase() === config.email.toLowerCase());
    if (found) {
      if (found.user_metadata?.fixture_namespace !== BROWSER_FIXTURE_NAMESPACE) throw new Error("Configured browser fixture email belongs to a non-fixture account; refusing to reset it.");
      const updated = await admin.auth.admin.updateUserById(found.id, { password: config.password, email_confirm: true, user_metadata: { fixture_namespace: BROWSER_FIXTURE_NAMESPACE } });
      if (updated.error) throw updated.error;
      return found.id;
    }
    if (users.length < 1000) break;
    page += 1;
  }
  const created = await admin.auth.admin.createUser({ email: config.email, password: config.password, email_confirm: true, user_metadata: { fixture_namespace: BROWSER_FIXTURE_NAMESPACE } });
  if (created.error || !created.data.user) throw created.error ?? new Error("Managed browser fixture user was not created.");
  return created.data.user.id;
}

async function uploadWorkpieceFile(admin: SupabaseClient, bucket: string, workpieceId: string, filePath: string, contentType: string, bytes: Buffer): Promise<string> {
  const storageKey = `workpieces/${workpieceId}/${filePath}`;
  const upload = await admin.storage.from(bucket).upload(storageKey, bytes, { upsert: true, contentType });
  if (upload.error) throw new Error(`Upload ${filePath}: ${upload.error.message}`);
  const hash = sha256(bytes);
  await requireSuccess(admin.schema("tongs").from("workpiece_files").upsert({ workpiece_id: workpieceId, path: filePath, revision: 1, storage_bucket: bucket, storage_key: storageKey, content_type: contentType, file_type: contentType === "application/json" ? "json" : contentType.startsWith("text/") ? "text" : "media", hash_algo: "sha256", hash_value: hash, bytes: bytes.byteLength, written_by_tool: "browser-fixture-provisioner", written_by_tool_version: "1", written_by_lane: "non-production-fixture", updated_at: new Date().toISOString() }, { onConflict: "workpiece_id,path" }), `Registry ${filePath}`);
  return hash;
}

function makeSilentWav(durationSec = 30, sampleRate = 8000): Buffer {
  const dataBytes = durationSec * sampleRate * 2; const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0); out.writeUInt32LE(36 + dataBytes, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(dataBytes, 40); return out;
}

async function signIn(config: FixtureConfig) {
  const client = createClient(config.supabaseUrl, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email: config.email, password: config.password });
  if (signed.error || !signed.data.session || !signed.data.user) throw signed.error ?? new Error("Managed fixture sign-in returned no session.");
  return { client, session: signed.data.session, user: signed.data.user };
}

export async function provisionBrowserFixtures(): Promise<BrowserFixtureManifest> {
  const config = loadFixtureConfig();
  const admin = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = await findOrCreateUser(admin, config);
  const orgId = deterministicFixtureUuid(`${config.projectRef}:org`); const workspaceId = deterministicFixtureUuid(`${config.projectRef}:workspace`);
  const hearthId = deterministicFixtureUuid(`${config.projectRef}:hearth`); const readyIds = [deterministicFixtureUuid(`${config.projectRef}:ready:1`), deterministicFixtureUuid(`${config.projectRef}:ready:2`)] as [string, string];
  const hammerId = deterministicFixtureUuid(`${config.projectRef}:hammer`); const recordingId = deterministicFixtureUuid(`${config.projectRef}:hammer:recording`); const revisionId = deterministicFixtureUuid(`${config.projectRef}:hammer:revision`);
  const tongs = admin.schema("tongs"); const now = new Date().toISOString();
  await requireSuccess(tongs.from("orgs").upsert({ id: orgId, name: `[fixture] Forge Browser Release ${config.projectRef}`, personal_owner_user_id: userId, created_by: userId, updated_at: now }), "Org");
  await requireSuccess(tongs.from("org_members").upsert({ org_id: orgId, user_id: userId, org_role: "owner", created_by: userId }, { onConflict: "org_id,user_id" }), "Org membership");
  await requireSuccess(tongs.from("workspaces").upsert({ id: workspaceId, org_id: orgId, name: `[fixture] Browser Release ${config.projectRef}`, created_by: userId }), "Workspace");
  await requireSuccess(tongs.from("workspace_members").upsert({ workspace_id: workspaceId, user_id: userId, role: "owner", created_by: userId }, { onConflict: "workspace_id,user_id" }), "Workspace membership");
  await requireSuccess(tongs.from("recording_sessions").delete().eq("workspace_id", workspaceId).eq("created_by", userId).like("title", `[fixture:${BROWSER_FIXTURE_NAMESPACE}]%`), "Stale fixture session cleanup");
  const episodes = [{ id: hearthId, label: "[fixture] Hearth authenticated handoff", state: "draft" }, { id: readyIds[0], label: "[fixture] Ready candidate Alpha", state: "ready" }, { id: readyIds[1], label: "[fixture] Ready candidate Beta", state: "ready" }, { id: hammerId, label: "[fixture] Hammer authenticated recording", state: "recorded" }];
  for (const episode of episodes) await requireSuccess(tongs.from("episodes").upsert({ id: episode.id, workspace_id: workspaceId, label: episode.label, lifecycle_state: episode.state, storage_tier: "active", created_by: userId, creation_origin: BROWSER_FIXTURE_NAMESPACE, deleted_at: null, archived_at: null, updated_at: now }), `Episode ${episode.label}`);
  const hashes: Record<string, string> = {};
  for (const episode of episodes.slice(0, 3)) {
    const script = `# ${episode.label}\n\nThis authenticated non-production fixture proves canonical script access.\n\nIt must never be published.\n`;
    hashes[`${episode.id}:script/script.md`] = await uploadWorkpieceFile(admin, config.bucket, episode.id, "script/script.md", "text/markdown", Buffer.from(script));
  }
  const authenticated = await signIn(config);
  for (const [index, workpieceId] of readyIds.entries()) {
    const userTongs = authenticated.client.schema("tongs");
    const sequence = await userTongs.from("workpiece_script_approval_sequences").select("current_revision,current_approval_id").eq("workspace_id", workspaceId).eq("workpiece_id", workpieceId).maybeSingle();
    if (sequence.error) throw new Error(`Ready approval sequence ${index + 1}: ${sequence.error.message}`);
    let approvalId = String(sequence.data?.current_approval_id ?? "");
    if (approvalId) {
      const current = await userTongs.from("script_approval_revisions").select("script_content_hash").eq("id", approvalId).maybeSingle();
      if (current.error || current.data?.script_content_hash !== hashes[`${workpieceId}:script/script.md`]) approvalId = "";
    }
    if (!approvalId) {
      const scriptText = `# ${episodes[index + 1]!.label}\n\nThis authenticated non-production fixture proves canonical script access.\n\nIt must never be published.\n`;
      const approval = await userTongs.rpc("approve_canonical_script_v2", { p_workspace_id: workspaceId, p_workpiece_id: workpieceId, p_expected_current_approval_revision: sequence.data?.current_revision ?? 0, p_expected_source_file_revision: 1, p_expected_source_content_hash: hashes[`${workpieceId}:script/script.md`], p_script_text: scriptText, p_creator_version_label: "Authenticated browser fixture", p_operation_id: deterministicFixtureUuid(`${config.projectRef}:ready:${index + 1}:approval:${sequence.data?.current_revision ?? 0}:${hashes[`${workpieceId}:script/script.md`]}`) });
      if (approval.error || !approval.data || typeof approval.data !== "object") throw new Error(`Ready approval ${index + 1}: ${approval.error?.message ?? "malformed receipt"}`);
      const approvalRow = (approval.data as Record<string, unknown>).approval;
      approvalId = String(approvalRow && typeof approvalRow === "object" ? (approvalRow as Record<string, unknown>).id ?? "" : "");
    }
    if (!approvalId) throw new Error(`Ready approval ${index + 1} returned no approval identity.`);
    const transition = await userTongs.rpc("hearth_transition_approved_script_ready", { p_workspace_id: workspaceId, p_workpiece_id: workpieceId, p_script_approval_id: approvalId, p_idempotency_key: deterministicFixtureUuid(`${config.projectRef}:ready:${index + 1}:transition:${approvalId}`), p_publish_evidence: { transition: "hearth.approved-script.ready.v2", script_approval_id: approvalId, script_approval_hash: hashes[`${workpieceId}:script/script.md`], fixture_namespace: BROWSER_FIXTURE_NAMESPACE, ordinal: index + 1 } });
    if (transition.error) throw new Error(`Ready transition ${index + 1}: ${transition.error.message}`);
  }
  const transcriptPath = `hammer/revisions/${revisionId}/transcript.v1.json`; const editorPath = `hammer/revisions/${revisionId}/editor-session.v1.json`; const timelinePath = `hammer/revisions/${revisionId}/visual-timeline.v2.json`; const historyPath = `hammer/revisions/${revisionId}/history.v1.json`; const mediaPath = "recordings/browser-fixture.wav";
  const segments = Array.from({ length: 8 }, (_, index) => ({ segment_id: `fixture-segment-${index + 1}`, speaker: index % 2 ? "Guest" : "Host", text: `Authenticated browser fixture segment ${index + 1}.`, start_sec: index * 3.5, end_sec: index * 3.5 + 3, is_disabled: false }));
  hashes[`${hammerId}:${transcriptPath}`] = await uploadWorkpieceFile(admin, config.bucket, hammerId, transcriptPath, "application/json", jsonBytes({ schema_version: 1, transcript_id: `fixture-transcript-${hammerId}`, segments }));
  hashes[`${hammerId}:${editorPath}`] = await uploadWorkpieceFile(admin, config.bucket, hammerId, editorPath, "application/json", jsonBytes({ schema_version: 1, session_id: `fixture-session-${hammerId}`, source_mode: "tongs", preview_mode: "edit-aware", transcript_source_id: `fixture-transcript-${hammerId}`, selected_segment_id: null, selected_overlay_row_id: null, media_ref: { media_id: `fixture-media-${hammerId}`, kind: "recording_audio", source_hint: "cloud", cloud_uri: mediaPath, duration_ms: 30000 }, workspace_mapping: null, media_source_label: "authenticated browser fixture", visual_preview: { white_balance: 0, color_amount: 0, background_blur: false }, last_opened_at: now }));
  hashes[`${hammerId}:${timelinePath}`] = await uploadWorkpieceFile(admin, config.bucket, hammerId, timelinePath, "application/json", jsonBytes({ version: 2, revision: 1, updated_at: now, source_mode: "canonical", selected_clip_id: null, assets: [], lanes: [], clips: [], packaging: { intro: null, outro: null } }));
  hashes[`${hammerId}:${historyPath}`] = await uploadWorkpieceFile(admin, config.bucket, hammerId, historyPath, "application/json", jsonBytes({ version: 1, workpieceId: hammerId, sessionId: `fixture-session-${hammerId}`, baseRevisionId: `fixture-base-${revisionId}`, createdAt: now, updatedAt: now, headEntryId: null, entries: [], checkpoints: [], undoStack: [], redoStack: [], metadata: { fixture_namespace: BROWSER_FIXTURE_NAMESPACE } }));
  const wav = makeSilentWav(); hashes[`${hammerId}:${mediaPath}`] = await uploadWorkpieceFile(admin, config.bucket, hammerId, mediaPath, "audio/wav", wav);
  await requireSuccess(tongs.from("canonical_recordings").upsert({ id: recordingId, workspace_id: workspaceId, workpiece_id: hammerId, media_id: `fixture-media-${hammerId}`, media_path: mediaPath, media_signature: hashes[`${hammerId}:${mediaPath}`], media_content_type: "audio/wav", media_bytes: wav.byteLength, media_duration_ms: 30000, source_kind: BROWSER_FIXTURE_NAMESPACE, status: "sealed", sealed_at: now, baseline_transcript_path: transcriptPath, created_by: userId, updated_by: userId }), "Canonical recording");
  await requireSuccess(tongs.from("recording_revisions").upsert({ id: revisionId, workspace_id: workspaceId, workpiece_id: hammerId, canonical_recording_id: recordingId, status: "active", label: "Authenticated browser fixture", editor_session_path: editorPath, revision_transcript_path: transcriptPath, visual_timeline_path: timelinePath, history_path: historyPath, created_by: userId, updated_by: userId }), "Hammer revision");
  await requireSuccess(tongs.from("episodes").update({ canonical_recording_id: recordingId, active_revision_id: revisionId, updated_at: now }).eq("id", hammerId), "Hammer pointers");
  const { session } = authenticated;
  const workspaceCache = [{ id: workspaceId, name: `[fixture] Browser Release ${config.projectRef}`, role: "owner", createdAt: now }];
  const storageState = { cookies: [], origins: [{ origin: config.origin, localStorage: [{ name: "forge-auth", value: JSON.stringify(session) }, { name: "forge_workspace_id_v1", value: workspaceId }, { name: "barstock_workspace_id", value: workspaceId }, { name: "forge_workspaces_cache_v1", value: JSON.stringify(workspaceCache) }] }] };
  fs.mkdirSync(path.dirname(config.authPath), { recursive: true }); fs.writeFileSync(config.authPath, `${JSON.stringify(storageState, null, 2)}\n`);
  const manifest: BrowserFixtureManifest = { schema_version: BROWSER_FIXTURE_SCHEMA, fixture_namespace: BROWSER_FIXTURE_NAMESPACE, project_ref: config.projectRef, user_id: userId, org_id: orgId, workspace_id: workspaceId, hearth_workpiece_id: hearthId, ready_workpiece_ids: readyIds, hammer_workpiece_id: hammerId, hammer_recording_id: recordingId, hammer_revision_id: revisionId, artifact_hashes: hashes, provisioned_at: now, verified_at: null };
  fs.mkdirSync(path.dirname(config.manifestPath), { recursive: true }); fs.writeFileSync(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyBrowserFixtures(): Promise<BrowserFixtureManifest> {
  const config = loadFixtureConfig();
  if (!fs.existsSync(config.manifestPath)) throw new Error("Browser fixture manifest is missing. Run browser:fixtures:provision.");
  const manifest = validateBrowserFixtureManifest(JSON.parse(fs.readFileSync(config.manifestPath, "utf8")), config.projectRef);
  const { client, session, user } = await signIn(config);
  if (user.id !== manifest.user_id) throw new Error("Authenticated fixture user does not match the manifest.");
  const userTongs = client.schema("tongs");
  const membership = await userTongs.from("workspace_members").select("workspace_id,role").eq("workspace_id", manifest.workspace_id).eq("user_id", user.id).maybeSingle();
  if (membership.error || !membership.data) throw new Error(`Fixture workspace is not reachable through normal RLS: ${membership.error?.message ?? "missing membership"}`);
  const episodes = await userTongs.from("episodes").select("id,workspace_id,canonical_recording_id,active_revision_id").in("id", [manifest.hearth_workpiece_id, ...manifest.ready_workpiece_ids, manifest.hammer_workpiece_id]);
  if (episodes.error || episodes.data?.length !== 4 || episodes.data.some((row) => row.workspace_id !== manifest.workspace_id)) throw new Error("Fixture workpieces are missing, cross-workspace, or inaccessible through RLS.");
  const ready = await userTongs.from("current_workpiece_ready_scripts").select("workpiece_id,script_path").eq("workspace_id", manifest.workspace_id).in("workpiece_id", manifest.ready_workpiece_ids);
  if (ready.error || ready.data?.length !== 2) throw new Error("Fixture Ready candidates are incomplete through normal RLS.");
  const revision = await userTongs.from("recording_revisions").select("id,canonical_recording_id,revision_transcript_path,editor_session_path,visual_timeline_path,history_path").eq("id", manifest.hammer_revision_id).maybeSingle();
  if (revision.error || !revision.data || revision.data.canonical_recording_id !== manifest.hammer_recording_id) throw new Error("Hammer fixture revision is missing or stale.");
  const transcriptRow = await userTongs.from("workpiece_files").select("storage_bucket,storage_key,hash_value").eq("workpiece_id", manifest.hammer_workpiece_id).eq("path", revision.data.revision_transcript_path!).maybeSingle();
  if (transcriptRow.error || !transcriptRow.data) throw new Error("Hammer fixture transcript registry is missing.");
  const downloaded = await client.storage.from(transcriptRow.data.storage_bucket).download(transcriptRow.data.storage_key);
  if (downloaded.error || !downloaded.data) throw new Error(`Hammer fixture transcript is not readable through storage policy: ${downloaded.error?.message ?? "missing object"}`);
  const transcriptBytes = Buffer.from(await downloaded.data.arrayBuffer()); const transcript = JSON.parse(transcriptBytes.toString("utf8"));
  if (!Array.isArray(transcript.segments) || transcript.segments.length < 6 || sha256(transcriptBytes) !== transcriptRow.data.hash_value) throw new Error("Hammer fixture transcript is malformed or hash-mismatched.");
  const canonical = await userTongs.from("canonical_recordings").select("id,media_path,media_duration_ms,status").eq("id", manifest.hammer_recording_id).eq("workpiece_id", manifest.hammer_workpiece_id).maybeSingle();
  if (canonical.error || !canonical.data || canonical.data.status !== "sealed" || (canonical.data.media_duration_ms ?? 0) < 25000) throw new Error("Hammer canonical recording is missing or malformed through normal RLS.");
  const requiredPaths = [revision.data.editor_session_path, revision.data.visual_timeline_path, revision.data.history_path, canonical.data.media_path].filter((value): value is string => Boolean(value));
  const requiredFiles = await userTongs.from("workpiece_files").select("path,hash_value").eq("workpiece_id", manifest.hammer_workpiece_id).in("path", requiredPaths);
  if (requiredFiles.error || requiredFiles.data?.length !== requiredPaths.length || requiredFiles.data.some((row) => manifest.artifact_hashes[`${manifest.hammer_workpiece_id}:${row.path}`] !== row.hash_value)) throw new Error("Hammer editor, timeline, history, or media fixture authority is incomplete.");
  const verified = { ...manifest, verified_at: new Date().toISOString() };
  fs.writeFileSync(config.manifestPath, `${JSON.stringify(verified, null, 2)}\n`);
  const receipt = sanitizeFixtureDiagnostic({ schema_version: BROWSER_FIXTURE_SCHEMA, project_ref: config.projectRef, fixture_namespace: BROWSER_FIXTURE_NAMESPACE, verified_at: verified.verified_at, user_id: user.id, workspace_id: manifest.workspace_id, workpiece_ids: [manifest.hearth_workpiece_id, ...manifest.ready_workpiece_ids, manifest.hammer_workpiece_id], checks: { authentication: true, membership_rls: true, episodes_rls: true, ready_candidates: 2, hammer_transcript_segments: transcript.segments.length, transcript_hash: transcriptRow.data.hash_value, canonical_recording: true, editor_session: true, visual_timeline: true, history: true }, session_expires_at: session.expires_at ?? null });
  fs.mkdirSync(path.dirname(config.receiptPath), { recursive: true }); fs.writeFileSync(config.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return verified;
}

export async function cleanBrowserFixtures(confirm: boolean): Promise<void> {
  if (!confirm) throw new Error("Fixture cleanup requires --confirm-fixture-destruction.");
  const config = loadFixtureConfig();
  if (!fs.existsSync(config.manifestPath)) throw new Error("Browser fixture manifest is missing; refusing an unscoped cleanup.");
  const manifest = validateBrowserFixtureManifest(JSON.parse(fs.readFileSync(config.manifestPath, "utf8")), config.projectRef);
  const admin = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }); const tongs = admin.schema("tongs");
  const workpieceIds = [manifest.hearth_workpiece_id, ...manifest.ready_workpiece_ids, manifest.hammer_workpiece_id];
  const scope = await tongs.from("episodes").select("id,workspace_id,creation_origin").in("id", workpieceIds);
  if (scope.error || scope.data?.length !== workpieceIds.length || scope.data.some((row) => row.workspace_id !== manifest.workspace_id || row.creation_origin !== BROWSER_FIXTURE_NAMESPACE)) throw new Error("Fixture cleanup scope proof failed; no records were removed.");
  const workspace = await tongs.from("workspaces").select("id,name,org_id").eq("id", manifest.workspace_id).maybeSingle();
  if (workspace.error || !workspace.data || workspace.data.org_id !== manifest.org_id || !workspace.data.name.startsWith("[fixture]")) throw new Error("Fixture workspace scope proof failed; no records were removed.");
  const files = await tongs.from("workpiece_files").select("storage_bucket,storage_key").in("workpiece_id", workpieceIds);
  if (files.error) throw new Error(`Fixture cleanup inventory failed: ${files.error.message}`);
  const storageKeys = new Map<string, string[]>();
  for (const row of files.data ?? []) storageKeys.set(row.storage_bucket, [...(storageKeys.get(row.storage_bucket) ?? []), row.storage_key]);
  for (const [bucket, keys] of storageKeys) if (keys.length) await admin.storage.from(bucket).remove(keys);
  await requireSuccess(
    tongs.from("episodes").delete().in("id", workpieceIds).eq("workspace_id", manifest.workspace_id),
    "Fixture workpiece cleanup",
  );
  await requireSuccess(
    tongs.from("workspace_members").delete().eq("workspace_id", manifest.workspace_id).eq("user_id", manifest.user_id),
    "Fixture workspace membership cleanup",
  );
  await requireSuccess(
    tongs.from("workspaces").delete().eq("id", manifest.workspace_id).eq("org_id", manifest.org_id),
    "Fixture workspace cleanup",
  );
  await requireSuccess(
    tongs.from("org_members").delete().eq("org_id", manifest.org_id).eq("user_id", manifest.user_id),
    "Fixture organization membership cleanup",
  );
  await requireSuccess(tongs.from("orgs").delete().eq("id", manifest.org_id), "Fixture organization cleanup");
  const deletedUser = await admin.auth.admin.deleteUser(manifest.user_id);
  if (deletedUser.error) throw new Error(`Fixture user cleanup failed: ${deletedUser.error.message}`);
  for (const target of [config.manifestPath, config.receiptPath, config.authPath]) if (fs.existsSync(target)) fs.rmSync(target);
}

export function readFixtureManifestForEnvironment(env: NodeJS.ProcessEnv = process.env): BrowserFixtureManifest | null {
  const configured = readString(env.FORGE_BROWSER_FIXTURE_MANIFEST); const manifestPath = path.resolve(getNurseryRoot(), configured ?? DEFAULT_MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return null;
  return validateBrowserFixtureManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
}

export function applyFixtureManifestToEnvironment(env: NodeJS.ProcessEnv = process.env): BrowserFixtureManifest | null {
  const manifest = readFixtureManifestForEnvironment(env); if (!manifest) return null;
  env.FORGE_TEST_WORKSPACE_ID = manifest.workspace_id; env.FORGE_TEST_WORKPIECE_ID = manifest.hearth_workpiece_id;
  env.FORGE_TEST_HAMMER_WORKSPACE_ID = manifest.workspace_id; env.FORGE_TEST_HAMMER_WORKPIECE_ID = manifest.hammer_workpiece_id;
  return manifest;
}
