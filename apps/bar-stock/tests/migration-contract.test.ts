import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20260713170000_tongs_barstock_persistence_authority.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("Bar-Stock migration uses server revisions rather than client clocks", () => {
  assert.match(sql, /revision bigint not null default 1/);
  assert.match(sql, /new\.revision := old\.revision \+ 1/);
  assert.doesNotMatch(sql, /client_updated_at/);
  assert.match(sql, /revision = p_expected_revision/g);
});

test("Bar-Stock import identity is unique within a workspace", () => {
  assert.match(sql, /unique index[\s\S]*barstock_assignments \(workspace_id, import_key\)/);
  assert.match(sql, /unique index[\s\S]*barstock_sparks \(workspace_id, import_key\)/);
  assert.match(sql, /'outcome', 'duplicate'/);
});

test("Bar-Stock RPCs require auth and workspace roles", () => {
  assert.match(sql, /auth\.uid\(\) is null/);
  assert.match(sql, /has_workspace_role\(v_workspace_id, 'editor'\)/);
  assert.match(sql, /has_workspace_role\(p_workspace_id, 'admin'\)/);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon/);
  assert.match(sql, /grant execute on function[\s\S]*to authenticated/);
});

test("linked Workpieces block assignment hard deletion", () => {
  assert.match(sql, /barstock_project_episode_links[\s\S]*'outcome', 'linked'/);
  assert.doesNotMatch(sql, /delete from tongs\.episodes/);
});
