import { createHash } from "node:crypto";

export const RECOVERY_EVIDENCE_V1 = "forge.hosted-recovery-readiness.v1";
export const RECOVERY_EVIDENCE_V2 = "forge.hosted-recovery-readiness.v2";
export const MANAGEMENT_API_OBSERVATION_V1 = "forge.supabase-management-backup-observation.v1";
export const MANAGEMENT_API_BASE_URL = "https://api.supabase.com";
export const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_API_OBSERVATION_AGE_MS = 5 * 60 * 1000;
export const MAX_DAILY_BACKUP_AGE_MS = 48 * 60 * 60 * 1000;

function required(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
}

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function timestamp(value, name) {
  const parsed = new Date(required(value, name));
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${name}_invalid`);
  return parsed;
}

function sha256(value, name) {
  const text = required(value, name);
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${name}_invalid`);
  return text;
}

export function managementBackupEndpoint(projectRef) {
  return `/v1/projects/${encodeURIComponent(required(projectRef, "project_ref"))}/database/backups`;
}

export function buildManagementApiBackupObservation({
  projectRef,
  responseText,
  httpStatus = 200,
  responseDate,
  observedAt = new Date().toISOString(),
  expectedBackupId,
}, now = new Date()) {
  if (httpStatus !== 200) throw new Error("management_api_http_status_invalid");
  const observed = timestamp(observedAt, "management_api_observed_at");
  const observationAge = now.getTime() - observed.getTime();
  if (observationAge < 0 || observationAge > MAX_API_OBSERVATION_AGE_MS) {
    throw new Error("management_api_observation_stale");
  }
  const responded = timestamp(responseDate, "management_api_response_date");
  const responseAge = Math.abs(observed.getTime() - responded.getTime());
  if (responseAge > MAX_API_OBSERVATION_AGE_MS) throw new Error("management_api_response_date_invalid");

  let payload;
  try { payload = JSON.parse(required(responseText, "management_api_response")); }
  catch { throw new Error("management_api_response_invalid"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("management_api_response_invalid");
  if (!Array.isArray(payload.backups)) throw new Error("management_api_backups_missing");
  if (payload.pitr_enabled !== false) throw new Error("management_api_recovery_method_unsupported");

  const completed = payload.backups.filter((backup) => backup?.status === "COMPLETED");
  const selected = expectedBackupId
    ? completed.find((backup) => String(backup.id) === String(expectedBackupId))
    : completed.sort((a, b) => Date.parse(b.inserted_at) - Date.parse(a.inserted_at))[0];
  if (!selected) throw new Error("management_api_completed_backup_missing");
  if (selected.is_physical_backup !== true) throw new Error("management_api_backup_not_physical");
  const backupAt = timestamp(selected.inserted_at, "management_api_backup_timestamp");
  const backupAge = observed.getTime() - backupAt.getTime();
  if (backupAge < 0 || backupAge > MAX_DAILY_BACKUP_AGE_MS) throw new Error("management_api_backup_stale");

  const endpoint = managementBackupEndpoint(projectRef);
  return {
    schema: MANAGEMENT_API_OBSERVATION_V1,
    project_ref: required(projectRef, "project_ref"),
    endpoint,
    http_status: 200,
    observed_at: observed.toISOString(),
    response_date: new Date(responseDate).toISOString(),
    response_sha256: createHash("sha256").update(responseText).digest("hex"),
    backup_id: String(selected.id),
    backup_status: "COMPLETED",
    backup_timestamp: backupAt.toISOString(),
    recovery_method: "daily_physical_backup",
    pitr_enabled: false,
  };
}

export function buildManagementApiRecoveryEvidence(input, observation, now = new Date()) {
  validateManagementApiObservation(observation, input.projectRef, now);
  if (input.restoreScopeAcknowledged !== true) throw new Error("restore_scope_acknowledgement_required");
  if (input.unrelatedDataImpactAcknowledged !== true) throw new Error("unrelated_data_impact_acknowledgement_required");
  return {
    schema: RECOVERY_EVIDENCE_V2,
    verification_source: "supabase_management_api",
    project_ref: required(input.projectRef, "project_ref"),
    backup_kind: "daily",
    verified_at: observation.observed_at,
    latest_restorable_at: observation.backup_timestamp,
    recovery_operator: required(input.recoveryOperator, "recovery_operator"),
    restore_authorizer: required(input.restoreAuthorizer, "restore_authorizer"),
    owner_approval_reference: required(input.ownerApprovalReference, "owner_approval_reference"),
    restore_scope_acknowledged: true,
    unrelated_data_impact_acknowledged: true,
    management_api: {
      endpoint: observation.endpoint,
      backup_id: observation.backup_id,
      backup_status: observation.backup_status,
      backup_timestamp: observation.backup_timestamp,
      recovery_method: observation.recovery_method,
      response_sha256: observation.response_sha256,
      observed_at: observation.observed_at,
    },
  };
}

export function validateManagementApiObservation(observation, projectRef, now = new Date()) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) throw new Error("management_api_observation_required");
  exact(observation.schema, MANAGEMENT_API_OBSERVATION_V1, "management_api_observation_schema");
  exact(observation.project_ref, projectRef, "management_api_project");
  exact(observation.endpoint, managementBackupEndpoint(projectRef), "management_api_endpoint");
  exact(observation.http_status, 200, "management_api_http_status");
  exact(observation.backup_status, "COMPLETED", "management_api_backup_status");
  exact(observation.recovery_method, "daily_physical_backup", "management_api_recovery_method");
  exact(observation.pitr_enabled, false, "management_api_pitr");
  sha256(observation.response_sha256, "management_api_response_sha256");
  required(observation.backup_id, "management_api_backup_id");
  const observed = timestamp(observation.observed_at, "management_api_observed_at");
  const backupAt = timestamp(observation.backup_timestamp, "management_api_backup_timestamp");
  const responded = timestamp(observation.response_date, "management_api_response_date");
  const age = now.getTime() - observed.getTime();
  if (age < 0 || age > MAX_API_OBSERVATION_AGE_MS) throw new Error("management_api_observation_stale");
  const responseAge = Math.abs(observed.getTime() - responded.getTime());
  if (responseAge > MAX_API_OBSERVATION_AGE_MS) throw new Error("management_api_response_date_invalid");
  const backupAge = observed.getTime() - backupAt.getTime();
  if (backupAge < 0 || backupAge > MAX_DAILY_BACKUP_AGE_MS) throw new Error("management_api_backup_stale");
  return true;
}

export function validateHostedRecoveryEvidence(evidence, {
  projectRef,
  approvalPrefix,
  targetVersion,
  apiObservation,
  now = new Date(),
}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("recovery_evidence_missing");
  exact(evidence.project_ref, projectRef, "recovery_project");
  exact(evidence.restore_scope_acknowledged, true, "restore_scope_acknowledgement");
  exact(evidence.unrelated_data_impact_acknowledged, true, "unrelated_data_impact_acknowledgement");
  if (!new Set(["daily", "pitr"]).has(evidence.backup_kind)) throw new Error("backup_kind_invalid");
  const verifiedAt = timestamp(evidence.verified_at, "recovery_verified_at");
  const restorableAt = timestamp(evidence.latest_restorable_at, "latest_restorable_at");
  const age = now.getTime() - verifiedAt.getTime();
  if (age < 0 || age > MAX_EVIDENCE_AGE_MS) throw new Error("recovery_evidence_stale");
  if (restorableAt.getTime() > verifiedAt.getTime()) throw new Error("latest_restorable_at_after_verification");
  if (restorableAt.getTime() > now.getTime()) throw new Error("latest_restorable_at_invalid");
  required(evidence.recovery_operator, "recovery_operator");
  required(evidence.restore_authorizer, "restore_authorizer");
  const approvalReference = required(evidence.owner_approval_reference, "owner_approval_reference");
  if (!approvalReference.startsWith(approvalPrefix) || !approvalReference.slice(approvalPrefix.length).trim()) {
    throw new Error("recovery_release_reference_mismatch");
  }

  if (evidence.schema === RECOVERY_EVIDENCE_V1) {
    exact(evidence.dashboard_verified, true, "recovery_dashboard_verification");
  } else if (evidence.schema === RECOVERY_EVIDENCE_V2) {
    exact(evidence.verification_source, "supabase_management_api", "recovery_verification_source");
    validateManagementApiObservation(apiObservation, projectRef, now);
    if (!evidence.management_api || typeof evidence.management_api !== "object") throw new Error("management_api_evidence_missing");
    for (const field of ["endpoint", "backup_id", "backup_status", "backup_timestamp", "recovery_method"]) {
      exact(evidence.management_api[field], apiObservation[field], `management_api_${field}`);
    }
    sha256(evidence.management_api.response_sha256, "management_api_evidence_response_sha256");
    exact(evidence.management_api.observed_at, evidence.verified_at, "management_api_evidence_observed_at");
    exact(evidence.latest_restorable_at, apiObservation.backup_timestamp, "management_api_latest_restorable_at");
    exact(evidence.backup_kind, "daily", "management_api_backup_kind");
  } else {
    throw new Error("recovery_schema_mismatch");
  }

  return {
    evidenceSha256: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
    recoveryUseKey: createHash("sha256").update(`${targetVersion}\n${approvalReference}`).digest("hex"),
    verificationSource: evidence.schema === RECOVERY_EVIDENCE_V2 ? "supabase_management_api" : "owner_dashboard_attestation",
  };
}
