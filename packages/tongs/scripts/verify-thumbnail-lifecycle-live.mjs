import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createTongsCommitService } from "../dist/workpiece-commit-api.js";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readConfig() {
  const text = await readFile(new URL("../../../apps/nursery/.env.local", import.meta.url), "utf8");
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return {
    url: values.TONGS_SUPABASE_URL || values.VITE_SUPABASE_URL,
    anonKey: values.VITE_SUPABASE_ANON_KEY,
    serviceKey: values.TONGS_SERVICE_ROLE_KEY,
    bucket: values.TONGS_WORKPIECE_BUCKET || "forge-workpieces",
  };
}

const config = await readConfig();
assert(config.url && config.anonKey && config.serviceKey, "Missing linked Supabase credentials");
const admin = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const service = createTongsCommitService({ supabaseUrl: config.url, supabaseServiceRoleKey: config.serviceKey, bucket: config.bucket });
const suffix = randomUUID();
const ownerEmail = `forge-thumbnail-live-owner-${suffix}@example.invalid`;
const outsiderEmail = `forge-thumbnail-live-outsider-${suffix}@example.invalid`;
const password = `${randomUUID()}Aa1!`;
const ids = { org: randomUUID(), workspace: randomUUID(), workpiece: randomUUID() };
let ownerId = null;
let outsiderId = null;
const storageKeys = new Set();

try {
  const ownerCreate = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  if (ownerCreate.error) throw ownerCreate.error;
  ownerId = ownerCreate.data.user.id;
  const outsiderCreate = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
  if (outsiderCreate.error) throw outsiderCreate.error;
  outsiderId = outsiderCreate.data.user.id;

  const tongs = admin.schema("tongs");
  for (const [table, row] of [
    ["orgs", { id: ids.org, name: `Thumbnail lifecycle verification ${suffix}`, created_by: ownerId }],
    ["org_members", { org_id: ids.org, user_id: ownerId, org_role: "owner", created_by: ownerId }],
    ["workspaces", { id: ids.workspace, org_id: ids.org, name: `Thumbnail lifecycle verification ${suffix}`, created_by: ownerId }],
    ["episodes", { id: ids.workpiece, workspace_id: ids.workspace, label: "Thumbnail lifecycle verification" }],
  ]) {
    const result = await tongs.from(table).insert(row);
    if (result.error) throw result.error;
  }

  const ownerAuth = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const outsiderAuth = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerSession = await ownerAuth.auth.signInWithPassword({ email: ownerEmail, password });
  const outsiderSession = await outsiderAuth.auth.signInWithPassword({ email: outsiderEmail, password });
  if (ownerSession.error) throw ownerSession.error;
  if (outsiderSession.error) throw outsiderSession.error;
  const ownerToken = ownerSession.data.session.access_token;

  const pngA = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#234567" } }).png().toBuffer();
  const pngB = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#765432" } }).png().toBuffer();
  const operationId = randomUUID();
  const stageInput = {
    workspace_id: ids.workspace,
    operation_id: operationId,
    asset_kind: "thumbnail_image",
    mime_type: "image/png",
    bytes_base64: pngA.toString("base64"),
    provider: "forge-live-verification",
    metadata: { verification: true },
  };
  const staged = await service.stageThumbnailAsset(ids.workpiece, stageInput, { userAccessToken: ownerToken });
  storageKeys.add(staged.storage_key);
  assert(staged.status === "pending", "Stage did not create a pending asset");
  assert(staged.content_hash === createHash("sha256").update(pngA).digest("hex"), "Stage hash did not describe exact bytes");
  const replay = await service.stageThumbnailAsset(ids.workpiece, stageInput, { userAccessToken: ownerToken });
  assert(replay.id === staged.id, "Lost-acknowledgement replay created a duplicate asset");
  let conflictObserved = false;
  try {
    await service.stageThumbnailAsset(ids.workpiece, { ...stageInput, bytes_base64: pngB.toString("base64") }, { userAccessToken: ownerToken });
  } catch (error) {
    conflictObserved = error?.status === 409;
  }
  assert(conflictObserved, "Conflicting operation replay did not fail with 409");

  const metadata = { episode: { schema: "forge.episode.package.v3", thumbnail: { base_versions: [{ id: randomUUID(), source_type: "forge_ai", asset_id: staged.id }] } } };
  await service.commitThumbnailAssetReference(ids.workpiece, {
    workspace_id: ids.workspace,
    asset_id: staged.id,
    expected_metadata_updated_at: null,
    metadata_document: metadata,
    reference_pointer: "/episode/thumbnail/base_versions/0/asset_id",
  }, { userAccessToken: ownerToken });
  const ready = await service.transitionThumbnailAsset(ids.workpiece, {
    workspace_id: ids.workspace, asset_id: staged.id, target_status: "ready",
  }, { userAccessToken: ownerToken });
  assert(ready.status === "ready" && ready.ready_at, "Referenced asset did not become ready");

  const outsideStaged = await service.stageThumbnailAsset(ids.workpiece, {
    ...stageInput, operation_id: randomUUID(), provider: "outside-tool-live-verification",
    bytes_base64: pngB.toString("base64"), metadata: { source_type: "outside_tool" },
  }, { userAccessToken: ownerToken });
  storageKeys.add(outsideStaged.storage_key);
  const afterForge = await service.readWorkpieceJson(ids.workpiece, "metadata.json");
  assert(afterForge.found, "V3 package was not readable after Forge reference commit");
  const outsideMetadata = structuredClone(afterForge.data);
  outsideMetadata.episode.thumbnail.base_versions.push({ id: randomUUID(), source_type: "outside_tool", asset_id: outsideStaged.id });
  await service.commitThumbnailAssetReference(ids.workpiece, {
    workspace_id: ids.workspace, asset_id: outsideStaged.id,
    expected_metadata_updated_at: afterForge.file_row?.updated_at ?? null,
    metadata_document: outsideMetadata,
    reference_pointer: "/episode/thumbnail/base_versions/1/asset_id",
  }, { userAccessToken: ownerToken });
  const outsideReady = await service.transitionThumbnailAsset(ids.workpiece, {
    workspace_id: ids.workspace, asset_id: outsideStaged.id, target_status: "ready",
  }, { userAccessToken: ownerToken });
  assert(outsideReady.status === "ready" && outsideReady.content_hash === createHash("sha256").update(pngB).digest("hex"), "Outside-tool branch did not reach equivalent ready authority");

  const stale = await service.stageThumbnailAsset(ids.workpiece, {
    ...stageInput, operation_id: randomUUID(), bytes_base64: pngB.toString("base64"),
  }, { userAccessToken: ownerToken });
  storageKeys.add(stale.storage_key);
  let staleObserved = false;
  try {
    await service.commitThumbnailAssetReference(ids.workpiece, {
      workspace_id: ids.workspace,
      asset_id: stale.id,
      expected_metadata_updated_at: "2000-01-01T00:00:00.000Z",
      metadata_document: { episode: { thumbnail: { versions: [{ asset_id: stale.id }] } } },
      reference_pointer: "/episode/thumbnail/versions/0/asset_id",
    }, { userAccessToken: ownerToken });
  } catch (error) {
    staleObserved = error?.status === 409;
  }
  assert(staleObserved, "Stale optimistic-concurrency token did not fail");

  const orphan = await service.stageThumbnailAsset(ids.workpiece, {
    ...stageInput, operation_id: randomUUID(), reference_pointer: "/episode/thumbnail/versions/9/asset_id",
  }, { userAccessToken: ownerToken });
  storageKeys.add(orphan.storage_key);
  const reconciled = await service.reconcileThumbnailAssets(ids.workpiece, {
    workspace_id: ids.workspace, operation_id: orphan.operation_id,
  }, { userAccessToken: ownerToken });
  assert(reconciled.assets[0]?.status === "failed", "Orphan pending asset did not reconcile to failed");
  const reconciledAgain = await service.reconcileThumbnailAssets(ids.workpiece, {
    workspace_id: ids.workspace, operation_id: orphan.operation_id,
  }, { userAccessToken: ownerToken });
  assert(reconciledAgain.reconciled_count === 0, "Cold-boot reconciliation was not idempotent");

  const recipe = {
    title_text: "Canonical Composite",
    title_revision: 2,
    template_revision: 3,
    text_color: "#FFFFFF",
    shadow_color: "#000000",
    shadow_opacity: 0.7,
    placement: "bottom",
    max_lines: 2,
    horizontal_padding_percent: 8,
  };
  const encoding = { format: "png", quality: 100 };
  const composite = await service.renderThumbnailComposite(ids.workpiece, {
    workspace_id: ids.workspace,
    operation_id: randomUUID(),
    base_asset_id: ready.id,
    recipe_snapshot: recipe,
    composition_recipe: recipe,
    recipe_snapshot_hash: sha256Json(recipe),
    width: 640,
    height: 360,
    encoding,
  }, { userAccessToken: ownerToken });
  storageKeys.add(composite.storage_key);
  const reusedComposite = await service.renderThumbnailComposite(ids.workpiece, {
    workspace_id: ids.workspace,
    operation_id: randomUUID(),
    base_asset_id: ready.id,
    recipe_snapshot: recipe,
    composition_recipe: recipe,
    recipe_snapshot_hash: sha256Json(recipe),
    width: 640,
    height: 360,
    encoding,
  }, { userAccessToken: ownerToken });
  assert(reusedComposite.id === composite.id, "Equivalent composite render did not reuse canonical asset");

  const ownerTongs = ownerAuth.schema("tongs");
  const outsiderTongs = outsiderAuth.schema("tongs");
  const ownerRead = await ownerTongs.from("assets").select("id").eq("id", ready.id);
  assert(!ownerRead.error && ownerRead.data.length === 1, "Workspace member could not select asset through RLS");
  const outsiderRead = await outsiderTongs.from("assets").select("id").eq("id", ready.id);
  assert(!outsiderRead.error && outsiderRead.data.length === 0, "Nonmember could read workspace asset");
  const rlsAssetId = randomUUID();
  const rlsInsert = await ownerTongs.from("assets").insert({
    id: rlsAssetId, workspace_id: ids.workspace, workpiece_id: ids.workpiece,
    path: `assets/rls/${rlsAssetId}.json`, mime_type: "application/json", bytes: 2,
    storage_key: `workpieces/${ids.workpiece}/assets/rls/${rlsAssetId}.json`, provider: "verification",
    created_by: ownerId, asset_kind: "image_map_json", status: "pending", metadata_json: {}, prompt: null,
  });
  assert(!rlsInsert.error, `Workspace member insert was denied: ${rlsInsert.error?.message}`);
  const rlsUpdate = await ownerTongs.from("assets").update({ status: "superseded" }).eq("id", rlsAssetId).select("id");
  assert(!rlsUpdate.error && rlsUpdate.data.length === 1, "Workspace member update was denied");
  const outsiderInsert = await outsiderTongs.from("assets").insert({
    id: randomUUID(), workspace_id: ids.workspace, workpiece_id: ids.workpiece,
    path: `assets/rls/outsider-${suffix}.json`, mime_type: "application/json", bytes: 2,
    storage_key: `workpieces/${ids.workpiece}/assets/rls/outsider-${suffix}.json`, provider: "verification",
    created_by: outsiderId, asset_kind: "image_map_json", status: "pending", metadata_json: {}, prompt: null,
  });
  assert(Boolean(outsiderInsert.error), "Nonmember insert unexpectedly passed RLS");

  console.log(JSON.stringify({
    pending_reference_ready: true,
    v3_forge_and_outside_branches: true,
    exact_content_hash: true,
    operation_idempotency: true,
    optimistic_concurrency: true,
    reconciliation_idempotency: true,
    rls_select_insert_update: true,
    composite_determinism_and_reuse: true,
  }));
} finally {
  for (const key of storageKeys) await admin.storage.from(config.bucket).remove([key]);
  await admin.schema("tongs").from("assets").delete().eq("workpiece_id", ids.workpiece);
  await admin.schema("tongs").from("episodes").delete().eq("id", ids.workpiece);
  await admin.schema("tongs").from("workspace_members").delete().eq("workspace_id", ids.workspace);
  await admin.schema("tongs").from("workspaces").delete().eq("id", ids.workspace);
  await admin.schema("tongs").from("org_members").delete().eq("org_id", ids.org);
  await admin.schema("tongs").from("orgs").delete().eq("id", ids.org);
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
  if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
}
