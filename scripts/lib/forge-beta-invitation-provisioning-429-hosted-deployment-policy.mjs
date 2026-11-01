import { validateHostedRecoveryEvidence } from "./hosted-recovery-readiness-policy.mjs";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const EXPECTED_INSTALLED_COUNT = 428;
export const EXPECTED_HOSTED_HEAD = "20261031123320";
export const TARGET_VERSION = "20261101084703";
export const TARGET_SHA256 = "12989ba74c00c2bdc8a9d4c5d38ee4e3be3f1f4d23b9b0f8d2a1b145c7b7dbc7";
export const APPLY_AUTHORIZATION = "APPLY-FORGE-BETA-INVITATION-PROVISIONING-429";
export const RECOVERY_APPROVAL_PREFIX = "FORGE-ADMISSION-S2A-429:";

const SNAPSHOT_HASHES = [
  "unaffectedAuthoritySha256",
  "authAuthoritySha256",
  "legacyCohortSha256",
  "admissionProjectionSha256",
  "admissionEventSha256",
  "applicationAuthoritySha256",
];

const SNAPSHOT_COUNTS = [
  "authUserCount",
  "profileCount",
  "workspaceCount",
  "workspaceMemberCount",
  "legacyCohortCount",
  "admissionProjectionCount",
  "admissionEventCount",
  "applicationCount",
  "decisionCount",
  "bindingCount",
];

const FINANCIAL_COUNTERS = [
  "fundingReservations",
  "fundingReservationEvents",
  "paidMediaProviderAttempts",
  "ownerCostProviderAttempts",
  "hammerTranscriptionProviderAttempts",
];

function required(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
}

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function sha256(value, name) {
  const text = required(value, name);
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${name}_invalid`);
  return text;
}

function nonnegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${name}_invalid`);
  return number;
}

export function validateAuthoritySnapshot(state) {
  for (const name of SNAPSHOT_HASHES) sha256(state[name], name);
  for (const name of SNAPSHOT_COUNTS) nonnegativeInteger(state[name], name);
  if (!state.financialCounters || typeof state.financialCounters !== "object" || Array.isArray(state.financialCounters)) {
    throw new Error("financial_counters_missing");
  }
  for (const name of FINANCIAL_COUNTERS) nonnegativeInteger(state.financialCounters[name], name);
  return true;
}

export function validateRecoveryEvidence(evidence, now = new Date(), apiObservation) {
  return validateHostedRecoveryEvidence(evidence, {
    projectRef: FORGE_PROJECT_REF,
    approvalPrefix: RECOVERY_APPROVAL_PREFIX,
    targetVersion: TARGET_VERSION,
    apiObservation,
    now,
  });
}

export function validateOperatorAuthorization(options = {}) {
  if (!new Set(["Preflight", "Apply"]).has(options.action)) throw new Error("action_invalid");
  const operator = required(options.operator, "operator");
  if (options.action === "Apply") exact(options.authorization, APPLY_AUTHORIZATION, "operator_authorization");
  return { operator };
}

export function validateHostedState(state, options = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("hosted_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.installedCount, EXPECTED_INSTALLED_COUNT, "installed_count");
  exact(state.hostedHead, EXPECTED_HOSTED_HEAD, "hosted_head");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 1 || state.pendingVersions[0] !== TARGET_VERSION) {
    throw new Error("pending_versions_mismatch");
  }
  exact(state.databasePasswordAvailable, true, "database_password");
  validateAuthoritySnapshot(state);
  return validateOperatorAuthorization(options);
}

export function validatePostVerifyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("postverify_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.installedCount, 429, "installed_count");
  exact(state.hostedHead, TARGET_VERSION, "hosted_head");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 0) throw new Error("pending_versions_mismatch");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  return true;
}
