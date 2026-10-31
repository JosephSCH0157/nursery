import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPLY_AUTHORIZATION,
  FORGE_PROJECT_REF,
  RECOVERY_APPROVAL_PREFIX,
  TARGET_SHA256,
  TARGET_VERSION,
  validateHostedState,
  validateOperatorAuthorization,
  validatePostVerifyState,
  validateRecoveryEvidence,
} from "./lib/forge-account-admission-authority-428-hosted-deployment-policy.mjs";

const NOW = new Date("2026-10-31T16:00:00Z");
const sha = (character) => character.repeat(64);
const state = () => ({
  projectRef: FORGE_PROJECT_REF,
  lineage: "historical-v1",
  installedCount: 427,
  hostedHead: "20261030224605",
  pendingVersions: [TARGET_VERSION],
  migrationSha256: TARGET_SHA256,
  databasePasswordAvailable: true,
  unaffectedAuthoritySha256: sha("a"),
  authSignupSha256: sha("b"),
  authUserCount: 6,
  financialCounters: {
    fundingReservations: 3,
    fundingReservationEvents: 5,
    paidMediaProviderAttempts: 0,
    ownerCostProviderAttempts: 1,
    hammerTranscriptionProviderAttempts: 2,
  },
});
const postState = () => ({
  projectRef: FORGE_PROJECT_REF,
  lineage: "historical-v1",
  installedCount: 428,
  hostedHead: TARGET_VERSION,
  pendingVersions: [],
  migrationSha256: TARGET_SHA256,
});
const recovery = () => ({
  schema: "forge.hosted-recovery-readiness.v1",
  project_ref: FORGE_PROJECT_REF,
  dashboard_verified: true,
  backup_kind: "pitr",
  verified_at: "2026-10-31T15:15:00Z",
  latest_restorable_at: "2026-10-31T15:00:00Z",
  recovery_operator: "release operator",
  restore_authorizer: "platform owner",
  owner_approval_reference: `${RECOVERY_APPROVAL_PREFIX}change-window-2026-10-31-a`,
  restore_scope_acknowledged: true,
  unrelated_data_impact_acknowledged: true,
});

test("accepts the exact 427 to 428 Preflight and Apply contract", () => {
  assert.deepEqual(validateHostedState(state(), { action: "Preflight", operator: "release operator" }), {
    operator: "release operator",
  });
  assert.deepEqual(validateHostedState(state(), {
    action: "Apply",
    operator: "release operator",
    authorization: APPLY_AUTHORIZATION,
  }), { operator: "release operator" });
  const validatedRecovery = validateRecoveryEvidence(recovery(), NOW);
  assert.match(validatedRecovery.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(validatedRecovery.recoveryUseKey, /^[0-9a-f]{64}$/);
});

test("accepts only the exact 428 PostVerify state", () => {
  assert.equal(validatePostVerifyState(postState()), true);
  for (const mutate of [
    (value) => { value.projectRef = "wrong-project"; },
    (value) => { value.lineage = "baseline-v1"; },
    (value) => { value.installedCount = 427; },
    (value) => { value.hostedHead = "20261030224605"; },
    (value) => { value.pendingVersions = [TARGET_VERSION]; },
    (value) => { value.migrationSha256 = sha("0"); },
  ]) {
    const value = postState();
    mutate(value);
    assert.throws(() => validatePostVerifyState(value));
  }
});

for (const [name, mutate] of [
  ["project", (value) => { value.projectRef = "wrong-project"; }],
  ["lineage", (value) => { value.lineage = "baseline-v1"; }],
  ["installed count", (value) => { value.installedCount = 426; }],
  ["hosted head", (value) => { value.hostedHead = "20261030090719"; }],
  ["pending version", (value) => { value.pendingVersions = ["20261101000000"]; }],
  ["extra pending version", (value) => { value.pendingVersions.push("20261101000000"); }],
  ["migration hash", (value) => { value.migrationSha256 = sha("0"); }],
  ["managed credential", (value) => { value.databasePasswordAvailable = false; }],
  ["authority snapshot", (value) => { value.unaffectedAuthoritySha256 = "not-a-hash"; }],
  ["Auth snapshot", (value) => { value.authSignupSha256 = "not-a-hash"; }],
  ["Auth user count", (value) => { value.authUserCount = -1; }],
  ["financial counter", (value) => { value.financialCounters.fundingReservations = -1; }],
]) {
  test(`rejects wrong ${name}`, () => {
    const value = state();
    mutate(value);
    assert.throws(() => validateHostedState(value, { action: "Preflight", operator: "release operator" }));
  });
}

test("requires the exact release-specific Apply token", () => {
  assert.throws(() => validateOperatorAuthorization({ action: "Unknown", operator: "release operator" }), /action/);
  assert.throws(() => validateOperatorAuthorization({ action: "Apply", operator: "release operator" }));
  assert.throws(() => validateOperatorAuthorization({
    action: "Apply",
    operator: "release operator",
    authorization: "APPLY-HAMMER-OWNER-SPONSORSHIP-AUTHORITY-RENEWAL-427",
  }));
  assert.deepEqual(validateOperatorAuthorization({
    action: "Apply",
    operator: "release operator",
    authorization: APPLY_AUTHORIZATION,
  }), { operator: "release operator" });
});

test("rejects stale, future, wrong-project, and reused recovery evidence", () => {
  const stale = recovery();
  stale.verified_at = "2026-10-30T15:59:59Z";
  assert.throws(() => validateRecoveryEvidence(stale, NOW), /stale/);

  const future = recovery();
  future.verified_at = "2026-10-31T16:00:01Z";
  assert.throws(() => validateRecoveryEvidence(future, NOW), /stale/);

  const wrongProject = recovery();
  wrongProject.project_ref = "wrong-project";
  assert.throws(() => validateRecoveryEvidence(wrongProject, NOW), /project/);

  const reused = recovery();
  reused.owner_approval_reference = "APPLY-HAMMER-OWNER-SPONSORSHIP-AUTHORITY-RENEWAL-427";
  assert.throws(() => validateRecoveryEvidence(reused, NOW), /release_reference/);

  const missingWindow = recovery();
  missingWindow.owner_approval_reference = RECOVERY_APPROVAL_PREFIX;
  assert.throws(() => validateRecoveryEvidence(missingWindow, NOW), /release_reference/);
});

test("derives a release-specific stable use key and requires a new change window", () => {
  const first = validateRecoveryEvidence(recovery(), NOW).recoveryUseKey;
  assert.equal(validateRecoveryEvidence(recovery(), NOW).recoveryUseKey, first);
  const nextWindow = recovery();
  nextWindow.owner_approval_reference = `${RECOVERY_APPROVAL_PREFIX}change-window-2026-10-31-b`;
  assert.notEqual(validateRecoveryEvidence(nextWindow, NOW).recoveryUseKey, first);
});

test("wrapper is one-tail-only, fail-closed, and has no retry or history repair path", () => {
  const source = readFileSync(new URL("./invoke-forge-account-admission-authority-428-hosted-deployment.ps1", import.meta.url), "utf8");
  const ordinaryPush = /Invoke-Supabase @\('db','push','--linked','--workdir',\$repo,'--agent=no'\)/g;
  const dryRunPush = /Invoke-Supabase @\('db','push','--linked','--dry-run','--workdir',\$repo,'--agent=no'\)/g;
  assert.equal(source.match(ordinaryPush)?.length, 1);
  assert.equal(source.match(dryRunPush)?.length, 1);
  assert.doesNotMatch(source, /--include-all|migration['"]?\s*,?['"]?repair|db['"]?\s*,?['"]?reset|(?:insert|update|delete)\s+(?:into|from)?\s*supabase_migrations/i);
  assert.doesNotMatch(source, /\bwhile\s*\(|\bfor\s*\([^)]*retry|Start-Sleep/i);
  assert.match(source, /Invoke-Supabase @\('db','push'[\s\S]+?Assert-PostApply -PreApplyState \$state/);
  assert.match(source, /Register-RecoveryEvidenceUse[\s\S]+?Invoke-Supabase @\('db','push'/);
  assert.match(source, /\[IO\.FileMode\]::CreateNew/);
  assert.doesNotMatch(source, /Remove-Item[^\n]+migration-428-/);
  assert.match(source, /installedCount=428;hostedHead=\$targetVersion/);
  assert.match(source, /if\(\$versions\.Count -ne 428/);
  assert.match(source, /if\(\$Action -eq 'Apply' -and \$Authorization -cne \$token\)/);
});

test("wrapper independently verifies admission structure, inactivity, and unaffected authority", () => {
  const source = readFileSync(new URL("./invoke-forge-account-admission-authority-428-hosted-deployment.ps1", import.meta.url), "utf8");
  for (const contract of [
    "six_forced_rls_tables",
    "table_acl_denied",
    "function_ownership_and_path",
    "complete_function_acl_contract",
    "intake_service_only",
    "operator_execute_contract",
    "admission_check_contract",
    "projection_consistent",
    "no_application_admission_events",
    "no_application_backfill",
    "admission_enforcement_inactive",
    "unaffectedAuthoritySha256",
    "authSignupSha256",
    "authUserCount",
    "fundingReservations",
    "paidMediaProviderAttempts",
    "hammerTranscriptionProviderAttempts",
    "FORGE_BETA_INTAKE_ENABLED",
  ]) assert.match(source, new RegExp(contract));
  assert.match(source, /legacy_count -ne \[int64\]\$PreApplyState\.authUserCount/);
  assert.match(source, /admissionEnforcementActive=\$false;netlifyIntakeEnabled=\$false/);
  assert.equal(source.match(/p\.prokind<>'a'/g)?.length, 3);
});

test("wrapper performs no Auth, Netlify, provider, or general hosted command", () => {
  const source = readFileSync(new URL("./invoke-forge-account-admission-authority-428-hosted-deployment.ps1", import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:^|\s)(?:npx\s+)?netlify(?:\.exe)?\s+(?:deploy|env|api|functions)|auth\s+(?:config|update)|functions\s+deploy|curl\s|Invoke-WebRequest|Invoke-RestMethod/im);
  assert.doesNotMatch(source, /stripe|openai\.com|api\.openai/i);
  assert.match(source, /customerDataReturned=\$false;credentialsReturned=\$false/);
});
