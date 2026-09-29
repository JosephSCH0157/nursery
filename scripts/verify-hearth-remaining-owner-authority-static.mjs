import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261011870000_grandfather_historical_hearth_authority.sql",
  "utf8",
);

const section = (start, end) => migration.split(start)[1]?.split(end)[0] ?? "";
const unifiedManifest = section("v_unified_expected text[] := array[", "];" );
const motionManifest = section("v_motion_expected text[] := array[", "];" );
const identities = (value) => [...value.matchAll(/'([^']+)'/g)].map((match) => match[1]);

assert.equal(identities(unifiedManifest).length, 30, "unified historical manifest must be exact");
assert.equal(identities(motionManifest).length, 29, "motion historical manifest must be exact");
assert.match(migration, /unified_visual_plan_historical_authorities_immutable/);
assert.match(migration, /broll_interpretation_historical_authorities_immutable/);
assert.match(migration, /requires exactly one customer, owner, or sealed historical authority/);
assert.match(migration, /historical authority is migration-only/);
assert.match(migration, /add constraint unified_visual_plan_owner_attempt_fkey/);
assert.match(migration, /add constraint broll_operation_receipts_owner_attempt_fkey/);
assert.match(migration, /add constraint broll_prompt_revisions_owner_attempt_fkey/);
assert.match(migration, /create function tongs\.begin_owner_unified_visual_plan/);
assert.match(migration, /create function tongs\.begin_owner_broll_prompt_interpretation/);
assert.match(migration, /create function tongs\.finalize_owner_hearth_thumbnail_direction_generation_result/);
assert.match(migration, /perform tongs\._require_accounting_service_role\(\)/);
assert.match(migration, /set search_path=pg_catalog/g);
assert.doesNotMatch(migration, /stripe|customer_credit|customer_balance|customer_charge/i);

console.log(JSON.stringify({
  historical_unified_manifest: identities(unifiedManifest).length,
  historical_motion_manifest: identities(motionManifest).length,
  owner_rpc_boundary: "service-role only",
  runtime_activation: "absent",
  customer_finance_changes: "absent",
}, null, 2));
