import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, readFile, readdir, copyFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
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
  LOGICAL_EXECUTION_APPROVAL_SCHEMA, LOGICAL_COMPLETION_SCHEMA, REQUIRED_447_BEHAVIOR_CHECKS,
  validateLogicalExecutionPrerequisites, validateLogicalExecutionObservation,
  validateLogicalRestoredCatalog, validateLogicalExecutionCompletion,
} from './lib/storage-logical-restoration-certification.mjs';
import {runUpgrade} from './certify-storage-authentic-restoration.mjs';
import {interventionFixture} from './fixtures/storage-quench-intervention-fixture.mjs';
import {LOGICAL_INTERVENTION_SCHEMA,INTERVENTION_COMPLETION_SCHEMA,catalogCommitment} from './lib/storage-quench-intervention.mjs';
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

const executionVersions = [...pinned.contract.migrations, pinned.admission.migration].map(m => m.version);
const executionReleases = [...STORAGE_RELEASES, {number: 447, ...pinned.admission.migration}];
function resealExecution(evidence) {
  reseal(evidence);
  delete evidence.approval.behaviorReceiptSha256;
  evidence.approvalBytes = bytes(evidence.approval);
  evidence.approvedSha256 = hash(evidence.approvalBytes);
}
async function executionFixture(getEvidence, mode = 'restrictive') {
  const evidence = await getEvidence();
  Object.assign(evidence.approval, {
    schema: LOGICAL_EXECUTION_APPROVAL_SCHEMA, allowedOperation: 'isolated-h444-to-447-certification',
    privilegeMode: mode, connectionSha256: hash(`postgresql://postgres@db.${targetProject}.supabase.co/postgres`),
    migrationManifestSha256: migrationManifestSha256({migrations: [...pinned.contract.migrations, pinned.admission.migration]}),
    migrations: executionReleases.map(({version, sha256}) => ({version, sha256})),
  });
  evidence.targetObservations.observations = evidence.targetObservations.observations.slice(0, 1);
  Object.assign(evidence.targetObservations.observations[0].observation, {billingStage: 4, billingContractOk: true});
  evidence.storageManifest.objects.forEach((object, i) => {
    object.sourceBytes = object.targetBytes = i === 0 ? 967 : 942;
  });
  resealExecution(evidence);
  return evidence;
}
const validateExecution = evidence => validateLogicalExecutionPrerequisites({...evidence, repositoryRoot, now});
const executionObservation = count => ({...observation(Math.min(count, 446)),
  versions: executionVersions.slice(0, count), billingStage: 4, billingContractOk: true,
  admissionStage: 7, admissionContractOk: count === 447});

for (const mode of ['permissive', 'restrictive']) logicalTest(`logical v2 validates restored H444 and executes the guarded 445/446/447 sequence: ${mode}`,
async getEvidence => {
  const e = await executionFixture(getEvidence, mode);
  const approval = await validateExecution(e);
  await assert.rejects(() => validate(e)); // v1 remains a separate non-executing contract.
  validateLogicalRestoredCatalog(approval, e.isolationManifestBytes, {entries: e.isolationManifest.targetCatalog});
  assert.throws(() => validateLogicalRestoredCatalog(approval, e.isolationManifestBytes, {entries: []}), /restored_catalog/);
  let count = 444;
  const receipts = new Map(), applied = [];
  const result = await runUpgrade({approval, versions: executionVersions, releases: executionReleases,
    validateObservation: validateLogicalExecutionObservation, checkApproval: () => validateExecution(e),
    observe: () => executionObservation(count),
    persist: (name, value) => {assert.ok(!receipts.has(name)); receipts.set(name, value);},
    apply: release => {assert.ok(receipts.has(`attempt-${release.number}.json`)); applied.push(release.number); count = release.number;},
  });
  assert.deepEqual(applied, [445, 446, 447]);
  assert.ok(receipts.has('verified-447.json'));
  assert.equal(result.authenticCertification, 'PENDING_BEHAVIOR_PARITY_AND_CLEANUP');
});

for (const [name, mutate, pattern] of [
  ['source substitution', e => {e.approval.sourceProject = 'a'.repeat(20);}, /source_project/],
  ['production target', e => {e.approval.targetProject = PROJECT;}, /production_target/],
  ['candidate substitution', e => {e.approval.candidate = 'a'.repeat(40);}, /approved_candidate/],
  ['missing 447 commitment', e => {e.approval.migrations.pop();}, /approved_successor/],
  ['invalid privilege mode', e => {e.approval.privilegeMode = 'both';}, /privilege_mode/],
  ['incomplete H444', e => {e.targetObservations.observations[0].observation.versions.pop();}, /exact_history_prefix/],
  ['unexplained catalog difference', e => {e.isolationManifest.catalogExceptions = [];}, /catalog_difference/],
  ['incomplete object bytes', e => {e.storageManifest.objects[0].sourceBytes--; e.storageManifest.objects[0].targetBytes--;}, /approved_original_storage_bytes/],
  ['wrong financial fingerprint', e => {e.targetObservations.observations[0].observation.financialSha256 = hash('changed');}, /financial_state_changed/],
  ['missing billing contract', e => {delete e.targetObservations.observations[0].observation.billingContractOk;}, /billing_contract/],
]) logicalTest(`logical execution rejects ${name}`, async getEvidence => {
  const e = await executionFixture(getEvidence); mutate(e); resealExecution(e);
  await assert.rejects(() => validateExecution(e), pattern);
});

logicalTest('logical execution rejects self-substituted approval digest and expiry', async getEvidence => {
  const e = await executionFixture(getEvidence);
  await assert.rejects(() => validateExecution({...e, approvedSha256: 'f'.repeat(64)}), /approval_bytes_changed/);
  e.approval.expiresAt = '2026-11-19T22:59:00Z'; resealExecution(e);
  await assert.rejects(() => validateExecution(e), /approval_expired/);
});

for (const failure of [445, 446, 447]) logicalTest(`logical coordinator does not replay lost response at ${failure}`,
async getEvidence => {
  const e = await executionFixture(getEvidence), approval = await validateExecution(e);
  let count = 444;
  const receipts = new Map(), calls = [];
  const run = () => runUpgrade({approval, versions: executionVersions, releases: executionReleases,
    validateObservation: validateLogicalExecutionObservation, checkApproval: () => approval,
    observe: () => executionObservation(count),
    persist: (name, value) => {assert.ok(!receipts.has(name), 'receipt_exists'); receipts.set(name, value);},
    apply: release => {calls.push(release.number); count = release.number; if (count === failure) throw Error('lost response');},
  });
  await assert.rejects(run, /lost response/);
  assert.equal(calls.at(-1), failure); assert.ok(!receipts.has(`verified-${failure}.json`));
  const previousCalls = calls.length;
  await assert.rejects(run); assert.equal(calls.length, previousCalls);
});

logicalTest('447 PostVerify rejects missing admission checks and protected-state drift', async getEvidence => {
  const e = await executionFixture(getEvidence), approval = await validateExecution(e);
  for (const change of [s => {s.admissionContractOk = false;}, s => {s.billingContractOk = false;},
    s => {s.storageContractOk = false;}, s => {s.admissionStage = 6;},
    s => {s.originalHistorySha256 = hash('wrong');}, s => {s.financialSha256 = hash('wrong');},
    s => {s.storageSha256 = hash('wrong');}, s => {s.versions[446] = '99999999999999';}]) {
    const state = executionObservation(447); change(state);
    assert.throws(() => validateLogicalExecutionObservation(approval, state, executionVersions, 447));
  }
});

logicalTest('logical completion requires independent review, four parity lanes and all 447 behavior evidence',
async getEvidence => {
  const e = await executionFixture(getEvidence), approval = await validateExecution(e);
  const finalObservation = executionObservation(447), stageReceiptsSha256 = hash('actual-stage-receipts');
  const completion = {
    schema: LOGICAL_COMPLETION_SCHEMA, candidate, executionApprovalSha256: e.approvedSha256,
    targetProject, sourceSnapshotId, privilegeMode: approval.privilegeMode,
    observedAt: '2026-11-19T22:59:00Z', reviewerReference: 'SYNTHETIC TEST ONLY',
    finalObservationSha256: hash(finalObservation), stageReceiptsSha256,
    storageManifestSha256: hash(e.storageManifestBytes),
    lanes: ['H447-permissive', 'H447-restrictive', 'B1-34-permissive', 'B1-34-restrictive'].map((name, index) => ({
      name, candidate, targetProject: index === 1 ? targetProject : index === 0 ? 'v'.repeat(20) : `forge-baseline-v1-${String(index).repeat(12)}`,
      lineage: index < 2 ? 'historical-v1' : 'baseline-v1',
      versions: index < 2 ? executionVersions : ['20261021020814', ...executionVersions.filter(v => v >= '20261022000000')],
      evidenceKind: index < 2 ? 'authentic-logical-restoration' : 'synthetic-operational-baseline',
      sourceSnapshotId: index < 2 ? sourceSnapshotId : null,
      storageManifest: index < 2 ? {...e.storageManifest, targetProject: index === 1 ? targetProject : 'v'.repeat(20)} : null,
      catalogSha256: baselineCatalogSha256, observationSha256: index === 1 ? hash(finalObservation) : hash(name),
      checks: Object.fromEntries(REQUIRED_447_BEHAVIOR_CHECKS.map(check => [check,
        {result: 'PASS', evidenceSha256: hash(check), procedure: 'SYNTHETIC TEST ONLY'}])),
    })),
  };
  const verify = (value = completion, override = {}) => validateLogicalExecutionCompletion({approval,
    approvedSha256: e.approvedSha256, completionBytes: bytes(value), completionSha256: hash(value),
    finalObservation, catalogSha256: baselineCatalogSha256, stageReceiptsSha256,
    storageManifestBytes: e.storageManifestBytes, initialStorageManifestBytes: e.storageManifestBytes,
    importCompletedAt: e.importReceipt.importCompletedAt, repositoryRoot, now, ...override});
  assert.equal(verify().status, 'LOGICAL_447_BEHAVIOR_PARITY_VERIFIED');
  assert.equal(verify().productionReleaseAuthorized, false);
  assert.equal(verify().physicalRecoveryCertified, false);
  assert.throws(() => verify(completion, {completionSha256: '0'.repeat(64)}), /logical_completion_bytes_changed/);
  assert.throws(() => verify(completion, {stageReceiptsSha256: hash('wrong')}), /completion_stages_changed/);
  const changedStorage = structuredClone(e.storageManifest);
  changedStorage.objects[0].sourceByteSha256 = changedStorage.objects[0].targetByteSha256 = hash('replacement');
  assert.throws(() => verify({...completion, storageManifestSha256: hash(changedStorage)},
    {storageManifestBytes: bytes(changedStorage)}), /approved_original_storage_changed/);
  for (const mutate of [c => {c.lanes.pop();}, c => {c.lanes[0].evidenceKind = 'synthetic';},
    c => {c.lanes[0].catalogSha256 = hash('other');}, c => {c.lanes[2].versions.pop();},
    c => {c.lanes[1].targetProject = c.lanes[0].targetProject;},
    c => {delete c.lanes[0].checks['storage-metadata-admission'];},
    c => {c.lanes[3].checks['storage-overwrite-admission'].result = 'FAIL';},
    c => {c.lanes[0].storageManifest.objects = [];},
    c => {c.finalObservationSha256 = hash('wrong');}, c => {c.executionApprovalSha256 = hash('wrong');},
    c => {c.observedAt = '2026-11-20T00:00:00Z';}, c => {c.observedAt = '2026-11-19T21:00:00Z';}]) {
    const changed = structuredClone(completion); mutate(changed); assert.throws(() => verify(changed));
  }
});

logicalTest('CLI prepares and validates exact logical packages through 447 without connecting',
async getEvidence => {
  const e = await executionFixture(getEvidence);
  e.approval.expiresAt = new Date(Date.now() + 3600000).toISOString();
  e.approval.cleanupDeadline = new Date(Date.now() + 7200000).toISOString();
  resealExecution(e);
  const base = join(repositoryRoot, '.git', 'forge-private-evidence', 'storage-authentic-certification');
  await mkdir(base, {recursive: true});
  const directory = await mkdtemp(join(base, 'offline-cli-test-'));
  try {
    const evidenceDirectory = join(directory, 'evidence');
    await mkdir(join(evidenceDirectory, 'artifacts'), {recursive: true});
    for (const name of REQUIRED_LOGICAL_ARTIFACTS) {
      await copyFile(join(e.logicalArtifactDirectory, name), join(evidenceDirectory, 'artifacts', name));
    }
    for (const [name, content] of Object.entries({
      'approval.json': e.approvalBytes, 'source-observation.json': e.sourceObservationBytes,
      'export-receipt.json': e.exportReceiptBytes, 'import-receipt.json': e.importReceiptBytes,
      'target-observations.json': e.targetObservationsBytes, 'storage-manifest.json': e.storageManifestBytes,
      'isolation-manifest.json': e.isolationManifestBytes,
    })) await writeFile(join(evidenceDirectory, name), content, {flag: 'wx'});
    const connection = join(directory, 'connection.txt'), workdir = join(directory, 'package');
    await writeFile(connection, `postgresql://postgres@db.${targetProject}.supabase.co/postgres`, {flag: 'wx'});
    const invoke = action => JSON.parse(execFileSync(process.execPath, [
      join(repositoryRoot, 'scripts/certify-storage-authentic-restoration.mjs'),
      '--action', action, '--approval', join(evidenceDirectory, 'approval.json'),
      '--approval-sha256', e.approvedSha256, '--workdir', workdir,
      ...(action === 'Prepare' ? ['--connection-file', connection] : []),
    // Offline preparation hashes/stages hundreds of pinned files. WSL over the
    // canonical Windows checkout can exceed 30 seconds without a stuck child.
    // This bounded test wait does not change acquisition/SQL/execution deadlines.
    ], {cwd: repositoryRoot, encoding: 'utf8', timeout: 120000, stdio: 'pipe'}));
    // Only these two offline actions are exercised. No adapter/credentials run.
    assert.equal(invoke('Prepare').connected, false);
    const packagePath = join(workdir, 'package.json');
    for (const count of [445, 446, 447]) {
      if (count > 445) {
        const migration = [...pinned.contract.migrations, pinned.admission.migration][count - 1];
        await writeFile(join(workdir, migration.path), pinned.blobs.get(migration.path), {flag: 'wx'});
        await writeFile(packagePath, bytes({targetProject, candidate, through: count}));
      }
      assert.equal(invoke('Validate').connected, false);
      assert.equal((await readdir(join(workdir, 'supabase/migrations'))).length, count);
    }
    const migration = join(workdir, pinned.admission.migration.path);
    await writeFile(migration, Buffer.concat([await readFile(migration), Buffer.from('\n-- tampered fixture')]));
    assert.throws(() => invoke('Validate'), /pinned_package_bytes/);
    assert.equal((await readdir(workdir)).some(name => name.startsWith('attempt-')), false);
  } finally {
    assert.equal(dirname(directory), base);
    assert.ok(directory.startsWith(join(base, 'offline-cli-test-')));
    await rm(directory, {recursive: true, force: true});
  }
});

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

logicalTest('rejects import receipts that predate the completed export or claim future completion',
async getEvidence => {
  const beforeExport = await getEvidence();
  resealNested(beforeExport, evidence => {
    Object.assign(evidence.importReceipt, {
      isolationCompletedAt: '2026-11-19T21:55:00.000Z',
      triggerSuppressionStartedAt: '2026-11-19T21:56:00.000Z',
      importStartedAt: '2026-11-19T21:57:00.000Z',
      importCompletedAt: '2026-11-19T21:59:00.000Z',
    });
  });
  await assert.rejects(() => validate(beforeExport), /logical_import_order/);

  const futureImport = await getEvidence();
  resealNested(futureImport, evidence => {
    evidence.importReceipt.importCompletedAt = '2026-11-19T23:01:00.000Z';
  });
  await assert.rejects(() => validate(futureImport), /logical_import_order/);
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

// The new route reuses the same artifact validator and guarded coordinator.
async function interventionExecutionFixture(getEvidence,mode='restrictive',mutateRole=()=>{},snapshotStartedAt){
 const e=await executionFixture(getEvidence,mode),f=interventionFixture(e.approval);
 const migrations=[...pinned.contract.migrations,pinned.admission.migration,pinned.convergence.migration];
 Object.assign(e.approval,{schema:LOGICAL_INTERVENTION_SCHEMA,allowedOperation:'isolated-corrected-h444-to-448-certification',intervention:f.binding,
   migrations:migrations.slice(444).map(({version,sha256})=>({version,sha256})),migrationManifestSha256:migrationManifestSha256({migrations})});
 e.interventionReceiptBytes=f.bytes;
 e.sourceObservation.observation.provenance={interventionReceiptSha256:f.binding.receiptSha256,correctedCatalogSha256:f.binding.correctedCatalogSha256,snapshotStartedAt:snapshotStartedAt??e.exportReceipt.snapshotStartedAt};
 e.isolationManifest.sourceCatalog=catalogCommitment(f.receipt.correctedCatalog).entries;
 e.isolationManifest.targetCatalog=e.isolationManifest.sourceCatalog.map(x=>x.identity==='media_probe'?{...x,sha256:hash('target-catalog-object')}:x);
 Object.assign(e.targetObservations.observations[0].observation,{quenchStage:8,quenchContractOk:true});
 const role={securityIntervention:{receipt:f.receipt,receiptSha256:f.binding.receiptSha256,functions:{found:3,records:JSON.parse(f.receipt.after.recordsJson)},catalog:f.receipt.correctedCatalog}};mutateRole(role);
 await writeFile(join(e.logicalArtifactDirectory,'role-and-acl-manifest.json'),bytes(role));
 resealExecution(e);
 const proof=JSON.parse(await readFile(join(e.logicalArtifactDirectory,'snapshot-consistency.json')));
 proof.sourceObservationSha256=e.approval.sourceObservationSha256;
 for(const a of e.exportReceipt.artifacts.filter(a=>a.name!=='snapshot-consistency.json')){const b=await readFile(join(e.logicalArtifactDirectory,a.name));a.sha256=hash(b);a.sizeBytes=b.length;}
 proof.artifactSetSha256=hash(e.exportReceipt.artifacts.filter(a=>a.name!=='snapshot-consistency.json').map(a=>[a.name,a.sha256,a.sizeBytes]).sort(([a],[b])=>a<b?-1:a>b?1:0));
 const b=bytes(proof);await writeFile(join(e.logicalArtifactDirectory,'snapshot-consistency.json'),b);
 const artifact=e.exportReceipt.artifacts.find(a=>a.name==='snapshot-consistency.json');artifact.sha256=hash(b);artifact.sizeBytes=b.length;e.exportReceipt.consistencyProofSha256=hash(b);
 resealExecution(e);return e;
}
const convergenceVersions=[...executionVersions,pinned.convergence.migration.version];
const convergenceReleases=[...executionReleases,{number:448,...pinned.convergence.migration}];
const convergenceObservation=count=>({...executionObservation(Math.min(count,447)),versions:convergenceVersions.slice(0,count),admissionContractOk:count>=447,quenchStage:8,quenchContractOk:true});
for(const mode of ['permissive','restrictive'])logicalTest('v3 preserves original evidence and executes ordered445-448 '+mode,async getEvidence=>{
 const e=await interventionExecutionFixture(getEvidence,mode),a=await validateExecution(e),calls=[],records=new Map();let count=444;
 const result=await runUpgrade({approval:a,versions:convergenceVersions,releases:convergenceReleases,validateObservation:validateLogicalExecutionObservation,
  checkApproval:()=>validateExecution(e),observe:()=>convergenceObservation(count),persist:(name,v)=>{assert.ok(!records.has(name));records.set(name,v);},apply:r=>{assert.ok(records.has('attempt-'+r.number+'.json'));calls.push(r.number);count=r.number;}});
 assert.deepEqual(calls,[445,446,447,448]);assert.equal(result.status,'UPGRADE_VERIFIED');
 for(const bad of [447,449])assert.throws(()=>validateLogicalExecutionObservation(a,convergenceObservation(bad),executionVersions,bad));
 for(const change of [x=>x.quenchContractOk=false,x=>x.financialSha256=hash('drift'),x=>x.versions.reverse()]){const x=convergenceObservation(448);change(x);assert.throws(()=>validateLogicalExecutionObservation(a,x,convergenceVersions,448));}
});
for(const [name,mutate] of [
 ['missing receipt',e=>delete e.interventionReceiptBytes],
 ['receipt substitution',e=>e.interventionReceiptBytes=bytes({})],
 ['snapshot provenance lost',e=>delete e.sourceObservation.observation.provenance],
 ['wrong corrected isolation source',e=>e.isolationManifest.sourceCatalog[1].sha256=hash('wrong')],
 ['downgrade',e=>{e.approval.schema=LOGICAL_EXECUTION_APPROVAL_SCHEMA;e.approval.allowedOperation='isolated-h444-to-447-certification';delete e.approval.intervention;}]
])logicalTest('v3 rejects '+name,async getEvidence=>{const e=await interventionExecutionFixture(getEvidence);mutate(e);resealExecution(e);await assert.rejects(()=>validateExecution(e));});
logicalTest('v3 completion requires four448 lanes and strict parity, never a447 receipt',async getEvidence=>{
 const e=await interventionExecutionFixture(getEvidence),approval=await validateExecution(e),finalObservation=convergenceObservation(448),stageReceiptsSha256=hash('four-verified-stages');
 const completion={schema:INTERVENTION_COMPLETION_SCHEMA,candidate,executionApprovalSha256:e.approvedSha256,targetProject,sourceSnapshotId,privilegeMode:approval.privilegeMode,observedAt:'2026-11-19T22:59:00Z',reviewerReference:'SYNTHETIC_REVIEWER',finalObservationSha256:hash(finalObservation),stageReceiptsSha256,storageManifestSha256:hash(e.storageManifestBytes),
 lanes:['H448-permissive','H448-restrictive','B1-35-permissive','B1-35-restrictive'].map((name,i)=>({name,candidate,targetProject:i===1?targetProject:i===0?'v'.repeat(20):'forge-baseline-v1-'+String(i).repeat(12),lineage:i<2?'historical-v1':'baseline-v1',versions:i<2?convergenceVersions:['20261021020814',...convergenceVersions.filter(v=>v>='20261022000000')],evidenceKind:i<2?'authentic-logical-restoration':'synthetic-operational-baseline',sourceSnapshotId:i<2?sourceSnapshotId:null,storageManifest:i<2?{...e.storageManifest,targetProject:i===1?targetProject:'v'.repeat(20)}:null,catalogSha256:baselineCatalogSha256,observationSha256:i===1?hash(finalObservation):hash(name),checks:Object.fromEntries([...REQUIRED_447_BEHAVIOR_CHECKS,'quench-acquisition-denied','quench-authorized-callers'].map(c=>[c,{result:'PASS',evidenceSha256:hash(c),procedure:'SYNTHETIC_ONLY'}]))}))};
 const verify=c=>validateLogicalExecutionCompletion({approval,approvedSha256:e.approvedSha256,completionBytes:bytes(c),completionSha256:hash(c),finalObservation,catalogSha256:baselineCatalogSha256,stageReceiptsSha256,storageManifestBytes:e.storageManifestBytes,initialStorageManifestBytes:e.storageManifestBytes,importCompletedAt:e.importReceipt.importCompletedAt,repositoryRoot,now});
 assert.equal(verify(completion).status,'LOGICAL_448_BEHAVIOR_PARITY_VERIFIED');
 for(const change of [c=>c.schema=LOGICAL_COMPLETION_SCHEMA,c=>c.lanes.pop(),c=>c.lanes[2].catalogSha256=hash('different'),c=>delete c.lanes[0].checks['quench-acquisition-denied'],c=>c.lanes[1].versions.pop()]){const c=structuredClone(completion);change(c);assert.throws(()=>verify(c));}
});

for(const [name,change] of [['missing function observation',x=>delete x.securityIntervention.functions],['function OID drift',x=>x.securityIntervention.functions.records[0].oid++]])logicalTest('v3 rejects '+name+' in consistently hashed artifacts',async getEvidence=>{
 const e=await interventionExecutionFixture(getEvidence,'restrictive',change);await assert.rejects(()=>validateExecution(e));
});
logicalTest('v3 requires independent review before acquisition snapshot',async getEvidence=>{
 const e=await interventionExecutionFixture(getEvidence,'restrictive',()=>{},'2026-11-19T21:03:30Z');await assert.rejects(()=>validateExecution(e),/intervention_snapshot_time_binding|intervention_precedes_acquisition/);
});
