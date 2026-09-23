import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261011530000_visual_unified_plan_test_product.sql",
  import.meta.url,
), "utf8");
const repairMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011540000_visual_unified_plan_canary_repair.sql",
  import.meta.url,
), "utf8");
const v5AuthorityMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011550000_visual_unified_plan_v5_compatibility_authority.sql",
  import.meta.url,
), "utf8");
const canaryRiskMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011560000_visual_unified_plan_v5_canary_risk_authorization.sql",
  import.meta.url,
), "utf8");
const service = readFileSync(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/providers/unified-visual-plan-provider.ts", import.meta.url), "utf8");
const certification = readFileSync(new URL("../../../scripts/certify-visual-unified-plan-gasoline-request.mts", import.meta.url), "utf8");

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
  assert.match(provider, /forge\.unified-visual-plan-provider\.v5/);
  assert.match(migration, /openai_text_validation_failure_evidence%rowtype/);
  assert.match(migration, /p_route_code not in \('hearth\.framing_pack_generation','visual\.unified_plan'\)/);
  assert.match(migration, /perform tongs\._require_pricing_service_role\(\)/);
});

test("Reference Material structured output requires one direct canonical Source", () => {
  assert.match(provider, /const canonicalReferenceSourceFields = \{[\s\S]+minItems:\s*1,[\s\S]+maxItems:\s*1,[\s\S]+enum:\s*\["direct"\]/);
  assert.match(provider, /reference_clips:[\s\S]+\.\.\.canonicalReferenceSourceFields/);
  assert.match(provider, /reference_visuals:[\s\S]+\.\.\.canonicalReferenceSourceFields/);
  assert.match(provider, /const sourceFields = \{[\s\S]+maxItems:\s*8/);
  assert.match(provider, /canonical_source_required/);
});

test("Gate 1 and runtime share canonical source and bounded-request builders", () => {
  assert.match(service, /canonicalizeUnifiedVisualSourceCatalog/);
  assert.match(service, /prepareUnifiedVisualPlanProviderRequest/);
  assert.match(certification, /EXPECTED_SOURCE_CATALOG_ENTRIES = 4/);
  assert.match(certification, /canonicalizeUnifiedVisualSourceCatalog/);
  assert.match(certification, /prepareUnifiedVisualPlanProviderRequest/);
  assert.doesNotMatch(certification, /rpc\/read_workpiece_sources/);
});

test("validation failure evidence and parent operation terminalization are replay-safe", () => {
  assert.match(service, /this\.openAiTextGate\.rpc\("record_openai_text_validation_failure_evidence"/);
  assert.match(service, /paidOutcome\.state === "failed_released" && validationFailureMessage/);
  assert.match(service, /unified_visual_plan_terminal_failure/);
  assert.match(repairMigration, /state in\([\s\S]+?'failed'/);
  assert.match(repairMigration, /if op\.state='failed'[\s\S]+failed_replay/);
  assert.match(repairMigration, /create table tongs\.unified_visual_plan_reconciliation_events/);
  assert.match(repairMigration, /reconcile_unified_visual_plan_validation_failure/);
  assert.match(
    repairMigration,
    /'supplier_expense_micros',supplier_expense_micros,'customer_charge_micros',0,[\s\S]*?'canonical_result_persisted',false/,
  );
  assert.match(repairMigration, /force row level security/);
  assert.match(repairMigration, /grant select on tongs\.unified_visual_plan_reconciliation_events to service_role/);
});

test("Visual Plan provider accepts harmless Responses output serialization without a retry", () => {
  assert.match(provider, /typeof payload\.output_text === "string"/);
  assert.match(provider, /parseError = "visual_plan_json_invalid"/);
  assert.match(service, /maximumAttempts:\s*context\.maximumAttempts/);
  assert.match(migration, /maximum_attempts=1/);
  assert.doesNotMatch(service, /visual\.unified_plan[\s\S]{0,1000}maximumAttempts:\s*2/);
});

test("model catalog revision 11 advances only the Visual Plan provider contract to v5", () => {
  assert.match(v5AuthorityMigration, /next_catalog_id,11,'active'/);
  assert.match(v5AuthorityMigration, /provider_contract_version','forge\.unified-visual-plan-provider\.v5'/);
  assert.match(v5AuthorityMigration, /compatibility_status='generation_verified'/);
  assert.match(v5AuthorityMigration, /maximum_input_tokens=32000/);
  assert.match(v5AuthorityMigration, /maximum_output_tokens=6144/);
  assert.match(v5AuthorityMigration, /maximum_attempts=1/);
  assert.match(v5AuthorityMigration, /supporting_cost_coverage='complete'/);
  assert.match(v5AuthorityMigration, /cost_policy_revision_id='17000000-0000-4000-8000-000000000001'/);
  assert.match(v5AuthorityMigration, /unrelated model-route compatibility changed/);
  assert.match(v5AuthorityMigration, /financial_environment='live'[\s\S]+status='active'/);
  assert.doesNotMatch(v5AuthorityMigration, /insert into tongs\.(private_pricing|openai_text_cost_policy|openai_text_rollout|customer_paid_execution_scope|openai_text_failure_loss)/);
  assert.doesNotMatch(v5AuthorityMigration, /update tongs\.openai_text_model_catalog/);
});

test("one additional v5 canary receives finite Test-only aggregate authority", () => {
  assert.match(canaryRiskMigration, /'bounded_test_risk_acceptance'/);
  assert.match(canaryRiskMigration, /6286,0,13773,13773,20059/);
  assert.match(canaryRiskMigration, /'test',2,'operator_authorized'/);
  assert.match(canaryRiskMigration, /additional_loss_capacity_micros=13773/);
  assert.match(canaryRiskMigration, /effective_aggregate_limit_micros=20059/);
  assert.match(canaryRiskMigration, /per_operation_limit_micros=13773/);
  assert.match(canaryRiskMigration, /maximum_concurrency=1/);
  assert.match(canaryRiskMigration, /rolling_window_seconds=86400/);
  assert.match(canaryRiskMigration, /provider_contract_version'='forge\.unified-visual-plan-provider\.v5'/);
  assert.doesNotMatch(canaryRiskMigration, /insert into tongs\.(private_pricing|customer_paid_execution_scope|openai_text_failure_loss_policy)/i);
  assert.doesNotMatch(canaryRiskMigration, /update\s+tongs\./i);
  const riskInserts = canaryRiskMigration.match(
    /insert into tongs\.openai_text_failure_loss_(?:operator_decisions|rollout_revisions)[\s\S]*?;/gi,
  ) ?? [];
  assert.equal(riskInserts.length, 2);
  for (const statement of riskInserts) {
    assert.doesNotMatch(statement, /'visual\.unified_plan','live'/i);
  }
});
