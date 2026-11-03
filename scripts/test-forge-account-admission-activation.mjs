import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  ACTIVATE_AUTHORIZATION,
  ACTIVATION_ACTIVE_CATALOG_OBJECT_COUNT,
  ACTIVATION_ACTIVE_CATALOG_SHA256,
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
import {
  executeAdmissionRuntimeProbes,
  RUNTIME_PROBE_BUNDLE_SCHEMA,
  RUNTIME_PROBE_RECEIPT_SCHEMA,
} from "./lib/forge-account-admission-runtime-probes.mjs";

const NOW = new Date("2026-11-02T04:00:00.000Z");
const COMMIT = "1".repeat(40);
const sha = (value) => value.repeat(64);
const container = process.env.SUPABASE_DB_CONTAINER?.trim();
const projectId = process.env.FORGE_OWNED_DATABASE_PROJECT_ID?.trim();
const localApiUrl = process.env.S2C_LOCAL_SUPABASE_URL?.trim();
const localAnonKey = process.env.S2C_LOCAL_ANON_KEY?.trim();
const localServiceRoleKey = process.env.S2C_LOCAL_SERVICE_ROLE_KEY?.trim();
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function runtimeReceipt(mode) {
  const unsigned = {
    schema: RUNTIME_PROBE_RECEIPT_SCHEMA,
    projectRef: ACTIVATION_PROJECT_REF,
    environment: "hosted",
    mode,
    observedAt: NOW.toISOString(),
    bundleExpiresAt: "2026-11-02T04:10:00.000Z",
    authIdentitiesVerified: 4,
    canonicalStatesVerified: true,
    admittedProtectedOperationAllowed: true,
    unadmittedProtectedOperationDenied: mode === "active",
    revokedProtectedOperationDenied: mode === "active",
    operatorProtectedOperationDenied: mode === "active",
    operatorExceptionAllowed: true,
    nonOperatorExceptionDenied: true,
    actualPostgrestRequestsExecuted: true,
    complete: true,
    tokensReturned: false,
    refreshTokensAccepted: false,
    serviceRoleSubstitutionAccepted: false,
    customerDataReturned: false,
    unverifiedExternalState: ["netlify_configuration", "hosted_auth_configuration"],
  };
  return { ...unsigned, evidenceSha256: crypto.createHash("sha256").update(canonicalJson(unsigned)).digest("hex") };
}

function state(active = false) {
  return {
    projectRef: ACTIVATION_PROJECT_REF,
    lineage: "historical-v1",
    migrationCount: ACTIVATION_MIGRATION_COUNT,
    migrationHead: ACTIVATION_MIGRATION_HEAD,
    migrationSha256: ACTIVATION_MIGRATION_SHA256,
    catalogObjectCount: active ? ACTIVATION_ACTIVE_CATALOG_OBJECT_COUNT : ACTIVATION_CATALOG_OBJECT_COUNT,
    catalogSha256: active ? ACTIVATION_ACTIVE_CATALOG_SHA256 : ACTIVATION_CATALOG_SHA256,
    enforcementState: active ? "active" : "inactive",
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
    runtimeProbeReadiness: runtimeReceipt("preflight"),
    runtimeProbeExecution: runtimeReceipt("active"),
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

test("fails closed when runtime probes are missing, incomplete, stale, or substituted", () => {
  for (const [action, active, field] of [
    ["Preflight", false, "runtimeProbeReadiness"],
    ["Activate", false, "runtimeProbeReadiness"],
    ["PostVerify", true, "runtimeProbeExecution"],
  ]) {
    const missing = state(active);
    delete missing[field];
    assert.throws(() => validateAction(missing, {
      action,
      operator: "owner",
      authorization: action === "Activate" ? ACTIVATE_AUTHORIZATION : undefined,
    }), /runtime_probe_receipt_missing/);
  }
  const incomplete = state(true);
  incomplete.runtimeProbeExecution.complete = false;
  assert.throws(() => validateAction(incomplete, { action: "PostVerify", operator: "owner" }), /runtime_probe_complete/);
  const serviceRole = state(true);
  serviceRole.runtimeProbeExecution.serviceRoleSubstitutionAccepted = true;
  assert.throws(() => validateAction(serviceRole, { action: "PostVerify", operator: "owner" }));
  const stale = state(false);
  stale.runtimeProbeReadiness.observedAt = "2026-11-02T03:40:00.000Z";
  assert.throws(() => validateAction(stale, { action: "Preflight", operator: "owner" }), /runtime_probe_receipt_stale/);
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

test("active verification rejects the inactive catalog and unexpected active catalog drift", () => {
  const inactiveCatalog = state(true);
  inactiveCatalog.catalogObjectCount = ACTIVATION_CATALOG_OBJECT_COUNT;
  inactiveCatalog.catalogSha256 = ACTIVATION_CATALOG_SHA256;
  assert.throws(() => validateAction(inactiveCatalog, { action: "PostVerify", operator: "owner" }), /active_catalog_object_count/);
  const unexpectedActive = state(true);
  unexpectedActive.catalogSha256 = sha("0");
  assert.throws(() => validateAction(unexpectedActive, { action: "PostVerify", operator: "owner" }), /active_catalog_sha256/);
  const mixed = state(true);
  mixed.enforcementState = "mixed";
  assert.throws(() => validateAction(mixed, { action: "PostVerify", operator: "owner" }), /enforcement_state/);
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

test("runtime-probe contract independently validates Auth tokens and returns a credential-free receipt", async () => {
  const apiOrigin = "http://127.0.0.1:54321";
  const identities = Object.fromEntries([
    ["admitted", "81000000-0000-4000-8000-000000000001"],
    ["unadmitted", "81000000-0000-4000-8000-000000000002"],
    ["revoked", "81000000-0000-4000-8000-000000000003"],
    ["unadmitted_operator", "81000000-0000-4000-8000-000000000004"],
  ].map(([role, userId]) => {
    const payload = Buffer.from(JSON.stringify({
      iss: `${apiOrigin}/auth/v1`, aud: "authenticated", role: "authenticated", sub: userId,
      exp: Math.floor(NOW.valueOf() / 1000) + 600,
    })).toString("base64url");
    return [role, { user_id: userId, access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture-signature` }];
  }));
  const tokenRole = new Map(Object.entries(identities).map(([role, identity]) => [identity.access_token, role]));
  const response = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
  const fetchImpl = async (url, init = {}) => {
    const token = new Headers(init.headers).get("authorization")?.replace(/^Bearer /, "");
    const role = tokenRole.get(token);
    if (!role) return response({ code: "invalid_token" }, 401);
    if (url.endsWith("/auth/v1/user")) return response({ id: identities[role].user_id });
    if (url.includes("/rpc/read_my_admission_onboarding")) {
      const effectiveState = role === "admitted" ? "admitted" : role === "revoked" ? "revoked" : null;
      return response({ effective_state: effectiveState, admitted: effectiveState === "admitted" });
    }
    if (url.includes("/rpc/is_account_admitted")) return response(role === "admitted");
    if (url.includes("/rpc/list_beta_invitation_applications")) {
      return role === "unadmitted_operator" ? response([]) : response({ code: "42501" }, 403);
    }
    return response({ code: "unexpected" }, 404);
  };
  const bundle = {
    schema: RUNTIME_PROBE_BUNDLE_SCHEMA,
    project_ref: "forge-local-probe",
    api_origin: apiOrigin,
    api_key: "local-publishable-key",
    created_at: NOW.toISOString(),
    expires_at: "2026-11-02T04:10:00.000Z",
    identities,
  };
  const receipt = await executeAdmissionRuntimeProbes(bundle, {
    mode: "preflight", environment: "local", projectRef: "forge-local-probe", apiOrigin, now: NOW, fetchImpl,
  });
  assert.equal(receipt.complete, true);
  assert.equal(receipt.authIdentitiesVerified, 4);
  assert.equal(receipt.actualPostgrestRequestsExecuted, true);
  const serialized = JSON.stringify(receipt);
  for (const identity of Object.values(identities)) assert.equal(serialized.includes(identity.access_token), false);
  const substituted = structuredClone(bundle);
  const admittedPayload = JSON.parse(Buffer.from(substituted.identities.admitted.access_token.split(".")[1], "base64url"));
  admittedPayload.role = "service_role";
  substituted.identities.admitted.access_token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(admittedPayload)).toString("base64url")}.fixture-signature`;
  await assert.rejects(() => executeAdmissionRuntimeProbes(substituted, {
    mode: "preflight", environment: "local", projectRef: "forge-local-probe", apiOrigin, now: NOW, fetchImpl,
  }), /admitted_jwt_role_mismatch/);
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
  assert.match(wrapper, /RuntimeProbeBundlePath/);
  assert.match(wrapper, /BLOCKED: a fresh runtime-probe bundle is required/);
  assert.match(wrapper, /verify-forge-account-admission-runtime-probes\.mjs/);
  assert.match(wrapper, /--mode \$Mode --environment hosted/);
  assert.match(wrapper, /runtimeProbesExecuted=\$true/);
  assert.match(wrapper, /Get-VerifiedEnforcementState/);
  assert.match(wrapper, /v1-account-admission-activation-active\/active-catalog-fingerprint\.json/);
  assert.match(wrapper, /persistent_financial_setting_count/);
  assert.match(wrapper, /mixed or differs from both certified lifecycle states/);
  assert.match(wrapper, /unverifiedExternalState/);
  assert.doesNotMatch(wrapper, /admitted_probe_allowed|unadmitted_probe_denied|revoked_probe_denied|operator_customer_probe_denied/);
  assert.doesNotMatch(wrapper, /(?:netlify|supabase)\s+(?:env:set|deploy|functions deploy|auth update)|--include-all|migration['"]?\s*,?['"]?repair|db['"]?\s*,?['"]?reset/i);
  assert.doesNotMatch(wrapper, /Start-Sleep|\bwhile\s*\(/i);
});

test("activation wrapper pins every lifecycle catalog contract input", () => {
  const wrapper = source("scripts/invoke-forge-account-admission-activation.ps1");
  for (const [variable, path] of [
    ["policySha256", "scripts/lib/forge-account-admission-activation-policy.mjs"],
    ["inactiveCatalogSha256", "docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json"],
    ["activeCatalogSha256", "docs/database/baseline/v1-account-admission-activation-active/active-catalog-fingerprint.json"],
    ["activeCatalogContractSha256", "docs/database/baseline/v1-account-admission-activation-active/active-contract.v1.json"],
    ["activeCatalogPolicySha256", "scripts/lib/forge-account-admission-active-catalog-contract.mjs"],
    ["activeCatalogVerifierSha256", "scripts/verify-forge-account-admission-active-catalog-contract.mjs"],
  ]) {
    const pinned = wrapper.match(new RegExp(`\\$${variable}='([0-9a-f]{64})'`))?.[1];
    const actual = crypto.createHash("sha256").update(source(path)).digest("hex");
    assert.equal(pinned, actual, `${variable} must pin ${path}`);
  }
});

test("PostgreSQL 17 and real Auth/PostgREST execute the complete activation matrix", { skip: !container }, async () => {
  assert.match(projectId ?? "", /^[a-z0-9][a-z0-9-]{2,62}$/);
  assert.ok(localApiUrl && localAnonKey && localServiceRoleKey);
  const apiOrigin = new URL(localApiUrl).origin;
  assert.ok(new Set(["127.0.0.1", "localhost", "::1"]).has(new URL(apiOrigin).hostname));
  const inspected = execFileSync("docker", ["inspect", "--format={{.Name}}", container], { encoding: "utf8" }).trim();
  assert.equal(inspected, `/supabase_db_${projectId}`);
  const run = (sql, options = {}) => execFileSync("docker", [
    "exec", "-i", ...(options.pgOptions ? ["-e", `PGOPTIONS=${options.pgOptions}`] : []), container,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
  ], { encoding: "utf8", input: sql });
  const serverVersion = Number(run("show server_version_num;", {}).trim().split(/\s+/).at(-1));
  assert.ok(serverVersion >= 170000 && serverVersion < 180000);
  const service = createClient(apiOrigin, localServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicClient = createClient(apiOrigin, localAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = crypto.randomUUID().slice(0, 8);
  const identitySpecs = {
    admitted: { email: `s2c-admitted-${suffix}@example.test`, password: `Forge-S2C-${suffix}-Admitted!9` },
    unadmitted: { email: `s2c-unadmitted-${suffix}@example.test`, password: `Forge-S2C-${suffix}-Unadmitted!9` },
    revoked: { email: `s2c-revoked-${suffix}@example.test`, password: `Forge-S2C-${suffix}-Revoked!9` },
    unadmitted_operator: { email: `s2c-operator-${suffix}@example.test`, password: `Forge-S2C-${suffix}-Operator!9` },
  };
  const identities = {};
  for (const [role, spec] of Object.entries(identitySpecs)) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
    });
    assert.ifError(createError);
    assert.ok(created.user?.id);
    const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword(spec);
    assert.ifError(signInError);
    assert.ok(signedIn.session?.access_token);
    identities[role] = { user_id: created.user.id, access_token: signedIn.session.access_token };
  }
  run(`
    insert into tongs.legacy_account_admission_cohort(user_id) values
      ('${identities.admitted.user_id}'),
      ('${identities.revoked.user_id}');
    insert into tongs.platform_operators(user_id,reason,granted_by)
    values ('${identities.unadmitted_operator.user_id}','Slice 2C disposable runtime probe','${identities.unadmitted_operator.user_id}');
    insert into tongs.account_admission_events(
      user_id,revision,operation_id,event_type,origin_kind,origin_legacy_user_id,actor_id,reason
    ) values
      ('${identities.admitted.user_id}',1,'${crypto.randomUUID()}','grant','legacy','${identities.admitted.user_id}',null,'Slice 2C disposable admitted probe'),
      ('${identities.revoked.user_id}',1,'${crypto.randomUUID()}','grant','legacy','${identities.revoked.user_id}',null,'Slice 2C disposable revoked probe'),
      ('${identities.revoked.user_id}',2,'${crypto.randomUUID()}','revoke','legacy','${identities.revoked.user_id}','${identities.unadmitted_operator.user_id}','Slice 2C disposable revoked probe');
  `);
  const localNow = new Date();
  const bundle = {
    schema: RUNTIME_PROBE_BUNDLE_SCHEMA,
    project_ref: projectId,
    api_origin: apiOrigin,
    api_key: localAnonKey,
    created_at: localNow.toISOString(),
    expires_at: new Date(localNow.valueOf() + 10 * 60 * 1000).toISOString(),
    identities,
  };
  const readiness = await executeAdmissionRuntimeProbes(bundle, {
    mode: "preflight", environment: "local", projectRef: projectId, apiOrigin, now: localNow,
  });
  assert.equal(readiness.complete, true);

  const post = async (path, identity, body = {}, options = {}) => {
    const response = await fetch(`${apiOrigin}/rest/v1/${path}${options.query ?? ""}`, {
      method: options.method ?? "POST",
      redirect: "manual",
      headers: {
        apikey: localAnonKey,
        authorization: `Bearer ${identity.access_token}`,
        "accept-profile": "tongs",
        "content-profile": "tongs",
        "content-type": "application/json",
      },
      body: (options.method ?? "POST") === "GET" ? undefined : JSON.stringify(body),
    });
    let value = null;
    try { value = await response.json(); } catch { /* response body is not evidence */ }
    return { status: response.status, ok: response.ok, code: value?.code ?? null, value };
  };
  try {
    run(source("supabase/activation/forge-account-admission-activation-v1.sql"), {
      pgOptions: "-c forge.activation_application_commit=1111111111111111111111111111111111111111 -c forge.activation_operator=local-certification",
    });
    let gateObserved = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const probe = await post("rpc/is_account_admitted", identities.unadmitted, { p_user_id: identities.unadmitted.user_id });
      if (probe.status === 403 && probe.code === "42501") { gateObserved = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(gateObserved, true, "PostgREST did not activate the registered pre-request gate");

    const execution = await executeAdmissionRuntimeProbes(bundle, {
      mode: "active", environment: "local", projectRef: projectId, apiOrigin, now: new Date(),
    });
    assert.equal(execution.complete, true);
    assert.equal(execution.admittedProtectedOperationAllowed, true);
    assert.equal(execution.unadmittedProtectedOperationDenied, true);
    assert.equal(execution.revokedProtectedOperationDenied, true);
    assert.equal(execution.operatorProtectedOperationDenied, true);

    const onboardingQuery = await post("rpc/read_my_admission_onboarding", identities.unadmitted, {}, { query: "?select=*" });
    assert.equal(onboardingQuery.status, 200);
    const bellows = await post("rpc/resolve_bellows_join_link", identities.unadmitted, {
      p_session_id: "missing-disposable-session",
      p_token: "missing-disposable-token",
    });
    assert.equal(bellows.status, 200);
    assert.deepEqual(bellows.value, []);

    const operatorCases = [
      ["list_beta_access_applications", { p_decision: null, p_limit: 1 }, 200, null],
      ["decide_beta_access_application", { p_application_id: null, p_decision: null, p_reason: null, p_operation_id: null }, 400, "22023"],
      ["set_account_admission_state", { p_user_id: null, p_state: null, p_reason: null, p_operation_id: null }, 400, "22023"],
      ["list_beta_invitation_applications", { p_state: null, p_limit: 1, p_before_submitted_at: null, p_before_application_id: null }, 200, null],
    ];
    for (const [name, body, operatorStatus, operatorCode] of operatorCases) {
      const operatorResult = await post(`rpc/${name}`, identities.unadmitted_operator, body);
      assert.equal(operatorResult.status, operatorStatus, `operator exception failed for ${name}`);
      if (operatorCode) assert.equal(operatorResult.code, operatorCode, `operator RPC ${name} did not reach its own contract`);
      const nonOperatorResult = await post(`rpc/${name}`, identities.unadmitted, body);
      assert.equal(nonOperatorResult.status, 403, `non-operator reached ${name}`);
      assert.equal(nonOperatorResult.code, "42501");
    }

    const protectedRpc = await post("rpc/is_account_admitted", identities.unadmitted, {
      p_user_id: identities.unadmitted.user_id,
    }, { query: "?request.path=rpc%2Fread_my_admission_onboarding" });
    assert.equal(protectedRpc.ok, false, "query parameters cannot rewrite the PostgREST request.path");
    assert.equal(protectedRpc.status >= 400 && protectedRpc.status < 500, true);
    const alternateRoute = await post("read_my_admission_onboarding", identities.unadmitted);
    assert.equal(alternateRoute.ok, false, "an alternate non-RPC route cannot reach the onboarding exception");
    assert.equal(alternateRoute.status >= 400 && alternateRoute.status < 500, true);
    // Kong/PostgREST normalize repeated transport slashes. Prove that this
    // normalization cannot turn a protected RPC into an excepted path.
    const doubleSlash = await post("rpc//is_account_admitted", identities.unadmitted, {
      p_user_id: identities.unadmitted.user_id,
    });
    assert.equal(doubleSlash.ok, false, "a double slash cannot bypass a protected RPC");
    assert.equal(doubleSlash.status >= 400 && doubleSlash.status < 500, true);
    const wrongMethod = await post("rpc/read_my_admission_onboarding", identities.unadmitted, {}, { method: "GET" });
    assert.equal(wrongMethod.status, 403);
    assert.equal(wrongMethod.code, "42501");

    run(source("supabase/tests/account_admission_activation_active.sql"));
  } finally {
    run(source("supabase/activation/forge-account-admission-deactivation-v1.sql"), {
      pgOptions: "-c forge.deactivation_operator=local-certification",
    });
  }
  const inactive = run("select count(*) from pg_policies where policyname like 'forge_account_admission%';").trim().split(/\s+/).at(-1);
  assert.equal(inactive, "0");
});
