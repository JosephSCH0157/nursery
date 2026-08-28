import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260827150000_tongs_approved_script_production_authority.sql"), "utf8");
const api = fs.readFileSync(path.join(root, "packages/tongs/src/workpiece-commit-api.ts"), "utf8");

test("approval creation freezes an exact source revision/hash through one server transaction", () => {
  assert.match(migration, /approve_canonical_script_v2/);
  assert.match(migration, /for update/);
  assert.match(migration, /source_revision_changed/);
  assert.match(migration, /source_hash_changed/);
  assert.match(migration, /normalize_script_approval_text/);
  assert.match(migration, /commit_script_approval_snapshot/);
});

test("Ready and capture consume explicit approval identity", () => {
  assert.match(migration, /hearth_transition_approved_script_ready/);
  assert.match(migration, /p_script_approval_id uuid/);
  assert.match(migration, /approved_ready_script_required/);
  assert.match(migration, /script_approval_id,script_approval_revision,script_approval_hash/);
  assert.match(api, /getReadyProductionScript/);
  assert.match(api, /ready_approval_mismatch/);
});

test("historical capture enrichment narrowly suspends and restores immutability", () => {
  const disableAt = migration.indexOf("disable trigger trg_anvil_capture_authority_immutable");
  const backfillAt = migration.indexOf("update tongs.anvil_capture_authorities c");
  const enableAt = migration.indexOf("enable trigger trg_anvil_capture_authority_immutable");
  assert.ok(disableAt >= 0 && disableAt < backfillAt && backfillAt < enableAt);
  assert.equal(migration.match(/disable trigger trg_anvil_capture_authority_immutable/g)?.length, 1);
  assert.equal(migration.match(/enable trigger trg_anvil_capture_authority_immutable/g)?.length, 1);
});

test("mutable script file is absent from the current Ready projection", () => {
  const view = migration.slice(migration.indexOf("create or replace view tongs.current_workpiece_ready_scripts"), migration.indexOf("create or replace function tongs.approve_canonical_script_v2"));
  assert.doesNotMatch(view, /workpiece_files/);
  assert.match(view, /script_approval_revisions/);
});

test("Ready view preserves its deployed columns and appends approval authority", () => {
  const view = migration.slice(migration.indexOf("create or replace view tongs.current_workpiece_ready_scripts"), migration.indexOf("create or replace function tongs.approve_canonical_script_v2"));
  const legacyUpdatedAt = view.indexOf("a.created_at as script_updated_at");
  const approvalId = view.indexOf("m.script_approval_id");
  const approvedAt = view.indexOf("a.created_at as script_approved_at");
  assert.ok(legacyUpdatedAt >= 0 && legacyUpdatedAt < approvalId && approvalId < approvedAt);
  assert.match(view, /m\.script_hash,\s*m\.transition_id,m\.marked_ready_by,m\.marked_ready_at,m\.publish_evidence/);
});
