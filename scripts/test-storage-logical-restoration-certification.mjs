import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  LOGICAL_BEHAVIOR_RECEIPT_SCHEMA,
  LOGICAL_EXPORT_RECEIPT_SCHEMA,
  LOGICAL_IMPORT_RECEIPT_SCHEMA,
  LOGICAL_ISOLATION_MANIFEST_SCHEMA,
  LOGICAL_RESTORATION_APPROVAL_SCHEMA,
  LOGICAL_SNAPSHOT_CONSISTENCY_SCHEMA,
  LOGICAL_STORAGE_MANIFEST_SCHEMA,
  LOGICAL_TARGET_OBSERVATIONS_SCHEMA,
  ORIGINAL_STORAGE_OBJECT_COUNT,
  REQUIRED_EXTERNAL_INVENTORY_KINDS,
  REQUIRED_LOGICAL_ARTIFACTS,
  migrationManifestSha256,
  validateLogicalRestorationEvidence,
} from './lib/storage-logical-restoration-certification.mjs';
import {sha256, REQUIRED_BEHAVIOR_CHECKS} from './lib/storage-authentic-certification.mjs';
import {readPinned} from './lib/forge-storage-full-tail.mjs';
import {PROJECT, STORAGE_RELEASES} from './lib/storage-successor-release-contract.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pinned = readPinned(repositoryRoot);
const now = new Date('2026-11-19T23:00:00.000Z');
const hash = value => sha256(
  typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
);
const bytes = value => Buffer.from(JSON.stringify(value));
const candidate = pinned.head;
const targetProject = 'abcdefghijklmnopqrst';
const sourceSnapshotId = 'snapshot-h444-2026-11-19T22:00:00Z';
const lineageSha256 = hash('historical-lineage');
const historySha256 = hash('six-column-history');
const financialSha256 = hash('financial-authority');
const storageSha256 = hash('storage-metadata');
const baselineCatalogSha256 = hash('h-b1-catalog');

function observation(migrationCount = 444) {
  const versions = pinned.contract.migrations
    .slice(0, migrationCount)
    .map(migration => migration.version);
  return {
    lineage: 'historical-v1',
    lineageSha256,
    historyColumns: [
      'created_by', 'idempotency_key', 'name', 'rollback', 'statements', 'version',
    ],
    versions,
    originalHistorySha256: historySha256,
    financialSha256,
    storageSha256,
    financialMode: 'test',
    requiredFinancialRecords: {pricing: 1, rollout: 1, costPolicy: 1, rateCondition: 1},
    storageStage: migrationCount - 440,
    storageContractOk: true,
  };
}

function catalogSha256(entries) {
  const rows = entries
    .map(entry => [entry.category, entry.identity, entry.sha256])
    .sort(([leftCategory, leftIdentity], [rightCategory, rightIdentity]) =>
      leftCategory === rightCategory
        ? leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0
        : leftCategory < rightCategory ? -1 : 1);
  return hash(rows);
}

function inventorySha256(entries, kind) {
  return hash(entries
    .filter(entry => entry.kind === kind)
    .map(entry => [entry.identity, entry.active, entry.fingerprintSha256])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

async function fixture() {
  const sourceObservation = {
    schema: 'forge.storage-h444-logical-source-observation.v1',
    sourceProject: PROJECT,
    snapshotId: sourceSnapshotId,
    observation: observation(444),
  };
  const sourceObservationSha256 = hash(bytes(sourceObservation));
  const artifactContent = new Map(REQUIRED_LOGICAL_ARTIFACTS
    .filter(name => name !== 'snapshot-consistency.json')
    .map(name => [name, Buffer.from(`synthetic artifact ${name}`)]));
  const artifactSetSha256 = hash([...artifactContent.entries()]
    .map(([name, content]) => [name, hash(content), content.length])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  artifactContent.set('snapshot-consistency.json', bytes({
    schema: LOGICAL_SNAPSHOT_CONSISTENCY_SCHEMA,
    sourceProject: PROJECT,
    snapshotId: sourceSnapshotId,
    consistencyMethod: 'single-transaction-snapshot',
    snapshotStartedAt: '2026-11-19T22:00:00.000Z',
    snapshotCompletedAt: '2026-11-19T22:05:00.000Z',
    databaseSnapshotId: sourceSnapshotId,
    migrationHistorySnapshotId: sourceSnapshotId,
    financialStateSnapshotId: sourceSnapshotId,
    storageMetadataSnapshotId: sourceSnapshotId,
    sourceObservationSha256,
    artifactSetSha256,
  }));
  const exportReceipt = {
    schema: LOGICAL_EXPORT_RECEIPT_SCHEMA,
    sourceProject: PROJECT,
    snapshotId: sourceSnapshotId,
    consistencyMethod: 'single-transaction-snapshot',
    snapshotStartedAt: '2026-11-19T22:00:00.000Z',
    snapshotCompletedAt: '2026-11-19T22:05:00.000Z',
    consistencyProofSha256: hash(artifactContent.get('snapshot-consistency.json')),
    sourceObservationSha256,
    productionSecretsIncluded: false,
    artifacts: REQUIRED_LOGICAL_ARTIFACTS.map(name => ({
      name,
      snapshotId: sourceSnapshotId,
      sha256: hash(artifactContent.get(name)),
      sizeBytes: artifactContent.get(name).length,
    })),
  };
  const targetObservations = {
    schema: LOGICAL_TARGET_OBSERVATIONS_SCHEMA,
    sourceProject: PROJECT,
    targetProject,
    candidate,
    sourceSnapshotId,
    observations: [444, 445, 446].map(migrationCount => ({
      migrationCount,
      observation: observation(migrationCount),
    })),
  };
  const objects = Array.from({length: ORIGINAL_STORAGE_OBJECT_COUNT}, (_, index) => {
    const identitySha256 = hash(`storage-object:${index}`);
    const metadataSha256 = hash(`storage-metadata:${index}`);
    const byteSha256 = hash(`storage-bytes:${index}`);
    return {
      identitySha256,
      sourceMetadataSha256: metadataSha256,
      targetMetadataSha256: metadataSha256,
      sourceBytes: 100 + index,
      targetBytes: 100 + index,
      sourceByteSha256: byteSha256,
      targetByteSha256: byteSha256,
      sourceReadReceiptSha256: hash(`source-read:${index}`),
      targetReadReceiptSha256: hash(`target-read:${index}`),
    };
  });
  const storageManifest = {
    schema: LOGICAL_STORAGE_MANIFEST_SCHEMA,
    sourceProject: PROJECT,
    targetProject,
    candidate,
    sourceSnapshotId,
    objectCount: ORIGINAL_STORAGE_OBJECT_COUNT,
    sourceObjectSetSha256: '',
    sourceStorageSha256: storageSha256,
    targetStorageSha256: storageSha256,
    objects,
  };
  const sourceInventory = [{
    kind: 'foreign-servers',
    identity: 'media_probe',
    active: true,
    fingerprintSha256: hash('source-foreign-server'),
  }];
  const targetInventory = [{
    kind: 'foreign-servers',
    identity: 'media_probe',
    active: false,
    fingerprintSha256: hash('isolated-foreign-server'),
  }];
  const sourceCatalog = [{
    category: 'foreign_server',
    identity: 'media_probe',
    sha256: hash('source-catalog-object'),
  }];
  const targetCatalog = [{
    category: 'foreign_server',
    identity: 'media_probe',
    sha256: hash('target-catalog-object'),
  }];
  const isolationManifest = {
    schema: LOGICAL_ISOLATION_MANIFEST_SCHEMA,
    sourceProject: PROJECT,
    targetProject,
    candidate,
    sourceSnapshotId,
    inventoryComplete: true,
    unclassifiedCount: 0,
    productionSecretsTransferred: false,
    requiredInventoryKinds: [...REQUIRED_EXTERNAL_INVENTORY_KINDS],
    sourceInventory,
    targetInventory,
    inventoryCoverage: [],
    sourceCatalog,
    sourceCatalogSha256: '',
    targetCatalog,
    targetCatalogSha256: '',
    catalogExceptions: [{
      category: 'foreign_server',
      identity: 'media_probe',
      sourceSha256: sourceCatalog[0].sha256,
      targetSha256: targetCatalog[0].sha256,
      neutralizationKind: 'foreign-servers',
      neutralizationIdentity: 'media_probe',
    }],
    neutralizations: [{
      kind: 'foreign-servers',
      identity: 'media_probe',
      action: 'network-isolated',
      evidenceSha256: hash('network-isolation-proof'),
      catalogCategory: 'foreign_server',
      catalogIdentity: 'media_probe',
    }],
  };
  const behaviorReceipt = {
    schema: LOGICAL_BEHAVIOR_RECEIPT_SCHEMA,
    targetProject,
    candidate,
    sourceSnapshotId,
    evidenceKind: 'authentic-logical-restoration',
    finalCatalogSha256: baselineCatalogSha256,
    checks: Object.fromEntries(REQUIRED_BEHAVIOR_CHECKS.map(name => [name, {
      result: 'PASS',
      evidenceSha256: hash(`behavior:${name}`),
      procedure: `offline fixture ${name}`,
    }])),
  };
  const approval = {
    schema: LOGICAL_RESTORATION_APPROVAL_SCHEMA,
    sourceProject: PROJECT,
    targetProject,
    evidenceKind: 'authentic-logical-restoration',
    allowedOperation: 'isolated-h444-to-446-certification',
    ownerApprovalReference: 'OFFLINE FIXTURE ONLY',
    candidate,
    sourceSnapshotId,
    migrationManifestSha256: migrationManifestSha256(pinned.contract),
    migrations: STORAGE_RELEASES.map(({version, sha256}) => ({version, sha256})),
    logicalExportReceiptSha256: '',
    logicalImportReceiptSha256: '',
    sourceObservationSha256: '',
    targetObservationsSha256: '',
    storageManifestSha256: '',
    isolationManifestSha256: '',
    behaviorReceiptSha256: '',
    lineageSha256,
    historySha256,
    financialSha256,
    storageSha256,
    storageObjectSetSha256: '',
    baselineCatalogSha256,
    isolationBeforeImportReference: 'OFFLINE FIXTURE ONLY',
    externalEffectsPrevented: true,
    productionSecretsTransferred: false,
    rootKeyTransferred: false,
    costApprovalReference: 'OFFLINE FIXTURE ONLY',
    cleanupOperator: 'OFFLINE FIXTURE ONLY',
    expiresAt: '2026-11-20T01:00:00.000Z',
    cleanupDeadline: '2026-11-20T02:00:00.000Z',
  };
  const importReceipt = {
    schema: LOGICAL_IMPORT_RECEIPT_SCHEMA,
    sourceProject: PROJECT,
    targetProject,
    candidate,
    sourceSnapshotId,
    exportReceiptSha256: '',
    importedArtifacts: [],
    singleTransaction: true,
    triggersSuppressedDuringImport: true,
    externalEffectsNeutralizedBeforeImport: true,
    isolationBeforeImportReference: 'OFFLINE FIXTURE ONLY',
    isolationCompletedAt: '2026-11-19T22:10:00.000Z',
    triggerSuppressionStartedAt: '2026-11-19T22:11:00.000Z',
    importStartedAt: '2026-11-19T22:12:00.000Z',
    importCompletedAt: '2026-11-19T22:20:00.000Z',
    productionSecretsTransferred: false,
    rootKeyTransferred: false,
    isolationManifestSha256: '',
    triggerSuppressionEvidenceSha256: hash('trigger-suppression'),
  };

  const evidence = {
    approval,
    sourceObservation,
    exportReceipt,
    importReceipt,
    targetObservations,
    storageManifest,
    isolationManifest,
    behaviorReceipt,
  };
  const logicalArtifactDirectory = await mkdtemp(join(tmpdir(), 'forge-logical-cert-'));
  for (const [name, content] of artifactContent) {
    await writeFile(join(logicalArtifactDirectory, name), content);
  }
  evidence.logicalArtifactDirectory = logicalArtifactDirectory;
  reseal(evidence);
  return evidence;
}

function reseal(evidence, {refreshInventoryCoverage = true} = {}) {
  const {approval, sourceObservation, exportReceipt, importReceipt,
    targetObservations, storageManifest, isolationManifest, behaviorReceipt} = evidence;

  const sourceObservationBytes = bytes(sourceObservation);
  approval.sourceObservationSha256 = sha256(sourceObservationBytes);
  exportReceipt.sourceObservationSha256 = approval.sourceObservationSha256;
  evidence.sourceObservationBytes = sourceObservationBytes;

  const exportReceiptBytes = bytes(exportReceipt);
  approval.logicalExportReceiptSha256 = sha256(exportReceiptBytes);
  evidence.exportReceiptBytes = exportReceiptBytes;
  importReceipt.exportReceiptSha256 = approval.logicalExportReceiptSha256;
  importReceipt.importedArtifacts = exportReceipt.artifacts.map(({name, sha256: digest}) => ({
    name,
    sha256: digest,
  }));

  targetObservations.observations.forEach(item => {
    item.observation.lineageSha256 = lineageSha256;
  });
  const targetObservationsBytes = bytes(targetObservations);
  approval.targetObservationsSha256 = sha256(targetObservationsBytes);
  evidence.targetObservationsBytes = targetObservationsBytes;

  storageManifest.sourceObjectSetSha256 = hash(
    storageManifest.objects.map(item => item.identitySha256).sort().join('\n'),
  );
  approval.storageObjectSetSha256 = storageManifest.sourceObjectSetSha256;
  const storageManifestBytes = bytes(storageManifest);
  approval.storageManifestSha256 = sha256(storageManifestBytes);
  evidence.storageManifestBytes = storageManifestBytes;

  if (refreshInventoryCoverage) {
    isolationManifest.inventoryCoverage = REQUIRED_EXTERNAL_INVENTORY_KINDS.map(kind => {
      const source = isolationManifest.sourceInventory
        .filter(item => item.kind === kind);
      const target = isolationManifest.targetInventory
        .filter(item => item.kind === kind);
      return {
        kind,
        complete: true,
        unclassifiedCount: 0,
        sourceCount: source.length,
        targetCount: target.length,
        sourceInventorySha256: inventorySha256(isolationManifest.sourceInventory, kind),
        targetInventorySha256: inventorySha256(isolationManifest.targetInventory, kind),
        sourceEvidenceSha256: hash(`source-inventory-query:${kind}`),
        targetEvidenceSha256: hash(`target-inventory-query:${kind}`),
      };
    });
  }
  isolationManifest.sourceCatalogSha256 = catalogSha256(isolationManifest.sourceCatalog);
  isolationManifest.targetCatalogSha256 = catalogSha256(isolationManifest.targetCatalog);
  const isolationManifestBytes = bytes(isolationManifest);
  approval.isolationManifestSha256 = sha256(isolationManifestBytes);
  evidence.isolationManifestBytes = isolationManifestBytes;
  importReceipt.isolationManifestSha256 = approval.isolationManifestSha256;

  const behaviorReceiptBytes = bytes(behaviorReceipt);
  approval.behaviorReceiptSha256 = sha256(behaviorReceiptBytes);
  evidence.behaviorReceiptBytes = behaviorReceiptBytes;

  const importReceiptBytes = bytes(importReceipt);
  approval.logicalImportReceiptSha256 = sha256(importReceiptBytes);
  evidence.importReceiptBytes = importReceiptBytes;

  evidence.approvalBytes = bytes(approval);
  evidence.approvedSha256 = sha256(evidence.approvalBytes);
}

function validate(evidence) {
  return validateLogicalRestorationEvidence({
    ...evidence,
    repositoryRoot,
    now,
  });
}

function resealNested(evidence, mutate, options) {
  mutate(evidence);
  reseal(evidence, options);
}

function logicalTest(name, run) {
  test(name, async () => {
    const directories = [];
    const getEvidence = async () => {
      const evidence = await fixture();
      directories.push(evidence.logicalArtifactDirectory);
      return evidence;
    };
    try {
      await run(getEvidence);
    } finally {
      await Promise.all(directories.map(directory =>
        rm(directory, {recursive: true, force: true})));
    }
  });
}

logicalTest('accepts complete versioned synthetic evidence but never certifies a hosted database',
async getEvidence => {
  const result = await validate(await getEvidence());
  assert.deepEqual(result, {
    status: 'OFFLINE_EVIDENCE_VALID',
    evidenceKind: 'authentic-logical-restoration',
    targetProject,
    candidate,
    sourceSnapshotId,
    migrationCount: 446,
    storageObjectCount: 475,
    behaviorCheckCount: REQUIRED_BEHAVIOR_CHECKS.length,
    hostedCertification: false,
  });
});

logicalTest('rejects approval bytes that differ from the independently pinned digest',
async getEvidence => {
  const evidence = await getEvidence();
  evidence.approvalBytes = bytes({...evidence.approval, candidate: 'c'.repeat(40)});
  await assert.rejects(() => validate(evidence), /approval_bytes_changed/);
});

logicalTest('rejects a candidate or complete migration-manifest mismatch',
async getEvidence => {
  const candidateEvidence = await getEvidence();
  resealNested(candidateEvidence, evidence => {
    evidence.approval.candidate = 'c'.repeat(40);
  });
  await assert.rejects(() => validate(candidateEvidence), /approved_candidate_changed/);

  const manifestEvidence = await getEvidence();
  resealNested(manifestEvidence, evidence => {
    evidence.approval.migrationManifestSha256 = hash('incomplete-manifest');
  });
  await assert.rejects(() => validate(manifestEvidence), /full_migration_manifest_changed/);
});

logicalTest('rejects inconsistent snapshot identities and non-transactional imports',
async getEvidence => {
  const snapshotEvidence = await getEvidence();
  resealNested(snapshotEvidence, evidence => {
    evidence.exportReceipt.artifacts[0].snapshotId = 'different-snapshot';
  });
  await assert.rejects(() => validate(snapshotEvidence), /artifact_snapshot_mismatch/);

  const importEvidence = await getEvidence();
  resealNested(importEvidence, evidence => {
    evidence.importReceipt.singleTransaction = false;
  });
  await assert.rejects(() => validate(importEvidence), /logical_import_must_be_transactional/);

  const orderingEvidence = await getEvidence();
  resealNested(orderingEvidence, evidence => {
    evidence.importReceipt.importStartedAt = '2026-11-19T22:09:00.000Z';
  });
  await assert.rejects(() => validate(orderingEvidence), /logical_import_order/);
});

logicalTest('rejects incomplete six-column source history and financial fingerprint drift',
async getEvidence => {
  const historyEvidence = await getEvidence();
  resealNested(historyEvidence, evidence => {
    evidence.sourceObservation.observation.historyColumns = ['version'];
  });
  await assert.rejects(() => validate(historyEvidence), /complete_six_column_history/);

  const financialEvidence = await getEvidence();
  resealNested(financialEvidence, evidence => {
    evidence.sourceObservation.observation.financialSha256 = hash('changed-financial-state');
  });
  await assert.rejects(() => validate(financialEvidence), /financial_state_changed/);
});

logicalTest('rejects missing, duplicate, or byte-mismatched Storage objects',
async getEvidence => {
  const shortEvidence = await getEvidence();
  resealNested(shortEvidence, evidence => {
    evidence.storageManifest.objects.pop();
    evidence.storageManifest.objectCount -= 1;
  });
  await assert.rejects(() => validate(shortEvidence), /storage_object_count/);

  const duplicateEvidence = await getEvidence();
  resealNested(duplicateEvidence, evidence => {
    evidence.storageManifest.objects[1].identitySha256 =
      evidence.storageManifest.objects[0].identitySha256;
  });
  await assert.rejects(() => validate(duplicateEvidence), /duplicate_storage_object/);

  const byteEvidence = await getEvidence();
  resealNested(byteEvidence, evidence => {
    evidence.storageManifest.objects[0].targetByteSha256 = hash('different-bytes');
  });
  await assert.rejects(() => validate(byteEvidence), /storage_bytes_mismatch/);

  const metadataEvidence = await getEvidence();
  resealNested(metadataEvidence, evidence => {
    evidence.storageManifest.objects[0].targetMetadataSha256 = hash('different-metadata');
  });
  await assert.rejects(() => validate(metadataEvidence), /storage_metadata_mismatch/);
});

logicalTest('rejects missing external-effect coverage and active restored mechanisms',
async getEvidence => {
  const coverageEvidence = await getEvidence();
  resealNested(coverageEvidence, evidence => {
    evidence.isolationManifest.inventoryCoverage =
      evidence.isolationManifest.inventoryCoverage.slice(1);
  }, {refreshInventoryCoverage: false});
  await assert.rejects(() => validate(coverageEvidence), /inventory_coverage_categories/);

  const incompleteEvidence = await getEvidence();
  resealNested(incompleteEvidence, evidence => {
    evidence.isolationManifest.inventoryCoverage[0].complete = false;
  }, {refreshInventoryCoverage: false});
  await assert.rejects(() => validate(incompleteEvidence), /external_inventory_incomplete/);

  const activeEvidence = await getEvidence();
  resealNested(activeEvidence, evidence => {
    evidence.isolationManifest.targetInventory[0].active = true;
  });
  await assert.rejects(() => validate(activeEvidence), /target_external_effect_active/);
});

logicalTest('rejects wildcard identities and catalog exceptions detached from the neutralization',
async getEvidence => {
  const wildcardEvidence = await getEvidence();
  resealNested(wildcardEvidence, evidence => {
    evidence.isolationManifest.neutralizations[0].identity = 'media_*';
  });
  await assert.rejects(() => validate(wildcardEvidence), /wildcard_forbidden/);

  const detachedEvidence = await getEvidence();
  resealNested(detachedEvidence, evidence => {
    evidence.isolationManifest.catalogExceptions[0].identity = 'unrelated-object';
    evidence.isolationManifest.catalogExceptions[0].sourceSha256 = null;
    evidence.isolationManifest.catalogExceptions[0].targetSha256 = null;
  });
  await assert.rejects(() => validate(detachedEvidence), /catalog_exception_identity_mismatch/);
});

logicalTest('rejects unexplained catalog differences and secret or root-key transfer',
async getEvidence => {
  const catalogEvidence = await getEvidence();
  resealNested(catalogEvidence, evidence => {
    evidence.isolationManifest.targetCatalog.push({
      category: 'unrelated_catalog',
      identity: 'unexpected_object',
      sha256: hash('unexpected'),
    });
  });
  await assert.rejects(() => validate(catalogEvidence), /catalog_difference_unaccounted/);

  const secretEvidence = await getEvidence();
  resealNested(secretEvidence, evidence => {
    evidence.importReceipt.rootKeyTransferred = true;
  });
  await assert.rejects(() => validate(secretEvidence), /production_root_key_forbidden/);
});

logicalTest('rejects incomplete behavioral acceptance receipts', async getEvidence => {
  const evidence = await getEvidence();
  resealNested(evidence, item => {
    delete item.behaviorReceipt.checks[REQUIRED_BEHAVIOR_CHECKS[0]];
  });
  await assert.rejects(() => validate(evidence), /logical_behavior_check_set/);
});

logicalTest('rejects logical artifact bytes that do not match the export receipt',
async getEvidence => {
  const evidence = await getEvidence();
  await writeFile(join(evidence.logicalArtifactDirectory, 'data.sql'),
    'x'.repeat(evidence.exportReceipt.artifacts.find(item => item.name === 'data.sql').sizeBytes));
  await assert.rejects(() => validate(evidence), /logical_artifact_bytes_changed/);
});
