import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateContract,pendingVersions,exactPending,readPinned,stage} from './lib/forge-storage-full-tail.mjs';
const contract=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json'));
test('exact full tail and original scoped runner identities remain pinned',()=>{
 const verified=readPinned(process.cwd());assert.equal(verified.contract.migrations.length,446);
 assert.equal(pendingVersions(contract,'historical',contract.historicalAnchor,'20261104071802').length,26);
 assert.equal(pendingVersions(contract,'historical','20261104071802').length,9);
 assert.equal(pendingVersions(contract,'baseline','20261104143249').length,8);
 assert.equal(pendingVersions(contract,'baseline','20261105025313').length,6);
});
test('missing, duplicate, reordered, extra, unsafe and unapproved migration identities fail',()=>{
 for(const change of [c=>c.migrations.pop(),c=>c.migrations.push(c.migrations[0]),c=>c.migrations.reverse(),c=>c.migrations[1]=c.migrations[0],c=>c.migrations[0].path='../escape.sql',c=>c.target='20261113214833',c=>c.sourceCandidate='0'.repeat(40)]){
  const c=structuredClone(contract);change(c);assert.throws(()=>validateContract(c));
 }
 const expected=pendingVersions(contract,'baseline','20261105025313');assert.throws(()=>exactPending(expected.slice(1),expected));assert.throws(()=>exactPending([...expected,'99999999999999'],expected));assert.throws(()=>pendingVersions(contract,'linked','0'));
});
test('migration-only staging refuses unknown or modified SQL and non-disposable paths',()=>{
 assert.throws(()=>stage(process.cwd(),process.cwd(),'baseline',contract.target),/disposable/);
 const dir=mkdtempSync(join(tmpdir(),'forge-baseline-v1-cert-staging-test-'));const migrations=join(dir,'supabase/migrations');mkdirSync(migrations,{recursive:true});
 try{writeFileSync(join(migrations,'99999999999999_unapproved.sql'),'select 1;');assert.throws(()=>stage(process.cwd(),dir,'baseline',contract.target),/Unexpected staged SQL/);rmSync(join(migrations,'99999999999999_unapproved.sql'));writeFileSync(join(migrations,'20261113214832_workpiece_manifest_optimistic_concurrency.sql'),'select 1;');assert.throws(()=>stage(process.cwd(),dir,'baseline',contract.target),/Staged bytes changed/);}finally{rmSync(dir,{recursive:true});}
});
