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
} from "./lib/forge-beta-invitation-provisioning-429-hosted-deployment-policy.mjs";

const NOW = new Date("2026-11-01T16:00:00Z");
const DATABASE_CONTAINER = process.env.SUPABASE_DB_CONTAINER?.trim();
const DATABASE_PROJECT_ID = process.env.FORGE_OWNED_DATABASE_PROJECT_ID?.trim();
const sha = (character) => character.repeat(64);
const wrapperSource = () => readFileSync(new URL("./invoke-forge-beta-invitation-provisioning-429-hosted-deployment.ps1", import.meta.url), "utf8");

const sqlBlocks = () => {
  const marker = `$sql=@'\n`;
  const source = wrapperSource();
  const blocks = [];
  let offset = -1;
  while ((offset = source.indexOf(marker, offset + 1)) >= 0) {
    const start = offset + marker.length;
    const end = source.indexOf("\n'@", start);
    assert.ok(end > start, "SQL block terminator is unavailable");
    blocks.push(source.slice(start, end));
  }
  assert.equal(blocks.length, 2, "wrapper must expose exactly the snapshot and PostVerify SQL blocks");
  return blocks;
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
  assert.equal(identity, "baseline-v1|16|20261101084703");
};

const runAclProbe = (probeSql) => {
  assertDisposableBaseline();
  const output = runDisposableDatabaseSql(`
begin;
create role forge_acl_probe;
${probeSql}
${sqlBlocks()[1]}
rollback;
`);
  const row = output.split(/\r?\n/).find((line) => line.startsWith("baseline-v1|"));
  assert.ok(row, "PostVerify probe row is unavailable");
  return row.split("|");
};

const state = () => ({
  projectRef: FORGE_PROJECT_REF,
  lineage: "historical-v1",
  installedCount: 428,
  hostedHead: "20261031123320",
  pendingVersions: [TARGET_VERSION],
  migrationSha256: TARGET_SHA256,
  databasePasswordAvailable: true,
  unaffectedAuthoritySha256: sha("a"),
  authAuthoritySha256: sha("b"),
  legacyCohortSha256: sha("c"),
  admissionProjectionSha256: sha("d"),
  admissionEventSha256: sha("e"),
  applicationAuthoritySha256: sha("f"),
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
  installedCount: 429,
  hostedHead: TARGET_VERSION,
  pendingVersions: [],
  migrationSha256: TARGET_SHA256,
});

const recovery = () => ({
  schema: "forge.hosted-recovery-readiness.v1",
  project_ref: FORGE_PROJECT_REF,
  dashboard_verified: true,
  backup_kind: "pitr",
  verified_at: "2026-11-01T15:15:00Z",
  latest_restorable_at: "2026-11-01T15:00:00Z",
  recovery_operator: "release operator",
  restore_authorizer: "platform owner",
  owner_approval_reference: `${RECOVERY_APPROVAL_PREFIX}change-window-2026-11-01-a`,
  restore_scope_acknowledged: true,
  unrelated_data_impact_acknowledged: true,
});

test("accepts only the exact 428 to 429 Preflight and Apply contract", () => {
  assert.deepEqual(validateHostedState(state(), { action: "Preflight", operator: "release operator" }), { operator: "release operator" });
  assert.deepEqual(validateHostedState(state(), {
    action: "Apply",
    operator: "release operator",
    authorization: APPLY_AUTHORIZATION,
  }), { operator: "release operator" });
});

test("accepts only the exact 429 PostVerify state", () => {
  assert.equal(validatePostVerifyState(postState()), true);
  for (const mutate of [
    (value) => { value.projectRef = "wrong-project"; },
    (value) => { value.lineage = "baseline-v1"; },
    (value) => { value.installedCount = 428; },
    (value) => { value.hostedHead = "20261031123320"; },
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
  ["installed count", (value) => { value.installedCount = 427; }],
  ["hosted head", (value) => { value.hostedHead = "20261030224605"; }],
  ["pending version", (value) => { value.pendingVersions = ["20261101000000"]; }],
  ["additional pending version", (value) => { value.pendingVersions.push("20261101090000"); }],
  ["migration hash", (value) => { value.migrationSha256 = sha("0"); }],
  ["managed credential", (value) => { value.databasePasswordAvailable = false; }],
  ["authority snapshot", (value) => { value.unaffectedAuthoritySha256 = "not-a-hash"; }],
  ["Auth snapshot", (value) => { value.authAuthoritySha256 = "not-a-hash"; }],
  ["legacy snapshot", (value) => { value.legacyCohortSha256 = "not-a-hash"; }],
  ["projection count", (value) => { value.admissionProjectionCount = -1; }],
  ["workspace count", (value) => { value.workspaceCount = -1; }],
  ["financial counter", (value) => { value.financialCounters.fundingReservations = -1; }],
]) {
  test(`rejects wrong ${name}`, () => {
    const value = state();
    mutate(value);
    assert.throws(() => validateHostedState(value, { action: "Preflight", operator: "release operator" }));
  });
}

test("requires the exact migration-429 Apply token", () => {
  assert.throws(() => validateOperatorAuthorization({ action: "Apply", operator: "release operator" }));
  assert.throws(() => validateOperatorAuthorization({
    action: "Apply",
    operator: "release operator",
    authorization: "APPLY-FORGE-ACCOUNT-ADMISSION-AUTHORITY-428",
  }));
  assert.deepEqual(validateOperatorAuthorization({
    action: "Apply",
    operator: "release operator",
    authorization: APPLY_AUTHORIZATION,
  }), { operator: "release operator" });
});

test("requires fresh release-specific recovery evidence with valid chronology", () => {
  const valid = validateRecoveryEvidence(recovery(), NOW);
  assert.match(valid.evidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(valid.recoveryUseKey, /^[0-9a-f]{64}$/);

  const afterVerification = recovery();
  afterVerification.latest_restorable_at = "2026-11-01T15:30:00Z";
  assert.throws(() => validateRecoveryEvidence(afterVerification, NOW), /after_verification/);

  const future = recovery();
  future.verified_at = "2026-11-01T16:00:01Z";
  assert.throws(() => validateRecoveryEvidence(future, NOW), /stale/);

  const stale = recovery();
  stale.verified_at = "2026-10-31T15:59:59Z";
  stale.latest_restorable_at = "2026-10-31T15:00:00Z";
  assert.throws(() => validateRecoveryEvidence(stale, NOW), /stale/);

  const wrongProject = recovery();
  wrongProject.project_ref = "wrong-project";
  assert.throws(() => validateRecoveryEvidence(wrongProject, NOW), /project/);

  const reusedRelease = recovery();
  reusedRelease.owner_approval_reference = "FORGE-ADMISSION-S1-428:old-window";
  assert.throws(() => validateRecoveryEvidence(reusedRelease, NOW), /release_reference/);
});

test("recovery evidence use keys are stable per change window and unique across windows", () => {
  const first = validateRecoveryEvidence(recovery(), NOW).recoveryUseKey;
  assert.equal(validateRecoveryEvidence(recovery(), NOW).recoveryUseKey, first);
  const next = recovery();
  next.owner_approval_reference = `${RECOVERY_APPROVAL_PREFIX}change-window-2026-11-01-b`;
  assert.notEqual(validateRecoveryEvidence(next, NOW).recoveryUseKey, first);
});

test("wrapper is one-tail-only, fail-closed, and has no retry or history-repair path", () => {
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
  assert.doesNotMatch(source, /Remove-Item[^\n]+migration-429-/);
  assert.match(source, /if\(\$versions\.Count -ne 429/);
  assert.match(source, /if\(\$Action -eq 'Apply' -and \$Authorization -cne \$token\)/);
});

test("failed or interrupted Apply consumes its change window and cannot blind-retry", () => {
  const source = wrapperSource();
  const consume = source.indexOf("Register-RecoveryEvidenceUse -UseKey");
  const apply = source.indexOf("Invoke-Supabase @('db','push','--linked','--workdir',$repo,'--agent=no')");
  const verify = source.indexOf("Assert-PostApply -PreApplyState $state");
  assert.ok(consume >= 0 && apply > consume && verify > apply);
  assert.match(source, /\[IO\.FileMode\]::CreateNew/);
  assert.match(source, /already consumed; obtain fresh recovery evidence and a new change window/);
  assert.doesNotMatch(source, /Remove-Item[^\n]+migration-429-|\bretry\b/i);
});

test("wrapper pins the DB-first release order and fail-closed invitation endpoint", () => {
  const source = wrapperSource();
  assert.match(source, /\$releaseOrder='database-before-application'/);
  assert.match(source, /FORGE_BETA_INVITATIONS_ENABLED/);
  assert.match(source, /if \(!config\.mutationsEnabled\)/);
  assert.match(source, /\$flagIndex -ge \$authIndex/);
  assert.match(source, /Slice 2A release-compatibility bytes changed/);
});

test("wrapper snapshots account, workspace, Auth, Storage, Realtime, and financial authority", () => {
  const source = wrapperSource();
  for (const contract of [
    "unaffectedAuthoritySha256",
    "authAuthoritySha256",
    "legacyCohortSha256",
    "admissionProjectionSha256",
    "admissionEventSha256",
    "applicationAuthoritySha256",
    "workspaceCount",
    "workspaceMemberCount",
    "fundingReservations",
    "paidMediaProviderAttempts",
    "hammerTranscriptionProviderAttempts",
    "'storage','realtime'",
  ]) assert.match(source, new RegExp(contract));
});

test("table effective-role checks allowlist only the reviewed Supabase administrative roles", () => {
  const source = wrapperSource();
  assert.match(source, /array\['supabase_admin','supabase_etl_admin','supabase_read_only_user','pg_read_all_data','pg_write_all_data'\]/);
  assert.match(source, /role\.table_administrative_exempt/);
  assert.match(source, /role\.function_administrative_exempt/);
  assert.match(source, /function_administrative_exempt\s+or role\.role_name=any/);
});

test("PostgreSQL 17 authority fingerprints retain trigger-state values", () => {
  const snapshot = sqlBlocks()[0];
  assert.equal(snapshot.match(/t\.tgenabled::text/g)?.length, 2);
  assert.doesNotMatch(snapshot, /t\.tgenabled(?!::text)/);
});

test("PostgreSQL 17 executes the complete authority-snapshot query", { skip: !DATABASE_CONTAINER }, () => {
  assertDisposableBaseline();
  const serverVersion = Number(runDisposableDatabaseSql("show server_version_num;").trim());
  assert.ok(serverVersion >= 170000 && serverVersion < 180000, `PostgreSQL 17 is required, received ${serverVersion}`);
  const row = runDisposableDatabaseSql(sqlBlocks()[0]).trim().split("|");
  assert.equal(row.length, 21, "snapshot must preserve six fingerprints and fifteen counters");
  for (const value of row.slice(0, 6)) assert.match(value, /^[0-9a-f]{64}$/);
  for (const value of row.slice(6)) assert.match(value, /^\d+$/);
});

test("PostVerify SQL proves the certified 429 authority contract", { skip: !DATABASE_CONTAINER }, () => {
  assertDisposableBaseline();
  const row = runDisposableDatabaseSql(sqlBlocks()[1]).trim().split("|");
  assert.equal(row[0], "baseline-v1");
  for (const value of row.slice(1)) assert.equal(value, "t");
});

test("PostVerify rejects an unexpected custom-role table grant", { skip: !DATABASE_CONTAINER }, () => {
  const row = runAclProbe("grant select on tongs.beta_access_invitation_events to forge_acl_probe;");
  assert.equal(row[2], "f", "table_acl_exact must reject the custom grantee");
  assert.equal(row[3], "f", "table_effective_acl_contract must reject effective custom access");
});

test("PostVerify rejects an unexpected custom-role function grant", { skip: !DATABASE_CONTAINER }, () => {
  const row = runAclProbe("grant execute on function tongs.claim_beta_invitation_dispatch(uuid,uuid,uuid,uuid,text,timestamptz) to forge_acl_probe;");
  assert.equal(row[5], "f", "complete_function_acl_contract must reject the custom grantee");
  assert.equal(row[6], "f", "function_effective_acl_contract must reject its effective execution");
});

test("PostVerify rejects a custom role inheriting an authorized function role", { skip: !DATABASE_CONTAINER }, () => {
  const row = runAclProbe("alter role forge_acl_probe login; grant authenticated to forge_acl_probe;");
  assert.equal(row[5], "t", "direct function ACLs remain exact");
  assert.equal(row[6], "f", "effective ACL checks must reject inherited custom execution");
});

test("PostVerify rejects inherited custom table access", { skip: !DATABASE_CONTAINER }, () => {
  const row = runAclProbe(`
create role forge_acl_parent;
grant select on tongs.beta_access_invitation_events to forge_acl_parent;
grant forge_acl_parent to forge_acl_probe;
`);
  assert.equal(row[2], "f");
  assert.equal(row[3], "f");
});

test("PostVerify receipts do not claim uninspected Netlify or Auth configuration", () => {
  const source = wrapperSource();
  const policy = readFileSync(new URL("./verify-forge-beta-invitation-provisioning-429-hosted-deployment-policy.mjs", import.meta.url), "utf8");
  for (const value of [source, policy]) {
    assert.match(value, /netlifyConfigurationVerified\s*[=:]\s*\$?false/);
    assert.match(value, /authConfigurationVerified\s*[=:]\s*\$?false/);
    assert.doesNotMatch(value, /netlifyIntakeEnabled|publicSignupDisabled|googleProvider/);
  }
});

test("wrapper cannot issue Auth, Netlify, provider, or general hosted commands", () => {
  const source = wrapperSource();
  assert.doesNotMatch(source, /(?:^|\s)(?:npx\s+)?netlify(?:\.exe)?\s+(?:deploy|env|api|functions)|auth\s+(?:config|update)|functions\s+deploy|curl\s|Invoke-WebRequest|Invoke-RestMethod/im);
  assert.doesNotMatch(source, /stripe|openai\.com|api\.openai/i);
  assert.match(source, /customerDataReturned=\$false;credentialsReturned=\$false/);
});
