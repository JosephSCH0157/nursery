// Offline proposal consistency only. No evidence acceptance or execution API.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readPinned, digest} from './lib/forge-storage-full-tail.mjs';

export const proposalPath = 'docs/database/proposals/storage-h444-447-contract.json';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = 'database/canonical-baseline-v1/supabase/migrations/20261021020814_canonical_baseline_v1.sql';
const sourceCandidate = '660a8d62732393a5e61e72d1a6fa9658c3c53f81';
const checks = {
  billing: {path: 'supabase/tests/storage_billing_hosted_release_contract.sql', sha256: '655b42fc665c4f2a5b0f4a5d0d7dfad595e4bb238997bd867aa3bd059a5c9620'},
  successor: {path: 'supabase/tests/storage_successor_hosted_release_contract.sql', sha256: '5b6045de79421e87f85fddc3ea0281ba5f7f0de894f9cc6178b1709312e1f171'},
  admission: {path: 'supabase/tests/storage_admission_447_contract.sql', sha256: '07ea6c20f716ba589d495d47535b594fc443ba8589d1c36470929614cbd4635f'},
};

export function validateStorage447Proposal(proposal, pinned, repositoryRoot = root) {
  const migrations = [...pinned.contract.migrations, pinned.admission.migration];
  assert.equal(migrations.length, 447, 'exact_447_membership');
  const expected = {
    schema: 'forge.storage-h444-447-certification-proposal.v1',
    status: 'PROPOSED-NON-EXECUTING',
    sourceCandidate,
    executionAuthorized: false,
    evidenceAcceptanceAuthorized: false,
    requiredSupabaseCliVersion: '2.84.2',
    sourceProject: 'wtvdjndyxegudufrompx',
    predecessorContract: pinned.admission.predecessor.contractPath,
    predecessorContractSha256: pinned.admission.predecessor.contractSha256,
    admissionContract: 'docs/database/certification/storage-admission-447.json',
    admissionContractSha256: '358c6d04d7d2aba2c47be5c73c5864974b348f58c5eeffc085d7ef6e48bf82d2',
    migrationManifestSha256: digest(migrations.map(m => [m.path, m.version, m.sha256].join('|')).join('\n')),
    baseline: {path: baselinePath, sha256: pinned.contract.templatesAndFixtures[baselinePath]},
    lineages: ['historical-v1', 'baseline-v1'],
    privilegeModes: ['permissive', 'restrictive'],
    historyColumns: ['created_by', 'idempotency_key', 'name', 'rollback', 'statements', 'version'],
    stages: migrations.slice(443).map((m, i) => ({
      historicalCount: 444 + i, baselineCount: 31 + i, version: m.version,
      checks: i === 3 ? {billing: 4, successor: 6, admission: 7} : {billing: 4, successor: 4 + i},
    })),
    executionChecks: checks,
    requiredFinancialAuthorities: ['pricing', 'rollout', 'costPolicy', 'rateCondition'],
    requiredOriginalStorageObjects: 475,
    requiredOriginalStorageBytes: 447475,
    finalParity: {
      requiredCatalogs: ['H447-permissive', 'H447-restrictive', 'B1-34-permissive', 'B1-34-restrictive'],
      normalizationContract: 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json',
      otherParityExceptionsAllowed: false,
      expectedCatalogSha256: null,
      syntheticEvidenceEstablishesAuthenticity: false,
    },
    approvalState: 'NOT_ISSUED',
    certificationState: 'NOT_RUN',
  };
  // Reject extra keys as well as broadened scopes. This never validates an
  // approval, connection descriptor, authentic package or execution receipt.
  assert.deepEqual(proposal, expected, 'proposal_commitments_changed');
  for (const file of [
    ...Object.values(checks),
    {path: expected.predecessorContract, sha256: expected.predecessorContractSha256},
    {path: expected.admissionContract, sha256: expected.admissionContractSha256},
  ]) {
    const bytes = readFileSync(join(repositoryRoot, file.path), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(digest(bytes), file.sha256, 'pinned_dependency_changed:' + file.path);
  }
  assert.equal(digest(pinned.blobs.get(baselinePath)), expected.baseline.sha256);
  assert.equal(pinned.admission.executionContractSha256, checks.admission.sha256);
  return {
    status: 'PROPOSAL_VALID', repositoryHead: pinned.head, sourceCandidate,
    historicalCount: 447, baselineCount: 34, privilegeModes: expected.privilegeModes,
    executionAuthorized: false, evidenceAcceptanceAuthorized: false, certification: 'NOT_RUN',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, 'No operational actions or evidence inputs are accepted');
  const pinned = readPinned(root); // Read-only local Git blob verification.
  console.log(JSON.stringify(validateStorage447Proposal(JSON.parse(readFileSync(join(root, proposalPath))), pinned)));
}
