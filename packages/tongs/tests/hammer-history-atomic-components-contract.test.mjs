import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20260821120000_tongs_hammer_history_atomic_components.sql", import.meta.url);
const priorUrl = new URL("../../../supabase/migrations/20260819140000_tongs_hammer_history_epoch_heads.sql", import.meta.url);
const typesUrl = new URL("../src/db.types.ts", import.meta.url);

test("HE-8B1 defines one atomic component-and-head database authority", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function tongs\.commit_hammer_history_epoch_head_with_components/);
  assert.match(sql, /security definer\s+set search_path = pg_catalog, tongs/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for update of rr/);
  assert.match(sql, /update tongs\.workpiece_files/);
  assert.match(sql, /tongs\.commit_hammer_history_epoch_head\(/);
  assert.match(sql, /raise exception using errcode='P0001'/);
  assert.match(sql, /history_epoch_atomic_component_conflict/);
  assert.match(sql, /history_epoch_atomic_idempotency_conflict/);
  assert.match(sql, /history_epoch_atomic_revision_token_conflict/);
  assert.match(sql, /history_epoch_atomic_pointer_conflict/);
  assert.match(sql, /history-atomic/);
  assert.match(sql, /create or replace function tongs\.read_hammer_history_epoch_head_with_components_operation/);
  assert.match(sql, /security invoker set search_path = pg_catalog, tongs/);
  assert.match(sql, /revoke all on function tongs\.commit_hammer_history_epoch_head_with_components[\s\S]+from public/);
  assert.match(sql, /grant execute on function tongs\.commit_hammer_history_epoch_head_with_components[\s\S]+to authenticated/);
  assert.doesNotMatch(sql, /storage\.objects/);
});

test("HE-8B1 is forward-only and leaves the applied head migration canonical", async () => {
  const prior = await readFile(priorUrl, "utf8");
  assert.match(prior, /create or replace function tongs\.commit_hammer_history_epoch_head\(/);
  assert.doesNotMatch(prior, /commit_hammer_history_epoch_head_with_components/);
  assert.ok("20260821120000" > "20260819140000");
});

test("generated database types expose the unified commit and readback RPCs", async () => {
  const types = await readFile(typesUrl, "utf8");
  assert.match(types, /commit_hammer_history_epoch_head_with_components: \{/);
  assert.match(types, /p_component_changes: Json/);
  assert.match(types, /p_head_storage_key: string/);
  assert.match(types, /read_hammer_history_epoch_head_with_components_operation: \{/);
});
