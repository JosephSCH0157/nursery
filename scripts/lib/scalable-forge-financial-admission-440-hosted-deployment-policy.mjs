import { createHash } from "node:crypto";
import { validateHostedRecoveryEvidence } from "./hosted-recovery-readiness-policy.mjs";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const PREDECESSOR_VERSION = "20261104212918";
export const TARGET_VERSION = "20261105025313";
export const TARGET_FILENAME = "20261105025313_scalable_forge_financial_admission.sql";
export const TARGET_SHA256 = "838f14fdd5801bcb842fa628a8ca80700bd20bda201569faa56e9b3fa2d2d24a";
export const CERTIFIED_PAYLOAD_COMMIT = "3e5ff31a9fe3eea24e7e75c136ef27664dd89422";
export const RECOVERY_APPROVAL_PREFIX = "FORGE-SCALABLE-FINANCIAL-ADMISSION-440:";

const required = (value, name) => { const text = typeof value === "string" ? value.trim() : ""; if (!text) throw new Error(`${name}_missing`); return text; };
const exact = (actual, expected, name) => { if (actual !== expected) throw new Error(`${name}_mismatch`); };
const zero = (value, name) => exact(Number(value), 0, name);

export function validateRecoveryEvidence(evidence, now = new Date(), apiObservation) {
  if (evidence?.schema !== "forge.hosted-recovery-readiness.v2") throw new Error("management_api_evidence_required");
  return validateHostedRecoveryEvidence(evidence, { projectRef: FORGE_PROJECT_REF, approvalPrefix: RECOVERY_APPROVAL_PREFIX, targetVersion: TARGET_VERSION, apiObservation, now });
}

export function validateOperatorAuthorization(options = {}) {
  const operator = required(options.operator, "operator");
  if (options.action === "Apply") {
    const authorization = required(options.authorization, "operator_authorization");
    const expected = required(options.authorizationSha256, "operator_authorization_sha256");
    if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error("operator_authorization_sha256_invalid");
    exact(createHash("sha256").update(authorization, "utf8").digest("hex"), expected, "operator_authorization");
  }
  return { operator };
}

function validateContainment(state) {
  exact(state.hammerRolloutRevision, 3, "hammer_rollout_revision"); exact(state.hammerRolloutMode, "halt_new", "hammer_rollout_mode");
  exact(state.lunaRolloutRevision, 13, "luna_rollout_revision"); exact(state.lunaRolloutMode, "halt_new", "luna_rollout_mode");
  for (const name of ["effectiveActivations","effectiveCapacityAuthorities","effectiveScopes","effectiveTestScopes","effectiveLiveScopes","operations","providerAttempts","unresolvedOperations","unresolvedAttempts"]) zero(state[name], name);
  exact(Number(state.aggregateExposureLimitMicros),10840000,"aggregate_exposure_limit");
  exact(Number(state.supplierCeilingMicros),38589,"supplier_ceiling");
  exact(Number(state.supportingCeilingMicros),6000,"supporting_ceiling");
  exact(Number(state.maximumAttempts),1,"maximum_attempts");
  exact(Number(state.automaticRetries),0,"automatic_retries");
}

function validateAdmissionContract(state, postApply) {
  zero(state.fundedNetPolicyCount, "funded_net_policy_count"); zero(state.fundedNetAssignmentCount, "funded_net_assignment_count");
  zero(state.nonLegacyPolicyCount, "non_legacy_policy_count"); exact(state.allPoliciesLegacyGross, true, "all_policies_legacy_gross");
  if (postApply) for (const name of ["scalableContractOk","observabilityContractOk","scalableAclOk","observabilityAclOk"]) exact(state[name], true, name);
}

export function validateHostedState(state, options = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("hosted_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref"); exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.certifiedPayloadCommit, CERTIFIED_PAYLOAD_COMMIT, "certified_payload_commit"); exact(state.payloadProvenanceOk, true, "payload_provenance");
  exact(state.installedCount, 439, "installed_count"); exact(state.hostedHead, PREDECESSOR_VERSION, "hosted_head");
  if (JSON.stringify(state.pendingVersions) !== JSON.stringify([TARGET_VERSION])) throw new Error("pending_versions_mismatch");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256"); exact(state.databasePasswordAvailable, true, "database_password");
  validateAdmissionContract(state, false); validateContainment(state); return validateOperatorAuthorization(options);
}

export function validatePostVerifyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("postverify_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref"); exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.certifiedPayloadCommit, CERTIFIED_PAYLOAD_COMMIT, "certified_payload_commit"); exact(state.payloadProvenanceOk, true, "payload_provenance");
  exact(state.installedCount, 440, "installed_count"); exact(state.hostedHead, TARGET_VERSION, "hosted_head");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 0) throw new Error("pending_versions_mismatch");
  validateAdmissionContract(state, true); validateContainment(state); return true;
}

export function recoveryUseMarkerName(recoveryUseKey) {
  if (!/^[0-9a-f]{64}$/.test(recoveryUseKey)) throw new Error("recovery_use_key_invalid");
  return `scalable-forge-financial-admission-440-${recoveryUseKey}.json`;
}
