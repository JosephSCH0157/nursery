import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const migrationUrl = new URL("supabase/migrations/20260802120000_tongs_thumbnail_brand_setup_operations.sql", root);

test("thumbnail brand setup has a recoverable monotonic state machine and immutable terminal receipt", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /state in\('pending','asset_ready','profile_committed','binding_committed','verified'\)/);
  assert.doesNotMatch(sql, /state in\([^)]*'failed'/);
  assert.match(sql, /state='verified'[\s\S]*receipt_json is not null[\s\S]*failed_stage is null/);
  assert.match(sql, /state='verified' then return v_op\.receipt_json/);
  assert.match(sql, /receipt_json is null/);
  assert.match(sql, /reject_thumbnail_brand_setup_direct_mutation/);
  assert.match(sql, /old\.state='verified'[\s\S]*terminal and immutable/);
  assert.match(sql, /new\.operation_fingerprint<>old\.operation_fingerprint/);
  assert.match(sql, /revoke insert,update,delete on tongs\.thumbnail_brand_setup_operations from authenticated/);
});

test("every stage locks and atomically records its canonical mutation", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const between = (start, end) => sql.slice(sql.indexOf(start), end ? sql.indexOf(end) : undefined);
  const asset = between("create or replace function tongs.mark_thumbnail_brand_asset_ready", "create or replace function tongs.commit_thumbnail_brand_profile_stage");
  assert.match(asset, /for update/);
  assert.match(asset, /update tongs\.brand_asset_revisions set state='ready'/);
  assert.match(asset, /update tongs\.thumbnail_brand_setup_operations set state='asset_ready'/);
  const profile = between("create or replace function tongs.commit_thumbnail_brand_profile_stage", "create or replace function tongs.commit_thumbnail_brand_binding_stage");
  assert.match(profile, /for update/);
  assert.match(profile, /append_brand_profile_revision/);
  assert.match(profile, /set state='profile_committed'/);
  const binding = between("create or replace function tongs.commit_thumbnail_brand_binding_stage", "create or replace function tongs.verify_thumbnail_brand_setup");
  assert.match(binding, /for update/);
  assert.match(binding, /insert into tongs\.workpiece_brand_bindings/);
  assert.match(binding, /set state='binding_committed'/);
  for (const body of [asset, profile, binding]) assert.match(body, /set search_path=pg_catalog,tongs/);
});

test("stage replay checks precede writes and cannot duplicate canonical identities", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const sections = [
    ["mark_thumbnail_brand_asset_ready", "commit_thumbnail_brand_profile_stage", "v_op.state<>'pending'", "update tongs.brand_asset_revisions"],
    ["commit_thumbnail_brand_profile_stage", "commit_thumbnail_brand_binding_stage", "v_op.state in('profile_committed','binding_committed','verified')", "append_brand_profile_revision"],
    ["commit_thumbnail_brand_binding_stage", "verify_thumbnail_brand_setup", "v_op.state in('binding_committed','verified')", "insert into tongs.workpiece_brand_bindings"],
  ];
  for (const [start, end, replay, mutation] of sections) {
    const body = sql.slice(sql.indexOf(`create or replace function tongs.${start}`), sql.indexOf(`create or replace function tongs.${end}`));
    assert.ok(body.indexOf(replay) >= 0, `${start} has a replay branch`);
    assert.ok(body.indexOf(replay) < body.indexOf(mutation), `${start} replays before mutation`);
    assert.match(body, /operation_fingerprint<>p_operation_fingerprint/);
  }
});

test("verification reconstructs renderer and preservation evidence from canonical Tongs state", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const verify = sql.slice(sql.indexOf("create or replace function tongs.verify_thumbnail_brand_setup"), sql.indexOf("create or replace function tongs.get_thumbnail_brand_setup_receipt"));
  assert.match(verify, /from tongs\.brand_asset_revisions/);
  assert.match(verify, /from tongs\.brand_profile_revisions/);
  assert.match(verify, /from tongs\.workpiece_brand_bindings/);
  assert.match(verify, /from tongs\.thumbnail_candidate_sets/);
  assert.match(verify, /thumbnail_brand_setup_asset_hash/);
  assert.match(verify, /'style_source','brand_profile'/);
  assert.match(verify, /'existing_thumbnails_unchanged',true/);
  assert.match(verify, /'existing_candidates_unchanged',true/);
  assert.match(verify, /'candidate_content_hash',v_set\.content_hash/);
});

test("asset readiness evidence is derived by Tongs and its mutation RPC is service-role only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const source = await readFile(new URL("packages/tongs/src/workpiece-commit-api.ts", root), "utf8");
  assert.match(source, /markThumbnailBrandAssetReady[\s\S]*downloadStorageObject\(this\.supabase, bucket, key\)[\s\S]*sha256Hex\(bytes\)/);
  assert.match(sql, /grant execute on function tongs\.mark_thumbnail_brand_asset_ready\([^;]+\) to service_role/);
  assert.match(sql, /p_actor_id[\s\S]*workspace_role_rank\(role\)>=tongs\.workspace_role_rank\('editor'\)/);
  assert.doesNotMatch(sql, /grant execute on function tongs\.mark_thumbnail_brand_asset_ready\([^;]+\) to authenticated/);
});

test("Tongs exposes begin, resume stages, verification, and receipt readback without Hearth changes", async () => {
  const source = await readFile(new URL("packages/tongs/src/workpiece-commit-api.ts", root), "utf8");
  for (const name of ["beginThumbnailBrandSetup", "markThumbnailBrandAssetReady", "advanceThumbnailBrandSetup", "getThumbnailBrandSetupReceipt"]) assert.match(source, new RegExp(name));
  assert.match(source, /thumbnail-brand-setup/);
  assert.match(source, /stage === "profile" \|\| stage === "binding" \|\| stage === "verify"/);
});
