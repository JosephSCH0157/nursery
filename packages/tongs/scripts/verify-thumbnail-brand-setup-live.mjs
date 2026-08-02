import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { TongsCommitService } from "../dist/workpiece-commit-api.js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required");

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const scoped = (token) => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const signup = async (label) => {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `forge-brand-setup-${label}-${randomUUID()}@example.test`;
  const { data, error } = await client.auth.signUp({ email, password: `Forge-${randomUUID()}-A1!` });
  if (error || !data.user || !data.session) throw error ?? new Error(`Unable to create ${label}`);
  return { id: data.user.id, token: data.session.access_token, client: scoped(data.session.access_token) };
};
const rpc = async (client, name, args) => { const { data, error } = await client.schema("tongs").rpc(name, args); if (error) throw new Error(`${name}: ${error.message}`); return data; };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7O3GQAAAABJRU5ErkJggg==", "base64");
const baseRules = (programName) => ({
  public_identity: { program_name: programName, tagline: null },
  palette: { primary: "#111827", secondary: "#F8FAFC", accent: "#F97316" },
  typography: { heading_family: "bold_sans", body_family: "sans-serif", heading_weight: 700, body_weight: 400 },
  logo: { placement: "bottom_right", watermark_opacity: 0.8 }, audio: { music_volume: 0.2, ducking: 0.35 }, asset_revision_ids: {},
});
const operationFingerprint = (value) => hash(Buffer.from(JSON.stringify(value)));
const assertState = (operation, expected) => assert.equal(
  operation.state,
  expected,
  `expected ${expected}; failed_stage=${operation.failed_stage ?? "null"} failure_code=${operation.failure_code ?? "null"} failure_message=${operation.failure_message ?? "null"}`,
);

const owner = await signup("owner");
const editor = await signup("editor");
const viewer = await signup("viewer");
const outsider = await signup("outsider");
const ids = { org: randomUUID(), workspace: randomUUID(), episode: randomUUID() };
const cleanup = async () => {
  await service.schema("tongs").from("workspaces").delete().eq("id", ids.workspace);
  await service.schema("tongs").from("orgs").delete().eq("id", ids.org);
  for (const user of [owner, editor, viewer, outsider]) await service.auth.admin.deleteUser(user.id);
};

try {
  let result = await service.schema("tongs").from("orgs").insert({ id: ids.org, name: "Thumbnail brand setup verification", created_by: owner.id });
  if (result.error) throw result.error;
  result = await service.schema("tongs").from("workspaces").insert({ id: ids.workspace, org_id: ids.org, name: "Brand setup verification", created_by: owner.id });
  if (result.error) throw result.error;
  result = await service.schema("tongs").from("workspace_members").upsert([
    { workspace_id: ids.workspace, user_id: owner.id, role: "owner", created_by: owner.id },
    { workspace_id: ids.workspace, user_id: editor.id, role: "editor", created_by: owner.id },
    { workspace_id: ids.workspace, user_id: viewer.id, role: "viewer", created_by: owner.id },
  ]); if (result.error) throw result.error;
  result = await service.schema("tongs").from("episodes").insert({ id: ids.episode, workspace_id: ids.workspace, label: "Brand setup episode" });
  if (result.error) throw result.error;

  const created = await rpc(editor.client, "create_brand_profile", { p_workspace_id: ids.workspace, p_internal_label: "BS with Joe", p_rules: baseRules("BS with Joe"), p_operation_id: randomUUID() });
  result = await service.schema("tongs").from("workpiece_brand_bindings").insert({ workspace_id: ids.workspace, workpiece_id: ids.episode, revision: 1,
    state: "disabled", mutation_reason: "resolve_default", operation_id: randomUUID(), operation_fingerprint: "a".repeat(64), created_by: owner.id });
  if (result.error) throw result.error;

  const operationId = randomUUID();
  const fingerprint = operationFingerprint({ workspace: ids.workspace, episode: ids.episode, profile: created.profile_id, role: "transparent_logo", expected: 1 });
  const beginArgs = { p_workspace_id: ids.workspace, p_workpiece_id: ids.episode, p_operation_id: operationId, p_operation_fingerprint: fingerprint,
    p_profile_id: created.profile_id, p_asset_id: null, p_logo_role: "transparent_logo", p_internal_label: "Thumbnail logo", p_filename: "logo.png",
    p_mime_type: "image/png", p_requested_rules: baseRules("BS with Joe"), p_expected_binding_revision: 1 };
  const begun = await rpc(editor.client, "begin_thumbnail_brand_setup", beginArgs);
  assert.equal(begun.state, "pending");
  const begunReplay = await rpc(editor.client, "begin_thumbnail_brand_setup", beginArgs);
  assert.equal(begunReplay.id, begun.id); assert.equal(begunReplay.logo_asset_revision_id, begun.logo_asset_revision_id);
  const conflict = await editor.client.schema("tongs").rpc("begin_thumbnail_brand_setup", { ...beginArgs, p_operation_fingerprint: "b".repeat(64) });
  assert.ok(conflict.error);

  const editorRows = await editor.client.schema("tongs").from("thumbnail_brand_setup_operations").select("id").eq("id", begun.id);
  assert.equal(editorRows.data?.length, 1);
  const viewerRows = await viewer.client.schema("tongs").from("thumbnail_brand_setup_operations").select("id").eq("id", begun.id);
  assert.equal(viewerRows.data?.length, 1);
  const outsiderRows = await outsider.client.schema("tongs").from("thumbnail_brand_setup_operations").select("id").eq("id", begun.id);
  assert.equal(outsiderRows.data?.length, 0);
  for (const mutation of [
    editor.client.schema("tongs").from("thumbnail_brand_setup_operations").insert({ ...begun, id: randomUUID() }),
    editor.client.schema("tongs").from("thumbnail_brand_setup_operations").update({ failure_code: "forbidden" }).eq("id", begun.id),
    editor.client.schema("tongs").from("thumbnail_brand_setup_operations").delete().eq("id", begun.id),
  ]) assert.ok((await mutation).error);
  const editorReady = await editor.client.schema("tongs").rpc("mark_thumbnail_brand_asset_ready", { p_workspace_id: ids.workspace, p_operation_id: operationId, p_operation_fingerprint: fingerprint, p_actor_id: editor.id, p_content_hash: hash(png), p_bytes: png.length, p_width: 1, p_height: 1 });
  assert.ok(editorReady.error, "asset readiness must reject authenticated editors");

  const tongs = new TongsCommitService(service, "forge-workpieces", null, (token) => scoped(token));
  const ready = await tongs.uploadThumbnailBrandSetupAsset(ids.episode, { workspace_id: ids.workspace, operation_id: operationId, operation_fingerprint: fingerprint,
    bytes_base64: png.toString("base64"), mime_type: "image/png" }, { userAccessToken: editor.token });
  assert.equal(ready.state, "asset_ready"); assert.equal(ready.logo_content_hash, hash(png));
  const readyReplay = await tongs.markThumbnailBrandAssetReady(ids.episode, { workspace_id: ids.workspace, operation_id: operationId, operation_fingerprint: fingerprint }, { userAccessToken: editor.token });
  assert.equal(readyReplay.logo_asset_revision_id, begun.logo_asset_revision_id);

  const profile = await rpc(editor.client, "commit_thumbnail_brand_profile_stage", { p_workspace_id: ids.workspace, p_operation_id: operationId, p_operation_fingerprint: fingerprint });
  assertState(profile, "profile_committed");
  const profileReplay = await rpc(editor.client, "commit_thumbnail_brand_profile_stage", { p_workspace_id: ids.workspace, p_operation_id: operationId, p_operation_fingerprint: fingerprint });
  assert.equal(profileReplay.profile_revision_id, profile.profile_revision_id);
  const profileCount = await service.schema("tongs").from("brand_profile_revisions").select("id", { count: "exact", head: true }).eq("profile_id", created.profile_id);
  assert.equal(profileCount.count, 2);

  const binding = await rpc(editor.client, "commit_thumbnail_brand_binding_stage", { p_workspace_id: ids.workspace, p_operation_id: operationId, p_operation_fingerprint: fingerprint });
  assertState(binding, "binding_committed");
  const bindingReplay = await rpc(editor.client, "commit_thumbnail_brand_binding_stage", { p_workspace_id: ids.workspace, p_operation_id: operationId, p_operation_fingerprint: fingerprint });
  assert.equal(bindingReplay.resulting_binding_id, binding.resulting_binding_id);
  const bindingCount = await service.schema("tongs").from("workpiece_brand_bindings").select("id", { count: "exact", head: true }).eq("workpiece_id", ids.episode);
  assert.equal(bindingCount.count, 2);

  const transientAssetId = randomUUID();
  const transientHash = "c".repeat(64);
  result = await service.schema("tongs").from("assets").insert({ id: transientAssetId, workspace_id: ids.workspace, workpiece_id: ids.episode,
    path: "assets/thumbnails/transient.png", mime_type: "image/png", bytes: 1, storage_bucket: "forge-workpieces", storage_key: `workspaces/${ids.workspace}/transient.png`,
    provider: "verification", created_by: owner.id, asset_kind: "thumbnail_image", status: "ready", content_hash: transientHash, ready_at: new Date().toISOString() });
  if (result.error) throw result.error;
  const failedVerify = await tongs.advanceThumbnailBrandSetup(ids.episode, "verify", { workspace_id: ids.workspace, operation_id: operationId, operation_fingerprint: fingerprint }, { userAccessToken: editor.token });
  assert.equal(failedVerify.state, "binding_committed"); assert.equal(failedVerify.failed_stage, "verified"); assert.equal(failedVerify.receipt_json, null);
  result = await service.schema("tongs").from("assets").delete().eq("id", transientAssetId); if (result.error) throw result.error;

  const receipt = await tongs.advanceThumbnailBrandSetup(ids.episode, "verify", { workspace_id: ids.workspace, operation_id: operationId, operation_fingerprint: fingerprint }, { userAccessToken: editor.token });
  assert.equal(receipt.schema_version, "forge.thumbnail-brand-setup-receipt.v1");
  assert.equal(receipt.logo.asset_revision_id, begun.logo_asset_revision_id); assert.equal(receipt.logo.role, "transparent_logo");
  assert.equal(receipt.logo.content_hash, hash(png)); assert.equal(receipt.renderer.style_source, "brand_profile");
  assert.equal(receipt.renderer.logo_asset_revision_id, begun.logo_asset_revision_id);
  assert.equal(receipt.profile.revision_id, profile.profile_revision_id); assert.equal(receipt.binding.id, binding.resulting_binding_id);
  assert.equal(receipt.preservation.existing_thumbnails_unchanged, true); assert.equal(receipt.preservation.existing_candidates_unchanged, true);
  const receiptReplay = await tongs.advanceThumbnailBrandSetup(ids.episode, "verify", { workspace_id: ids.workspace, operation_id: operationId, operation_fingerprint: fingerprint }, { userAccessToken: editor.token });
  assert.deepEqual(receiptReplay, receipt);
  const viewerReceipt = await rpc(viewer.client, "get_thumbnail_brand_setup_receipt", { p_workspace_id: ids.workspace, p_operation_id: operationId });
  assert.deepEqual(viewerReceipt, receipt);
  const outsiderReceipt = await outsider.client.schema("tongs").rpc("get_thumbnail_brand_setup_receipt", { p_workspace_id: ids.workspace, p_operation_id: operationId });
  assert.ok(outsiderReceipt.error);
  const terminalUpdate = await service.schema("tongs").from("thumbnail_brand_setup_operations").update({ failure_code: "forbidden" }).eq("id", begun.id);
  assert.ok(terminalUpdate.error); const terminalDelete = await service.schema("tongs").from("thumbnail_brand_setup_operations").delete().eq("id", begun.id); assert.ok(terminalDelete.error);

  const staleOperationId = randomUUID(); const staleFingerprint = "d".repeat(64);
  const staleBeginArgs = { ...beginArgs, p_operation_id: staleOperationId, p_operation_fingerprint: staleFingerprint, p_expected_binding_revision: binding.resulting_binding_revision, p_filename: "stale-logo.png" };
  await rpc(editor.client, "begin_thumbnail_brand_setup", staleBeginArgs);
  await tongs.uploadThumbnailBrandSetupAsset(ids.episode, { workspace_id: ids.workspace, operation_id: staleOperationId, operation_fingerprint: staleFingerprint,
    bytes_base64: png.toString("base64"), mime_type: "image/png" }, { userAccessToken: editor.token });
  await rpc(editor.client, "commit_thumbnail_brand_profile_stage", { p_workspace_id: ids.workspace, p_operation_id: staleOperationId, p_operation_fingerprint: staleFingerprint });
  const disabled = await rpc(editor.client, "mutate_workpiece_brand_binding", { p_workspace_id: ids.workspace, p_workpiece_id: ids.episode, p_intent: "disable", p_operation_id: randomUUID(), p_operation_fingerprint: "e".repeat(64), p_expected_current_revision: binding.resulting_binding_revision, p_profile_id: null, p_profile_revision_id: null });
  assert.equal(disabled.disposition, "created_revision");
  const staleBinding = await rpc(editor.client, "commit_thumbnail_brand_binding_stage", { p_workspace_id: ids.workspace, p_operation_id: staleOperationId, p_operation_fingerprint: staleFingerprint });
  assert.equal(staleBinding.state, "profile_committed"); assert.equal(staleBinding.failure_code, "revision_conflict");
  const authoritative = await rpc(viewer.client, "get_workpiece_brand_binding", { p_workspace_id: ids.workspace, p_workpiece_id: ids.episode });
  assert.equal(authoritative.id, disabled.binding.id); assert.equal(authoritative.state, "disabled");

  const setupRows = await service.schema("tongs").from("thumbnail_brand_setup_operations").select("id", { count: "exact", head: true }).eq("workspace_id", ids.workspace);
  assert.equal(setupRows.count, 2);
  console.log(JSON.stringify({ ok: true, verified_operation_id: operationId, receipt, stale_operation_state: staleBinding.state }));
} finally {
  await cleanup();
}
