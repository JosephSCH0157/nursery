import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const bridgeName = "20260811135000_tongs_reference_visual_sequence_policy_clean_init_bridge.sql";
const canonicalName = "20260811140000_tongs_restore_reference_visual_archival_completion_rpcs.sql";
const bridge = readFileSync(new URL(`../../../supabase/migrations/${bridgeName}`, import.meta.url), "utf8");
const canonical = readFileSync(new URL(`../../../supabase/migrations/${canonicalName}`, import.meta.url), "utf8");

test("clean-init bridge is ledger-guarded and ordered before the canonical creator", () => {
  assert.ok(bridgeName < canonicalName);
  assert.match(bridge, /^begin;/i);
  assert.match(bridge, /supabase_migrations\.schema_migrations/i);
  assert.match(bridge, /where version = '20260811140000'/i);
  assert.match(bridge, /drop policy if exists reference_visual_sequence_sequences_viewer\s+on tongs\.reference_visual_sequence_sequences/i);
  assert.doesNotMatch(bridge, /create\s+policy/i);
  assert.match(bridge, /commit;\s*$/i);
});

test("deployed migration remains the immutable canonical policy creator", () => {
  const definitions = canonical.match(/create policy reference_visual_sequence_sequences_viewer/gi) ?? [];
  assert.equal(definitions.length, 1);
  assert.match(canonical, /create policy reference_visual_sequence_sequences_viewer on tongs\.reference_visual_sequence_sequences\s+for select to authenticated using\(tongs\.has_workspace_role\(workspace_id,'viewer'\)\);/i);
  assert.match(canonical, /alter table tongs\.reference_visual_sequence_sequences enable row level security;/i);
  assert.match(canonical, /revoke all on tongs\.reference_visual_sequence_sequences from public,anon,authenticated;/i);
  assert.match(canonical, /grant select on tongs\.reference_visual_sequence_sequences to authenticated;/i);
  assert.match(canonical, /grant all on tongs\.reference_visual_sequence_sequences to service_role;/i);
});
