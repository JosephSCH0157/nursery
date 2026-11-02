import { validateAuthoritySnapshot } from "./forge-beta-invitation-provisioning-429-hosted-deployment-policy.mjs";
import {
  RECOVERY_EVIDENCE_V2,
  validateHostedRecoveryEvidence,
} from "./hosted-recovery-readiness-policy.mjs";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const EXPECTED_INSTALLED_COUNT = 430;
export const EXPECTED_HOSTED_HEAD = "20261101201817";
export const TARGET_VERSION = "20261102032722";
export const TARGET_SHA256 = "12c3688094eeb00bb294339d6ee738c1b52421cb99204df4af32d92fa3f32cbb";
export const APPLY_AUTHORIZATION = "APPLY-FORGE-ADMISSION-ACTIVATION-PREPARATION-431";
export const RECOVERY_APPROVAL_PREFIX = "FORGE-ADMISSION-S2C-431:";

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
  sha256(state.platformOperatorAuthoritySha256, "platform_operator_authority_sha256");
  nonnegativeInteger(state.platformOperatorCount, "platform_operator_count");
  nonnegativeInteger(state.invitationEventCount, "invitation_event_count");
  return validateOperatorAuthorization(options);
}

export function validatePostVerifyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("postverify_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.installedCount, 431, "installed_count");
  exact(state.hostedHead, TARGET_VERSION, "hosted_head");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 0) throw new Error("pending_versions_mismatch");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  return true;
}
