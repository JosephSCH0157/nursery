import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261011530000_visual_unified_plan_test_product.sql",
  import.meta.url,
), "utf8");
const service = readFileSync(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/providers/unified-visual-plan-provider.ts", import.meta.url), "utf8");

test("Visual Plan product uses one bounded Luna attempt and four Forge Credits", () => {
  assert.match(migration, /'visual\.unified_plan',3,[\s\S]+32000,6144,1,13773,0,13773,'complete','active'/);
  assert.match(migration, /coalesce\(max\(revision\),0\)\+1,'enforce',cost_id/);
  assert.match(migration, /actor,18319,1681,20000/);
  assert.match(migration, /customer_credit_units=4/);
  assert.match(migration, /maximum_customer_charge_micros[\s\S]+20000,13773,1/);
  assert.match(migration, /'test','17000000-0000-4000-8000-000000000006'[\s\S]+'live','17000000-0000-4000-8000-000000000007'/);
  assert.doesNotMatch(migration, /financial_environment='live'[\s\S]{0,300}status='active'[\s\S]{0,300}insert into tongs\.customer_paid_execution_scope_authorizations/i);
});

test("Visual Plan request remains bound to canonical approval and the existing unified operation", () => {
  assert.match(service, /routeCode:\s*"visual\.unified_plan"/);
  assert.match(service, /model:\s*"gpt-5\.6-luna"/);
  assert.match(service, /script_approval_id:\s*input\.script_approval_id/);
  assert.match(service, /script_content_hash:\s*approval\.data\.script_content_hash/);
  assert.match(service, /expectedFingerprint !== input\.operation_fingerprint/);
  assert.match(service, /begin_unified_visual_plan/);
  assert.match(service, /record_unified_visual_plan_provider_response/);
  assert.match(service, /record_unified_visual_plan_child/);
  assert.match(service, /readLatestUnifiedVisualPlanOperation|read_unified_visual_plan_operation/);
});

test("Visual Plan validation evidence is private, immutable, and retains the raw paid response", () => {
  assert.match(provider, /rawResponseText:\s*string/);
  assert.match(service, /privateCaptureEvidence:[\s\S]+raw_provider_response_text:\s*result\.rawResponseText/);
  assert.match(service, /record_openai_text_validation_failure_evidence/);
  assert.match(service, /UNIFIED_VISUAL_PLAN_PROVIDER_CONTRACT_VERSION/);
  assert.match(provider, /forge\.unified-visual-plan-provider\.v4/);
  assert.match(migration, /openai_text_validation_failure_evidence%rowtype/);
  assert.match(migration, /p_route_code not in \('hearth\.framing_pack_generation','visual\.unified_plan'\)/);
  assert.match(migration, /perform tongs\._require_pricing_service_role\(\)/);
});

test("Visual Plan provider accepts harmless Responses output serialization without a retry", () => {
  assert.match(provider, /typeof payload\.output_text === "string"/);
  assert.match(provider, /parseError = "visual_plan_json_invalid"/);
  assert.match(service, /maximumAttempts:\s*context\.maximumAttempts/);
  assert.match(migration, /maximum_attempts=1/);
  assert.doesNotMatch(service, /visual\.unified_plan[\s\S]{0,1000}maximumAttempts:\s*2/);
});
