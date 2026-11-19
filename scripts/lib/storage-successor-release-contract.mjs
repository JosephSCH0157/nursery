import assert from 'node:assert/strict';
import {
  PROJECT, PAYLOAD as ORIGINAL_PAYLOAD,
  validateStorageAuthorization, validateStorageRecovery,
} from './storage-hosted-release-contract.mjs';

export {PROJECT, validateStorageAuthorization, validateStorageRecovery};
// Migration/configuration source identity, not a claim of completed certification.
export const PAYLOAD = '4de38126e51070ea4b5e90b418f1e66e5b7095f0';
export const STORAGE_RELEASES = Object.freeze([
  ['445', '20261113175455', 'storage_historical_accounting', 'ca369b18b67f6aaa555f17e90dd58a66cee9b2a512b38c2569717c3f0e3bb4fc', '20261111201029', ORIGINAL_PAYLOAD],
  ['446', '20261113214832', 'workpiece_manifest_optimistic_concurrency', 'beb2d1dfe797666e8b11c7e62f89ce76450a87520b662100c12b7afb604291f0', '20261113175455', PAYLOAD],
].map(([number, version, name, sha256, predecessor, predecessorPayload]) => Object.freeze({
  number: Number(number), version, name, sha256, predecessor, predecessorPayload,
  filename: `${version}_${name}.sql`, stage: Number(number) - 440,
})));

export function releaseFor(version) {
  const release = STORAGE_RELEASES.find(r => r.version === version);
  assert.ok(release, 'unsupported_storage_successor');
  return release;
}

export function assertStorageSuccessorReleaseReady(action) {
  assert.ok(['Preflight', 'Apply', 'PostVerify'].includes(action), 'action_invalid');
  // No caller flag, token, fixture, or synthetic receipt can waive this hold.
  // Remove only in the reviewed certification closeout, with authentic H/B1
  // parity and the inactive fresh-B1 initialization outcome explicitly resolved.
  assert.notEqual(action, 'Apply',
    'storage_successor_release_hold: authentic historical full-tail certification and H/B1 parity are missing; see docs/database/STORAGE_FULL_TAIL_CERTIFICATION.md');
}

export function validateStorageState(r, state, options) {
  assertStorageSuccessorReleaseReady(options.action);
  validateStorageAuthorization(r, options);
  assert.equal(state.projectRef, PROJECT, 'project_mismatch');
  assert.equal(state.lineage, 'historical-v1', 'lineage_mismatch');
  assert.equal(state.financialMode, 'test', 'financial_mode_mismatch');
  assert.equal(state.certifiedPayloadCommit, PAYLOAD, 'candidate_mismatch');
  assert.equal(state.payloadProvenanceOk, true, 'payload_provenance');
  assert.equal(state.migrationSha256, r.sha256, 'migration_hash');
  assert.equal(state.databasePasswordAvailable, true, 'managed_credential_required');
  const post = options.action === 'PostVerify';
  assert.equal(state.installedCount, r.number - (post ? 0 : 1), 'migration_count');
  assert.equal(state.hostedHead, post ? r.version : r.predecessor, 'migration_head');
  assert.deepEqual(state.pendingVersions, post ? [] : [r.version], 'pending_versions');
  assert.equal(state.storageStage, post ? r.stage : r.stage - 1, 'storage_stage');
  assert.equal(state.storageContractOk, true, 'storage_contract');
  assert.equal(state.predecessorVerified, true, 'previous_stage_verification');
  assert.match(state.protectedAuthoritySha256 ?? '', /^[0-9a-f]{64}$/);
  return true;
}

export function validatePredecessorReceipt(r, receipt, authorizationSha256, financialSha256) {
  assert.match(authorizationSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.match(financialSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(receipt.project_ref, PROJECT, 'previous_project');
  assert.equal(receipt.payload_commit, r.predecessorPayload, 'previous_payload');
  assert.equal(receipt.target_version, r.predecessor, 'previous_version');
  assert.equal(receipt.authorization_sha256, authorizationSha256, 'previous_authorization');
  assert.equal(receipt.protected_authority_sha256, financialSha256, 'previous_financial_authority');
  return true;
}
