import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  APPLY_AUTHORIZATION,
  CERTIFIED_COMMIT,
  FORGE_PROJECT_REF,
  PREDECESSOR_VERSION,
  RECOVERY_APPROVAL_PREFIX,
  TARGET_FILENAME,
  TARGET_SHA256,
  TARGET_VERSION,
  recoveryUseMarkerName,
  validateHostedState,
  validateOperatorAuthorization,
  validatePostVerifyState,
  validateRecoveryEvidence,
} from "./lib/hammer-canary-renewal-compatibility-439-hosted-deployment-policy.mjs";

const NOW = new Date("2026-11-04T23:00:00Z");
const wrapper = readFileSync(new URL("./invoke-hammer-canary-renewal-compatibility-439-hosted-deployment.ps1", import.meta.url), "utf8");
const postverifySql = readFileSync(new URL("../supabase/tests/hammer_canary_renewal_compatibility_439_hosted_postverify.sql", import.meta.url), "utf8");
const booleanParserPath = fileURLToPath(new URL("./lib/forge-strict-csv-boolean.ps1", import.meta.url));
const runPowerShell = (body) => spawnSync("pwsh", ["-NoProfile", "-Command", `. '${booleanParserPath.replaceAll("'", "''")}'; ${body}`], { encoding: "utf8" });
const containment = {
  hammerRolloutRevision: 3, hammerRolloutMode: "halt_new",
  lunaRolloutRevision: 13, lunaRolloutMode: "halt_new",
  aggregateExposureLimitMicros: 10840000, supplierCeilingMicros: 38589,
  supportingCeilingMicros: 6000, maximumAttempts: 1, automaticRetries: 0,
  effectiveActivations: 0, effectiveCapacityAuthorities: 0, effectiveScopes: 0,
  effectiveTestScopes: 0, effectiveLiveScopes: 0, operations: 0,
  providerAttempts: 0, unresolvedOperations: 0, unresolvedAttempts: 0,
};
const preState = () => ({
  projectRef: FORGE_PROJECT_REF, certifiedCommit: CERTIFIED_COMMIT,
  lineage: "historical-v1", installedCount: 438, hostedHead: PREDECESSOR_VERSION,
  pendingVersions: [TARGET_VERSION], migrationSha256: TARGET_SHA256,
  databasePasswordAvailable: true, ...containment,
});
const postState = () => ({
  projectRef: FORGE_PROJECT_REF, certifiedCommit: CERTIFIED_COMMIT,
  lineage: "historical-v1", installedCount: 439, hostedHead: TARGET_VERSION,
  pendingVersions: [], renewalRpcContractOk: true, resolverContractOk: true,
  renewalAclOk: true, resolverAclOk: true, ...containment,
});
const observation = () => ({
  schema: "forge.supabase-management-backup-observation.v1", project_ref: FORGE_PROJECT_REF,
  endpoint: `/v1/projects/${FORGE_PROJECT_REF}/database/backups`, http_status: 200,
  observed_at: "2026-11-04T22:59:00.000Z", response_date: "2026-11-04T22:58:59.000Z",
  response_sha256: "a".repeat(64), backup_id: "backup-439", backup_status: "COMPLETED",
  backup_timestamp: "2026-11-04T06:30:00.000Z", recovery_method: "daily_physical_backup", pitr_enabled: false,
});
const recovery = () => ({
  schema: "forge.hosted-recovery-readiness.v2", verification_source: "supabase_management_api",
  project_ref: FORGE_PROJECT_REF, backup_kind: "daily", verified_at: "2026-11-04T22:59:00.000Z",
  latest_restorable_at: "2026-11-04T06:30:00.000Z", recovery_operator: "named recovery operator",
  restore_authorizer: "named restore authorizer", owner_approval_reference: `${RECOVERY_APPROVAL_PREFIX}window-1`,
  restore_scope_acknowledged: true, unrelated_data_impact_acknowledged: true,
  management_api: { endpoint: `/v1/projects/${FORGE_PROJECT_REF}/database/backups`, backup_id: "backup-439", backup_status: "COMPLETED", backup_timestamp: "2026-11-04T06:30:00.000Z", recovery_method: "daily_physical_backup", response_sha256: "a".repeat(64), observed_at: "2026-11-04T22:59:00.000Z" },
});

test("accepts only the certified predecessor, migration, and Apply token", () => {
  assert.deepEqual(validateHostedState(preState(), { action: "Preflight", operator: "release operator" }), { operator: "release operator" });
  assert.deepEqual(validateHostedState(preState(), { action: "Apply", operator: "release operator", authorization: APPLY_AUTHORIZATION }), { operator: "release operator" });
  assert.throws(() => validateOperatorAuthorization({ action: "Apply", operator: "release operator", authorization: "wrong" }), /authorization/);
});

test("rejects migration identity, checkout, predecessor, and containment drift", () => {
  for (const mutate of [
    (s) => { s.certifiedCommit = "0".repeat(40); },
    (s) => { s.hostedHead = "20261104071802"; },
    (s) => { s.pendingVersions = []; },
    (s) => { s.pendingVersions = [TARGET_VERSION, "20261105000000"]; },
    (s) => { s.migrationSha256 = "0".repeat(64); },
    (s) => { s.effectiveScopes = 1; },
    (s) => { s.operations = 1; },
    (s) => { s.hammerRolloutMode = "enforce"; },
    (s) => { s.lunaRolloutMode = "enforce"; },
  ]) { const state = preState(); mutate(state); assert.throws(() => validateHostedState(state, { action: "Preflight", operator: "release operator" })); }
});

test("rejects incorrect financial ceilings and attempt terms", () => {
  for (const mutate of [
    (s) => { s.aggregateExposureLimitMicros = 44589; },
    (s) => { s.supplierCeilingMicros = 38590; },
    (s) => { s.supportingCeilingMicros = 6001; },
    (s) => { s.maximumAttempts = 2; },
    (s) => { s.automaticRetries = 1; },
  ]) { const state = preState(); mutate(state); assert.throws(() => validateHostedState(state, { action: "Preflight", operator: "release operator" })); }
});

test("requires fresh API-correlated evidence and a unique 439 change window", () => {
  const value = validateRecoveryEvidence(recovery(), NOW, observation());
  assert.match(value.recoveryUseKey, /^[0-9a-f]{64}$/);
  const stale = recovery(); stale.verified_at = "2026-11-03T22:59:00.000Z"; stale.management_api.observed_at = stale.verified_at;
  assert.throws(() => validateRecoveryEvidence(stale, NOW, observation()), /stale/);
  const wrongWindow = recovery(); wrongWindow.owner_approval_reference = "FORGE-INTEGRATED-RECOVERY-433-437:old";
  assert.throws(() => validateRecoveryEvidence(wrongWindow, NOW, observation()), /release_reference/);
  const missingRole = recovery(); missingRole.restore_authorizer = "";
  assert.throws(() => validateRecoveryEvidence(missingRole, NOW, observation()), /restore_authorizer/);
});

test("PostVerify is independent and exact", () => {
  assert.equal(validatePostVerifyState(postState()), true);
  for (const mutate of [
    (s) => { s.installedCount = 438; },
    (s) => { s.pendingVersions = [TARGET_VERSION]; },
    (s) => { s.renewalRpcContractOk = false; },
    (s) => { s.resolverAclOk = false; },
    (s) => { s.effectiveActivations = 1; },
  ]) { const state = postState(); mutate(state); assert.throws(() => validatePostVerifyState(state)); }
});

test("strict CSV boolean parser accepts both PostgreSQL representations", () => {
  for (const [literal, expected] of [["'t'", "true"], ["'true'", "true"], ["'f'", "false"], ["'false'", "false"]]) {
    const result = runPowerShell(`$value=ConvertFrom-ForgeStrictCsvBoolean -Value ${literal} -FieldName 'fixture'; $value.ToString().ToLowerInvariant()`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});

test("actual four-field PostVerify response and mixed representations parse exactly", () => {
  const result = runPowerShell(`
    $row=@{renewal_rpc_contract_ok='true';resolver_contract_ok='t';renewal_acl_ok='true';resolver_acl_ok='t'};
    $values=@(
      (ConvertFrom-ForgeStrictCsvBoolean -Value $row.renewal_rpc_contract_ok -FieldName 'renewal_rpc_contract_ok'),
      (ConvertFrom-ForgeStrictCsvBoolean -Value $row.resolver_contract_ok -FieldName 'resolver_contract_ok'),
      (ConvertFrom-ForgeStrictCsvBoolean -Value $row.renewal_acl_ok -FieldName 'renewal_acl_ok'),
      (ConvertFrom-ForgeStrictCsvBoolean -Value $row.resolver_acl_ok -FieldName 'resolver_acl_ok')
    ); ($values -join ',').ToLowerInvariant()
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "true,true,true,true");
});

test("strict CSV boolean parser rejects missing, malformed, ambiguous, and unexpected values", () => {
  for (const literal of ["$null", "''", "'TRUE'", "'yes'", "'1'", "' true '", "'false '"]) {
    const result = runPowerShell(`ConvertFrom-ForgeStrictCsvBoolean -Value ${literal} -FieldName 'fixture'`);
    assert.notEqual(result.status, 0, `${literal} must fail closed`);
    assert.match(result.stderr, /boolean value is (?:missing|malformed or unsupported)/);
  }
});

test("single-use marker identity is deterministic and rejects malformed keys", () => {
  const key = "a".repeat(64);
  assert.equal(recoveryUseMarkerName(key), recoveryUseMarkerName(key));
  assert.notEqual(recoveryUseMarkerName(key), recoveryUseMarkerName("b".repeat(64)));
  assert.throws(() => recoveryUseMarkerName("bad"), /invalid/);
  assert.match(wrapper, /\[IO\.FileMode\]::CreateNew/);
  assert.match(wrapper, /already consumed; obtain fresh recovery evidence and a new change window/);
});

test("wrapper is one-migration bounded and uses structured dry-run parsing", () => {
  assert.equal(wrapper.match(/Invoke-Supabase @\('db','push','--linked','--workdir',\$repo,'--agent=no'\)/g)?.length, 1);
  assert.equal(wrapper.match(/Invoke-Supabase @\('db','push','--linked','--dry-run','--workdir',\$repo,'--agent=no'\)/g)?.length, 1);
  assert.match(wrapper, /Assert-ForgeSupabaseDryRunPlan -Result \$dryRun/);
  assert.match(wrapper, new RegExp(TARGET_VERSION));
  assert.match(wrapper, new RegExp(TARGET_FILENAME));
  assert.match(wrapper, new RegExp(TARGET_SHA256));
  assert.match(wrapper, new RegExp(PREDECESSOR_VERSION));
  assert.doesNotMatch(wrapper, /--include-all|migration['"]?\s*,?['"]?repair|db['"]?\s*,?['"]?reset|insert\s+into\s+supabase_migrations/i);
  assert.match(wrapper, /Register-RecoveryEvidenceUse[\s\S]+?Invoke-Supabase @\('db','push'/);
  assert.match(wrapper, /Protected financial or execution authority changed/);
});

test("PostVerify covers exact contracts, ACLs, ceilings, and containment", () => {
  for (const term of [
    "10840000", "38589", "6000", "maximum_attempts", "automatic_retries",
    "renewal_rpc_contract_ok", "resolver_contract_ok", "renewal_acl_ok", "resolver_acl_ok",
    "effective_activations", "effective_capacity_authorities", "effective_scopes",
    "operations", "provider_attempts", "unresolved_operations", "unresolved_attempts",
  ]) assert.match(postverifySql, new RegExp(term));
});
