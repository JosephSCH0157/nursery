import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20260819130000_tongs_hammer_history_epochs.sql", import.meta.url);
const typesUrl = new URL("../src/db.types.ts", import.meta.url);

test("history epoch migration exposes one locked canonical transition and invoker readback", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /create table tongs\.hammer_history_epochs/);
  assert.match(migration, /create table tongs\.hammer_history_epoch_transitions/);
  assert.match(migration, /create or replace function tongs\.commit_hammer_history_epoch/);
  assert.match(migration, /security definer\s+set search_path = pg_catalog, tongs/);
  assert.match(migration, /create or replace function tongs\.read_hammer_history_epoch_operation/);
  assert.match(migration, /security invoker\s+set search_path = pg_catalog, tongs/);
  assert.match(migration, /has_workspace_role\(p_workspace_id, 'editor'\)/);
  assert.match(migration, /has_workspace_role\(p_workspace_id, 'viewer'\)/);
  assert.match(migration, /revoke insert, update, delete on table tongs\.hammer_history_epochs from authenticated/);
  assert.match(migration, /revoke insert, update, delete on table tongs\.hammer_history_epoch_transitions from authenticated/);
  assert.match(migration, /grant all on table tongs\.hammer_history_epochs to service_role/);
  assert.match(migration, /history_epoch_revision_token_conflict/);
  assert.match(migration, /history_epoch_pointer_conflict/);
  assert.match(migration, /history_epoch_predecessor_registry_conflict/);
  assert.match(migration, /history_epoch_archive_registry_conflict/);
  assert.match(migration, /history_epoch_artifact_registry_conflict/);
  assert.doesNotMatch(migration, /storage\.objects/);
});

test("generated Tongs types include the history epoch tables and RPCs", async () => {
  const types = await readFile(typesUrl, "utf8");
  assert.match(types, /hammer_history_epochs: \{/);
  assert.match(types, /hammer_history_epoch_transitions: \{/);
  assert.match(types, /commit_hammer_history_epoch: \{/);
  assert.match(types, /is_hammer_history_component_sha256: \{/);
  assert.match(types, /read_hammer_history_epoch_operation: \{/);
  assert.match(types, /p_expected_revision_updated_at: string/);
  assert.match(types, /p_predecessor_registry_revision: number/);
  assert.match(types, /p_epoch_registry_updated_at: string/);
});
