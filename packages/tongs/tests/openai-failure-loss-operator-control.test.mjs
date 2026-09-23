import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(root,
  "supabase/migrations/20260916202804_operator_controlled_openai_failure_loss.sql"), "utf8");

test("operator risk decisions are append-only, attributable, and service-only", () => {
  assert.match(migration, /create table tongs\.openai_text_failure_loss_operator_decisions/i);
  assert.match(migration, /actor_id uuid not null references tongs\.platform_operators/i);
  assert.match(migration, /length\(btrim\(reason\)\)>=12/i);
  assert.match(migration, /openai_text_failure_loss_operator_decisions_immutable/i);
  assert.match(migration, /_reject_accounting_mutation\(\)/i);
  assert.match(migration, /_require_pricing_service_role\(\)/i);
  assert.match(migration, /not tongs\.is_platform_operator\(p_actor_id\)/i);
  assert.match(migration, /grant execute on function tongs\.control_openai_text_failure_loss_environment[\s\S]+to service_role/i);
});

test("bounded risk acceptance is finite, explicit, and Test-only", () => {
  assert.match(migration, /decision_type='bounded_test_risk_acceptance'[\s\S]+financial_environment='test'/i);
  assert.match(migration, /effective_aggregate_limit_micros=[\s\n\r]*known_exposure_micros\+additional_loss_capacity_micros/i);
  assert.match(migration, /p_financial_environment<>'test'/i);
  assert.match(migration, /p_additional_loss_capacity_micros>policy\.per_operation_limit_micros/i);
  assert.doesNotMatch(migration, /unlimited|bypass_provider|skip_reservation/i);
});

test("the shared provider gate keeps hard operation and concurrency controls", () => {
  assert.match(migration, /p_failure_exposure_micros>policy\.per_operation_limit_micros/i);
  assert.match(migration, /concurrency_count>=policy\.maximum_concurrency/i);
  assert.match(migration, /committed_micros\+p_failure_exposure_micros>effective_aggregate_limit_micros/i);
  assert.match(migration, /begin_result:=tongs\.begin_provider_attempt/i);
  assert.match(migration, /shared spending gate denied OpenAI execution/i);
  assert.doesNotMatch(migration, /update\s+tongs\.openai_text_failure_loss_policy_revisions/i);
});

test("accepted aggregate risk and later exhaustion remain auditable", () => {
  assert.match(migration, /'aggregate_risk_accepted'/i);
  assert.match(migration, /'accepted_total_exposure_micros'/i);
  assert.match(migration, /'Automatic halt: effective aggregate Forge failure-loss ceiling reached\.'/i);
  assert.match(migration, /operator_decision_id.*risk_rollout\.operator_decision_id/is);
});

test("operator controls preserve independent emergency halt and idempotent replay", () => {
  assert.match(migration, /'emergency_halt','policy_enforce','bounded_test_risk_acceptance'/i);
  assert.match(migration, /existing_decision[\s\S]+operator decision idempotency conflict/i);
  assert.match(migration, /'decision_id',existing_decision\.id,'replay',true/i);
  assert.match(migration, /'decision_id',p_decision_id,'replay',false/i);
  assert.match(migration, /'openai-text-loss:'\|\|btrim\(p_route_code\)\|\|':'\|\|p_financial_environment/i);
});

test("Live retains an independently selected aggregate policy budget", () => {
  assert.match(migration, /rollout\.financial_environment=p_financial_environment/i);
  assert.match(migration, /effective_limit:=policy\.aggregate_limit_micros/i);
  assert.doesNotMatch(migration, /aggregate_limit_micros\s*=\s*policy\.per_operation_limit_micros/i);
  assert.doesNotMatch(migration, /update\s+tongs\.openai_text_failure_loss_policy_revisions/i);
});
