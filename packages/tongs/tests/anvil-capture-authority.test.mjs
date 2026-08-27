import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20260826210000_tongs_anvil_capture_identity_authority.sql", import.meta.url);
const relationshipMigrationUrl = new URL("../../../supabase/migrations/20260826211000_tongs_anvil_capture_relationship_constraints.sql", import.meta.url);

test("Anvil capture authority migration establishes an immutable episode binding", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table tongs\.anvil_capture_authorities/i);
  assert.match(sql, /unique \(workspace_id, operation_key\)/i);
  assert.match(sql, /provenance in \('live_established','completion_backfill'\)/i);
  assert.match(sql, /guard_anvil_capture_authority_immutable/i);
  assert.match(sql, /current_workpiece_ready_scripts/i);
  assert.match(sql, /episode_membership_invalid/i);
});

test("database insert guard enforces episode, planner, and Ready relationships", async () => {
  const sql = await readFile(relationshipMigrationUrl, "utf8");
  assert.match(sql, /capture authority episode membership mismatch/i);
  assert.match(sql, /capture authority planner session mismatch/i);
  assert.match(sql, /capture authority Ready transition mismatch/i);
  assert.match(sql, /before insert on tongs\.anvil_capture_authorities/i);
});

test("completion and decisions derive identity from capture authority", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /anvil_transition_take_completed_v3/i);
  assert.match(sql, /where workpiece_id=a\.workpiece_id and path=p_media_path/i);
  assert.match(sql, /capture_authority_id/i);
  assert.match(sql, /anvil_transition_take_decision_v2/i);
  assert.match(sql, /where id=p_completion_id and capture_authority_id=a\.id/i);
});

test("historical completions backfill only from persisted evidence", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /'completion_backfill'/i);
  assert.match(sql, /from tongs\.anvil_recording_completion_requests c/i);
  assert.match(sql, /c\.script_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
});
