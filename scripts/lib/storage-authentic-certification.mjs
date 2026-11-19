import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PROJECT, STORAGE_RELEASES} from './storage-successor-release-contract.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = (value, name) => assert.match(value ?? '', /^[a-f0-9]{64}$/, name);
const nonempty = (value, name) => assert.ok(typeof value === 'string' && value.trim(), name);

// The independently owner-approved digest is the trust anchor. JSON assertions
// alone are not proof of authenticity, isolation, ownership or approval.
export function validateRestorationApproval(bytes, approvedSha256, now = new Date()) {
  hash(approvedSha256, 'approval_digest_required');
  assert.equal(sha256(bytes), approvedSha256, 'approval_bytes_changed');
  const a = JSON.parse(bytes);
  assert.equal(a.schema, 'forge.storage-h444-restoration-approval.v1');
  assert.equal(a.sourceProject, PROJECT, 'source_project');
  assert.match(a.targetProject ?? '', /^[a-z]{20}$/, 'target_project');
  assert.notEqual(a.targetProject, PROJECT, 'production_target_forbidden');
  assert.equal(a.evidenceKind, 'authentic-provider-restoration', 'synthetic_predecessor_forbidden');
  assert.equal(a.allowedOperation, 'isolated-h444-to-446-certification');
  for (const key of ['ownerApprovalReference', 'backupId', 'providerRestoreReceipt',
    'isolationBeforeStartupReference', 'costApprovalReference', 'cleanupOperator']) nonempty(a[key], key);
  assert.equal(a.externalEffectsPrevented, true, 'isolation_required');
  assert.ok(Number.isFinite(Date.parse(a.backupCompletedAt)), 'backup_timestamp');
  assert.ok(Date.parse(a.backupCompletedAt) <= now.getTime(), 'future_backup');
  assert.ok(Number.isFinite(Date.parse(a.expiresAt)) && Date.parse(a.expiresAt) > now.getTime(), 'approval_expired');
  assert.ok(Date.parse(a.cleanupDeadline) >= Date.parse(a.expiresAt), 'cleanup_deadline');
  assert.match(a.candidate ?? '', /^[a-f0-9]{40}$/, 'candidate_required');
  for (const key of ['lineageSha256', 'historySha256', 'financialSha256', 'storageSha256',
    'baselineCatalogSha256', 'sourceObservationSha256']) hash(a[key], key);
  assert.deepEqual(a.migrations, STORAGE_RELEASES.map(r => ({version:r.version, sha256:r.sha256})), 'approved_migrations');
  return a;
}

export function validateHistoricalObservation(a, s, versions, count) {
  assert.ok([444,445,446].includes(count), 'unsupported_stage');
  assert.equal(s.lineage, 'historical-v1', 'historical_lineage_required');
  assert.equal(s.lineageSha256, a.lineageSha256, 'lineage_changed');
  assert.deepEqual(s.historyColumns, ['created_by','idempotency_key','name','rollback','statements','version'], 'complete_six_column_history');
  assert.deepEqual(s.versions, versions.slice(0,count), 'exact_history_prefix');
  assert.equal(s.originalHistorySha256, a.historySha256, 'original_history_changed');
  assert.equal(s.financialSha256, a.financialSha256, 'financial_state_changed');
  assert.equal(s.storageSha256, a.storageSha256, 'original_storage_metadata_changed');
  assert.equal(s.financialMode, 'test', 'test_environment_required');
  // These authorities are present in authentic H444 and absent in the empty or
  // synthetic history-only predecessor. Pin their contents via financial hash.
  for (const key of ['pricing','rollout','costPolicy','rateCondition']) assert.ok(Number.isSafeInteger(s.requiredFinancialRecords?.[key]) && s.requiredFinancialRecords[key] > 0, `financial_predecessor_missing:${key}`);
  assert.equal(s.storageStage, count-440, 'storage_stage');
  assert.equal(s.storageContractOk, true, 'cumulative_storage_contract');
  return s;
}

// Recovery is a decision over fresh observations, never a cache authorizing a
// write. Unknown outcomes require inspection with the same attempt commitment.
export function recoveryDecision({attemptedStage, observedCount, originalHistoryUnchanged,
  financialUnchanged, storageVersionsReconciled, stripeEventsReconciled,
  compatibleArtifacts, fenceProven, acceptancePassed, unresolvedOperations}) {
  assert.ok([null,445,446].includes(attemptedStage), 'attempt_stage');
  if (!fenceProven) return {action:'OWNER_INTERVENTION',resume:false,reason:'global_fence_unproven'};
  if (!originalHistoryUnchanged || !financialUnchanged) return {action:'OWNER_INTERVENTION',resume:false,reason:'integrity_changed'};
  if (!Number.isInteger(observedCount) || ![444,445,446].includes(observedCount)) return {action:'POSTVERIFY_ONLY',resume:false,reason:'ambiguous_database_state'};
  if (attemptedStage && ![attemptedStage-1,attemptedStage].includes(observedCount)) return {action:'OWNER_INTERVENTION',resume:false,reason:'unexpected_migration_state'};
  if (attemptedStage && observedCount === attemptedStage-1) return {action:'NEW_AUTHORIZATION_REQUIRED',resume:false,reason:'attempt_not_installed_do_not_replay'};
  if (!storageVersionsReconciled || !stripeEventsReconciled || unresolvedOperations !== 0) return {action:'RECONCILE_EXTERNAL_STATE',resume:false,reason:'external_or_admitted_operations_unresolved'};
  if (!compatibleArtifacts) return {action:'COMPATIBLE_FORWARD_DEPLOYMENT',resume:false,reason:'application_database_mismatch'};
  if (observedCount !== 446 || !acceptancePassed) return {action:'KEEP_FENCED',resume:false,reason:'release_acceptance_incomplete'};
  return {action:'REQUEST_EXPLICIT_RESUME',resume:false,reason:'owner_resume_authorization_required'};
}

export const REQUIRED_BEHAVIOR_CHECKS = Object.freeze([
  'historical-original-version-exclusions','historical-replacement-billed',
  'ownership-and-rls','storage-http-and-retained-bytes','manifest-concurrency',
  'stale-writer-rejection','global-fence-and-drain','stripe-duplicate-delayed-events',
]);

export function validateBehaviorReceipt(a, receipt, expectedDigest, bytes) {
  hash(expectedDigest, 'behavior_receipt_digest');
  assert.equal(sha256(bytes), expectedDigest, 'behavior_receipt_changed');
  assert.equal(receipt.schema, 'forge.storage-authentic-behavior.v1');
  assert.equal(receipt.targetProject, a.targetProject);
  assert.equal(receipt.candidate, a.candidate);
  assert.equal(receipt.backupId, a.backupId);
  assert.equal(receipt.evidenceKind, 'authentic-provider-restoration');
  assert.deepEqual(Object.keys(receipt.checks).sort(), [...REQUIRED_BEHAVIOR_CHECKS].sort());
  for (const item of Object.values(receipt.checks)) {
    assert.equal(item.result, 'PASS', 'behavior_not_passed');
    hash(item.evidenceSha256, 'behavior_evidence_required');
    nonempty(item.procedure, 'reproducible_procedure_required');
  }
  return true;
}
