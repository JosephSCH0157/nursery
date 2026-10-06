import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(
  root,
  "supabase/migrations/20261012060000_scoped_owner_canary_execution_context_activation.sql",
), "utf8");
const activation = readFileSync(resolve(
  root,
  "supabase/migrations/20261012050000_owner_only_test_canary_scoped_activation.sql",
), "utf8");

test("execution context consumes the one canonical scoped owner-canary authority", () => {
  assert.match(migration, /v_route_activated:=coalesce\(v_rollout\.mode='enforce' and v_rollout\.cost_policy_revision_id=v_cost\.id,false\)/);
  assert.match(migration, /v_owner_canary_activated:=coalesce\(v_rollout\.mode='halt_new' and exists\([\s\S]*_owner_paid_execution_canary_for_reservation\(p_reservation_id\)/);
  assert.match(migration, /not \(v_route_activated or v_owner_canary_activated\)/);
  assert.doesNotMatch(migration, /is_platform_operator\(p_user_id\)|account_class\s*=\s*'owner'/);
  assert.equal((migration.match(/_owner_paid_execution_canary_for_reservation/g) ?? []).length, 1);
});

test("accepted complete-cost identity remains exact", () => {
  for (const invariant of [
    /operation_id=btrim\(p_operation_id\)/,
    /reservation_id=p_reservation_id/,
    /route_code=p_route_code/,
    /v_res\.user_id<>p_user_id/,
    /v_qb\.workspace_id<>p_workspace_id/,
    /v_qb\.workpiece_id<>btrim\(p_workpiece_id\)/,
    /v_qb\.request_fingerprint<>p_request_fingerprint/,
    /v_quote\.request_fingerprint<>p_request_fingerprint/,
    /v_qb\.runtime_model<>v_binding\.model/,
    /v_qb\.pricing_revision_id<>v_binding\.pricing_revision_id/,
    /v_qb\.cost_policy_revision_id<>v_binding\.cost_policy_revision_id/,
    /customer_spending_quote_acceptances/,
    /v_cost\.lifecycle_state not in \('pilot_candidate','active'\)/,
    /v_cost\.cost_coverage<>'complete'/,
    /v_res\.reserved_wholesale_spend_micros<>v_cost\.full_cost_ceiling_micros/,
    /v_binding\.model not in \(v_rate\.runtime_model_alias,v_rate\.provider_model_id\)/,
  ]) assert.match(migration, invariant);
});

test("canonical scoped activation keeps owner, Test, expiry, budget, price, model, and operation bounds", () => {
  for (const invariant of [
    /activation\.state='active'/,
    /activation\.valid_from<=now\(\) and activation\.valid_until>now\(\)/,
    /scope_auth\.authorization_kind='owner_only'/,
    /scope_auth\.financial_environment='test'/,
    /scope_auth\.status='active'/,
    /scope_auth\.valid_from<=now\(\) and scope_auth\.valid_until>now\(\)/,
    /scope_auth\.maximum_operation_count=1 and scope_auth\.maximum_concurrency=1/,
    /budget\.environment='test'/,
    /budget\.owner_testing_user_id=scope_auth\.user_id/,
    /budget\.workspace_id=scope_auth\.workspace_id/,
    /lower\(budget\.provider\)='openai'/,
    /budget\.route=scope_auth\.route_code/,
    /budget_revision\.status='active'/,
    /budget_revision\.maximum_amount_micros=scope_auth\.maximum_wholesale_exposure_micros/,
    /now\(\)>=budget\.period_start and now\(\)<budget\.period_end/,
    /reservation\.funding_source_type='owner_budget'/,
    /reservation\.funding_environment='test'/,
    /quote_binding\.runtime_model=scope_auth\.model_or_sku/,
    /quote_binding\.pricing_revision_id=scope_auth\.pricing_revision_id/,
    /quote_binding\.cost_policy_revision_id=scope_auth\.cost_policy_revision_id/,
  ]) assert.match(activation, invariant);
});

test("private execution-context authority remains service-only", () => {
  assert.match(migration, /revoke all on function tongs\.resolve_openai_text_paid_execution_context[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function tongs\.resolve_openai_text_paid_execution_context[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated/);
});
