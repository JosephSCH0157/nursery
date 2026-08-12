import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../../supabase/migrations/20260811173000_tongs_creator_uploaded_image_map_candidate_shape.sql", import.meta.url),
  "utf8",
);

test("uploaded image-map candidates are registered and committed to canonical authority", () => {
  const saveMethod = source.match(/async saveWorkpieceImageMap\([\s\S]*?\n  private async listLatestKeptTakeByWorkpieceIds/)?.[0] ?? "";

  assert.match(saveMethod, /readCanonicalImageMapProjection/);
  assert.match(saveMethod, /candidate\.source !== "upload"/);
  assert.match(saveMethod, /insertAssetRow/);
  assert.match(saveMethod, /asset_kind: IMAGE_MAP_CANDIDATE_ASSET_KIND/);
  assert.match(saveMethod, /reason: "attach_uploaded_candidate"/);
  assert.match(saveMethod, /affectedEntryIds: \[\.\.\.attachedEntryIds\]/);
  assert.match(saveMethod, /canonicalAfterSave\.entries/);
});

test("asset shape permits only explicit creator uploads without prompts", () => {
  assert.match(migration, /asset_kind = 'image_map_candidate_image'/);
  assert.match(migration, /prompt is not null or provider = 'creator_upload'/);
  assert.match(migration, /'reference_visual_image'/);
  assert.match(migration, /'broll_candidate_video', 'reference_clip_video'/);
  assert.doesNotMatch(migration, /drop constraint assets_asset_kind_check/);
});
