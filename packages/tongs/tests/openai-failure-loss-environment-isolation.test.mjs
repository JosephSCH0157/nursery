import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(root,
  "supabase/migrations/20261011380000_openai_failure_loss_environment_isolation.sql"), "utf8");
const coordinator = readFileSync(resolve(root,
  "packages/tongs/src/providers/paid-openai-text-execution-coordinator.ts"), "utf8");
const handler = readFileSync(resolve(root,
  "apps/nursery/server/hearth/create-hearth-ai-handler.ts"), "utf8");

test("failure-loss authority is derived from the immutable reservation environment", () => {
  assert.match(migration, /canonical_environment:=reservation\.funding_environment/i);
  assert.match(migration, /canonical_environment not in\('test','live'\)/i);
  assert.match(migration, /where policy_row\.route_code=binding\.route_code[\s\S]+policy_row\.environment=canonical_environment/i);
  assert.match(migration, /join tongs\.funding_reservations exposure_reservation[\s\S]+exposure_reservation\.funding_environment=canonical_environment/i);
  assert.doesNotMatch(migration, /openai-text-loss:'\|\|binding\.route_code\|\|':production'/i);
});

test("Test and Live risk rollouts are independent but use one canonical function path", () => {
  assert.match(migration, /create table tongs\.openai_text_failure_loss_rollout_revisions/i);
  assert.match(migration, /primary key\(route_code,financial_environment,revision\)/i);
  assert.match(migration, /'test'::text as financial_environment[\s\S]+'live'::text/i);
  assert.match(migration, /_current_openai_text_failure_loss_rollout\(binding\.route_code,canonical_environment\)/i);
  assert.match(migration, /where risk_revision\.route_code=hold\.route_code[\s\S]+risk_revision\.financial_environment=canonical_environment/i);
});

test("legacy exposure remains immutable and is explicitly classified through its reservation", () => {
  assert.match(migration, /historical rows remain null\s+-- and are classified through their immutable reservation/i);
  assert.match(migration, /environment_authority='canonical_reservation'/i);
  assert.doesNotMatch(migration, /update\s+tongs\.openai_text_failure_exposure_(holds|events)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+tongs\.openai_text_failure/i);
});

test("pre-provider platform-risk denial releases once and maps to safe customer copy", () => {
  assert.match(coordinator, /platform-risk-denied-release/);
  assert.match(coordinator, /new OpenAiTextBoundaryError\("platform_risk_unavailable"\)/);
  assert.match(handler, /Hearth is temporarily unable to start this AI operation\. No credits were charged\./);
  assert.match(handler, /The accepted funding context did not authorize this provider call\./);
});

test("repair does not mutate owner, BYO, simulator, pricing, or the approved limits", () => {
  assert.match(migration, /per_operation_limit_micros,aggregate_limit_micros,\s+rolling_window_seconds,maximum_concurrency/);
  assert.doesNotMatch(migration, /update\s+tongs\.openai_text_failure_loss_policy_revisions/i);
  assert.doesNotMatch(migration, /owner_hearth|user_ai_keys|simulator|private_pricing_revisions/i);
  assert.doesNotMatch(migration, /11015\s*\+|set\s+aggregate_limit_micros|set\s+per_operation_limit_micros/i);
});
