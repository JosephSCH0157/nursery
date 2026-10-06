import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(
  root,
  "supabase/migrations/20261012070000_return_paid_funding_environment.sql",
), "utf8");

test("paid execution context projects the immutable reservation environment", () => {
  assert.match(migration, /'funding_environment',v_res\.funding_environment/);
  assert.match(migration, /v_res\.funding_environment is null[\s\S]*not in \('test','live','owner_internal'\)/);
  assert.doesNotMatch(migration, /p_funding_environment|coalesce\([^)]*funding_environment|funding_environment[^\n]*default/i);
});

test("funding-environment repair preserves the exact execution gates", () => {
  for (const invariant of [
    /_require_pricing_service_role\(\)/,
    /_owner_paid_execution_canary_for_reservation\(p_reservation_id\)/,
    /not \(v_route_activated or v_owner_canary_activated\)/,
    /v_res\.reserved_wholesale_spend_micros<>v_cost\.full_cost_ceiling_micros/,
    /v_binding\.model not in \(v_rate\.runtime_model_alias,v_rate\.provider_model_id\)/,
  ]) assert.match(migration, invariant);
});

test("paid execution context remains service-only", () => {
  assert.match(migration, /revoke all on function tongs\.resolve_openai_text_paid_execution_context[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /grant execute on function tongs\.resolve_openai_text_paid_execution_context[\s\S]*to service_role/);
});
