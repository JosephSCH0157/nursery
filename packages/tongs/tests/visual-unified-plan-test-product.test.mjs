import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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
const transportRecoveryMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011570000_visual_unified_plan_transport_lease_recovery.sql",
  import.meta.url,
), "utf8");
const submissionUnknownConcurrencyMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011580000_visual_plan_submission_unknown_concurrency_repair.sql",
  import.meta.url,
), "utf8");
const paidScopeConcurrencyMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011590000_visual_plan_submission_unknown_paid_scope_concurrency_repair.sql",
  import.meta.url,
), "utf8");
const referenceVisualStateRepairMigration = readFileSync(new URL(
  "../../../supabase/migrations/20261011600000_visual_plan_reference_visual_state_repair.sql",
  import.meta.url,
), "utf8");
const service = readFileSync(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/providers/unified-visual-plan-provider.ts", import.meta.url), "utf8");
const hearthAuthority = readFileSync(new URL("../../../apps/hearth/src/lib/hearth-unified-visual-plan-authority.ts", import.meta.url), "utf8");
const hearthRecovery = readFileSync(new URL("../../../apps/hearth/src/hooks/visuals/useUnifiedVisualPlanRecovery.ts", import.meta.url), "utf8");
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
  assert.match(service, /paidOutcome\.state === "failed_released"\) \{[\s\S]+?fail_unified_visual_plan/);
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

test("expired Visual Plan attempts become replay-safe submission-unknown without invented cost", () => {
  assert.match(transportRecoveryMigration, /'submission_unknown'/);
  assert.match(transportRecoveryMigration, /attempt_event\.lease_expires_at>now\(\)/);
  assert.match(transportRecoveryMigration, /openai_text_provider_captures/);
  assert.match(transportRecoveryMigration, /openai_text_usage_evidence/);
  assert.match(transportRecoveryMigration, /openai_text_persisted_results/);
  assert.match(transportRecoveryMigration, /close_openai_text_failure_exposure[\s\S]+?'unresolved'/);
  assert.match(transportRecoveryMigration, /mark_submission_unknown/);
  assert.match(transportRecoveryMigration, /'ambiguous'/);
  assert.match(transportRecoveryMigration, /'automatic_resubmission_allowed',false/);
  assert.match(transportRecoveryMigration, /expense_micros<>0/);
  assert.doesNotMatch(transportRecoveryMigration, /insert into tongs\.supplier_expenses/i);
  assert.doesNotMatch(transportRecoveryMigration, /customer_charge_micros\s*=/i);
  assert.match(transportRecoveryMigration, /on conflict\(event_key\) do nothing/);
  assert.match(transportRecoveryMigration, /force row level security/);
});

test("terminal submission-unknown liability remains committed without consuming active concurrency", () => {
  assert.match(submissionUnknownConcurrencyMigration, /event_type in\('authorized','unresolved'\) then authorized_exposure_micros/);
  assert.match(submissionUnknownConcurrencyMigration, /event_type in\('authorized','unresolved'\) and counts_concurrency/);
  assert.match(submissionUnknownConcurrencyMigration, /reservation_event\.event_type='submission_unknown'/);
  assert.match(submissionUnknownConcurrencyMigration, /operation\.state='submission_unknown'/);
  assert.match(submissionUnknownConcurrencyMigration, /attempt_event\.lease_expires_at<=now\(\)/);
  assert.match(submissionUnknownConcurrencyMigration, /automatic_resubmission_allowed'='false'/);
  assert.match(submissionUnknownConcurrencyMigration, /recovery\.event_type='expired_attempt_submission_unknown'/);
  assert.match(submissionUnknownConcurrencyMigration, /20059,0,13773,13773,33832/);
  assert.match(submissionUnknownConcurrencyMigration, /'visual\.unified_plan','test',3,'operator_authorized'/);
  assert.match(submissionUnknownConcurrencyMigration, /customer_credit_units=4 and full_cost_ceiling_micros=13773/);
  assert.doesNotMatch(submissionUnknownConcurrencyMigration, /insert into tongs\.(supplier_expenses|customer_paid_execution_scope_authorizations|private_pricing_revisions|openai_text_failure_loss_policy_revisions)/i);
  assert.doesNotMatch(submissionUnknownConcurrencyMigration, /update\s+tongs\./i);
});

test("terminal submission-unknown releases stale paid-scope concurrency only with canonical evidence", () => {
  assert.match(paidScopeConcurrencyMigration, /_funding_reservation_counts_paid_scope_concurrency/);
  assert.match(paidScopeConcurrencyMigration, /binding\.route_code='visual\.unified_plan'/);
  assert.match(paidScopeConcurrencyMigration, /operation\.state='submission_unknown'/);
  assert.match(paidScopeConcurrencyMigration, /terminal_event\.event_type='submission_unknown'/);
  assert.match(paidScopeConcurrencyMigration, /attempt_event\.event_type='provider_attempt_shadowed'/);
  assert.match(paidScopeConcurrencyMigration, /attempt_event\.lease_expires_at<=now\(\)/);
  assert.match(paidScopeConcurrencyMigration, /automatic_resubmission_allowed'='false'/);
  assert.match(paidScopeConcurrencyMigration, /recovery\.event_type='expired_attempt_submission_unknown'/);
  assert.match(paidScopeConcurrencyMigration, /committed<>20059 or failure_loss_concurrency<>0/);
  assert.match(paidScopeConcurrencyMigration, /maximum_concurrency/);
  assert.doesNotMatch(paidScopeConcurrencyMigration, /insert into tongs\.(supplier_expenses|customer_paid_execution_scope_authorizations|private_pricing_revisions|openai_text_failure_loss_policy_revisions)/i);
  assert.doesNotMatch(paidScopeConcurrencyMigration, /update\s+tongs\./i);
});

test("the final Visual Plan state constraint preserves every four-child and terminal state", () => {
  assert.match(
    referenceVisualStateRepairMigration,
    /state in\([\s\S]*?'pending'[\s\S]*?'provider_completed'[\s\S]*?'image_plan_committed'[\s\S]*?'broll_plan_committed'[\s\S]*?'reference_plan_committed'[\s\S]*?'reference_visual_plan_committed'[\s\S]*?'verified'[\s\S]*?'failed'[\s\S]*?'submission_unknown'/,
  );

  const migrationsDirectory = new URL("../../../supabase/migrations/", import.meta.url);
  const constraintReplacements = readdirSync(migrationsDirectory)
    .filter((name) => name >= "20261011600000" && name.endsWith(".sql"))
    .map((name) => [name, readFileSync(new URL(name, migrationsDirectory), "utf8")])
    .filter(([, sql]) => /add constraint unified_visual_plan_operations_state_check/i.test(sql));
  assert.ok(constraintReplacements.length >= 1);
  for (const [name, sql] of constraintReplacements) {
    assert.match(sql, /'reference_visual_plan_committed'/, `${name} dropped the four-child state`);
    assert.match(sql, /'failed'/, `${name} dropped the failed terminal state`);
    assert.match(sql, /'submission_unknown'/, `${name} dropped the ambiguous terminal state`);
  }
});

test("historical Reference Visual persistence recovery is exact, private, nonbillable, and replay-safe", () => {
  assert.match(referenceVisualStateRepairMigration, /perform tongs\._require_pricing_service_role\(\)/);
  assert.match(referenceVisualStateRepairMigration, /force row level security/);
  assert.match(referenceVisualStateRepairMigration, /grant select on tongs\.unified_visual_plan_persistence_reconciliation_events to service_role/);
  assert.match(referenceVisualStateRepairMigration, /from public,anon,authenticated,service_role/);
  assert.match(referenceVisualStateRepairMigration, /failed_stage is distinct from 'reference_visual_retention'/);
  assert.match(referenceVisualStateRepairMigration, /failure_code is distinct from 'unified_reference_visual_receipt_failed'/);
  assert.match(referenceVisualStateRepairMigration, /capture_count<>1/);
  assert.match(referenceVisualStateRepairMigration, /usage_count<>1/);
  assert.match(referenceVisualStateRepairMigration, /p_expected_supplier_expense_micros<>5190/);
  assert.match(referenceVisualStateRepairMigration, /tongs\._funding_reservation_state\(p_reservation_id\)<>'released'/);
  assert.match(referenceVisualStateRepairMigration, /settlement_count<>0/);
  assert.match(referenceVisualStateRepairMigration, /openai_text_persisted_results/);
  assert.match(referenceVisualStateRepairMigration, /canonical Visual Plan children changed after the failed receipt/);
  assert.match(referenceVisualStateRepairMigration, /state='reference_visual_plan_committed'/);
  assert.match(referenceVisualStateRepairMigration, /tongs\.verify_unified_visual_plan\(op\.operation_id,op\.operation_fingerprint\)/);
  assert.match(referenceVisualStateRepairMigration, /'disposition','replay','replay',true/);
  assert.match(referenceVisualStateRepairMigration, /'customer_charge_micros',0,'settled_credit_units',0/);
  assert.doesNotMatch(referenceVisualStateRepairMigration, /insert into tongs\.supplier_expenses/i);
  assert.doesNotMatch(referenceVisualStateRepairMigration, /insert into tongs\.openai_text_persisted_results/i);
  assert.doesNotMatch(referenceVisualStateRepairMigration, /https:\/\/api\.openai\.com|fetch\(|OpenAiUnifiedVisualPlanProvider/i);
});

test("Visual Plan recovery is readback-only while terminal ambiguity permits only a distinct fresh operation", () => {
  assert.match(service, /parts\[4\] === "generate" \|\| parts\[4\] === "recover"/);
  assert.match(service, /recoveryOnly = parts\[4\] === "recover"/);
  assert.match(service, /recover_expired_unified_visual_plan_attempt/);
  assert.match(service, /mark_unified_visual_plan_submission_unknown/);
  assert.match(hearthAuthority, /\/visual-plan-v2\/recover/);
  assert.match(hearthAuthority, /No automatic retry is allowed/);
  assert.match(hearthRecovery, /resume:\s*recoverUnifiedVisualPlanOperation/);
  assert.match(hearthRecovery, /finally\s*\{[\s\S]+?setBusy\(false\)/);
  assert.match(hearthRecovery, /latest\.data\.state === "submission_unknown"[\s\S]+?setRetryBlocked\(false\)/);
  assert.match(hearthAuthority, /operationId = `forge:unified-visual-plan:\$\{operationFingerprint\}:\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(hearthRecovery, /setRetryBlocked\(unknown \|\| resumed\.code === "unified_visual_plan_recovery_required"\)/);
  assert.doesNotMatch(hearthRecovery, /generateUnifiedVisualPlan/);
});
