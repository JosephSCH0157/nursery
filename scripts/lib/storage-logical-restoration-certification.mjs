import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat, open, readdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  REQUIRED_BEHAVIOR_CHECKS,
  sha256,
  validateHistoricalObservation,
} from './storage-authentic-certification.mjs';
import {readPinned} from './forge-storage-full-tail.mjs';
import {PROJECT, STORAGE_RELEASES} from './storage-successor-release-contract.mjs';

export const LOGICAL_RESTORATION_APPROVAL_SCHEMA =
  'forge.storage-h444-logical-restoration-approval.v1';
export const LOGICAL_EXPORT_RECEIPT_SCHEMA =
  'forge.storage-h444-logical-export-receipt.v1';
export const LOGICAL_SNAPSHOT_CONSISTENCY_SCHEMA =
  'forge.storage-h444-logical-snapshot-consistency.v1';
export const LOGICAL_IMPORT_RECEIPT_SCHEMA =
  'forge.storage-h444-logical-import-receipt.v1';
export const LOGICAL_TARGET_OBSERVATIONS_SCHEMA =
  'forge.storage-h444-logical-target-observations.v1';
export const LOGICAL_STORAGE_MANIFEST_SCHEMA =
  'forge.storage-h444-logical-storage-manifest.v1';
export const LOGICAL_ISOLATION_MANIFEST_SCHEMA =
  'forge.storage-h444-logical-isolation-manifest.v1';
export const LOGICAL_BEHAVIOR_RECEIPT_SCHEMA =
  'forge.storage-h444-logical-behavior.v1';

export const ORIGINAL_STORAGE_OBJECT_COUNT = 475;
export const REQUIRED_LOGICAL_ARTIFACTS = Object.freeze([
  'schema.sql',
  'data.sql',
  'supabase-migrations-schema.sql',
  'supabase-migrations-data.sql',
  'role-and-acl-manifest.json',
  'snapshot-consistency.json',
]);
export const REQUIRED_EXTERNAL_INVENTORY_KINDS = Object.freeze([
  'background-workers',
  'cron-jobs',
  'database-triggers',
  'database-webhooks',
  'edge-functions',
  'event-triggers',
  'extensions',
  'foreign-servers',
  'foreign-user-mappings',
  'outbound-routines',
  'provider-webhooks',
]);

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APPROVAL_KEYS = [
  'schema', 'sourceProject', 'targetProject', 'evidenceKind', 'allowedOperation',
  'ownerApprovalReference', 'candidate', 'sourceSnapshotId', 'migrationManifestSha256',
  'migrations', 'logicalExportReceiptSha256', 'logicalImportReceiptSha256',
  'sourceObservationSha256', 'targetObservationsSha256', 'storageManifestSha256',
  'isolationManifestSha256', 'behaviorReceiptSha256', 'lineageSha256',
  'historySha256', 'financialSha256', 'storageSha256', 'storageObjectSetSha256',
  'baselineCatalogSha256', 'isolationBeforeImportReference', 'externalEffectsPrevented',
  'productionSecretsTransferred', 'rootKeyTransferred', 'costApprovalReference',
  'cleanupOperator', 'expiresAt', 'cleanupDeadline',
];
const CATALOG_ENTRY_KEYS = ['category', 'identity', 'sha256'];
const MAX_SNAPSHOT_PROOF_BYTES = 65536n;
const NEUTRALIZATION_ACTIONS = new Set([
  'credentials-stripped', 'disabled', 'network-isolated', 'omitted',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, name) {
  assert.ok(isRecord(value), `${name}_object_required`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${name}_fields`);
}

function parseJson(bytes, name) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes;
  assert.equal(typeof text, 'string', `${name}_bytes_required`);
  return JSON.parse(text);
}

function digest(value, name) {
  assert.match(value ?? '', /^[a-f0-9]{64}$/, name);
}

function nonempty(value, name) {
  assert.ok(typeof value === 'string' && value.trim(), name);
}

function exactIdentity(value, name) {
  nonempty(value, name);
  assert.equal(value.trim(), value, `${name}_trimmed`);
  assert.doesNotMatch(value, /[*?\[\]]/, `${name}_wildcard_forbidden`);
  assert.doesNotMatch(value, /[\u0000-\u001f]/, `${name}_control_character`);
}

function verifyBytes(bytes, expectedDigest, name) {
  digest(expectedDigest, `${name}_digest`);
  assert.equal(sha256(bytes), expectedDigest, `${name}_bytes_changed`);
  return parseJson(bytes, name);
}

export function migrationManifestSha256(contract) {
  const values = contract.migrations.map(
    migration => `${migration.path}|${migration.version}|${migration.sha256}`,
  );
  return sha256(values.join('\n'));
}

function validateApproval(bytes, approvedSha256, pinned, now) {
  digest(approvedSha256, 'approval_digest_required');
  assert.equal(sha256(bytes), approvedSha256, 'approval_bytes_changed');
  const approval = parseJson(bytes, 'logical_approval');
  exactKeys(approval, APPROVAL_KEYS, 'logical_approval');
  assert.equal(approval.schema, LOGICAL_RESTORATION_APPROVAL_SCHEMA);
  assert.equal(approval.sourceProject, PROJECT, 'source_project');
  assert.match(approval.targetProject ?? '', /^[a-z]{20}$/, 'target_project');
  assert.notEqual(approval.targetProject, PROJECT, 'production_target_forbidden');
  assert.equal(approval.evidenceKind, 'authentic-logical-restoration');
  assert.equal(approval.allowedOperation, 'isolated-h444-to-446-certification');
  assert.equal(approval.candidate, pinned.head, 'approved_candidate_changed');
  assert.equal(approval.migrationManifestSha256, migrationManifestSha256(pinned.contract),
    'full_migration_manifest_changed');
  assert.deepEqual(
    approval.migrations,
    STORAGE_RELEASES.map(release => ({version: release.version, sha256: release.sha256})),
    'approved_successor_migrations',
  );
  for (const key of [
    'ownerApprovalReference', 'sourceSnapshotId', 'isolationBeforeImportReference',
    'costApprovalReference', 'cleanupOperator',
  ]) nonempty(approval[key], key);
  exactIdentity(approval.sourceSnapshotId, 'source_snapshot_id');
  assert.equal(approval.externalEffectsPrevented, true, 'isolation_required');
  assert.equal(approval.productionSecretsTransferred, false, 'production_secrets_forbidden');
  assert.equal(approval.rootKeyTransferred, false, 'production_root_key_forbidden');
  const expiresAt = Date.parse(approval.expiresAt);
  const cleanupDeadline = Date.parse(approval.cleanupDeadline);
  assert.ok(Number.isFinite(expiresAt) && expiresAt > now.getTime(), 'approval_expired');
  assert.ok(Number.isFinite(cleanupDeadline) &&
    cleanupDeadline >= expiresAt && cleanupDeadline > now.getTime(),
    'cleanup_deadline');
  for (const key of [
    'logicalExportReceiptSha256', 'logicalImportReceiptSha256',
    'sourceObservationSha256', 'targetObservationsSha256', 'storageManifestSha256',
    'isolationManifestSha256', 'behaviorReceiptSha256', 'lineageSha256',
    'historySha256', 'financialSha256', 'storageSha256', 'storageObjectSetSha256',
    'baselineCatalogSha256',
  ]) digest(approval[key], key);
  return approval;
}

export function validateLogicalRestorationApproval(
  bytes,
  approvedSha256,
  {repositoryRoot = REPOSITORY_ROOT, now = new Date()} = {},
) {
  const pinned = readPinned(repositoryRoot);
  return validateApproval(bytes, approvedSha256, pinned, now);
}

function validateSourceObservation(bytes, approval, versions) {
  const source = verifyBytes(bytes, approval.sourceObservationSha256, 'source_observation');
  exactKeys(source, ['schema', 'sourceProject', 'snapshotId', 'observation'],
    'source_observation');
  assert.equal(source.schema, 'forge.storage-h444-logical-source-observation.v1');
  assert.equal(source.sourceProject, approval.sourceProject);
  assert.equal(source.snapshotId, approval.sourceSnapshotId, 'source_snapshot_mismatch');
  validateHistoricalObservation(approval, source.observation, versions, 444);
  return source;
}

function validateExportReceipt(bytes, approval, now) {
  const receipt = verifyBytes(
    bytes, approval.logicalExportReceiptSha256, 'logical_export_receipt',
  );
  exactKeys(receipt, [
    'schema', 'sourceProject', 'snapshotId', 'consistencyMethod',
    'snapshotStartedAt', 'snapshotCompletedAt', 'consistencyProofSha256',
    'sourceObservationSha256', 'productionSecretsIncluded', 'artifacts',
  ], 'logical_export_receipt');
  assert.equal(receipt.schema, LOGICAL_EXPORT_RECEIPT_SCHEMA);
  assert.equal(receipt.sourceProject, approval.sourceProject);
  assert.equal(receipt.snapshotId, approval.sourceSnapshotId, 'export_snapshot_mismatch');
  assert.equal(receipt.consistencyMethod, 'single-transaction-snapshot');
  const startedAt = Date.parse(receipt.snapshotStartedAt);
  const completedAt = Date.parse(receipt.snapshotCompletedAt);
  assert.ok(Number.isFinite(startedAt) && Number.isFinite(completedAt), 'snapshot_time');
  assert.ok(completedAt >= startedAt && completedAt <= now.getTime(), 'snapshot_time_order');
  digest(receipt.consistencyProofSha256, 'snapshot_consistency_proof');
  assert.equal(receipt.sourceObservationSha256, approval.sourceObservationSha256);
  assert.equal(receipt.productionSecretsIncluded, false, 'production_secrets_forbidden');
  assert.ok(Array.isArray(receipt.artifacts), 'logical_artifacts_required');
  assert.deepEqual(
    receipt.artifacts.map(item => item.name).sort(),
    [...REQUIRED_LOGICAL_ARTIFACTS].sort(),
    'logical_artifact_set',
  );
  const names = new Set();
  for (const artifact of receipt.artifacts) {
    exactKeys(artifact, ['name', 'snapshotId', 'sha256', 'sizeBytes'], 'logical_artifact');
    assert.ok(REQUIRED_LOGICAL_ARTIFACTS.includes(artifact.name), 'logical_artifact_name');
    assert.ok(!names.has(artifact.name), 'duplicate_logical_artifact');
    names.add(artifact.name);
    assert.equal(artifact.snapshotId, receipt.snapshotId, 'artifact_snapshot_mismatch');
    digest(artifact.sha256, 'logical_artifact_sha256');
    assert.ok(Number.isSafeInteger(artifact.sizeBytes) && artifact.sizeBytes > 0,
      'logical_artifact_size');
  }
  const consistencyArtifact = receipt.artifacts.find(
    artifact => artifact.name === 'snapshot-consistency.json',
  );
  assert.equal(receipt.consistencyProofSha256, consistencyArtifact.sha256,
    'snapshot_consistency_proof_mismatch');
  return receipt;
}

function artifactSetSha256(artifacts) {
  const rows = artifacts
    .filter(artifact => artifact.name !== 'snapshot-consistency.json')
    .map(({name, sha256: artifactSha256, sizeBytes}) => [
      name, artifactSha256, sizeBytes,
    ])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return sha256(JSON.stringify(rows));
}

async function hashArtifactFile(path, name) {
  const handle = await open(path, 'r');
  try {
    const before = await handle.stat({bigint: true});
    assert.ok(before.isFile(), 'logical_artifact_regular_file_required');
    if (name === 'snapshot-consistency.json') {
      assert.ok(before.size <= MAX_SNAPSHOT_PROOF_BYTES, 'snapshot_proof_too_large');
    }
    const hash = createHash('sha256');
    const proofChunks = [];
    let size = 0n;
    for await (const chunk of handle.createReadStream({autoClose: false})) {
      hash.update(chunk);
      size += BigInt(chunk.length);
      if (name === 'snapshot-consistency.json') proofChunks.push(chunk);
    }
    const after = await handle.stat({bigint: true});
    assert.equal(after.size, before.size, 'logical_artifact_changed_during_read');
    assert.equal(after.mtimeNs, before.mtimeNs, 'logical_artifact_changed_during_read');
    return {
      sha256: hash.digest('hex'),
      sizeBytes: Number(size),
      proofBytes: name === 'snapshot-consistency.json'
        ? Buffer.concat(proofChunks)
        : undefined,
    };
  } finally {
    await handle.close();
  }
}

// Byte/shape verification only; this export neither validates approval nor
// establishes authenticity. The complete restoration validator remains required.
export async function validateLogicalArtifactDirectory(directory, receipt, approval) {
  assert.ok(typeof directory === 'string' && directory.trim(),
    'logical_artifact_directory_required');
  const root = resolve(directory);
  const rootStat = await lstat(root);
  assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink(),
    'logical_artifact_directory_required');
  const actualNames = (await readdir(root)).sort();
  assert.deepEqual(actualNames, [...REQUIRED_LOGICAL_ARTIFACTS].sort(),
    'logical_artifact_files');

  const verified = new Map();
  for (const artifact of receipt.artifacts) {
    const path = resolve(root, artifact.name);
    const fileStat = await lstat(path);
    assert.ok(fileStat.isFile() && !fileStat.isSymbolicLink(),
      'logical_artifact_regular_file_required');
    const result = await hashArtifactFile(path, artifact.name);
    assert.equal(result.sizeBytes, artifact.sizeBytes, 'logical_artifact_size_mismatch');
    assert.equal(result.sha256, artifact.sha256, 'logical_artifact_bytes_changed');
    verified.set(artifact.name, result);
  }

  const proofBytes = verified.get('snapshot-consistency.json').proofBytes;
  validateSnapshotProof(proofBytes, receipt, approval);
}

// Same byte/proof checks without materializing plaintext files. Not approval.
export function validateLogicalArtifactBuffers(files, receipt, approval) {
  assert.deepEqual([...files.keys()].sort(), [...REQUIRED_LOGICAL_ARTIFACTS].sort(), 'logical_artifact_files');
  assert.deepEqual(receipt.artifacts.map(a => a.name).sort(), [...REQUIRED_LOGICAL_ARTIFACTS].sort(), 'logical_artifact_receipt_files');
  for (const artifact of receipt.artifacts) {
    const bytes = files.get(artifact.name);
    assert.ok(Buffer.isBuffer(bytes), 'logical_artifact_buffer');
    assert.ok(bytes.length > 0, 'logical_artifact_empty');
    assert.equal(artifact.snapshotId, receipt.snapshotId, 'logical_artifact_snapshot');
    assert.equal(bytes.length, artifact.sizeBytes, 'logical_artifact_size_mismatch');
    assert.equal(sha256(bytes), artifact.sha256, 'logical_artifact_bytes_changed');
  }
  const proofBytes = files.get('snapshot-consistency.json');
  assert.ok(proofBytes.length <= 65536, 'snapshot_consistency_proof_size');
  validateSnapshotProof(proofBytes, receipt, approval);
}

function validateSnapshotProof(proofBytes, receipt, approval) {
  assert.equal(sha256(proofBytes), receipt.consistencyProofSha256,
    'snapshot_consistency_proof_mismatch');
  const proof = parseJson(proofBytes, 'snapshot_consistency_proof');
  exactKeys(proof, [
    'schema', 'sourceProject', 'snapshotId', 'consistencyMethod',
    'snapshotStartedAt', 'snapshotCompletedAt', 'databaseSnapshotId',
    'migrationHistorySnapshotId', 'financialStateSnapshotId',
    'storageMetadataSnapshotId', 'sourceObservationSha256', 'artifactSetSha256',
  ], 'snapshot_consistency_proof');
  assert.equal(proof.schema, LOGICAL_SNAPSHOT_CONSISTENCY_SCHEMA);
  assert.equal(proof.sourceProject, approval.sourceProject);
  assert.equal(proof.snapshotId, approval.sourceSnapshotId);
  assert.equal(proof.consistencyMethod, receipt.consistencyMethod);
  assert.equal(Date.parse(proof.snapshotStartedAt), Date.parse(receipt.snapshotStartedAt),
    'snapshot_proof_start_time');
  assert.equal(Date.parse(proof.snapshotCompletedAt), Date.parse(receipt.snapshotCompletedAt),
    'snapshot_proof_completion_time');
  for (const key of [
    'databaseSnapshotId', 'migrationHistorySnapshotId', 'financialStateSnapshotId',
    'storageMetadataSnapshotId',
  ]) assert.equal(proof[key], receipt.snapshotId, `snapshot_proof_${key}`);
  assert.equal(proof.sourceObservationSha256, approval.sourceObservationSha256,
    'snapshot_proof_source_observation');
  assert.equal(proof.artifactSetSha256, artifactSetSha256(receipt.artifacts),
    'snapshot_proof_artifact_set');
}

function validateTargetObservations(bytes, approval, versions) {
  const bundle = verifyBytes(
    bytes, approval.targetObservationsSha256, 'target_observations',
  );
  exactKeys(bundle, [
    'schema', 'sourceProject', 'targetProject', 'candidate', 'sourceSnapshotId',
    'observations',
  ], 'target_observations');
  assert.equal(bundle.schema, LOGICAL_TARGET_OBSERVATIONS_SCHEMA);
  assert.equal(bundle.sourceProject, approval.sourceProject);
  assert.equal(bundle.targetProject, approval.targetProject);
  assert.equal(bundle.candidate, approval.candidate);
  assert.equal(bundle.sourceSnapshotId, approval.sourceSnapshotId);
  assert.ok(Array.isArray(bundle.observations), 'target_observations_required');
  assert.deepEqual(bundle.observations.map(item => item.migrationCount), [444, 445, 446],
    'target_observation_stages');
  for (const item of bundle.observations) {
    exactKeys(item, ['migrationCount', 'observation'], 'target_observation');
    validateHistoricalObservation(approval, item.observation, versions, item.migrationCount);
  }
  return bundle;
}

function validateImportReceipt(bytes, approval, exportReceipt) {
  const receipt = verifyBytes(
    bytes, approval.logicalImportReceiptSha256, 'logical_import_receipt',
  );
  exactKeys(receipt, [
    'schema', 'sourceProject', 'targetProject', 'candidate', 'sourceSnapshotId',
    'exportReceiptSha256', 'importedArtifacts', 'singleTransaction',
    'triggersSuppressedDuringImport', 'externalEffectsNeutralizedBeforeImport',
    'isolationBeforeImportReference', 'isolationCompletedAt',
    'triggerSuppressionStartedAt', 'importStartedAt', 'importCompletedAt',
    'productionSecretsTransferred', 'rootKeyTransferred',
    'isolationManifestSha256', 'triggerSuppressionEvidenceSha256',
  ], 'logical_import_receipt');
  assert.equal(receipt.schema, LOGICAL_IMPORT_RECEIPT_SCHEMA);
  assert.equal(receipt.sourceProject, approval.sourceProject);
  assert.equal(receipt.targetProject, approval.targetProject);
  assert.equal(receipt.candidate, approval.candidate);
  assert.equal(receipt.sourceSnapshotId, approval.sourceSnapshotId);
  assert.equal(receipt.exportReceiptSha256, approval.logicalExportReceiptSha256);
  assert.deepEqual(
    receipt.importedArtifacts,
    exportReceipt.artifacts.map(({name, sha256: artifactSha256}) => ({
      name, sha256: artifactSha256,
    })),
    'imported_artifact_mismatch',
  );
  assert.equal(receipt.singleTransaction, true, 'logical_import_must_be_transactional');
  assert.equal(receipt.triggersSuppressedDuringImport, true, 'trigger_suppression_required');
  assert.equal(receipt.externalEffectsNeutralizedBeforeImport, true,
    'pre_import_isolation_required');
  assert.equal(receipt.productionSecretsTransferred, false, 'production_secrets_forbidden');
  assert.equal(receipt.rootKeyTransferred, false, 'production_root_key_forbidden');
  assert.equal(receipt.isolationBeforeImportReference,
    approval.isolationBeforeImportReference, 'pre_import_isolation_reference');
  const isolationCompletedAt = Date.parse(receipt.isolationCompletedAt);
  const triggerSuppressionStartedAt = Date.parse(receipt.triggerSuppressionStartedAt);
  const importStartedAt = Date.parse(receipt.importStartedAt);
  const importCompletedAt = Date.parse(receipt.importCompletedAt);
  assert.ok([isolationCompletedAt, triggerSuppressionStartedAt, importStartedAt,
    importCompletedAt].every(Number.isFinite), 'logical_import_timestamps');
  assert.ok(isolationCompletedAt <= importStartedAt &&
    triggerSuppressionStartedAt <= importStartedAt &&
    importStartedAt <= importCompletedAt, 'logical_import_order');
  assert.equal(receipt.isolationManifestSha256, approval.isolationManifestSha256);
  digest(receipt.triggerSuppressionEvidenceSha256, 'trigger_suppression_evidence');
  return receipt;
}

function sortedDigest(values) {
  return sha256([...values].sort().join('\n'));
}

function validateStorageManifest(bytes, approval) {
  const manifest = verifyBytes(bytes, approval.storageManifestSha256, 'storage_manifest');
  exactKeys(manifest, [
    'schema', 'sourceProject', 'targetProject', 'candidate', 'sourceSnapshotId',
    'objectCount', 'sourceObjectSetSha256', 'sourceStorageSha256',
    'targetStorageSha256', 'objects',
  ], 'storage_manifest');
  assert.equal(manifest.schema, LOGICAL_STORAGE_MANIFEST_SCHEMA);
  assert.equal(manifest.sourceProject, approval.sourceProject);
  assert.equal(manifest.targetProject, approval.targetProject);
  assert.equal(manifest.candidate, approval.candidate);
  assert.equal(manifest.sourceSnapshotId, approval.sourceSnapshotId);
  assert.equal(manifest.objectCount, ORIGINAL_STORAGE_OBJECT_COUNT, 'storage_object_count');
  assert.ok(Array.isArray(manifest.objects), 'storage_objects_required');
  assert.equal(manifest.objects.length, ORIGINAL_STORAGE_OBJECT_COUNT, 'storage_manifest_length');
  assert.equal(manifest.sourceObjectSetSha256, approval.storageObjectSetSha256);
  assert.equal(manifest.sourceStorageSha256, approval.storageSha256);
  assert.equal(manifest.targetStorageSha256, approval.storageSha256);

  const seen = new Set();
  for (const object of manifest.objects) {
    exactKeys(object, [
      'identitySha256', 'sourceMetadataSha256', 'targetMetadataSha256',
      'sourceBytes', 'targetBytes', 'sourceByteSha256', 'targetByteSha256',
      'sourceReadReceiptSha256', 'targetReadReceiptSha256',
    ], 'storage_object');
    for (const key of [
      'identitySha256', 'sourceMetadataSha256', 'targetMetadataSha256',
      'sourceByteSha256', 'targetByteSha256', 'sourceReadReceiptSha256',
      'targetReadReceiptSha256',
    ]) digest(object[key], key);
    assert.ok(!seen.has(object.identitySha256), 'duplicate_storage_object');
    seen.add(object.identitySha256);
    assert.equal(object.sourceMetadataSha256, object.targetMetadataSha256,
      'storage_metadata_mismatch');
    assert.ok(Number.isSafeInteger(object.sourceBytes) && object.sourceBytes >= 0,
      'source_storage_size');
    assert.equal(object.targetBytes, object.sourceBytes, 'storage_size_mismatch');
    assert.equal(object.targetByteSha256, object.sourceByteSha256, 'storage_bytes_mismatch');
  }
  assert.equal(sortedDigest(seen), approval.storageObjectSetSha256,
    'storage_object_set_mismatch');
  return manifest;
}

function catalogMap(entries, label) {
  assert.ok(Array.isArray(entries), `${label}_entries_required`);
  const map = new Map();
  const rows = [];
  for (const entry of entries) {
    exactKeys(entry, CATALOG_ENTRY_KEYS, `${label}_entry`);
    exactIdentity(entry.category, `${label}_category`);
    exactIdentity(entry.identity, `${label}_identity`);
    digest(entry.sha256, `${label}_entry_sha256`);
    const key = `${entry.category}\u0000${entry.identity}`;
    assert.ok(!map.has(key), `${label}_duplicate_identity`);
    map.set(key, entry.sha256);
    rows.push([entry.category, entry.identity, entry.sha256]);
  }
  rows.sort(([leftCategory, leftIdentity], [rightCategory, rightIdentity]) =>
    leftCategory === rightCategory
      ? leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0
      : leftCategory < rightCategory ? -1 : 1);
  return {map, sha256: sha256(JSON.stringify(rows))};
}

function inventoryMap(entries, label) {
  assert.ok(Array.isArray(entries), `${label}_required`);
  const map = new Map();
  for (const entry of entries) {
    exactKeys(entry, ['kind', 'identity', 'active', 'fingerprintSha256'], `${label}_entry`);
    assert.ok(REQUIRED_EXTERNAL_INVENTORY_KINDS.includes(entry.kind),
      `${label}_unknown_kind`);
    exactIdentity(entry.identity, `${label}_identity`);
    assert.equal(typeof entry.active, 'boolean', `${label}_active_flag`);
    digest(entry.fingerprintSha256, `${label}_fingerprint`);
    const key = `${entry.kind}\u0000${entry.identity}`;
    assert.ok(!map.has(key), `${label}_duplicate_identity`);
    map.set(key, entry);
  }
  return map;
}

function inventoryDigest(inventory, kind) {
  const entries = [...inventory.values()]
    .filter(entry => entry.kind === kind)
    .map(entry => [entry.identity, entry.active, entry.fingerprintSha256])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return sha256(JSON.stringify(entries));
}

function validateIsolationManifest(bytes, approval) {
  const manifest = verifyBytes(bytes, approval.isolationManifestSha256, 'isolation_manifest');
  exactKeys(manifest, [
    'schema', 'sourceProject', 'targetProject', 'candidate', 'sourceSnapshotId',
    'inventoryComplete', 'unclassifiedCount', 'productionSecretsTransferred',
    'requiredInventoryKinds', 'sourceInventory', 'targetInventory',
    'inventoryCoverage', 'sourceCatalog', 'sourceCatalogSha256',
    'targetCatalog', 'targetCatalogSha256', 'catalogExceptions', 'neutralizations',
  ], 'isolation_manifest');
  assert.equal(manifest.schema, LOGICAL_ISOLATION_MANIFEST_SCHEMA);
  assert.equal(manifest.sourceProject, approval.sourceProject);
  assert.equal(manifest.targetProject, approval.targetProject);
  assert.equal(manifest.candidate, approval.candidate);
  assert.equal(manifest.sourceSnapshotId, approval.sourceSnapshotId);
  assert.equal(manifest.inventoryComplete, true, 'external_inventory_incomplete');
  assert.equal(manifest.unclassifiedCount, 0, 'unclassified_external_effect');
  assert.equal(manifest.productionSecretsTransferred, false, 'production_secrets_forbidden');
  assert.deepEqual(manifest.requiredInventoryKinds,
    [...REQUIRED_EXTERNAL_INVENTORY_KINDS], 'external_inventory_categories');

  const sourceInventory = inventoryMap(manifest.sourceInventory, 'source_inventory');
  const targetInventory = inventoryMap(manifest.targetInventory, 'target_inventory');
  assert.ok(Array.isArray(manifest.inventoryCoverage), 'inventory_coverage_required');
  assert.deepEqual(
    manifest.inventoryCoverage.map(item => item.kind),
    [...REQUIRED_EXTERNAL_INVENTORY_KINDS],
    'inventory_coverage_categories',
  );
  for (const coverage of manifest.inventoryCoverage) {
    exactKeys(coverage, [
      'kind', 'complete', 'unclassifiedCount', 'sourceCount', 'targetCount',
      'sourceInventorySha256', 'targetInventorySha256',
      'sourceEvidenceSha256', 'targetEvidenceSha256',
    ], 'inventory_coverage');
    assert.equal(coverage.complete, true, 'external_inventory_incomplete');
    assert.equal(coverage.unclassifiedCount, 0, 'unclassified_external_effect');
    digest(coverage.sourceEvidenceSha256, 'source_inventory_evidence');
    digest(coverage.targetEvidenceSha256, 'target_inventory_evidence');
    const sourceCount = [...sourceInventory.values()]
      .filter(entry => entry.kind === coverage.kind).length;
    const targetCount = [...targetInventory.values()]
      .filter(entry => entry.kind === coverage.kind).length;
    assert.equal(coverage.sourceCount, sourceCount, 'source_inventory_count');
    assert.equal(coverage.targetCount, targetCount, 'target_inventory_count');
    assert.equal(coverage.sourceInventorySha256,
      inventoryDigest(sourceInventory, coverage.kind), 'source_inventory_digest');
    assert.equal(coverage.targetInventorySha256,
      inventoryDigest(targetInventory, coverage.kind), 'target_inventory_digest');
  }
  for (const kind of REQUIRED_EXTERNAL_INVENTORY_KINDS) {
    assert.ok(manifest.inventoryCoverage.some(entry => entry.kind === kind),
      'inventory_category_missing');
  }
  for (const entry of targetInventory.values()) {
    assert.equal(entry.active, false, 'target_external_effect_active');
  }

  assert.ok(Array.isArray(manifest.neutralizations), 'neutralizations_required');
  const neutralizations = new Map();
  for (const item of manifest.neutralizations) {
    exactKeys(item, [
      'kind', 'identity', 'action', 'evidenceSha256', 'catalogCategory',
      'catalogIdentity',
    ], 'neutralization');
    assert.ok(REQUIRED_EXTERNAL_INVENTORY_KINDS.includes(item.kind),
      'neutralization_kind');
    exactIdentity(item.identity, 'neutralization_identity');
    assert.ok(NEUTRALIZATION_ACTIONS.has(item.action), 'neutralization_action');
    digest(item.evidenceSha256, 'neutralization_evidence');
    const key = `${item.kind}\u0000${item.identity}`;
    assert.ok(!neutralizations.has(key), 'duplicate_neutralization');
    const source = sourceInventory.get(key);
    assert.ok(source?.active, 'neutralization_not_active_at_source');
    const target = targetInventory.get(key);
    assert.ok(!target?.active, 'external_mechanism_not_neutralized');
    if (item.catalogCategory === null) {
      assert.equal(item.catalogIdentity, null, 'catalog_identity_pair');
    } else {
      nonempty(item.catalogCategory, 'neutralization_catalog_category');
      exactIdentity(item.catalogIdentity, 'neutralization_catalog_identity');
    }
    neutralizations.set(key, item);
  }
  const activeSource = [...sourceInventory.entries()]
    .filter(([, entry]) => entry.active)
    .map(([key]) => key)
    .sort();
  assert.deepEqual([...neutralizations.keys()].sort(), activeSource,
    'active_external_mechanism_unaccounted');

  const sourceCatalog = catalogMap(manifest.sourceCatalog, 'source_catalog');
  const targetCatalog = catalogMap(manifest.targetCatalog, 'target_catalog');
  assert.equal(manifest.sourceCatalogSha256, sourceCatalog.sha256,
    'source_catalog_fingerprint');
  assert.equal(manifest.targetCatalogSha256, targetCatalog.sha256,
    'target_catalog_fingerprint');
  const catalogKeys = new Set([...sourceCatalog.map.keys(), ...targetCatalog.map.keys()]);
  const differences = [...catalogKeys].filter(key =>
    sourceCatalog.map.get(key) !== targetCatalog.map.get(key),
  ).sort();
  assert.ok(Array.isArray(manifest.catalogExceptions), 'catalog_exceptions_required');
  const catalogExceptions = new Map();
  for (const exception of manifest.catalogExceptions) {
    exactKeys(exception, [
      'category', 'identity', 'sourceSha256', 'targetSha256',
      'neutralizationKind', 'neutralizationIdentity',
    ], 'catalog_exception');
    nonempty(exception.category, 'catalog_exception_category');
    exactIdentity(exception.identity, 'catalog_exception_identity');
    exactIdentity(exception.neutralizationIdentity, 'catalog_exception_neutralization_identity');
    const key = `${exception.category}\u0000${exception.identity}`;
    assert.ok(!catalogExceptions.has(key), 'duplicate_catalog_exception');
    const neutralizationKey =
      `${exception.neutralizationKind}\u0000${exception.neutralizationIdentity}`;
    const neutralization = neutralizations.get(neutralizationKey);
    assert.ok(neutralization, 'catalog_exception_not_external');
    assert.notEqual(neutralization.catalogCategory, null,
      'catalog_exception_without_catalog_identity');
    assert.equal(exception.category, neutralization.catalogCategory,
      'catalog_exception_identity_mismatch');
    assert.equal(exception.identity, neutralization.catalogIdentity,
      'catalog_exception_identity_mismatch');
    assert.equal(exception.sourceSha256, sourceCatalog.map.get(key) ?? null,
      'catalog_exception_source_hash');
    assert.equal(exception.targetSha256, targetCatalog.map.get(key) ?? null,
      'catalog_exception_target_hash');
    catalogExceptions.set(key, exception);
  }
  assert.deepEqual([...catalogExceptions.keys()].sort(), differences,
    'catalog_difference_unaccounted');

  for (const item of neutralizations.values()) {
    if (item.catalogCategory === null) continue;
    const key = `${item.catalogCategory}\u0000${item.catalogIdentity}`;
    assert.ok(sourceCatalog.map.has(key), 'isolation_source_catalog_object_missing');
    if (sourceCatalog.map.get(key) !== targetCatalog.map.get(key)) {
      assert.ok(catalogExceptions.has(key), 'isolation_catalog_exception_missing');
      const exception = catalogExceptions.get(key);
      assert.equal(exception.neutralizationKind, item.kind);
      assert.equal(exception.neutralizationIdentity, item.identity);
    }
  }
  return manifest;
}

function validateBehaviorReceipt(bytes, approval) {
  const receipt = verifyBytes(bytes, approval.behaviorReceiptSha256, 'logical_behavior_receipt');
  exactKeys(receipt, [
    'schema', 'targetProject', 'candidate', 'sourceSnapshotId', 'evidenceKind',
    'finalCatalogSha256', 'checks',
  ], 'logical_behavior_receipt');
  assert.equal(receipt.schema, LOGICAL_BEHAVIOR_RECEIPT_SCHEMA);
  assert.equal(receipt.targetProject, approval.targetProject);
  assert.equal(receipt.candidate, approval.candidate);
  assert.equal(receipt.sourceSnapshotId, approval.sourceSnapshotId);
  assert.equal(receipt.evidenceKind, 'authentic-logical-restoration');
  assert.equal(receipt.finalCatalogSha256, approval.baselineCatalogSha256,
    'h_b1_catalog_parity');
  assert.ok(isRecord(receipt.checks), 'logical_behavior_checks_required');
  assert.deepEqual(Object.keys(receipt.checks).sort(), [...REQUIRED_BEHAVIOR_CHECKS].sort(),
    'logical_behavior_check_set');
  for (const check of Object.values(receipt.checks)) {
    exactKeys(check, ['result', 'evidenceSha256', 'procedure'], 'logical_behavior_check');
    assert.equal(check.result, 'PASS', 'logical_behavior_failed');
    digest(check.evidenceSha256, 'logical_behavior_evidence');
    nonempty(check.procedure, 'logical_behavior_procedure');
  }
  return receipt;
}

export async function validateLogicalRestorationEvidence({
  approvalBytes,
  approvedSha256,
  sourceObservationBytes,
  exportReceiptBytes,
  importReceiptBytes,
  targetObservationsBytes,
  storageManifestBytes,
  isolationManifestBytes,
  behaviorReceiptBytes,
  logicalArtifactDirectory,
  repositoryRoot = REPOSITORY_ROOT,
  now = new Date(),
}) {
  const pinned = readPinned(repositoryRoot);
  const approval = validateApproval(approvalBytes, approvedSha256, pinned, now);
  const versions = pinned.contract.migrations.map(migration => migration.version);
  validateSourceObservation(sourceObservationBytes, approval, versions);
  const exportReceipt = validateExportReceipt(exportReceiptBytes, approval, now);
  await validateLogicalArtifactDirectory(logicalArtifactDirectory, exportReceipt, approval);
  validateTargetObservations(targetObservationsBytes, approval, versions);
  validateImportReceipt(importReceiptBytes, approval, exportReceipt);
  validateStorageManifest(storageManifestBytes, approval);
  validateIsolationManifest(isolationManifestBytes, approval);
  validateBehaviorReceipt(behaviorReceiptBytes, approval);
  return {
    status: 'OFFLINE_EVIDENCE_VALID',
    evidenceKind: approval.evidenceKind,
    targetProject: approval.targetProject,
    candidate: approval.candidate,
    sourceSnapshotId: approval.sourceSnapshotId,
    migrationCount: versions.length,
    storageObjectCount: ORIGINAL_STORAGE_OBJECT_COUNT,
    behaviorCheckCount: REQUIRED_BEHAVIOR_CHECKS.length,
    hostedCertification: false,
  };
}
