/* global Request */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeCanonicalAssetAuthority } from "../dist/canonical-asset-authority.js";
import { createTongsCommitApiHandlerWithService } from "../dist/workpiece-commit-api.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workpieceId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";

test("canonical asset authority normalizes an exact ready workpiece envelope", () => {
  const authority = normalizeCanonicalAssetAuthority({
    state: "ready", canonical_asset_id: assetId, workspace_id: workspaceId,
    scope: { kind: "workpiece", workpiece_id: workpieceId, workspace_reuse_policy: "not_applicable" },
    asset_kind: "reference_visual_image", content_hash: "a".repeat(64), storage_bucket: "forge-workpieces",
    storage_object_key: `workpieces/${workpieceId}/assets/visual.png`, path: "assets/visual.png",
    mime_type: "image/png", bytes: 10, intrinsic_width: 1920, intrinsic_height: 1080,
    asset_status: "ready", provenance_classification: "canonical_native", provenance: { authority: "tongs" },
    ready_at: "2026-08-27T19:00:00.000Z",
  });
  assert.equal(authority?.state, "ready");
  assert.equal(authority?.canonicalAssetId, assetId);
  assert.deepEqual(authority?.scope, { kind: "workpiece", workpieceId, workspaceReusePolicy: "not_applicable" });
  assert.equal(authority?.contentHash, "a".repeat(64));
});

test("canonical asset authority rejects malformed readiness and preserves ambiguous scope", () => {
  assert.equal(normalizeCanonicalAssetAuthority({ state: "ready", code: "canonical_asset_not_ready", canonical_asset_id: assetId }), null);
  const authority = normalizeCanonicalAssetAuthority({ state: "relationship_mismatch", code: "canonical_asset_workpiece_mismatch", canonical_asset_id: assetId,
    scope: { kind: "workspace", workpiece_id: workpieceId, workspace_reuse_policy: "allowed" } });
  assert.equal(authority?.state, "relationship_mismatch");
  assert.equal(authority?.scope, undefined);
});

test("canonical asset resolution HTTP route starts from ID and treats evidence as assertions", async () => {
  const calls = [];
  const service = { async resolveCanonicalAssetAuthority(input, options) { calls.push({ input, options }); return { state: "ready", code: null, canonicalAssetId: input.canonicalAssetId }; } };
  const handler = createTongsCommitApiHandlerWithService(service);
  const response = await handler(new Request(`http://localhost/tongs/workspaces/${workspaceId}/assets/${assetId}/resolve-authority`, {
    method: "POST", headers: { "x-forge-user-authorization": "Bearer user-token", "content-type": "application/json" },
    body: JSON.stringify({ expected_workpiece_id: workpieceId, required_asset_kind: "reference_visual_image", expected_content_hash: "b".repeat(64),
      expected_storage_bucket: "forge-workpieces", expected_storage_key: `workpieces/${workpieceId}/assets/visual.png`, expected_path: "assets/visual.png" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.canonicalAssetId, assetId);
  assert.equal(calls[0].input.expectedWorkpieceId, workpieceId);
  assert.equal(calls[0].input.expectedContentHash, "b".repeat(64));
  assert.equal(calls[0].options.userAccessToken, "user-token");
});

test("S4-1 migration locks explicit scope, exact resolution, ambiguity, RLS, and proven relationships", async () => {
  const path = fileURLToPath(new URL("../../../supabase/migrations/20260827190000_tongs_canonical_asset_authority_s4_1.sql", import.meta.url));
  const sql = await readFile(path, "utf8");
  assert.match(sql, /asset_scope = 'workpiece'.*workpiece_id is not null/s);
  assert.match(sql, /asset_scope = 'workspace'.*workpiece_id is null/s);
  assert.match(sql, /provenance_classification in \('canonical_native','legacy_resolved','legacy_unresolved','conflicting_evidence'\)/);
  assert.match(sql, /create or replace function tongs\.resolve_canonical_asset_authority/);
  assert.match(sql, /ID selects; optional evidence only validates/);
  assert.match(sql, /Path is only corroboration/);
  assert.match(sql, /same_path_different_content/);
  assert.match(sql, /count\(distinct a\.content_hash\)/);
  assert.match(sql, /drop policy if exists assets_update_if_workspace_access/);
  assert.match(sql, /broll_candidate_asset_authority_fkey/);
  assert.match(sql, /reference_clip_asset_authority_fkey/);
  assert.match(sql, /reference_visual_asset_authority_fkey/);
  assert.doesNotMatch(sql, /where\s+path\s*=\s*p_/i);
  assert.doesNotMatch(sql, /\nend\r?\n\$(?:function|triggers|relationships)\$;/);
  assert.equal((sql.match(/\nend;\r?\n\$function\$;/g) ?? []).length, 4);
  assert.equal((sql.match(/\nend;\r?\n\$(?:triggers|relationships)\$;/g) ?? []).length, 2);
  assert.match(sql, /v_duration := case[\s\S]+end;[\s\S]+duration_ms_assertion is distinct from v_duration/);
  assert.doesNotMatch(sql, /is distinct from\s+case when/);
});
