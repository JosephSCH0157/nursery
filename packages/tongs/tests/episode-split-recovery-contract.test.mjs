import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20260826170000_tongs_episode_split_recovery.sql", import.meta.url), "utf8");
const operator = await readFile(new URL("../../../scripts/recover-in-the-forge-episode-split.mjs", import.meta.url), "utf8");
const linkPrimaryKey = await readFile(new URL("../../../supabase/migrations/20260826171000_tongs_project_episode_link_primary_key.sql", import.meta.url), "utf8");

test("episode split recovery is manifest-bound, replay-safe, and transactional", () => {
  assert.match(migration, /episode_split_recovery_receipts/);
  assert.match(migration, /expected_hash <> p_manifest_hash/);
  assert.match(migration, /operation_identity_conflict/);
  assert.match(migration, /authority_precondition_failed/);
  assert.match(migration, /insert into tongs\.episodes/);
  assert.match(migration, /update tongs\.workpiece_script_approval_sequences/);
  assert.match(migration, /update tongs\.workpiece_image_map_sequences/);
  assert.match(migration, /update tongs\.broll_plan_sequences/);
  assert.match(migration, /update tongs\.reference_clip_plan_sequences/);
  assert.match(migration, /update tongs\.reference_visual_plan_sequences/);
  assert.match(migration, /return prior\.receipt_json/);
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
});

test("project episode links use canonical link identity rather than project cardinality", () => {
  assert.match(linkPrimaryKey, /drop constraint if exists barstock_project_episode_links_pkey/);
  assert.match(linkPrimaryKey, /primary key \(id\)/);
  assert.doesNotMatch(linkPrimaryKey, /primary key \(workspace_id,\s*project_id\)/);
});

test("operator defaults to dry-run and stages destination-owned verified bytes before apply", () => {
  assert.match(operator, /const APPLY = process\.argv\.includes\("--apply"\)/);
  assert.match(operator, /if\(!APPLY\)process\.exit\(0\)/);
  assert.match(operator, /Downloaded chat bytes failed hash verification/);
  assert.match(operator, /recovery\/\$\{IDS\.operationKey/);
  assert.match(operator, /upsert:false/);
  assert.match(operator, /apply_episode_split_recovery/);
  assert.match(operator, /episode_split_recovery_receipts/);
  assert.match(operator, /Existing recovery receipt targets a different destination/);
});
