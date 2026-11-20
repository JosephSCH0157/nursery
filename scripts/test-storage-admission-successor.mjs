import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {admissionSuccessor as successor,readAdmissionSuccessor,validateAdmissionContract,sha256} from './lib/storage-admission-successor.mjs';
import {readPinned,stage,pendingVersions,validateStorageCiProvenance} from './lib/forge-storage-full-tail.mjs';
import {releaseFor,assertStorageSuccessorReleaseReady} from './lib/storage-successor-release-contract.mjs';
import {validateSuccessorPayload,prepareSuccessorWorkdir} from './prepare-storage-successor-hosted-workdir.mjs';
import {prepareStorageWorkdir} from './prepare-storage-successor-linked-workdir.mjs';
const predecessor=JSON.parse(readFileSync(successor.predecessor.contractPath));

test('adopts precisely the byte-tested SQL without changing the proposal or predecessor catalog',()=>{
 const {sql,contract}=readAdmissionSuccessor();
 assert.equal(sha256(sql),contract.migration.sha256);
 assert.equal(contract.historicalCount,contract.predecessor.historicalCount+1);
 assert.equal(contract.baselineCount,contract.predecessor.baselineCount+1);
 assert.ok(contract.migration.version>contract.predecessor.version);
});
test('changed successor identity, hash, lineage counts, catalog scope or execution permission fails closed',()=>{
 for(const mutate of [c=>c.migration.version='20261113214832',c=>c.migration.sha256='0'.repeat(64),
  c=>c.migration.path='../untrusted.sql',c=>c.predecessor.contractSha256='0'.repeat(64),
  c=>c.historicalCount++,c=>c.baselineCount++,c=>c.catalogDelta.changed.pop(),
  c=>c.executionContractSha256='0'.repeat(64),c=>c.hostedExecution='allowed',c=>c.releaseAuthorization=true]){
  const c=structuredClone(successor);mutate(c);assert.throws(()=>validateAdmissionContract(c));
 }
});
test('current CI requires exactly seven Storage migrations while legacy verification stays through 446',()=>{
 const legacy={lineage:'baseline-v1',head:predecessor.target,versions:pendingVersions(predecessor,'baseline','20261105025313')};
 const current={...legacy,head:successor.migration.version,versions:[...legacy.versions,successor.migration.version]};
 validateStorageCiProvenance(predecessor,legacy);
 validateStorageCiProvenance(predecessor,current,{includeAdmission:true});
 assert.throws(()=>validateStorageCiProvenance(predecessor,legacy,{includeAdmission:true}));
 assert.throws(()=>validateStorageCiProvenance(predecessor,current));
 for(const mutate of [c=>c.versions.pop(),c=>c.versions.push(successor.migration.version),c=>c.versions.reverse(),c=>c.lineage='historical-v1',c=>c.head=predecessor.target]){
  const c=structuredClone(current);mutate(c);assert.throws(()=>validateStorageCiProvenance(predecessor,c,{includeAdmission:true}));
 }
});
test('repository membership and both migration-only lineage stages include the same successor bytes',()=>{
 const pinned=readPinned(process.cwd());
 assert.deepEqual(pinned.admission,successor);
 assert.equal(pinned.contract.migrations.length,446,'historical contract remains scoped and immutable');
 for(const lineage of ['historical','baseline']){
  const dir=mkdtempSync(join(tmpdir(),'forge-baseline-v1-cert-admission-test-'));
  mkdirSync(join(dir,'supabase/migrations'),{recursive:true});
  try{
   const staged=stage(process.cwd(),dir,lineage,successor.migration.version);
   assert.equal(staged.count,lineage==='historical'?447:34);
   assert.equal(staged.versions.at(-1),successor.migration.version);
   assert.equal(sha256(readFileSync(join(dir,'supabase/migrations',basename(successor.migration.path)))),successor.migration.sha256);
   assert.equal(stage(process.cwd(),dir,lineage,predecessor.target).count,staged.count-1,'legacy staging never silently adopts the successor');
  }finally{rmSync(dir,{recursive:true,force:true});}
 }
});
test('adoption does not enable or broaden any hosted executor',()=>{
 assert.throws(()=>releaseFor(successor.migration.version),/unsupported_storage_successor/);
 assert.throws(()=>prepareSuccessorWorkdir(process.cwd(),successor.migration.version),/unsupported_storage_successor/);
 assert.throws(()=>prepareStorageWorkdir(process.cwd(),successor.migration.version),/unsupported_storage_successor/);
 const legacy=validateSuccessorPayload(process.cwd());
 assert.equal(legacy.names.length,446);
 assert.ok(!legacy.names.includes(successor.migration.path),'adopted suffix is excluded from all legacy packages');
 assert.throws(()=>assertStorageSuccessorReleaseReady('Apply'),/storage_successor_release_hold/);
 assert.equal(successor.hostedExecution,'held-no-executor');
});
test('focused regression runner does not invoke H/B1 certification or Stripe validation',()=>{
 const runner=readFileSync('scripts/test-storage-review-database.ps1','utf8');
 assert.doesNotMatch(runner,/certify-canonical-baseline|certify-storage-full-tail|certify-stripe-sandbox|FORGE_STORAGE_PRIVATE_INVENTORY='[^']/);
 assert.match(runner,/FORGE_STORAGE_REVIEW_PRIVILEGES=\$DefaultPrivilegeMode/);
});
