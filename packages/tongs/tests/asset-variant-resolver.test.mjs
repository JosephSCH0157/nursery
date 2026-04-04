import test from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_LIMITS,
  THUMB_LIMITS,
  buildForgeAssetIdentityKey,
  resolveForgeAssetVariant,
} from "../dist/asset-variant-resolver.js";

function makeRow(overrides = {}) {
  return {
    id: "asset_original",
    workpiece_id: "workpiece_01",
    source_asset_id: null,
    variant_kind: "original",
    variant_version: 1,
    path: "assets/image-map/original.webp",
    storage_key: "workpieces/workpiece_01/assets/image-map/original.webp",
    bytes: 1_024_000,
    width: 1920,
    height: 1080,
    cache_control: null,
    mime_type: "image/webp",
    status: "ready",
    ...overrides,
  };
}

test("buildForgeAssetIdentityKey is deterministic", () => {
  const key = buildForgeAssetIdentityKey({
    workpiece_id: "w1",
    asset_id: "a1",
    variant_kind: "preview",
    variant_version: 3,
  });
  assert.equal(key, "w1:a1:preview:v3");
});

test("resolveForgeAssetVariant resolves preview variant and enforces no escalation", () => {
  const original = makeRow();
  const preview = makeRow({
    id: "asset_preview",
    source_asset_id: original.id,
    variant_kind: "preview",
    bytes: PREVIEW_LIMITS.targetBytes,
    width: PREVIEW_LIMITS.maxWidth,
    variant_version: 2,
    path: "assets/image-map/preview_v2.webp",
  });

  const result = resolveForgeAssetVariant({
    purpose: "preview",
    originalAsset: original,
    variants: [preview],
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.resolved?.variant_kind, "preview");
  assert.equal(result.resolved?.fallback_used, false);
});

test("resolveForgeAssetVariant allows preview -> thumb fallback only", () => {
  const original = makeRow();
  const thumb = makeRow({
    id: "asset_thumb",
    source_asset_id: original.id,
    variant_kind: "thumb",
    bytes: THUMB_LIMITS.hardMaxBytes,
    width: THUMB_LIMITS.maxWidth,
    variant_version: 1,
    path: "assets/image-map/thumb_v1.webp",
  });

  const result = resolveForgeAssetVariant({
    purpose: "preview",
    originalAsset: original,
    variants: [thumb],
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.resolved?.variant_kind, "thumb");
  assert.equal(result.resolved?.fallback_used, true);
});

test("resolveForgeAssetVariant rejects missing preview without thumb fallback", () => {
  const original = makeRow();
  const result = resolveForgeAssetVariant({
    purpose: "preview",
    originalAsset: original,
    variants: [],
  });
  assert.equal(result.status, "missing_variant");
  assert.equal(result.resolved, null);
});

test("resolveForgeAssetVariant rejects oversized preview payload", () => {
  const original = makeRow();
  const preview = makeRow({
    id: "asset_preview",
    source_asset_id: original.id,
    variant_kind: "preview",
    bytes: PREVIEW_LIMITS.hardMaxBytes + 1,
    width: PREVIEW_LIMITS.maxWidth + 1,
  });
  const result = resolveForgeAssetVariant({
    purpose: "preview",
    originalAsset: original,
    variants: [preview],
  });
  assert.equal(result.status, "variant_too_large");
  assert.equal(result.resolved, null);
});

test("resolveForgeAssetVariant list purpose requires thumb and never escalates", () => {
  const original = makeRow();
  const previewOnly = makeRow({
    id: "asset_preview",
    source_asset_id: original.id,
    variant_kind: "preview",
    bytes: PREVIEW_LIMITS.targetBytes,
    width: PREVIEW_LIMITS.maxWidth,
  });
  const result = resolveForgeAssetVariant({
    purpose: "list",
    originalAsset: original,
    variants: [previewOnly],
  });
  assert.equal(result.status, "missing_variant");
});
