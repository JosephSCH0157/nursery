import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL(
  "../../../supabase/migrations/20261011780000_runway_aggregate_attempt_smallint_resolution.sql",
  import.meta.url),"utf8");

test("Runway aggregate wrapper resolves the exact smallint helper signature",()=>{
  assert.match(migration,/version='20261011770000'/);
  assert.match(migration,/begin_paid_operation_aggregate_attempt\([\s\S]*1::smallint/);
  assert.doesNotMatch(migration,/begin_paid_operation_aggregate_attempt\([\s\S]*,1,p_caller_class/);
});

test("repair retains denial release, aggregate outcome, and base boundary semantics",()=>{
  assert.match(migration,/aggregate-admission-denied-release/);
  assert.match(migration,/record_paid_operation_aggregate_outcome/);
  assert.match(migration,/authorize_runway_submission\(/);
  assert.match(migration,/aggregate-preprovider-release/);
});

test("linked guard permits only the exact accepted untransmitted replacement",()=>{
  assert.match(migration,/state<>'submitting'/);
  assert.match(migration,/provider_submitted_at is not null/);
  assert.match(migration,/provider_task_id is not null/);
  assert.match(migration,/runway_submission_boundary_events/);
  assert.match(migration,/reserved_credit_units<>160/);
  assert.match(migration,/reserved_wholesale_spend_micros<>600000/);
  assert.match(migration,/customer_spending_quote_acceptances/);
  assert.match(migration,/paid_operation_aggregate_bindings/);
});

test("wrapper remains service-only and Live remains inactive",()=>{
  assert.match(migration,/security definer[\s\S]*set search_path=pg_catalog/);
  assert.match(migration,/revoke all on function tongs\.authorize_runway_submission_with_aggregate[\s\S]*from public,anon,authenticated/);
  assert.match(migration,/grant execute on function tongs\.authorize_runway_submission_with_aggregate[\s\S]*to service_role/);
  assert.match(migration,/environment='live'[\s\S]*<>'inactive_ready'/);
});
