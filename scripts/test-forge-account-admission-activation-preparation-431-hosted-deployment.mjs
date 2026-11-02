import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
} from "./lib/forge-account-admission-activation-preparation-431-hosted-deployment-policy.mjs";

const NOW = new Date("2026-11-02T18:00:00Z");
const DATABASE_CONTAINER = process.env.SUPABASE_DB_CONTAINER?.trim();
const DATABASE_PROJECT_ID = process.env.FORGE_OWNED_DATABASE_PROJECT_ID?.trim();
const sha = (character) => character.repeat(64);
const wrapperSource = () => readFileSync(new URL("./invoke-forge-account-admission-activation-preparation-431-hosted-deployment.ps1", import.meta.url), "utf8");
const postflightSource = () => readFileSync(new URL("../supabase/tests/account_admission_activation_preparation_hosted_postverify.sql", import.meta.url), "utf8");

const snapshotSql = () => {
  const marker = `$sql=@'\n`;
  const source = wrapperSource();
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "authority snapshot SQL is unavailable");
  const bodyStart = start + marker.length;
  const end = source.indexOf("\n'@", bodyStart);
  assert.ok(end > bodyStart, "authority snapshot SQL terminator is unavailable");
  assert.equal(source.indexOf(marker, end), -1, "wrapper must contain exactly one embedded SQL block");
  return source.slice(bodyStart, end);
};

const runDisposableDatabaseSql = (sql) => {
  assert.ok(DATABASE_CONTAINER, "SUPABASE_DB_CONTAINER is required");
  assert.match(DATABASE_PROJECT_ID ?? "", /^[a-z0-9][a-z0-9-]{2,62}$/, "FORGE_OWNED_DATABASE_PROJECT_ID is required");
  const containerName = execFileSync("docker", ["inspect", "--format={{.Name}}", DATABASE_CONTAINER], { encoding: "utf8" }).trim();
  assert.equal(containerName, `/supabase_db_${DATABASE_PROJECT_ID}`, "target must match the explicitly owned local Supabase project");
  return execFileSync("docker", [
    "exec", "-i", DATABASE_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-F", "|",
  ], { encoding: "utf8", input: sql });
};

const assertDisposableBaseline = () => {
  const identity = runDisposableDatabaseSql(`
select lineage||'|'||migration_count::text||'|'||hosted_head
from forge_meta.database_lineage
cross join lateral (
  select count(*) as migration_count,max(version) as hosted_head
  from supabase_migrations.schema_migrations
) history
where singleton=true;
`).trim();
  assert.equal(identity, "baseline-v1|18|20261102032722");
};

const runPostflightProbe = (probeSql = "") => {
  assertDisposableBaseline();
  const output = runDisposableDatabaseSql(`
begin;
create role forge_acl_probe;
${probeSql}
${postflightSource()}
rollback;
`);
  const row = output.split(/\r?\n/).find((line) => line.startsWith("baseline-v1|"));
  assert.ok(row, "PostVerify probe row is unavailable");
  return row.split("|");
};

const state = () => ({
  projectRef: FORGE_PROJECT_REF,
  lineage: "historical-v1",
  installedCount: 430,
  hostedHead: "20261101201817",
  pendingVersions: [TARGET_VERSION],
  migrationSha256: TARGET_SHA256,
  databasePasswordAvailable: true,
  unaffectedAuthoritySha256: sha("a"),
  authAuthoritySha256: sha("b"),
  legacyCohortSha256: sha("c"),
  admissionProjectionSha256: sha("d"),
  admissionEventSha256: sha("e"),
  applicationAuthoritySha256: sha("f"),
  platformOperatorAuthoritySha256: sha("1"),
  authUserCount: 136,
  profileCount: 136,
  workspaceCount: 136,
  workspaceMemberCount: 136,
  legacyCohortCount: 136,
  admissionProjectionCount: 136,
  admissionEventCount: 136,
  applicationCount: 0,
  decisionCount: 0,
  bindingCount: 0,
  invitationEventCount: 0,
  platformOperatorCount: 1,
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
  installedCount: 431,
  hostedHead: TARGET_VERSION,
  pendingVersions: [],
  migrationSha256: TARGET_SHA256,
});

const apiObservation = () => ({
  schema: "forge.supabase-management-backup-observation.v1",
  project_ref: FORGE_PROJECT_REF,
  endpoint: `/v1/projects/${FORGE_PROJECT_REF}/database/backups`,
  http_status: 200,
  observed_at: "2026-11-02T17:59:00.000Z",
  response_date: "2026-11-02T17:58:59.000Z",
  response_sha256: sha("a"),
  backup_id: "2133034325",
  backup_status: "COMPLETED",
  backup_timestamp: "2026-11-02T06:28:20.071Z",
  recovery_method: "daily_physical_backup",
  pitr_enabled: false,
});

const recovery = () => ({
  schema: "forge.hosted-recovery-readiness.v2",
  verification_source: "supabase_management_api",
  project_ref: FORGE_PROJECT_REF,
  backup_kind: "daily",
  verified_at: "2026-11-02T17:59:00.000Z",
  latest_restorable_at: "2026-11-02T06:28:20.071Z",
  recovery_operator: "platform owner",
  restore_authorizer: "platform owner",
  owner_approval_reference: `${RECOVERY_APPROVAL_PREFIX}window-a`,
  restore_scope_acknowledged: true,
  unrelated_data_impact_acknowledged: true,
  management_api: {
    endpoint: `/v1/projects/${FORGE_PROJECT_REF}/database/backups`,
    backup_id: "2133034325",
    backup_status: "COMPLETED",
    backup_timestamp: "2026-11-02T06:28:20.071Z",
    recovery_method: "daily_physical_backup",
    response_sha256: sha("a"),
    observed_at: "2026-11-02T17:59:00.000Z",
  },
});

test("accepts only the exact 430 to 431 Preflight and Apply contract", () => {
  assert.deepEqual(validateHostedState(state(), { action: "Preflight", operator: "release operator" }), { operator: "release operator" });
  assert.deepEqual(validateHostedState(state(), {
    action: "Apply",
    operator: "release operator",
    authorization: APPLY_AUTHORIZATION,
  }), { operator: "release operator" });
});

test("accepts only the exact 431 PostVerify state", () => {
  assert.equal(validatePostVerifyState(postState()), true);
  for (const mutate of [
    (value) => { value.projectRef = "wrong-project"; },
    (value) => { value.lineage = "baseline-v1"; },
    (value) => { value.installedCount = 430; },
    (value) => { value.hostedHead = "20261101201817"; },
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
  ["installed count", (value) => { value.installedCount = 429; }],
  ["hosted head", (value) => { value.hostedHead = "20261101084703"; }],
  ["pending version", (value) => { value.pendingVersions = ["20261103000000"]; }],
  ["additional pending version", (value) => { value.pendingVersions.push("20261103000000"); }],
  ["migration hash", (value) => { value.migrationSha256 = sha("0"); }],
  ["managed credential", (value) => { value.databasePasswordAvailable = false; }],
  ["authority snapshot", (value) => { value.unaffectedAuthoritySha256 = "not-a-hash"; }],
  ["Auth snapshot", (value) => { value.authAuthoritySha256 = "not-a-hash"; }],
  ["legacy snapshot", (value) => { value.legacyCohortSha256 = "not-a-hash"; }],
  ["operator snapshot", (value) => { value.platformOperatorAuthoritySha256 = "not-a-hash"; }],
  ["workspace count", (value) => { value.workspaceCount = -1; }],
  ["operator count", (value) => { value.platformOperatorCount = -1; }],
  ["invitation count", (value) => { value.invitationEventCount = -1; }],
  ["financial counter", (value) => { value.financialCounters.fundingReservations = -1; }],
]) {
  test(`rejects wrong ${name}`, () => {
    const value = state();
    mutate(value);
    assert.throws(() => validateHostedState(value, { action: "Preflight", operator: "release operator" }));
  });
}

test("requires the exact migration-431 Apply token", () => {
  assert.throws(() => validateOperatorAuthorization({ action: "Apply", operator: "release operator" }));
  assert.throws(() => validateOperatorAuthorization({
    action: "Apply",
    operator: "release operator",
    authorization: "APPLY-FORGE-INACTIVE-ADMISSION-ENFORCEMENT-430",
  }));
  assert.deepEqual(validateOperatorAuthorization({
    action: "Apply",
    operator: "release operator",
    authorization: APPLY_AUTHORIZATION,
  }), { operator: "release operator" });
});

test("requires fresh authenticated Management API recovery evidence", () => {
  const validated = validateRecoveryEvidence(recovery(), NOW, apiObservation());
  assert.equal(validated.verificationSource, "supabase_management_api");
  assert.match(validated.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(validated.recoveryUseKey, /^[0-9a-f]{64}$/);

  const dashboard = { ...recovery(), schema: "forge.hosted-recovery-readiness.v1", dashboard_verified: true };
  assert.throws(() => validateRecoveryEvidence(dashboard, NOW), /management_api_evidence_required/);
  assert.throws(() => validateRecoveryEvidence(recovery(), NOW), /observation_required/);

  const wrongProject = apiObservation();
  wrongProject.project_ref = "wrong-project";
  assert.throws(() => validateRecoveryEvidence(recovery(), NOW, wrongProject), /management_api_project/);

  const wrongBackup = apiObservation();
  wrongBackup.backup_id = "wrong-backup";
  assert.throws(() => validateRecoveryEvidence(recovery(), NOW, wrongBackup), /backup_id/);

  const failedBackup = apiObservation();
  failedBackup.backup_status = "FAILED";
  assert.throws(() => validateRecoveryEvidence(recovery(), NOW, failedBackup), /backup_status/);

  const stale = recovery();
  stale.verified_at = "2026-11-01T17:59:59.000Z";
  stale.management_api.observed_at = stale.verified_at;
  assert.throws(() => validateRecoveryEvidence(stale, NOW, apiObservation()), /stale/);
});

test("recovery evidence is bound to the migration-431 change window", () => {
  const first = validateRecoveryEvidence(recovery(), NOW, apiObservation()).recoveryUseKey;
  assert.equal(validateRecoveryEvidence(recovery(), NOW, apiObservation()).recoveryUseKey, first);
  const next = recovery();
  next.owner_approval_reference = `${RECOVERY_APPROVAL_PREFIX}window-b`;
  assert.notEqual(validateRecoveryEvidence(next, NOW, apiObservation()).recoveryUseKey, first);
  const reused = recovery();
  reused.owner_approval_reference = "FORGE-ADMISSION-S2B-430:old-window";
  assert.throws(() => validateRecoveryEvidence(reused, NOW, apiObservation()), /release_reference/);
  const missingAuthority = recovery();
  missingAuthority.restore_authorizer = "";
  assert.throws(() => validateRecoveryEvidence(missingAuthority, NOW, apiObservation()), /restore_authorizer/);
});

test("wrapper is one-tail-only, single-use, and has no retry or history-repair path", () => {
  const source = wrapperSource();
  const ordinaryPush = /Invoke-Supabase @\('db','push','--linked','--workdir',\$repo,'--agent=no'\)/g;
  const dryRunPush = /Invoke-Supabase @\('db','push','--linked','--dry-run','--workdir',\$repo,'--agent=no'\)/g;
  assert.equal(source.match(ordinaryPush)?.length, 1);
  assert.equal(source.match(dryRunPush)?.length, 1);
  assert.doesNotMatch(source, /--include-all|migration['"]?\s*,?['"]?repair|db['"]?\s*,?['"]?reset|(?:insert|update|delete)\s+(?:into|from)?\s*supabase_migrations/i);
  assert.doesNotMatch(source, /\bwhile\s*\(|\bfor\s*\([^)]*retry|Start-Sleep/i);
  assert.match(source, /Register-RecoveryEvidenceUse[\s\S]+?Invoke-Supabase @\('db','push'/);
  assert.match(source, /Invoke-Supabase @\('db','push'[\s\S]+?Assert-PostApply -PreApplyState \$state/);
  assert.match(source, /\[IO\.FileMode\]::CreateNew/);
  assert.doesNotMatch(source, /Remove-Item[^\n]+migration-431-/);
  assert.match(source, /if\(\$versions\.Count -ne 431/);
  assert.match(source, /if\(\$Action -eq 'Apply' -and \$Authorization -cne \$token\)/);
  assert.match(source, /Invoke-WithForgeManagedSupabaseCapacityReadCredential/);
  assert.match(source, /--action Observe/);
});

test("wrapper uses the established governed infrastructure without invoking stale Slice 2B application pins", () => {
  const source = wrapperSource();
  assert.match(source, /account_admission_enforcement_hosted_postverify\.sql/);
  assert.doesNotMatch(source, /invoke-forge-inactive-admission-enforcement-430-hosted-deployment\.ps1[^\n]+PostVerify/);
  assert.match(source, /lib\/forge-managed-credential\.ps1/);
  assert.match(source, /lib\/forge-supabase-cli\.ps1/);
  assert.match(source, /collect-hosted-recovery-readiness-evidence\.mjs/);
  assert.match(source, /\$releaseOrder='database-before-coordinated-activation'/);
});

test("wrapper pins migration 431 and leaves every activation surface inactive", () => {
  const source = wrapperSource();
  assert.match(source, /20261102032722_forge_admission_activation_preparation\.sql/);
  assert.match(source, /forge-account-admission-activation-v1\.sql/);
  assert.match(source, /forge-account-admission-deactivation-v1\.sql/);
  assert.match(source, /FORGE_ADMISSION_ENFORCEMENT_ENABLED/);
  assert.match(source, /VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED/);
  assert.match(source, /admissionEnforcementActive=\$false/);
  assert.match(source, /preRequestRegistered=\$false/);
  assert.match(source, /dataApiPolicyInstalled=\$false/);
  assert.match(source, /storagePolicyInstalled=\$false/);
  assert.match(source, /realtimePolicyInstalled=\$false/);
});

test("wrapper snapshots all protected authority and financial/provider counters", () => {
  const source = wrapperSource();
  for (const contract of [
    "unaffectedAuthoritySha256",
    "authAuthoritySha256",
    "legacyCohortSha256",
    "admissionProjectionSha256",
    "admissionEventSha256",
    "applicationAuthoritySha256",
    "platformOperatorAuthoritySha256",
    "workspaceCount",
    "workspaceMemberCount",
    "invitationEventCount",
    "fundingReservations",
    "paidMediaProviderAttempts",
    "hammerTranscriptionProviderAttempts",
    "'storage','realtime'",
  ]) assert.match(source, new RegExp(contract));
});

test("PostgreSQL 17 authority fingerprints retain trigger-state values", () => {
  const snapshot = snapshotSql();
  assert.equal(snapshot.match(/t\.tgenabled::text/g)?.length, 2);
  assert.doesNotMatch(snapshot, /t\.tgenabled(?!::text)/);
  assert.match(postflightSource(), /trigger\.tgenabled::text/);
});

test("PostVerify proves the exact six paths and all enforcement remains inactive", () => {
  const source = postflightSource();
  for (const path of [
    "rpc/list_beta_access_applications",
    "rpc/decide_beta_access_application",
    "rpc/set_account_admission_state",
    "rpc/list_beta_invitation_applications",
    "rpc/read_my_admission_onboarding",
    "rpc/resolve_bellows_join_link",
  ]) assert.match(source, new RegExp(path));
  assert.match(source, /count\(\*\) = 6/);
  assert.match(source, /prepared_contract_v2/);
  assert.match(source, /data_api_policy_uninstalled/);
  assert.match(source, /storage_policy_uninstalled/);
  assert.match(source, /realtime_policy_uninstalled/);
});

test("PostVerify receipts do not claim uninspected external configuration", () => {
  const verifier = readFileSync(new URL("./verify-forge-account-admission-activation-preparation-431-hosted-deployment-policy.mjs", import.meta.url), "utf8");
  for (const value of [wrapperSource(), verifier]) {
    assert.match(value, /netlifyConfigurationVerified\s*[=:]\s*\$?false/);
    assert.match(value, /authConfigurationVerified\s*[=:]\s*\$?false/);
    assert.doesNotMatch(value, /publicSignupDisabled\s*[=:]\s*\$?true|googleProviderConfigured\s*[=:]\s*\$?true/);
  }
});

test("wrapper cannot issue Auth, Netlify, provider, activation, or general hosted commands", () => {
  const source = wrapperSource();
  assert.doesNotMatch(source, /(?:^|\s)(?:npx\s+)?netlify(?:\.exe)?\s+(?:deploy|env|api|functions)|auth\s+(?:config|update)|functions\s+deploy|curl\s|Invoke-WebRequest|Invoke-RestMethod/im);
  assert.doesNotMatch(source, /stripe|openai\.com|api\.openai/i);
  assert.doesNotMatch(source, /forge-account-admission-activation-v1\.sql['"]?\s*\)|forge-account-admission-deactivation-v1\.sql['"]?\s*\)/);
  assert.match(source, /customerDataReturned=\$false;credentialsReturned=\$false/);
});

test("the documented Bellows exception identifies disclosed metadata and connected-participant revocation limits", () => {
  const contract = readFileSync(new URL("../docs/admission/ADMISSION_ACTIVATION_CONTRACT.md", import.meta.url), "utf8");
  assert.match(contract, /session_id/);
  assert.match(contract, /workspace_id/);
  assert.match(contract, /host_user_id/);
  assert.match(contract, /does not immediately disconnect/i);
  assert.match(contract, /Broadcast\/Presence/);
});

test("PostgreSQL 17 executes the authority snapshot and migration-431 PostVerify SQL", { skip: !DATABASE_CONTAINER }, () => {
  assertDisposableBaseline();
  const serverVersion = Number(runDisposableDatabaseSql("show server_version_num;").trim());
  assert.ok(serverVersion >= 170000 && serverVersion < 180000, `PostgreSQL 17 is required, received ${serverVersion}`);
  const snapshot = runDisposableDatabaseSql(snapshotSql()).trim().split("|");
  assert.equal(snapshot.length, 24, "snapshot must preserve seven fingerprints and seventeen counters");
  for (const value of snapshot.slice(0, 7)) assert.match(value, /^[0-9a-f]{64}$/);
  for (const value of snapshot.slice(7)) assert.match(value, /^\d+$/);
  const postflight = runPostflightProbe();
  assert.equal(postflight[0], "baseline-v1");
  for (const value of postflight.slice(1)) assert.equal(value, "t");
});

test("PostVerify rejects unexpected direct and inherited function authority", { skip: !DATABASE_CONTAINER }, () => {
  const direct = runPostflightProbe("grant execute on function tongs.account_admission_pre_request() to forge_acl_probe;");
  assert.equal(direct[3], "f");
  assert.equal(direct[4], "f");
  const inherited = runPostflightProbe("alter role forge_acl_probe login; grant service_role to forge_acl_probe;");
  assert.equal(inherited[3], "t");
  assert.equal(inherited[4], "f");
});

test("PostVerify rejects active database, Storage, and Data API enforcement", { skip: !DATABASE_CONTAINER }, () => {
  const financial = runPostflightProbe("set local forge.account_admission_enforcement to 'on';");
  assert.equal(financial[11], "f");
  const preRequest = runPostflightProbe("set local pgrst.db_pre_request to 'tongs.account_admission_pre_request';");
  assert.equal(preRequest[10], "f");
  const dataApi = runPostflightProbe(`
create policy forge_account_admission_required_v1 on tongs.account_admissions
as restrictive for select to authenticated using (tongs.current_request_is_admitted());
`);
  assert.equal(dataApi[12], "f");
  const storage = runPostflightProbe(`
create policy forge_account_admission_storage_select_v1 on storage.objects
as restrictive for select to authenticated using (tongs.current_request_is_admitted());
`);
  assert.equal(storage[13], "f");
});
