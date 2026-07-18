import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  renderThumbnailComposite,
  THUMBNAIL_BUNDLED_FONT_VERSION,
  THUMBNAIL_COMPOSITION_ENGINE_VERSION,
} from "../dist/thumbnail-composite.js";
import { contrastRatio, evaluateReadabilityMasks, nearestRankP10, THUMBNAIL_READABILITY_THRESHOLD } from "../dist/thumbnail-readability.js";
import {
  resolveThumbnailOperationReplay,
  resolveThumbnailReconciliationOutcome,
} from "../dist/workpiece-commit-api.js";

const root = new URL("../../../", import.meta.url);

test("thumbnail lifecycle migration defines canonical states, kinds, hashes, diagnostics, and idempotency", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260715153000_tongs_thumbnail_asset_lifecycle.sql", root), "utf8");
  assert.match(sql, /status in \('pending', 'ready', 'failed', 'superseded'\)/);
  assert.match(sql, /'thumbnail_composite'/);
  assert.match(sql, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /failure_code is not null[\s\S]*failure_message is not null/);
  assert.match(sql, /assets_thumbnail_operation_unique_idx/);
  assert.match(sql, /workspace_id, workpiece_id, asset_kind, operation_id/);
  assert.match(sql, /assets_thumbnail_composite_reuse_unique_idx/);
  assert.match(sql, /workspace_id, workpiece_id, reuse_identity/);
  assert.match(sql, /assets_thumbnail_reconciliation_idx/);
  assert.match(sql, /assets_thumbnail_ready_hash_check/);
});

test("candidate-set migration separates stable candidates from atomic ordered membership", async()=>{
  const sql=await readFile(new URL("supabase/migrations/20260718130000_tongs_thumbnail_candidate_sets.sql",root),"utf8");
  const candidateTable=sql.match(/create table tongs\.thumbnail_candidate_revisions \(([\s\S]*?)\n\);/)?.[1]??"";
  assert.doesNotMatch(candidateTable,/candidate_set_id|candidate_ordinal/);
  assert.match(sql,/create table tongs\.thumbnail_candidate_set_members/);
  assert.match(sql,/unique\(candidate_set_id,candidate_revision_id\)/);
  assert.match(sql,/unique\(candidate_set_id,candidate_ordinal\)/);
  assert.match(sql,/composite_asset_id uuid not null unique references/);
  assert.doesNotMatch(sql,/unique\s*\(candidate_set_id,\s*title_revision_id\)/);
  assert.match(sql,/forge\.thumbnail-candidate-distinction\.v1/);
  assert.match(sql,/forge\.thumbnail-structural-composition\.v1/);
});

test("candidate authority locks binding first and replays receipts before current-binding rejection",async()=>{
  const sql=await readFile(new URL("supabase/migrations/20260718130000_tongs_thumbnail_candidate_sets.sql",root),"utf8");
  const commit=sql.slice(sql.indexOf("create or replace function tongs.commit_thumbnail_candidate_set"),sql.indexOf("create or replace function tongs.decide_thumbnail_candidate_historical_brand"));
  assert.ok(commit.indexOf(":brand',0")<commit.indexOf(":thumbnail-candidate-set',0"));
  assert.ok(commit.indexOf("thumbnail_candidate_set_operations where")<commit.indexOf("stale_thumbnail_candidate_set_revision"));
  const decision=sql.slice(sql.indexOf("create or replace function tongs.decide_thumbnail_candidate_historical_brand"),sql.indexOf("create or replace function tongs.get_thumbnail_candidate_set_projection"));
  assert.ok(decision.indexOf(":brand',0")<decision.indexOf(":thumbnail-candidate-brand-decision',0"));
  assert.ok(decision.indexOf("thumbnail_candidate_brand_decision_operations where")<decision.indexOf("stale_active_brand_binding"));
  assert.match(sql,/set search_path=pg_catalog,tongs/); assert.doesNotMatch(sql,/set search_path[^\n]*public/);
  assert.match(sql,/revoke insert,update,delete/); assert.match(sql,/for select to authenticated using\(tongs\.has_workspace_role/);
});

test("existing workspace RLS policies cover every asset state and kind without filtering either field", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260228170000_tongs_assets_table.sql", root), "utf8");
  for (const operation of ["select", "insert", "update"]) {
    assert.match(sql, new RegExp(`assets_${operation}_if_workspace_access`));
  }
  assert.match(sql, /using \(tongs\.can_access_workspace\(workspace_id\)\)/);
  assert.match(sql, /with check \(tongs\.can_access_workspace\(workspace_id\)\)/);
  const policyBodies = sql.match(/create policy assets_(?:select|insert|update)_if_workspace_access[\s\S]*?(?=drop policy|alter table|$)/g) ?? [];
  assert.equal(policyBodies.length, 3);
  for (const policy of policyBodies) {
    assert.doesNotMatch(policy, /asset_kind|status/);
  }
});

test("server compositor is deterministic for identical versioned inputs", async () => {
  assert.equal(THUMBNAIL_COMPOSITION_ENGINE_VERSION, "forge-thumbnail-compositor-v1");
  assert.equal(THUMBNAIL_BUNDLED_FONT_VERSION, "inter-5.2.8-latin-700");
  const baseBytes = await sharp({
    create: { width: 640, height: 360, channels: 4, background: "#234567" },
  }).png().toBuffer();
  const input = {
    baseBytes,
    width: 640,
    height: 360,
    recipe: {
      title_text: "A Durable Thumbnail",
      title_revision: 2,
      template_revision: 3,
      text_color: "#FFFFFF",
      shadow_color: "#000000",
      shadow_opacity: 0.75,
      placement: "bottom",
      max_lines: 2,
      horizontal_padding_percent: 8,
    },
    encoding: { format: "png", quality: 100 },
  };
  const first = await renderThumbnailComposite(input);
  const second = await renderThumbnailComposite(input);
  assert.equal(first.mimeType, "image/png");
  assert.deepEqual(first.bytes, second.bytes);
  assert.ok(first.bytes.length > baseBytes.length);
});

test("server compositor deterministically applies Brand Profile palette and logo", async () => {
  const baseBytes = await sharp({ create: { width: 640, height: 360, channels: 4, background: "#202020" } }).png().toBuffer();
  const logoBytes = await sharp({ create: { width: 120, height: 60, channels: 4, background: "#FF5500" } }).png().toBuffer();
  const input = {
    baseBytes, logoBytes, width: 640, height: 360,
    recipe: {
      title_text: "Branded Episode", title_revision: 1, template_revision: 1,
      text_color: "#FFFFFF", shadow_color: "#000000", shadow_opacity: 0.7,
      placement: "bottom", max_lines: 2, horizontal_padding_percent: 8,
      brand: { text_color: "#F8FAFC", shadow_color: "#111827", logo_placement: "top_right", logo_opacity: 0.8 },
    },
    encoding: { format: "png", quality: 100 },
  };
  const first = await renderThumbnailComposite(input);
  const second = await renderThumbnailComposite(input);
  const unbranded = await renderThumbnailComposite({ ...input, logoBytes: null, recipe: { ...input.recipe, brand: null } });
  assert.deepEqual(first.bytes, second.bytes);
  assert.notDeepEqual(first.bytes, unbranded.bytes);
});

test("readability v1 locks the contrast formula and nearest-rank tenth percentile", () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(THUMBNAIL_READABILITY_THRESHOLD, 4.5);
  assert.equal(nearestRankP10([9, 8, 7, 6, 5, 4, 3, 2, 1, 10]), 1);
});

test("readability v1 evaluates every multiline mask independently", () => {
  const width = 2; const height = 2;
  const rgba = (pixels) => ({ data: Buffer.from(pixels.flatMap(([r,g,b,a=255]) => [r,g,b,a])), width, height, channels: 4 });
  const untreated = rgba([[0,0,0],[0,0,0],[255,255,255],[255,255,255]]);
  const final = rgba([[255,255,255],[255,255,255],[255,255,255],[255,255,255]]);
  const mask = rgba([[255,255,255],[255,255,255],[255,255,255],[255,255,255]]);
  const empty = rgba([[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  const lineOne = rgba([[255,255,255],[255,255,255],[0,0,0,0],[0,0,0,0]]);
  const lineTwo = rgba([[0,0,0,0],[0,0,0,0],[255,255,255],[255,255,255]]);
  const evidence = evaluateReadabilityMasks({ untreatedImage: untreated, treatedBackground: untreated, finalComposite: final,
    glyphCoreMask: mask, supportMask: empty, lineMasks: [lineOne, lineTwo], supportRadiusPx: 2 });
  assert.equal(evidence.lineScores[0].passed, true); assert.equal(evidence.lineScores[1].passed, false); assert.equal(evidence.passed, false);
});

test("compositor corrects the actual bright title region and rejects a failing explicit treatment", async () => {
  const baseBytes = await sharp({ create: { width: 640, height: 360, channels: 4, background: "#FFFFFF" } }).png().toBuffer();
  const input = { baseBytes, width: 640, height: 360, recipe: { title_text: "BRIGHT REGION", title_revision: 1, template_revision: 1,
    text_color: "#FFFFFF", shadow_color: "#000000", shadow_opacity: 0.8, placement: "top", max_lines: 2, horizontal_padding_percent: 8,
    brand: { text_color: "#FFFFFF", shadow_color: "#000000", palette_colors: ["#FFFFFF"], logo_placement: "bottom_right", logo_opacity: 1 } },
    encoding: { format: "png", quality: 100 } };
  const first = await renderThumbnailComposite(input); const second = await renderThumbnailComposite(input);
  assert.equal(first.readability.passed, true); assert.notEqual(first.readability.applied_treatment, "none");
  assert.equal(first.readability.evaluation_hash, second.readability.evaluation_hash); assert.deepEqual(first.bytes, second.bytes);
  const explicitBacking = await renderThumbnailComposite({ ...input, recipe: { ...input.recipe, presentation_override: {
    text_color: "#FFFFFF", treatment: "backing", decision_origin: "explicit_user" } } });
  assert.equal(explicitBacking.readability.passed, true);
  assert.equal(explicitBacking.readability.applied_treatment, "backing");
  assert.equal(explicitBacking.readability.decision_origin, "explicit_user");
  await assert.rejects(() => renderThumbnailComposite({ ...input, recipe: { ...input.recipe, presentation_override: {
    text_color: "#FFFFFF", treatment: "none", decision_origin: "explicit_user" } } }), /No approved thumbnail presentation meets/);
});

test("thumbnail render authority resolves canonical brand bindings and records provenance", async () => {
  const source = await readFile(new URL("packages/tongs/src/workpiece-commit-api.ts", root), "utf8");
  assert.match(source, /resolve_workpiece_brand_default/);
  assert.match(source, /brand_application_provenance/);
  assert.match(source, /brand_logo_asset_revision_id/);
  assert.match(source, /brand_logo_hash_mismatch/);
  assert.match(source, /establishBinding: false/);
  assert.match(source, /if \(reusable\) return thumbnailAssetSummary\(reusable\);[\s\S]*verifySources: true/);
  assert.match(source, /"unresolved" \| "canonical_branded" \| "canonical_unbranded" \| "stale_projection" \| "verification_blocked"/);
});

test("lost stage acknowledgement reuses the canonical asset and conflicting input is rejected", () => {
  const existing = {
    id: "55555555-5555-4555-8555-555555555555",
    workspace_id: "33333333-3333-4333-8333-333333333333",
    workpiece_id: "11111111-1111-4111-8111-111111111111",
    operation_id: "22222222-2222-4222-8222-222222222222",
    operation_fingerprint: "a".repeat(64),
    asset_kind: "thumbnail_image",
    status: "pending",
    path: "assets/thumbnails/asset.png",
    mime_type: "image/png",
    bytes: 12,
    content_hash: "b".repeat(64),
    storage_bucket: "forge-workpieces",
    storage_key: "workpieces/1/assets/thumbnails/asset.png",
    reference_committed_at: null,
    ready_at: null,
    failed_at: null,
    failure_code: null,
    failure_message: null,
    metadata_json: {},
  };
  const replay = resolveThumbnailOperationReplay(existing, "a".repeat(64));
  assert.equal(replay.id, existing.id);
  assert.equal(replay.status, "pending");
  assert.throws(() => resolveThumbnailOperationReplay(existing, "c".repeat(64)), /operation_id was already used/i);
});

test("reconciliation decisions are deterministic and fail closed", () => {
  const assetId = "55555555-5555-4555-8555-555555555555";
  const hash = "a".repeat(64);
  assert.deepEqual(resolveThumbnailReconciliationOutcome({
    assetId, referencedAssetId: assetId, canonicalHash: hash, storedHash: hash,
  }), { target: "ready" });
  assert.equal(resolveThumbnailReconciliationOutcome({
    assetId, referencedAssetId: null, canonicalHash: hash, storedHash: hash,
  }).code, "package_reference_missing");
  assert.equal(resolveThumbnailReconciliationOutcome({
    assetId, referencedAssetId: assetId, canonicalHash: hash, storedHash: null,
  }).code, "asset_bytes_missing");
  assert.equal(resolveThumbnailReconciliationOutcome({
    assetId, referencedAssetId: assetId, canonicalHash: hash, storedHash: "b".repeat(64),
  }).code, "asset_hash_mismatch");
});
