import { validateHostedRecoveryEvidence } from "./hosted-recovery-readiness-policy.mjs";

export const FORGE_PROJECT_REF = "wtvdjndyxegudufrompx";
export const EXPECTED_LINEAGE = "historical-v1";
export const PREDECESSOR_VERSION = "20261104143249";
export const TARGET_VERSION = "20261104212918";
export const TARGET_FILENAME = "20261104212918_hammer_canary_renewal_tooling_compatibility.sql";
export const TARGET_SHA256 = "1addbe643cd6a7543615c9e6a3f0b4952edc5ffc7a3a5ea72de3abfcbdb07631";
export const CERTIFIED_COMMIT = "7dcc259df4b124d7f8453194b550e92a78958b0d";
export const APPLY_AUTHORIZATION = "APPLY-HAMMER-CANARY-RENEWAL-COMPATIBILITY-439";
export const RECOVERY_APPROVAL_PREFIX = "FORGE-HAMMER-CANARY-RENEWAL-COMPATIBILITY-439:";

const required = (value, name) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name}_missing`);
  return text;
};
const exact = (actual, expected, name) => {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
};
const zero = (value, name) => exact(Number(value), 0, name);

export function validateRecoveryEvidence(evidence, now = new Date(), apiObservation) {
  if (evidence?.schema !== "forge.hosted-recovery-readiness.v2") {
    throw new Error("management_api_evidence_required");
  }
  return validateHostedRecoveryEvidence(evidence, {
    projectRef: FORGE_PROJECT_REF,
    approvalPrefix: RECOVERY_APPROVAL_PREFIX,
    targetVersion: TARGET_VERSION,
    apiObservation,
    now,
  });
}

export function validateOperatorAuthorization(options = {}) {
  const operator = required(options.operator, "operator");
  if (options.action === "Apply") exact(options.authorization, APPLY_AUTHORIZATION, "operator_authorization");
  return { operator };
}

function validateContainment(state) {
  exact(state.hammerRolloutRevision, 3, "hammer_rollout_revision");
  exact(state.hammerRolloutMode, "halt_new", "hammer_rollout_mode");
  exact(state.lunaRolloutRevision, 13, "luna_rollout_revision");
  exact(state.lunaRolloutMode, "halt_new", "luna_rollout_mode");
  for (const name of [
    "effectiveActivations", "effectiveCapacityAuthorities", "effectiveScopes",
    "effectiveTestScopes", "effectiveLiveScopes", "operations", "providerAttempts",
    "unresolvedOperations", "unresolvedAttempts",
  ]) zero(state[name], name);
  exact(Number(state.aggregateExposureLimitMicros), 10840000, "aggregate_exposure_limit");
  exact(Number(state.supplierCeilingMicros), 38589, "supplier_ceiling");
  exact(Number(state.supportingCeilingMicros), 6000, "supporting_ceiling");
  exact(Number(state.maximumAttempts), 1, "maximum_attempts");
  exact(Number(state.automaticRetries), 0, "automatic_retries");
}

export function validateHostedState(state, options = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("hosted_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.certifiedCommit, CERTIFIED_COMMIT, "certified_commit");
  exact(state.installedCount, 438, "installed_count");
  exact(state.hostedHead, PREDECESSOR_VERSION, "hosted_head");
  if (JSON.stringify(state.pendingVersions) !== JSON.stringify([TARGET_VERSION])) throw new Error("pending_versions_mismatch");
  exact(state.migrationSha256, TARGET_SHA256, "migration_sha256");
  exact(state.databasePasswordAvailable, true, "database_password");
  validateContainment(state);
  return validateOperatorAuthorization(options);
}

export function validatePostVerifyState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("postverify_state_missing");
  exact(state.projectRef, FORGE_PROJECT_REF, "project_ref");
  exact(state.lineage, EXPECTED_LINEAGE, "lineage");
  exact(state.certifiedCommit, CERTIFIED_COMMIT, "certified_commit");
  exact(state.installedCount, 439, "installed_count");
  exact(state.hostedHead, TARGET_VERSION, "hosted_head");
  if (!Array.isArray(state.pendingVersions) || state.pendingVersions.length !== 0) throw new Error("pending_versions_mismatch");
  exact(state.renewalRpcContractOk, true, "renewal_rpc_contract");
  exact(state.resolverContractOk, true, "resolver_contract");
  exact(state.renewalAclOk, true, "renewal_rpc_acl");
  exact(state.resolverAclOk, true, "resolver_acl");
  validateContainment(state);
  return true;
}

export function recoveryUseMarkerName(recoveryUseKey) {
  if (!/^[0-9a-f]{64}$/.test(recoveryUseKey)) throw new Error("recovery_use_key_invalid");
  return `hammer-canary-renewal-compatibility-439-${recoveryUseKey}.json`;
}
