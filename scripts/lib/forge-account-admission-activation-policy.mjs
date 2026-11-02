import {
  RECOVERY_EVIDENCE_V2,
  validateHostedRecoveryEvidence,
} from "./hosted-recovery-readiness-policy.mjs";
import { validateAdmissionActivationExternalState } from "./forge-account-admission-activation-external-state.mjs";
import { validateRuntimeProbeReceipt } from "./forge-account-admission-runtime-probes.mjs";

export const ACTIVATION_PROJECT_REF = "wtvdjndyxegudufrompx";
export const ACTIVATION_LINEAGE = "historical-v1";
export const ACTIVATION_MIGRATION_COUNT = 431;
export const ACTIVATION_MIGRATION_HEAD = "20261102032722";
export const ACTIVATION_MIGRATION_SHA256 = "12c3688094eeb00bb294339d6ee738c1b52421cb99204df4af32d92fa3f32cbb";
export const ACTIVATION_CATALOG_OBJECT_COUNT = 16612;
export const ACTIVATION_CATALOG_SHA256 = "a631d4c3f5ca6439a0e5a0b476662cbfc7a7543987140538f7d8ea6ab3b43fb1";
export const ACTIVATION_RELATION_COUNT = 259;
export const ACTIVATION_RELATION_SHA256 = "575e52fa85bf79dafa30eee4aba95f7396b5559c0183d8b205eee110837d31f0";
export const ACTIVATION_FUNCTION_COUNT = 492;
export const ACTIVATION_FUNCTION_SHA256 = "5ed453b8a284f1bceb73c53f490ad039cccd4ebd929bc11eb8c8a1b8d7db996e";
export const ACTIVATION_STORAGE_POLICY_COUNT = 8;
export const ACTIVATION_STORAGE_POLICY_SHA256 = "9cc277337a4c0db8afbc56c8da7e463b9cdb6b26eaa3ce4a371334a183331fe7";
export const ACTIVATE_AUTHORIZATION = "ACTIVATE-FORGE-ACCOUNT-ADMISSION-ENFORCEMENT-V1";
export const DEACTIVATE_AUTHORIZATION = "DEACTIVATE-FORGE-ACCOUNT-ADMISSION-ENFORCEMENT-V1";
export const ACTIVATION_RECOVERY_PREFIX = "FORGE-ADMISSION-S2C-ACTIVATION:";

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function required(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
}

function hash(value, name) {
  const text = required(value, name);
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${name}_invalid`);
  return text;
}

function commit(value, name) {
  const text = required(value, name);
  if (!/^[0-9a-f]{40}$/.test(text)) throw new Error(`${name}_invalid`);
  return text;
}

function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}_invalid`);
  return value;
}

function validateIdentity(state, now) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("activation_state_missing");
  exact(state.projectRef, ACTIVATION_PROJECT_REF, "project_ref");
  exact(state.lineage, ACTIVATION_LINEAGE, "lineage");
  exact(state.migrationCount, ACTIVATION_MIGRATION_COUNT, "migration_count");
  exact(state.migrationHead, ACTIVATION_MIGRATION_HEAD, "migration_head");
  exact(state.migrationSha256, ACTIVATION_MIGRATION_SHA256, "migration_sha256");
  exact(state.catalogObjectCount, ACTIVATION_CATALOG_OBJECT_COUNT, "catalog_object_count");
  exact(state.catalogSha256, ACTIVATION_CATALOG_SHA256, "catalog_sha256");
  exact(state.relationCount, ACTIVATION_RELATION_COUNT, "relation_count");
  exact(state.relationSha256, ACTIVATION_RELATION_SHA256, "relation_sha256");
  exact(state.functionCount, ACTIVATION_FUNCTION_COUNT, "function_count");
  exact(state.functionSha256, ACTIVATION_FUNCTION_SHA256, "function_sha256");
  exact(state.storagePolicyCount, ACTIVATION_STORAGE_POLICY_COUNT, "storage_policy_count");
  exact(state.storagePolicySha256, ACTIVATION_STORAGE_POLICY_SHA256, "storage_policy_sha256");
  exact(integer(state.legacyCohortCount, "legacy_cohort_count"), 136, "legacy_cohort_count");
  exact(state.projectionConsistent, true, "projection_consistent");
  integer(state.invitationJournalCount, "invitation_journal_count");
  if (state.invitationJournalCount < 0) throw new Error("invitation_journal_count_invalid");
  hash(state.legacyCohortSha256, "legacy_cohort_sha256");
  hash(state.admissionProjectionSha256, "admission_projection_sha256");
  hash(state.financialAuthoritySha256, "financial_authority_sha256");
  const applicationCommit = commit(state.applicationCommit, "application_commit");
  exact(commit(state.remoteMain, "remote_main"), applicationCommit, "remote_main");
  validateAdmissionActivationExternalState(state.externalState, applicationCommit, now);
  return applicationCommit;
}

function validateInactive(state) {
  exact(state.preRequestSetting, "", "pre_request_setting");
  exact(state.dataApiAdmissionPolicyCount, 0, "data_api_admission_policy_count");
  exact(state.storageAdmissionPolicyCount, 0, "storage_admission_policy_count");
  exact(state.realtimeAdmissionPolicyCount, 0, "realtime_admission_policy_count");
}

function validateActive(state) {
  exact(state.preRequestSetting, "tongs.account_admission_pre_request", "pre_request_setting");
  exact(state.dataApiAdmissionPolicyCount, 250, "data_api_admission_policy_count");
  exact(state.storageAdmissionPolicyCount, 3, "storage_admission_policy_count");
  exact(state.realtimeAdmissionPolicyCount, 0, "realtime_admission_policy_count");
  exact(state.dataApiPolicyContractValid, true, "data_api_policy_contract");
  exact(state.storagePolicyContractValid, true, "storage_policy_contract");
  exact(state.financialTransactionGuardValid, true, "financial_transaction_guard");
}

export function validateActivationRecoveryEvidence(evidence, now, apiObservation) {
  if (evidence?.schema !== RECOVERY_EVIDENCE_V2) throw new Error("recovery_management_api_evidence_required");
  return validateHostedRecoveryEvidence(evidence, {
    projectRef: ACTIVATION_PROJECT_REF,
    approvalPrefix: ACTIVATION_RECOVERY_PREFIX,
    targetVersion: "account-admission-activation-v1",
    apiObservation,
    now,
  });
}

export function validateActivationAction(state, options = {}) {
  const action = required(options.action, "action");
  if (!new Set(["Preflight", "Activate", "PostVerify", "Deactivate", "PostDeactivate"]).has(action)) throw new Error("action_invalid");
  const applicationCommit = validateIdentity(state, options.now ?? new Date());
  const operator = required(options.operator, "operator");
  if (action === "Preflight" || action === "Activate" || action === "PostDeactivate") validateInactive(state);
  if (action === "PostVerify" || action === "Deactivate") validateActive(state);
  let runtimeProbeReceipt = null;
  if (action === "Preflight" || action === "Activate") {
    runtimeProbeReceipt = validateRuntimeProbeReceipt(state.runtimeProbeReadiness, {
      projectRef: ACTIVATION_PROJECT_REF,
      environment: "hosted",
      mode: "preflight",
      now: options.now ?? new Date(),
    });
  }
  if (action === "PostVerify") {
    runtimeProbeReceipt = validateRuntimeProbeReceipt(state.runtimeProbeExecution, {
      projectRef: ACTIVATION_PROJECT_REF,
      environment: "hosted",
      mode: "active",
      now: options.now ?? new Date(),
    });
  }
  if (action === "Activate") exact(options.authorization, ACTIVATE_AUTHORIZATION, "activation_authorization");
  if (action === "Deactivate") exact(options.authorization, DEACTIVATE_AUTHORIZATION, "deactivation_authorization");
  return {
    action,
    operator,
    applicationCommit,
    structuralValidationPassed: true,
    runtimeProbeStatus: runtimeProbeReceipt ? {
      mode: runtimeProbeReceipt.mode,
      complete: runtimeProbeReceipt.complete,
      evidenceSha256: runtimeProbeReceipt.evidenceSha256,
    } : null,
  };
}
