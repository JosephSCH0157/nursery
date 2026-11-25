import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interventionFixture} from './fixtures/storage-quench-intervention-fixture.mjs';
import {validateInterventionReceipt,validateInterventionSnapshot,validateOriginalQuenchSnapshot,canonical,digest} from './lib/storage-quench-intervention.mjs';
import {readConvergenceSuccessor} from './lib/storage-quench-successor.mjs';
const context={sourceProject:'wtvdjndyxegudufrompx',candidate:'a'.repeat(40),...Object.fromEntries(['lineageSha256','historySha256','financialSha256','storageSha256'].map(k=>[k,digest(k)]))};
test('closed intervention pins exact original/after catalogs, history and independently reviewed committed evidence',()=>{
 const f=interventionFixture(context);assert.equal(validateInterventionReceipt(f.bytes,f.binding,context).schema,f.receipt.schema);
 validateInterventionSnapshot(f.receipt,{found:3,records:JSON.parse(f.receipt.after.recordsJson)},f.receipt.correctedCatalog);
 validateOriginalQuenchSnapshot({found:3,records:JSON.parse(f.receipt.before.recordsJson)});
 assert.throws(()=>validateOriginalQuenchSnapshot({found:3,records:JSON.parse(f.receipt.after.recordsJson)}));
 readConvergenceSuccessor();
});
for(const [name,mutate] of [
 ['fourth catalog change',r=>r.correctedCatalog[0].canonical='drift'],['missing original catalog',r=>r.originalCatalog=[]],
 ['body change',r=>r.correctedCatalog[1].canonical=r.correctedCatalog[1].canonical.replace('SECURITY DEFINER','SECURITY INVOKER')],
 ['history change',r=>r.after.versions.push('99999999999999')],['financial change',r=>r.after.financialSha256=digest('different')],
 ['uncertain commit',r=>r.after.transactionOutcome='NOTICE_BEFORE_COMMIT'],['same snapshot postverify',r=>r.after.snapshotId=r.before.snapshotId],
 ['retry dispatch',r=>r.attempt.dispatchCount=2],['owner absent',r=>r.authorization.ownerApprovalReference=''],
 ['wrong SQL',r=>r.authorization.sqlSha256=digest('wrong')],['operator self review',r=>r.authorization.independentReviewer=r.authorization.operator],
 ['source substitution',r=>r.sourceProject='otherproject'],['candidate substitution',r=>r.candidate='b'.repeat(40)],
 ['wrong full inventory query',r=>r.catalogQuerySha256=digest('partial')],['unreviewed evidence',r=>r.independentReview.verdict='UNKNOWN'],
 ['OID substitution',r=>{const rows=JSON.parse(r.after.recordsJson);rows[0].oid++;r.after.recordsJson=JSON.stringify(rows);r.after.recordsSha256=digest(r.after.recordsJson);}]
])test('rejects '+name+' even with freshly supplied outer digest',()=>{
 const f=interventionFixture(context);mutate(f.receipt);const bytes=Buffer.from(JSON.stringify(f.receipt));assert.throws(()=>validateInterventionReceipt(bytes,{...f.binding,receiptSha256:digest(bytes)},context));
});
test('same-snapshot acquisition stops on function or full catalog drift',()=>{
 const f=interventionFixture(context),observation={found:3,records:JSON.parse(f.receipt.after.recordsJson)};
 for(const mutate of [o=>o.found=2,o=>o.records[0].owner='other',o=>o.records[0].acl.push({grantee:'PUBLIC'})]){const o=structuredClone(observation);mutate(o);assert.throws(()=>validateInterventionSnapshot(f.receipt,o,f.receipt.correctedCatalog));}
 const rows=structuredClone(f.receipt.correctedCatalog);rows[0].canonical='unrelated';assert.throws(()=>validateInterventionSnapshot(f.receipt,observation,rows));
});

test('completed evidence and independent review cannot be future dated',()=>{
 const f=interventionFixture(context);
 assert.throws(()=>validateInterventionReceipt(f.bytes,f.binding,{...context,now:new Date('2026-11-19T21:02:00Z')}));
 assert.throws(()=>validateInterventionReceipt(f.bytes,f.binding,{...context,now:new Date('2026-11-19T21:03:30Z')}));
});
