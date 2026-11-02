import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVATE_AUTHORIZATION,
  ACTIVATION_CATALOG_OBJECT_COUNT,
  ACTIVATION_CATALOG_SHA256,
  ACTIVATION_FUNCTION_COUNT,
  ACTIVATION_FUNCTION_SHA256,
  ACTIVATION_MIGRATION_COUNT,
  ACTIVATION_MIGRATION_HEAD,
  ACTIVATION_MIGRATION_SHA256,
  ACTIVATION_PROJECT_REF,
  ACTIVATION_RECOVERY_PREFIX,
  ACTIVATION_RELATION_COUNT,
  ACTIVATION_RELATION_SHA256,
  ACTIVATION_STORAGE_POLICY_COUNT,
  ACTIVATION_STORAGE_POLICY_SHA256,
  DEACTIVATE_AUTHORIZATION,
  validateActivationAction,
  validateActivationRecoveryEvidence,
} from "./lib/forge-account-admission-activation-policy.mjs";
import {
  buildAdmissionActivationExternalState,
  validateAdmissionActivationExternalState,
} from "./lib/forge-account-admission-activation-external-state.mjs";

const NOW = new Date("2026-11-02T04:00:00.000Z");
const COMMIT = "1".repeat(40);
const sha = (value) => value.repeat(64);
const container = process.env.SUPABASE_DB_CONTAINER?.trim();
const projectId = process.env.FORGE_OWNED_DATABASE_PROJECT_ID?.trim();
const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");
const validateAction = (value, options) => validateActivationAction(value, { ...options, now: NOW });

function externalState() {
  return buildAdmissionActivationExternalState({
    site: {
      id: "d5c7485d-35eb-4c66-b22d-410b09b38a73",
      account_slug: "forge-owner",
      build_settings: { repo_branch: "main" },
      published_deploy: { id: "deploy-1", state: "ready", commit_ref: COMMIT },
    },
    environment: [
      { key: "FORGE_ADMISSION_ENFORCEMENT_ENABLED", scopes: ["Functions"], values: [{ context: "production", value: "true" }] },
      { key: "VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED", scopes: ["Builds"], values: [{ context: "production", value: "true" }] },
      { key: "FORGE_BETA_INVITATIONS_ENABLED", scopes: ["Functions"], values: [{ context: "production", value: "true" }] },
      { key: "FORGE_BETA_INTAKE_ENABLED", scopes: ["Functions"], values: [{ context: "production", value: "false" }] },
    ],
    authConfig: { disable_signup: true, external_google_enabled: true },
    projectRef: ACTIVATION_PROJECT_REF,
    observedAt: NOW.toISOString(),
    health: { "/": 200, "/login": 200, "/app": 200, "/beta": 200, "/welcome/invitation": 200, loginHasGoogleUi: false },
    receipts: {
      netlifySite: { endpoint: "/api/v1/sites/d5c7485d-35eb-4c66-b22d-410b09b38a73", status: 200, responseSha256: sha("a") },
      netlifyEnvironment: { endpoint: "/api/v1/accounts/forge-owner/env", status: 200, responseSha256: sha("b") },
      supabaseAuthConfig: { endpoint: `/v1/projects/${ACTIVATION_PROJECT_REF}/config/auth`, status: 200, responseSha256: sha("c") },
    },
  });
}

function state(active = false) {
  return {
    projectRef: ACTIVATION_PROJECT_REF,
    lineage: "historical-v1",
    migrationCount: ACTIVATION_MIGRATION_COUNT,
    migrationHead: ACTIVATION_MIGRATION_HEAD,
    migrationSha256: ACTIVATION_MIGRATION_SHA256,
    catalogObjectCount: ACTIVATION_CATALOG_OBJECT_COUNT,
    catalogSha256: ACTIVATION_CATALOG_SHA256,
    relationCount: ACTIVATION_RELATION_COUNT,
    relationSha256: ACTIVATION_RELATION_SHA256,
    functionCount: ACTIVATION_FUNCTION_COUNT,
    functionSha256: ACTIVATION_FUNCTION_SHA256,
    storagePolicyCount: ACTIVATION_STORAGE_POLICY_COUNT,
    storagePolicySha256: ACTIVATION_STORAGE_POLICY_SHA256,
    legacyCohortCount: 136,
    legacyCohortSha256: sha("a"),
    admissionProjectionSha256: sha("b"),
    financialAuthoritySha256: sha("c"),
    projectionConsistent: true,
    invitationJournalCount: 0,
    applicationCommit: COMMIT,
    remoteMain: COMMIT,
    externalState: externalState(),
    preRequestSetting: active ? "tongs.account_admission_pre_request" : "",
    dataApiAdmissionPolicyCount: active ? 250 : 0,
    storageAdmissionPolicyCount: active ? 3 : 0,
    realtimeAdmissionPolicyCount: 0,
    dataApiPolicyContractValid: true,
    storagePolicyContractValid: true,
    financialTransactionGuardValid: true,
    admittedProbeAllowed: true,
    unadmittedProbeDenied: true,
    revokedProbeDenied: true,
    operatorCustomerProbeDenied: true,
  };
}

function observation() {
  return {
    schema: "forge.supabase-management-backup-observation.v1",
    project_ref: ACTIVATION_PROJECT_REF,
    endpoint: `/v1/projects/${ACTIVATION_PROJECT_REF}/database/backups`,
    http_status: 200,
    observed_at: "2026-11-02T03:59:00.000Z",
    response_date: "2026-11-02T03:58:59.000Z",
    response_sha256: sha("d"),
    backup_id: "2133034325",
    backup_status: "COMPLETED",
    backup_timestamp: "2026-11-02T03:28:20.071Z",
    recovery_method: "daily_physical_backup",
    pitr_enabled: false,
  };
}

function recovery() {
  return {
    schema: "forge.hosted-recovery-readiness.v2",
    verification_source: "supabase_management_api",
    project_ref: ACTIVATION_PROJECT_REF,
    backup_kind: "daily",
    verified_at: "2026-11-02T03:59:00.000Z",
    latest_restorable_at: "2026-11-02T03:28:20.071Z",
    recovery_operator: "platform owner",
    restore_authorizer: "platform owner",
    owner_approval_reference: `${ACTIVATION_RECOVERY_PREFIX}window-a`,
    restore_scope_acknowledged: true,
    unrelated_data_impact_acknowledged: true,
    management_api: {
      endpoint: `/v1/projects/${ACTIVATION_PROJECT_REF}/database/backups`,
      backup_id: "2133034325",
      backup_status: "COMPLETED",
      backup_timestamp: "2026-11-02T03:28:20.071Z",
      recovery_method: "daily_physical_backup",
      response_sha256: sha("d"),
      observed_at: "2026-11-02T03:59:00.000Z",
    },
  };
}

test("accepts only the exact inactive-to-active action sequence and owner tokens", () => {
  assert.equal(validateAction(state(false), { action: "Preflight", operator: "owner" }).action, "Preflight");
  assert.equal(validateAction(state(false), { action: "Activate", operator: "owner", authorization: ACTIVATE_AUTHORIZATION }).action, "Activate");
  assert.equal(validateAction(state(true), { action: "PostVerify", operator: "owner" }).action, "PostVerify");
  assert.equal(validateAction(state(true), { action: "Deactivate", operator: "owner", authorization: DEACTIVATE_AUTHORIZATION }).action, "Deactivate");
  assert.equal(validateAction(state(false), { action: "PostDeactivate", operator: "owner" }).action, "PostDeactivate");
  assert.throws(() => validateAction(state(false), { action: "Activate", operator: "owner" }), /activation_authorization/);
  assert.throws(() => validateAction(state(true), { action: "Deactivate", operator: "owner", authorization: ACTIVATE_AUTHORIZATION }), /deactivation_authorization/);
  assert.throws(() => validateAction(state(true), { action: "Activate", operator: "owner", authorization: ACTIVATE_AUTHORIZATION }));
});

test("fails closed on project, lineage, catalog, surface, policy, and external-state drift", () => {
  for (const mutate of [
    (value) => { value.projectRef = "wrong"; },
    (value) => { value.lineage = "baseline-v1"; },
    (value) => { value.migrationHead = "20261101201817"; },
    (value) => { value.catalogSha256 = sha("0"); },
    (value) => { value.relationCount += 1; },
    (value) => { value.functionSha256 = sha("0"); },
    (value) => { value.storagePolicySha256 = sha("0"); },
    (value) => { value.legacyCohortCount = 135; },
    (value) => { value.externalState.flags.serverAdmissionEnforcement = false; },
    (value) => { value.externalState.auth.publicSignupDisabled = false; },
    (value) => { value.remoteMain = "2".repeat(40); },
  ]) {
    const value = state(false);
    mutate(value);
    assert.throws(() => validateAction(value, { action: "Preflight", operator: "owner" }));
  }
});

test("external evidence is authenticated-source-shaped, exact-commit-bound, and hashed", () => {
  const value = externalState();
  assert.equal(validateAdmissionActivationExternalState(value, COMMIT, NOW), value);
  const forged = structuredClone(value);
  forged.flags.serverAdmissionEnforcement = false;
  assert.throws(() => validateAdmissionActivationExternalState(forged, COMMIT, NOW));
  assert.throws(() => buildAdmissionActivationExternalState({
    site: { id: "wrong" }, environment: [], authConfig: {}, projectRef: ACTIVATION_PROJECT_REF,
  }), /site_mismatch/);
  const publicSignup = externalState();
  publicSignup.auth.publicSignupDisabled = false;
  assert.throws(() => validateAdmissionActivationExternalState(publicSignup, COMMIT, NOW));
  const wrongReceipt = externalState();
  wrongReceipt.receipts.supabaseAuthConfig.endpoint = "/v1/projects/wrong/config/auth";
  assert.throws(() => validateAdmissionActivationExternalState(wrongReceipt, COMMIT, NOW));
  const stale = externalState();
  stale.observedAt = "2026-11-02T03:40:00.000Z";
  const { evidenceSha256: _oldHash, ...unsigned } = stale;
  stale.evidenceSha256 = crypto.createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  assert.throws(() => validateAdmissionActivationExternalState(stale, COMMIT, NOW), /stale/);
});

test("requires fresh migration-specific v2 recovery evidence", () => {
  const validObservation = observation();
  validObservation.backup_timestamp = recovery().management_api.backup_timestamp;
  const result = validateActivationRecoveryEvidence(recovery(), NOW, validObservation);
  assert.match(result.recoveryUseKey, /^[0-9a-f]{64}$/);
  const reused = recovery();
  reused.owner_approval_reference = "FORGE-ADMISSION-S2B-430:old-window";
  assert.throws(() => validateActivationRecoveryEvidence(reused, NOW, validObservation), /release_reference/);
  const wrongProject = observation();
  wrongProject.project_ref = "wrong";
  assert.throws(() => validateActivationRecoveryEvidence(recovery(), NOW, wrongProject));
});

test("activation SQL is atomic, complete, and leaves Bellows public Realtime unchanged", () => {
  const activation = source("supabase/activation/forge-account-admission-activation-v1.sql");
  const deactivation = source("supabase/activation/forge-account-admission-deactivation-v1.sql");
  assert.match(activation, /^--[\s\S]+\nbegin;/i);
  assert.match(activation, /alter role authenticator[\s\S]+pgrst\.db_pre_request/i);
  assert.match(activation, /as restrictive[\s\S]+to authenticated/i);
  assert.match(activation, /forge_account_admission_storage_update_v1/);
  assert.doesNotMatch(activation, /on realtime\.messages|create policy[^;]+realtime/i);
  assert.doesNotMatch(activation, /alter\s+(?:role|database)[^;]+forge\.account_admission_enforcement/i);
  assert.match(deactivation, /alter role authenticator reset pgrst\.db_pre_request/i);
  assert.doesNotMatch(deactivation, /migration repair|--include-all/i);
});

test("wrapper is single-attempt, private-evidence-bound, and performs no external configuration write", () => {
  const wrapper = source("scripts/invoke-forge-account-admission-activation.ps1");
  assert.equal(wrapper.match(/Invoke-GovernedSql 'supabase\/activation\/forge-account-admission-activation-v1\.sql'/g)?.length, 1);
  assert.equal(wrapper.match(/Invoke-GovernedSql 'supabase\/activation\/forge-account-admission-deactivation-v1\.sql'/g)?.length, 1);
  assert.match(wrapper, /Register-RecoveryEvidenceUse[\s\S]+Invoke-GovernedSql/);
  assert.match(wrapper, /\[IO\.FileMode\]::CreateNew/);
  assert.match(wrapper, /git -C \$repo ls-remote/);
  assert.doesNotMatch(wrapper, /(?:netlify|supabase)\s+(?:env:set|deploy|functions deploy|auth update)|--include-all|migration['"]?\s*,?['"]?repair|db['"]?\s*,?['"]?reset/i);
  assert.doesNotMatch(wrapper, /Start-Sleep|\bwhile\s*\(/i);
});

test("PostgreSQL 17 executes activation, state matrix, financial guard, and deactivation", { skip: !container }, () => {
  assert.match(projectId ?? "", /^[a-z0-9][a-z0-9-]{2,62}$/);
  const inspected = execFileSync("docker", ["inspect", "--format={{.Name}}", container], { encoding: "utf8" }).trim();
  assert.equal(inspected, `/supabase_db_${projectId}`);
  const run = (sql, options = {}) => execFileSync("docker", [
    "exec", "-i", ...(options.pgOptions ? ["-e", `PGOPTIONS=${options.pgOptions}`] : []), container,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
  ], { encoding: "utf8", input: sql });
  const serverVersion = Number(run("show server_version_num;", {}).trim().split(/\s+/).at(-1));
  assert.ok(serverVersion >= 170000 && serverVersion < 180000);
  try {
    run(source("supabase/activation/forge-account-admission-activation-v1.sql"), {
      pgOptions: "-c forge.activation_application_commit=1111111111111111111111111111111111111111 -c forge.activation_operator=local-certification",
    });
    run(source("supabase/tests/account_admission_activation_active.sql"));
  } finally {
    run(source("supabase/activation/forge-account-admission-deactivation-v1.sql"), {
      pgOptions: "-c forge.deactivation_operator=local-certification",
    });
  }
  const inactive = run("select count(*) from pg_policies where policyname like 'forge_account_admission%';").trim().split(/\s+/).at(-1);
  assert.equal(inactive, "0");
});
