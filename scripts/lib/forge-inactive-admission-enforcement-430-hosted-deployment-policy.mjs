import { validateAuthoritySnapshot } from "./forge-beta-invitation-provisioning-429-hosted-deployment-policy.mjs";
import {
  RECOVERY_EVIDENCE_V2,
  validateHostedRecoveryEvidence,
} from "./hosted-recovery-readiness-policy.mjs";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const EXPECTED_INSTALLED_COUNT = 429;
export const EXPECTED_HOSTED_HEAD = "20261101084703";
export const TARGET_VERSION = "20261101201817";
export const TARGET_SHA256 = "ed35a3138ba4b15f63a50b5b8e8624ad45dcb9fdd2a6a9d990d52db42017c1bb";
export const APPLY_AUTHORIZATION = "APPLY-FORGE-INACTIVE-ADMISSION-ENFORCEMENT-430";
export const RECOVERY_APPROVAL_PREFIX = "FORGE-ADMISSION-S2B-430:";

function required(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
}

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function nonnegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${name}_invalid`);
  return number;
}

export function validateRecoveryEvidence(evidence, now = new Date(), apiObservation) {
  if (evidence?.schema !== RECOVERY_EVIDENCE_V2) throw new Error("recovery_management_api_evidence_required");
  const validated = validateHostedRecoveryEvidence(evidence, {
    projectRef: FORGE_PROJECT_REF,
    approvalPrefix: RECOVERY_APPROVAL_PREFIX,
    targetVersion: TARGET_VERSION,
    apiObservation,
    now,
  });
  exact(validated.verificationSource, "supabase_management_api", "recovery_verification_source");
  return validated;
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
  nonnegativeInteger(state.invitationEventCount, "invitation_event_count");
  return validateOperatorAuthorization(options);
}

export function validatePostVerifyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("postverify_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.installedCount, 430, "installed_count");
  exact(state.hostedHead, TARGET_VERSION, "hosted_head");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 0) throw new Error("pending_versions_mismatch");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  return true;
}
