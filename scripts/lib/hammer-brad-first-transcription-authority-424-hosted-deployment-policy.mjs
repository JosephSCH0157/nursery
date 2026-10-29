import { createHash } from "node:crypto";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const EXPECTED_INSTALLED_COUNT = 423;
export const EXPECTED_HOSTED_HEAD = "20261029110858";
export const TARGET_VERSION = "20261029154824";
export const TARGET_SHA256 = "b3699ef0f621f3630671402a278f9b178ebe9c42bdc746d3bf9e3ed8a3ee3850";
export const APPLY_AUTHORIZATION = "AUTHORIZE-HAMMER-BRAD-FIRST-TRANSCRIPTION-AUTHORITY-424";

function requireString(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name}_missing`);
  return normalized;
}
function requireExact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}
export function validateRecoveryEvidence(evidence, now = new Date()) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("recovery_evidence_missing");
  requireExact(evidence.schema, "forge.hosted-recovery-readiness.v1", "recovery_schema");
  requireExact(evidence.project_ref, FORGE_PROJECT_REF, "recovery_project");
  requireExact(evidence.dashboard_verified, true, "recovery_dashboard_verification");
  requireExact(evidence.restore_scope_acknowledged, true, "restore_scope_acknowledgement");
  requireExact(evidence.unrelated_data_impact_acknowledged, true, "unrelated_data_impact_acknowledgement");
  if (!new Set(["daily", "pitr"]).has(evidence.backup_kind)) throw new Error("backup_kind_invalid");
  const verifiedAt = new Date(requireString(evidence.verified_at, "recovery_verified_at"));
  const restorableAt = new Date(requireString(evidence.latest_restorable_at, "latest_restorable_at"));
  if (!Number.isFinite(verifiedAt.getTime()) || !Number.isFinite(restorableAt.getTime())) throw new Error("recovery_timestamp_invalid");
  const ageMs = now.getTime() - verifiedAt.getTime();
  if (ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) throw new Error("recovery_evidence_stale");
  if (restorableAt.getTime() > now.getTime()) throw new Error("latest_restorable_at_invalid");
  requireString(evidence.recovery_operator, "recovery_operator");
  requireString(evidence.restore_authorizer, "restore_authorizer");
  requireString(evidence.owner_approval_reference, "owner_approval_reference");
  return {
    backupKind: evidence.backup_kind,
    verifiedAt: verifiedAt.toISOString(),
    latestRestorableAt: restorableAt.toISOString(),
    recoveryOperator: evidence.recovery_operator.trim(),
    restoreAuthorizer: evidence.restore_authorizer.trim(),
    evidenceSha256: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
  };
}

export function validateHostedState(state, options = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("hosted_state_missing");
  requireExact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  requireExact(state.lineage, EXPECTED_LINEAGE, "lineage");
  requireExact(state.installedCount, EXPECTED_INSTALLED_COUNT, "installed_count");
  requireExact(state.hostedHead, EXPECTED_HOSTED_HEAD, "hosted_head");
  requireExact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 1 || state.pendingVersions[0] !== TARGET_VERSION) throw new Error("pending_versions_mismatch");
  requireExact(state.databasePasswordAvailable, true, "database_password");
  return validateOperatorAuthorization(options);
}

export function validateOperatorAuthorization(options = {}) {
  const operator = requireString(options.operator, "operator");
  if (options.action === "Apply") requireExact(options.authorization, APPLY_AUTHORIZATION, "operator_authorization");
  return { operator };
}
