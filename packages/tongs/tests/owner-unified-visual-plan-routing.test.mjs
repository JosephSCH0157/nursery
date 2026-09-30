import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
const ownerExecutor = await readFile(new URL("../../../apps/nursery/server/hearth/owner-unified-visual-plan-execution.ts", import.meta.url), "utf8");

test("owner Unified Visual Plan authority branches before ordinary customer funding", () => {
  const methodStart = service.indexOf("async generateUnifiedVisualPlan(");
  const methodEnd = service.indexOf("async beginReferenceClipAcquisition(", methodStart);
  const method = service.slice(methodStart, methodEnd);
  const owner = method.indexOf("ownerUnifiedVisualPlanExecutor");
  const customer = method.indexOf("resolveOrdinaryOpenAiTextFunding");
  assert.ok(owner > 0);
  assert.ok(customer > owner);
  assert.match(method, /if \(ownerResult\) return ownerResult/);
  assert.match(method, /if \(!options\?\.ownerRecovery && !options\?\.recoveryOnly\)/);
  assert.ok(method.indexOf("ownerUnifiedVisualPlanExecutor") < method.indexOf("if (!input.paid_execution"));
  assert.match(method, /canonicalInputFingerprint: expectedFingerprint/);
  assert.match(method, /max_output_tokens: 6144/);
});

test("owner recovery re-enters persisted-result continuation without customer funding", () => {
  const methodStart = service.indexOf("async generateUnifiedVisualPlan(");
  const methodEnd = service.indexOf("async beginReferenceClipAcquisition(", methodStart);
  const method = service.slice(methodStart, methodEnd);
  assert.match(method, /const ownerCostAttemptId = readStringField\(existingOperation, "owner_cost_attempt_id"\)/);
  assert.match(method, /options\?\.recoveryOnly[\s\S]*!options\.ownerRecovery[\s\S]*ownerCostAttemptId/);
  assert.match(method, /ownerContinuation \? expectedFingerprint : input\.operation_fingerprint/);
  assert.match(method, /if \(ownerContinuation && ownerCostAttemptId\)[\s\S]*ownerRecovery: \{[\s\S]*canonicalInputFingerprint: expectedFingerprint,[\s\S]*ownerCostAttemptId/);
  assert.ok(method.indexOf("if (ownerContinuation && ownerCostAttemptId)") < method.indexOf("ownerUnifiedVisualPlanExecutor"));
  assert.ok(method.indexOf("ownerUnifiedVisualPlanExecutor") < method.indexOf("resolveOrdinaryOpenAiTextFunding"));
});

test("owner continuation never synthesizes customer financial authority", () => {
  assert.doesNotMatch(ownerExecutor, /reservationId|spending_acceptance|customer_balance|quote|settlement|stripe/i);
  assert.match(service, /ownerRecovery[\s\S]*skipPaidFundingResolution: true/);
});

test("owner continuation reads the durable operation through owner attempt authority", () => {
  const methodStart = service.indexOf("async generateUnifiedVisualPlan(");
  const methodEnd = service.indexOf("async beginReferenceClipAcquisition(", methodStart);
  const method = service.slice(methodStart, methodEnd);
  assert.match(method, /options\?\.ownerRecovery[\s\S]*read_owner_unified_visual_plan_operation/);
  assert.match(method, /p_owner_cost_attempt_id: options\.ownerRecovery\.ownerCostAttemptId/);
  assert.match(method, /owner_unified_visual_plan_recovery_identity_conflict/);
  assert.match(method, /ownerCostAttemptId[\s\S]*skipPaidFundingResolution: true[\s\S]*recoveryOnly: true/);
  assert.match(method, /const userAuthority = this\.userClientFactory\(options\.userAccessToken\)\.schema/);
  assert.match(method, /const sourceRead = await userAuthority\.rpc\("read_workpiece_sources"/);
  assert.match(method, /const coverageCheck = await userAuthority\.rpc/);
  assert.match(method, /const committed = await userAuthority\.rpc\([\s\S]*"commit_visual_source_attribution"/);
  assert.match(method, /const committed = await userAuthority\.rpc\([\s\S]*"commit_reference_visual_source_set"/);
  assert.match(method, /const result = await userAuthority\.rpc\("commit_broll_plan"/);
  assert.match(method, /const result = await userAuthority\.rpc\("commit_reference_clip_plan"/);
  assert.match(method, /const result = await userAuthority\.rpc\("commit_reference_visual_plan"/);
  assert.match(method, /const verified = await authority\.rpc\("verify_unified_visual_plan"/);
});

test("read-only preflight authenticates before the paid Visual Plan request parser", () => {
  const route = service.slice(
    service.indexOf('parts[3] === "visual-plan-v2"'),
    service.indexOf('parts[3] === "reference-clips"', service.indexOf('parts[3] === "visual-plan-v2"')),
  );
  assert.match(route, /parts\[4\] === "preflight"/);
  assert.ok(route.indexOf("preflightUnifiedVisualPlanOwnerAuthority") < route.indexOf("normalizeOpenAiTextPaidExecutionHandle"));
  const preflight = service.slice(
    service.indexOf("async preflightUnifiedVisualPlanOwnerAuthority("),
    service.indexOf("async acquireReferenceClipCandidate(", service.indexOf("async preflightUnifiedVisualPlanOwnerAuthority(")),
  );
  assert.match(preflight, /assertWorkspaceRoleFromAccessToken/);
  assert.match(preflight, /"editor"/);
  assert.doesNotMatch(preflight, /provider|attempt|valuation|journal|quote|reservation|settlement/i);
});
