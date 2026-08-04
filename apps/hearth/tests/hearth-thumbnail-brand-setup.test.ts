import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyThumbnailBrandSetupReceipt, type ThumbnailBrandSetupPointer } from "../src/lib/hearth-thumbnail-v3-api";

const root = new URL("../../../", import.meta.url);
const pointer: ThumbnailBrandSetupPointer = {
  version: 1, workspaceId: "workspace", workpieceId: "workpiece", operationId: "operation",
  operationFingerprint: "a".repeat(64), profileId: "profile", role: "transparent_logo",
  filename: "logo.png", mimeType: "image/png", fileContentHash: "b".repeat(64),
  expectedBindingRevision: 1, requestedRules: {},
};
const receipt = {
  schema_version: "forge.thumbnail-brand-setup-receipt.v1", operation_id: "operation", workspace_id: "workspace", workpiece_id: "workpiece",
  logo: { asset_revision_id: "asset-revision", role: "transparent_logo", content_hash: "b".repeat(64), storage_bucket: "forge-workpieces", storage_key: "canonical/logo.png" },
  profile: { profile_id: "profile", revision_id: "profile-revision", revision: 2, content_hash: "c".repeat(64) },
  binding: { id: "binding", revision: 3 },
  renderer: { style_source: "brand_profile", logo_asset_revision_id: "asset-revision", storage_bucket: "forge-workpieces", storage_key: "canonical/logo.png" },
  preservation: { candidate_set_id: "set", candidate_set_revision: 1, candidate_count: 3, candidate_content_hash: "d".repeat(64), thumbnail_count: 3,
    thumbnail_identity_hash: "e".repeat(64), existing_thumbnails_unchanged: true, existing_candidates_unchanged: true },
};

test("terminal receipt enables branding only when every canonical identity matches readback", () => {
  assert.equal(verifyThumbnailBrandSetupReceipt({ receipt, readback: structuredClone(receipt), pointer }).ok, true);
  const mismatch = structuredClone(receipt);
  mismatch.renderer.logo_asset_revision_id = "different-asset";
  const result = verifyThumbnailBrandSetupReceipt({ receipt, readback: mismatch, pointer });
  assert.equal(result.ok, false);
  assert.match(result.reason, /renderer\.logo_asset_revision_id/);
});

test("preservation evidence and renderer brand_profile resolution are mandatory", () => {
  const changed = structuredClone(receipt);
  changed.preservation.existing_candidates_unchanged = false;
  assert.equal(verifyThumbnailBrandSetupReceipt({ receipt: changed, readback: changed, pointer }).ok, false);
  const standard = structuredClone(receipt);
  standard.renderer.style_source = "forge_standard";
  assert.equal(verifyThumbnailBrandSetupReceipt({ receipt: standard, readback: standard, pointer }).ok, false);
});

test("Thumbnail V3 uses the durable Tongs setup contract and never calls the legacy template-logo writer", async () => {
  const [panel, api, legacyPanel, legacyActions] = await Promise.all([
    readFile(new URL("apps/hearth/src/components/visuals/ThumbnailV3Panel.tsx", root), "utf8"),
    readFile(new URL("apps/hearth/src/lib/hearth-thumbnail-v3-api.ts", root), "utf8"),
    readFile(new URL("apps/hearth/src/components/visuals/ThumbnailPanel.tsx", root), "utf8"),
    readFile(new URL("apps/hearth/src/hooks/visuals/useThumbnailGenerationActions.ts", root), "utf8"),
  ]);
  assert.match(panel, /beginThumbnailBrandSetup/);
  assert.match(panel, /advanceThumbnailBrandSetup/);
  assert.match(panel, /My Brand \(verified canonical logo required\)/);
  assert.match(panel, /Existing thumbnails were not changed/);
  assert.doesNotMatch(panel, /uploadWorkspaceThumbnailBrandLogo|updateWorkspaceThumbnailBrandTemplate/);
  assert.match(legacyPanel, /Legacy template styling only.*do not configure Thumbnail V3/s);
  assert.match(legacyActions, /does not configure Thumbnail V3/);
  assert.match(api, /Retained before the request so a lost begin response reuses the exact identity/);
  for (const stage of ["asset-ready", "profile", "binding", "verify", "receipt"]) assert.match(api, new RegExp(`stage: "${stage}"`));
});

test("failed stages remain precise and My Brand cannot become optimistic", async () => {
  const panel = await readFile(new URL("apps/hearth/src/components/visuals/ThumbnailV3Panel.tsx", root), "utf8");
  assert.match(panel, /brandSetupOperation\.failed_stage/);
  assert.match(panel, /brandSetupOperation\.failure_message/);
  assert.match(panel, /const myBrandReady = brandPresentation\.ready && brandSetupReceipt\?\.schema_version/);
  assert.match(panel, /disabled=\{!myBrandReady\}/);
});
