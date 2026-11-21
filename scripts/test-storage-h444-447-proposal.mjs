import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {readPinned} from './lib/forge-storage-full-tail.mjs';
import {proposalPath, validateStorage447Proposal} from './verify-storage-h444-447-proposal.mjs';
import {validateHistoricalObservation} from './lib/storage-authentic-certification.mjs';
import {releaseFor, assertStorageSuccessorReleaseReady} from './lib/storage-successor-release-contract.mjs';

const pinned = readPinned(process.cwd());
const proposal = JSON.parse(readFileSync(proposalPath));
test('proposal binds the adopted tail and both lineages without accepting evidence or authorizing execution', () => {
  const result = validateStorage447Proposal(proposal, pinned);
  assert.equal(result.status, 'PROPOSAL_VALID');
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.evidenceAcceptanceAuthorized, false);
  assert.equal(result.certification, 'NOT_RUN');
});

for (const [name, mutate] of [
  ['wrong source candidate', p => { p.sourceCandidate = '0'.repeat(40); }],
  ['substituted manifest', p => { p.migrationManifestSha256 = '0'.repeat(64); }],
  ['missing or reordered stage', p => { p.stages.reverse(); }],
  ['wrong lineage count', p => { p.stages[3].baselineCount = 33; }],
  ['missing privilege lane', p => { p.privilegeModes.pop(); }],
  ['missing migration-history column', p => { p.historyColumns.splice(4, 1); }],
  ['missing cumulative execution check', p => { delete p.stages[3].checks.successor; }],
  ['substituted execution SQL', p => { p.executionChecks.admission.sha256 = '0'.repeat(64); }],
  ['missing financial predecessor', p => { p.requiredFinancialAuthorities.pop(); }],
  ['incomplete original inventory', p => { p.requiredOriginalStorageObjects--; }],
  ['missing parity lane', p => { p.finalParity.requiredCatalogs.pop(); }],
  ['invented final catalog expectation', p => { p.finalParity.expectedCatalogSha256 = '0'.repeat(64); }],
  ['broadened catalog exception', p => { p.finalParity.otherParityExceptionsAllowed = true; }],
  ['synthetic evidence promoted to authentic', p => { p.finalParity.syntheticEvidenceEstablishesAuthenticity = true; }],
  ['execution enabled', p => { p.executionAuthorized = true; }],
  ['evidence acceptance enabled', p => { p.evidenceAcceptanceAuthorized = true; }],
  ['approval claimed', p => { p.approvalState = 'APPROVED'; }],
  ['certification claimed', p => { p.certificationState = 'PASS'; }],
  ['extra operational argument', p => { p.connection = 'postgresql://untrusted'; }],
]) {
  test('rejects ' + name, () => {
    const changed = structuredClone(proposal);
    mutate(changed);
    assert.throws(() => validateStorage447Proposal(changed, pinned), /proposal_commitments_changed/);
  });
}

test('proposal cannot broaden legacy restoration stages or hosted execution targets', () => {
  assert.throws(() => validateHistoricalObservation({}, {}, [], 447), /unsupported_stage/);
  assert.throws(() => releaseFor('20261120161347'), /unsupported_storage_successor/);
  assert.throws(() => assertStorageSuccessorReleaseReady('Apply'), /storage_successor_release_hold/);
});

test('offline entrypoint rejects operational actions before loading any evidence', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/verify-storage-h444-447-proposal.mjs', '--action', 'Upgrade'],
    {stdio: 'pipe'}), /No operational actions or evidence inputs are accepted/);
});
