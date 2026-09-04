import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.resolve("../../supabase/migrations/20260903150000_tongs_reference_material_rollout_gate.sql"),
  "utf8",
);

test("Reference Material rollout is canonical, default-off, and workspace-scoped", () => {
  assert.match(migration, /reference_material_review_enabled boolean not null default false/);
  assert.match(migration, /assert_workspace_role\(p_workspace_id, 'viewer'\)/);
  assert.match(migration, /assert_workspace_role\(p_workspace_id, 'admin'\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, tongs/);
  assert.match(migration, /revoke all on function tongs\.set_reference_material_rollout/);
});
