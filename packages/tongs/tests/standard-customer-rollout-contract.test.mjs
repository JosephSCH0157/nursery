import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const source = (path) => readFileSync(resolve(root, path), "utf8");
const rollout = source("supabase/migrations/20261011240000_tongs_standard_customer_rollout.sql");
const beta = source("supabase/migrations/20261011250000_tongs_beta_credit_controls.sql");
const providerAuthority = source("supabase/migrations/20261011280000_tongs_normal_customer_provider_authority.sql");
const purchaseCallerRole = source("supabase/migrations/20261011290000_tongs_credit_pack_availability_caller_role.sql");
const api = source("packages/tongs/src/workpiece-commit-api.ts");

test("normal customers are credit-bounded without certification operation or rolling quotas", () => {
  assert.match(rollout, /'test', 4, 'customer_rollout_active'/);
  assert.match(rollout, /11015, 1, null, null/);
  assert.match(rollout, /authorization_kind = 'normal_customer' and maximum_operation_count is null/);
  assert.match(rollout, /authorization_kind = 'normal_customer' and rolling_window_seconds is null/);
  assert.match(rollout, /if v_authorization\.maximum_operation_count is not null then/);
  assert.match(rollout, /customer paid execution concurrency limit reached/);
  assert.match(rollout, /normal_customer_credit_bounded/);
  assert.doesNotMatch(rollout, /maximum_operation_count\s*=\s*[2-9]/);
});

test("normal authorization uses one environment-parameterized Test and Live path", () => {
  assert.match(rollout, /p_financial_environment text/);
  assert.match(rollout, /p_financial_environment not in \('test', 'live'\)/);
  assert.match(rollout, /where environment = p_financial_environment/);
  assert.match(rollout, /p_workspace_id, p_financial_environment/);
});

test("normal customer provider attempts keep the existing failure-loss safety boundary", () => {
  assert.match(providerAuthority, /authorization_kind = 'normal_customer'/);
  assert.match(providerAuthority, /funding_source_type in \('customer_deposit', 'paid_allowance', 'beta_grant'\)/);
  assert.match(providerAuthority, /_authorize_openai_text_provider_attempt_before_customer_test_scope/);
  assert.match(providerAuthority, /normal_customer_credit_bounded/);
  assert.match(providerAuthority, /aggregate_admission_required/);
});

test("beta grants are canonical, operator-only, Test-only, and participate in relief", () => {
  assert.match(beta, /create table tongs\.beta_credit_grants/);
  assert.match(beta, /not tongs\.is_platform_operator\(p_actor_id\)/);
  assert.match(beta, /_current_financial_environment\(\) <> 'test'/);
  assert.match(beta, /consume_beta_test_credits/);
  assert.match(beta, /funding_source_type in \('customer_deposit','paid_allowance','beta_grant'\)/);
  assert.match(beta, /customer_operation_relieved',v_res\.funding_environment/);
  assert.match(beta, /beta_credit_deferred_value/);
  assert.match(beta, /beta_forge_credit_units/);
});

test("beta purchase availability is readable by the customer and the trusted checkout backend", () => {
  assert.match(purchaseCallerRole, /coalesce\(auth\.role\(\), ''\)/);
  assert.match(purchaseCallerRole, /\('authenticated', 'service_role'\)/);
  assert.match(purchaseCallerRole, /grant execute.*authenticated, service_role/s);
});

test("customer quote DTOs contain credits and omit financial internals", () => {
  const blocks = [...api.matchAll(/billing_quote:\s*\{([\s\S]*?)\n\s*\},/g)].map((match) => match[1]);
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.match(block, /credit_charge:/);
    assert.doesNotMatch(block, /currency:|micros:|funding_source:|provider_model_id:|catalog_revision:|cost_components:|limits:/);
  }
});
