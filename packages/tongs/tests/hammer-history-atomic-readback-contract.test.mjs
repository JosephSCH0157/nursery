import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../../../supabase/migrations/20260821130000_tongs_hammer_history_atomic_readback_completion.sql", import.meta.url);
const priorUrl = new URL("../../../supabase/migrations/20260821120000_tongs_hammer_history_atomic_components.sql", import.meta.url);
const typesUrl = new URL("../src/db.types.ts", import.meta.url);

test("HE-8B1A adds immutable parent byte evidence without amending HE-8B1", async () => {
  const [sql, prior] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(priorUrl, "utf8")]);
  assert.match(sql, /create table tongs\.hammer_history_epoch_atomic_parent_evidence/);
  assert.match(sql, /v_parent\.bytes<>p_parent_bytes/);
  assert.match(sql, /p_parent_bytes is null or p_parent_bytes <= 0/);
  assert.match(sql, /select parent_bytes into v_recorded_parent_bytes from tongs\.hammer_history_epoch_atomic_parent_evidence/);
  assert.match(sql, /v_existing\.parent_sha256=p_parent_sha256 and v_recorded_parent_bytes=p_parent_bytes/);
  assert.match(sql, /insert into tongs\.hammer_history_epoch_atomic_parent_evidence/);
  assert.match(sql, /trg_hammer_history_epoch_atomic_parent_evidence_immutable/);
  assert.match(sql, /drop function tongs\.he8b1a_migration_boundary\(\)/);
  assert.doesNotMatch(sql, /create or replace function tongs\.reject_hammer_history_immutable_mutation/);
  assert.match(prior, /create or replace function tongs\.commit_hammer_history_epoch_head_with_components/);
  assert.doesNotMatch(prior, /p_parent_bytes/);
});

test("designated readback is conclusive and returns the complete frozen evidence", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const field of ["idempotency_key", "operation_fingerprint", "component_changes", "result_component_authority", "parent", "head", "envelope", "transition_id", "history_path", "revision_updated_at"]) assert.match(sql, new RegExp(`'${field}'`));
  assert.match(sql, /'bytes',v_parent_bytes/);
  assert.match(sql, /'content_type','application\/json'/);
  assert.match(sql, /'outcome','absent','conclusive',true/);
  assert.match(sql, /history_epoch_atomic_operation_mismatch/);
  assert.match(sql, /history_epoch_atomic_readback_forbidden/);
  assert.match(sql, /security invoker\s+set search_path = pg_catalog, tongs/);
  assert.match(sql, /security definer\s+set search_path = pg_catalog, tongs/);
});

test("HE-8B1A preserves grants and generated types expose parent evidence", async () => {
  const [sql, types] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(typesUrl, "utf8")]);
  assert.match(sql, /revoke all on function tongs\.commit_hammer_history_epoch_head_with_components[\s\S]+from public/);
  assert.match(sql, /grant execute on function tongs\.commit_hammer_history_epoch_head_with_components[\s\S]+to authenticated/);
  assert.match(sql, /alter function tongs\.commit_hammer_history_epoch_head_with_components[\s\S]+owner to postgres/);
  assert.match(types, /hammer_history_epoch_atomic_parent_evidence:[\s\S]+parent_bytes: number/);
  assert.match(types, /p_parent_bytes: number/);
});
