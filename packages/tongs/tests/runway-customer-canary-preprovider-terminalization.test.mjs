import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../../../supabase/migrations/20261011750000_runway_customer_canary_preprovider_terminalization.sql",import.meta.url),"utf8");

test("exact canary terminalization requires definitive release and no provider evidence",()=>{
  assert.match(migration,/version='20261011740000'/);
  assert.match(migration,/op\.state<>'submitting'/);
  assert.match(migration,/op\.provider_task_id is not null/);
  assert.match(migration,/runway_submission_boundary_events/);
  assert.match(migration,/runway_execution_reconciliation_receipts/);
  assert.match(migration,/latest_event\.event_type<>'released'/);
  assert.match(migration,/aggregate_exposure_exhausted/);
  assert.match(migration,/transmitted/);
});

test("terminalization changes only the mutable receipt lifecycle",()=>{
  assert.match(migration,/update tongs\.broll_operation_receipts set[\s\S]*state='failed'/);
  assert.doesNotMatch(migration,/update tongs\.(customer_spending_quotes|customer_spending_quote_acceptances|funding_reservations|funding_reservation_events|runway_funding_bindings)/);
  assert.doesNotMatch(migration,/delete from|truncate|drop table|alter table/);
  assert.match(migration,/environment='live'[\s\S]*?<>'inactive_ready'/);
});
