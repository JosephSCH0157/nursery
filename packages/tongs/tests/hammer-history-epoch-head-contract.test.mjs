import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20260819140000_tongs_hammer_history_epoch_heads.sql", import.meta.url);
const priorMigrationUrl = new URL("../../../supabase/migrations/20260819130000_tongs_hammer_history_epochs.sql", import.meta.url);
const typesUrl = new URL("../src/db.types.ts", import.meta.url);

test("post-epoch heads have one locked commit boundary and invoker-safe readback", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create table tongs\.hammer_history_epoch_heads/);
  assert.match(migration, /create table tongs\.hammer_history_epoch_head_transitions/);
  assert.match(migration, /unique \(epoch_id, sequence\)/);
  assert.match(migration, /unique \(workpiece_id, artifact_path\)/);
  assert.match(migration, /create or replace function tongs\.validate_hammer_history_epoch_head_parent/);
  assert.match(migration, /new\.sequence = 1/);
  assert.match(migration, /new\.sequence - 1/);
  assert.match(migration, /create or replace function tongs\.commit_hammer_history_epoch_head/);
  assert.match(migration, /security definer\s+set search_path = pg_catalog, tongs/);
  assert.match(migration, /create or replace function tongs\.read_hammer_history_epoch_head_operation/);
  assert.match(migration, /security invoker\s+set search_path = pg_catalog, tongs/);
  assert.match(migration, /has_workspace_role\(p_workspace_id, 'editor'\)/);
  assert.match(migration, /has_workspace_role\(p_workspace_id, 'viewer'\)/);
  assert.match(migration, /history_epoch_head_revision_token_conflict/);
  assert.match(migration, /history_epoch_head_pointer_conflict/);
  assert.match(migration, /history_epoch_head_parent_registry_conflict/);
  assert.match(migration, /history_epoch_head_operation_mismatch/);
  assert.match(migration, /revoke insert, update, delete on table tongs\.hammer_history_epoch_heads from authenticated/);
  assert.match(migration, /grant all on table tongs\.hammer_history_epoch_heads to service_role/);
  assert.doesNotMatch(migration, /storage\.objects/);
});

test("HE-1D is forward-only and leaves the committed HE-1A migration unchanged", async () => {
  const prior = await readFile(priorMigrationUrl, "utf8");
  assert.match(prior, /create or replace function tongs\.commit_hammer_history_epoch\(/);
  assert.doesNotMatch(prior, /hammer_history_epoch_heads/);
  assert.doesNotMatch(prior, /commit_hammer_history_epoch_head/);
});

test("generated Tongs types expose head authority and both RPC contracts", async () => {
  const types = await readFile(typesUrl, "utf8");
  assert.match(types, /hammer_history_epoch_heads: \{/);
  assert.match(types, /hammer_history_epoch_head_transitions: \{/);
  assert.match(types, /commit_hammer_history_epoch_head: \{/);
  assert.match(types, /read_hammer_history_epoch_head_operation: \{/);
  assert.match(types, /is_hammer_history_component_authority: \{/);
  assert.match(types, /p_parent_registry_updated_at: string/);
  assert.match(types, /p_result_component_authority: Json/);
});
