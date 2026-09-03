import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  normalizeThumbnailLogoForRender,
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
  assert.doesNotMatch(source, /if \(!logoAssetRevisionId \|\| !logoBytes\?\.length\)/);
  assert.doesNotMatch(source, /brand_logo_unavailable/);
  assert.match(source, /establishBinding: false/);
  assert.match(source, /requested_style_source \?\? "auto"/);
  assert.match(source, /THUMBNAIL_STANDARD_RECIPE_ID = "forge-thumbnail-standard"/);
  assert.match(source, /style_application_provenance/);
  assert.match(source, /style_render_identity/);
  assert.match(source, /"unresolved"\s*\|\s*"canonical_branded"\s*\|\s*"canonical_unbranded"\s*\|\s*"stale_projection"\s*\|\s*"verification_blocked"/);
  assert.match(source, /applyWorkspaceDefaultThumbnailBrand/);
  assert.match(source, /p_intent: "select_profile_revision"/);
  assert.match(source, /p_expected_current_revision: input\.expected_current_revision/);
  assert.match(source, /parts\[4\] === "apply-workspace-brand"/);
  assert.match(source, /asset\.asset_kind\s*!==\s*"thumbnail_composite"\s*\|\|\s*asset\.status\s*!==\s*"ready"\s*\|\|\s*asset\.content_hash\s*!==\s*expectedHash/);
  assert.match(source, /asset_path: asset\.path/);
});

test("thumbnail logo rendering normalizes grayscale, grayscale-alpha, RGB, and RGBA inputs before linear opacity", async () => {
  const width = 640; const height = 360;
  const baseBytes = await sharp({ create: { width, height, channels: 4, background: "#202020" } }).png().toBuffer();
  const recipe = {
    title_text: "Branded Episode", title_revision: 1, template_revision: 1,
    text_color: "#FFFFFF", shadow_color: "#000000", shadow_opacity: 0.7,
    placement: "bottom", max_lines: 2, horizontal_padding_percent: 8,
    brand: { text_color: "#F8FAFC", shadow_color: "#111827", logo_placement: "top_left", logo_opacity: 0.8 },
  };
  const cases = [
    { name: "grayscale", channels: 1, pixels: [220] },
    { name: "grayscale-alpha", channels: 2, pixels: [220, 96], alpha: 96 },
    { name: "rgb", channels: 3, pixels: [255, 85, 0] },
    { name: "rgba", channels: 4, pixels: [255, 85, 0, 96], alpha: 96 },
  ];
  const unbranded = await renderThumbnailComposite({ baseBytes, width, height, recipe: { ...recipe, brand: null }, encoding: { format: "png", quality: 100 } });
  const unbrandedRaw = await sharp(unbranded.bytes).ensureAlpha().raw().toBuffer();
  for (const fixture of cases) {
    const pixel = Buffer.from(fixture.pixels);
    const logoBytes = await sharp(Buffer.concat(Array.from({ length: 80 * 40 }, () => pixel)), {
      raw: { width: 80, height: 40, channels: fixture.channels },
    }).png().toBuffer();
    const canonicalHash = createHash("sha256").update(logoBytes).digest("hex");
    const evidence = Object.freeze({ asset_revision_id: `${fixture.name}-asset-revision`, content_hash: canonicalHash });
    const normalized = await normalizeThumbnailLogoForRender(logoBytes);
    const normalizedMetadata = await sharp(normalized).metadata();
    assert.equal(normalizedMetadata.space, "srgb", fixture.name);
    assert.equal(normalizedMetadata.channels, 4, fixture.name);
    assert.equal(normalizedMetadata.hasAlpha, true, fixture.name);
    if (fixture.alpha != null) {
      const normalizedPixel = await sharp(normalized).raw().toBuffer();
      assert.equal(normalizedPixel[3], fixture.alpha, `${fixture.name} alpha must be preserved before opacity modulation`);
    }
    const composite = await renderThumbnailComposite({ baseBytes, logoBytes, width, height, recipe, encoding: { format: "png", quality: 100 } });
    const metadata = await sharp(composite.bytes).metadata();
    assert.equal(metadata.width, width, fixture.name);
    assert.equal(metadata.height, height, fixture.name);
    assert.equal(metadata.format, "png", fixture.name);
    const compositeRaw = await sharp(composite.bytes).ensureAlpha().raw().toBuffer();
    let changedPixels = 0;
    for (let index = 0; index < compositeRaw.length; index += 4) {
      if (compositeRaw[index] !== unbrandedRaw[index] || compositeRaw[index + 1] !== unbrandedRaw[index + 1]
        || compositeRaw[index + 2] !== unbrandedRaw[index + 2] || compositeRaw[index + 3] !== unbrandedRaw[index + 3]) changedPixels += 1;
    }
    assert.ok(changedPixels > 0, `${fixture.name} logo must be visibly included`);
    assert.equal(createHash("sha256").update(logoBytes).digest("hex"), canonicalHash, `${fixture.name} canonical bytes must remain unchanged`);
    assert.deepEqual(evidence, { asset_revision_id: `${fixture.name}-asset-revision`, content_hash: canonicalHash });
  }
});

test("three-band canonical logos no longer reach linear before RGBA materialization", async () => {
  const logoBytes = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#FF5500" } }).png().toBuffer();
  await assert.rejects(
    () => sharp(logoBytes).ensureAlpha().linear([1, 1, 1, 0.8], [0, 0, 0, 0]).png().toBuffer(),
    /Band expansion using linear is unsupported/,
  );
  const normalized = await normalizeThumbnailLogoForRender(logoBytes);
  await assert.doesNotReject(() => sharp(normalized).linear([1, 1, 1, 0.8], [0, 0, 0, 0]).png().toBuffer());
});

test("brand logo is composed below title text and canonical placement anchors change pixels", async () => {
  const width = 640; const height = 360;
  const baseBytes = await sharp({ create: { width, height, channels: 4, background: "#000000" } }).png().toBuffer();
  const logoBytes = await sharp({ create: { width: 160, height: 90, channels: 4, background: "#0000FF" } }).png().toBuffer();
  const recipe = {
    title_text: "LAYER ORDER", title_revision: 1, template_revision: 1,
    text_color: "#FFFFFF", shadow_color: "#000000", shadow_opacity: 1,
    placement: "top", max_lines: 1, horizontal_padding_percent: 8,
    brand: { text_color: "#FFFFFF", shadow_color: "#000000", logo_placement: "top_left", logo_opacity: 1 },
    presentation_override: { text_color: "#FFFFFF", treatment: "none", logo_visible: true,
      logo_placement: "top_left", logo_opacity: 1, decision_origin: "explicit_user" },
  };
  const withoutLogo = await renderThumbnailComposite({ baseBytes, logoBytes: null, width, height,
    recipe: { ...recipe, brand: null, presentation_override: { ...recipe.presentation_override, logo_visible: false } }, encoding: { format: "png", quality: 100 } });
  const topLeft = await renderThumbnailComposite({ baseBytes, logoBytes, width, height, recipe, encoding: { format: "png", quality: 100 } });
  const bottomRight = await renderThumbnailComposite({ baseBytes, logoBytes, width, height,
    recipe: { ...recipe, presentation_override: { ...recipe.presentation_override, logo_placement: "bottom_right" } }, encoding: { format: "png", quality: 100 } });
  assert.notDeepEqual(topLeft.bytes, bottomRight.bytes);
  const plain = await sharp(withoutLogo.bytes).ensureAlpha().raw().toBuffer();
  const layered = await sharp(topLeft.bytes).ensureAlpha().raw().toBuffer();
  let overlappingTitlePixels = 0;
  for (let y = 51; y < 110; y += 1) for (let x = 51; x < 154; x += 1) {
    const index = (y * width + x) * 4;
    if (plain[index] > 240 && plain[index + 1] > 240 && plain[index + 2] > 240) {
      overlappingTitlePixels += 1;
      assert.ok(layered[index] > 240 && layered[index + 1] > 240 && layered[index + 2] > 240,
        "opaque title pixels must remain above the blue logo layer");
    }
  }
  assert.ok(overlappingTitlePixels > 0, "fixture must contain title glyph pixels inside the logo region");
});

test("canonical text placement anchors move the composed title", async () => {
  const width = 640; const height = 360;
  const baseBytes = await sharp({ create: { width, height, channels: 4, background: "#000000" } }).png().toBuffer();
  const recipe = { title_text: "MOVE TEXT", title_revision: 1, template_revision: 1,
    text_color: "#FFFFFF", shadow_color: "#000000", shadow_opacity: 1,
    placement: "top", max_lines: 1, horizontal_padding_percent: 8,
    presentation_override: { text_color: "#FFFFFF", treatment: "none", logo_visible: false,
      logo_placement: null, logo_opacity: null, decision_origin: "explicit_user" } };
  const top = await renderThumbnailComposite({ baseBytes, width, height, recipe, encoding: { format: "png", quality: 100 } });
  const bottom = await renderThumbnailComposite({ baseBytes, width, height, recipe: { ...recipe, placement: "bottom" }, encoding: { format: "png", quality: 100 } });
  assert.notDeepEqual(top.bytes, bottom.bytes);
  const topMetadata = await sharp(top.bytes).metadata(); const bottomMetadata = await sharp(bottom.bytes).metadata();
  assert.deepEqual([topMetadata.width, topMetadata.height, topMetadata.format], [width, height, "png"]);
  assert.deepEqual([bottomMetadata.width, bottomMetadata.height, bottomMetadata.format], [width, height, "png"]);
});

test("thumbnail style-source migration backfills and keeps standard eligibility binding-independent", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260720130000_tongs_thumbnail_style_source_provenance.sql", root), "utf8");
  assert.match(sql, /add column style_source text/);
  assert.match(sql, /when b\.state = 'profile' then 'brand_profile' else 'forge_standard'/);
  assert.match(sql, /if c\.style_source='forge_standard' then return 'current'/);
  assert.match(sql, /'schema','forge\.thumbnail-candidate\.v2'/);
  assert.match(sql, /style_provenance_hash/);
  assert.match(sql, /rolling_deployment_legacy_composite/);
  assert.match(sql, /brand_binding_context,binding_id[\s\S]*brand_application_provenance,binding_id/);
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
