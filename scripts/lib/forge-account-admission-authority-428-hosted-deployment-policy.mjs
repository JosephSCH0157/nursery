import { createHash } from "node:crypto";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const EXPECTED_INSTALLED_COUNT = 427;
export const EXPECTED_HOSTED_HEAD = "20261030224605";
export const TARGET_VERSION = "20261031123320";
export const TARGET_SHA256 = "d59bc289ccd2b14f39e811586b9588e3fedc76bcdd9336c318b9c87453689d0d";
export const APPLY_AUTHORIZATION = "APPLY-FORGE-ACCOUNT-ADMISSION-AUTHORITY-428";
export const RECOVERY_APPROVAL_PREFIX = "FORGE-ADMISSION-S1-428:";

const SNAPSHOT_COUNTERS = [
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

function validateUnaffectedSnapshot(state) {
  sha256(state.unaffectedAuthoritySha256, "unaffected_authority_sha256");
  sha256(state.authSignupSha256, "auth_signup_sha256");
  const authUserCount = Number(state.authUserCount);
  if (!Number.isSafeInteger(authUserCount) || authUserCount < 0) throw new Error("auth_user_count_invalid");
  if (!state.financialCounters || typeof state.financialCounters !== "object" || Array.isArray(state.financialCounters)) {
    throw new Error("financial_counters_missing");
  }
  for (const name of SNAPSHOT_COUNTERS) {
    const value = Number(state.financialCounters[name]);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}_invalid`);
  }
}

export function validateRecoveryEvidence(evidence, now = new Date()) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("recovery_evidence_missing");
  exact(evidence.schema, "forge.hosted-recovery-readiness.v1", "recovery_schema");
  exact(evidence.project_ref, FORGE_PROJECT_REF, "recovery_project");
  exact(evidence.dashboard_verified, true, "recovery_dashboard_verification");
  exact(evidence.restore_scope_acknowledged, true, "restore_scope_acknowledgement");
  exact(evidence.unrelated_data_impact_acknowledged, true, "unrelated_data_impact_acknowledgement");
  if (!new Set(["daily", "pitr"]).has(evidence.backup_kind)) throw new Error("backup_kind_invalid");
  const verifiedAt = new Date(required(evidence.verified_at, "recovery_verified_at"));
  const restorableAt = new Date(required(evidence.latest_restorable_at, "latest_restorable_at"));
  if (!Number.isFinite(verifiedAt.getTime()) || !Number.isFinite(restorableAt.getTime())) throw new Error("recovery_timestamp_invalid");
  const age = now.getTime() - verifiedAt.getTime();
  if (age < 0 || age > 24 * 60 * 60 * 1000) throw new Error("recovery_evidence_stale");
  if (restorableAt.getTime() > now.getTime()) throw new Error("latest_restorable_at_invalid");
  if (restorableAt.getTime() > verifiedAt.getTime()) throw new Error("latest_restorable_at_after_verification");
  required(evidence.recovery_operator, "recovery_operator");
  required(evidence.restore_authorizer, "restore_authorizer");
  const approvalReference = required(evidence.owner_approval_reference, "owner_approval_reference");
  if (!approvalReference.startsWith(RECOVERY_APPROVAL_PREFIX) || !approvalReference.slice(RECOVERY_APPROVAL_PREFIX.length).trim()) {
    throw new Error("recovery_release_reference_mismatch");
  }
  return {
    evidenceSha256: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    recoveryUseKey: createHash("sha256").update(`${TARGET_VERSION}\n${approvalReference}`).digest("hex"),
  };
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
  validateUnaffectedSnapshot(state);
  return validateOperatorAuthorization(options);
}

export function validatePostVerifyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("postverify_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.installedCount, 428, "installed_count");
  exact(state.hostedHead, TARGET_VERSION, "hosted_head");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 0) throw new Error("pending_versions_mismatch");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  return true;
}
