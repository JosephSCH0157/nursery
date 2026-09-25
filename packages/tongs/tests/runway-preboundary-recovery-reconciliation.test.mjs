import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL(
  "../../../supabase/migrations/20261011790000_runway_preboundary_recovery_reconciliation.sql",
  import.meta.url),"utf8");

test("reconciliation is ordered after the aggregate signature repair and exact-operation only",()=>{
  assert.match(migration,/version='20261011780000'/);
  assert.match(migration,/forge:broll:acquire:eca82dd315133b5db4197005ee769f7bfae6cd064ff80dea53f787d5feae176f/);
  assert.match(migration,/recovered_inflight_submission_without_task_id/);
  assert.match(migration,/state<>'submission_unknown'/);
});

test("no-transmission proof covers every canonical paid and provider boundary",()=>{
  assert.match(migration,/runway_submission_boundary_events/);
  assert.match(migration,/paid_operation_aggregate_bindings/);
  assert.match(migration,/restricted_beta_exposure_holds/);
  assert.match(migration,/runway_execution_reconciliation_receipts/);
  assert.match(migration,/provider_task_id is not null/);
  assert.match(migration,/provider_response_json is not null/);
  assert.match(migration,/provider_submission_json is not null/);
  assert.match(migration,/result_candidate_revision_id is not null/);
});

test("accepted 160-credit reservation is preserved without settlement or release",()=>{
  assert.match(migration,/reserved_credit_units<>160/);
  assert.match(migration,/reserved_customer_charge_micros<>800000/);
  assert.match(migration,/reserved_wholesale_spend_micros<>600000/);
  assert.match(migration,/customer_spending_quote_acceptances/);
  assert.match(migration,/event_type[\s\S]*<>'reserved'/);
  assert.doesNotMatch(migration,/settle_operation\s*\(/);
  assert.doesNotMatch(migration,/release_operation\s*\(/);
});

test("canonical reconciliation retains the old attempt and authorizes one safe resubmission",()=>{
  assert.match(migration,/reconcile_broll_runway_submission\(/);
  assert.match(migration,/'authorize_resubmission'/);
  assert.match(migration,/transport_evidence_json#>>'\{latest,submission_attempt_id\}'/);
  assert.match(migration,/resubmission_authorized_at is null/);
  assert.match(migration,/environment='live'[\s\S]*<>'inactive_ready'/);
});
