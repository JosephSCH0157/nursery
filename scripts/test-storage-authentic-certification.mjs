import assert from 'node:assert/strict';
import test from 'node:test';
import {PROJECT,STORAGE_RELEASES} from './lib/storage-successor-release-contract.mjs';
import {sha256,validateRestorationApproval,validateHistoricalObservation,recoveryDecision,validateBehaviorReceipt,REQUIRED_BEHAVIOR_CHECKS} from './lib/storage-authentic-certification.mjs';
import {runUpgrade,validateRestorationConnection} from './certify-storage-authentic-restoration.mjs';
const now=new Date('2026-11-19T15:00:00Z');
const h='a'.repeat(64), candidate='b'.repeat(40);
const approval=()=>({schema:'forge.storage-h444-restoration-approval.v1',sourceProject:PROJECT,targetProject:'abcdefghijklmnopqrst',evidenceKind:'authentic-provider-restoration',allowedOperation:'isolated-h444-to-446-certification',ownerApprovalReference:'OFFLINE TEST ONLY',backupId:'offline-fixture',providerRestoreReceipt:'offline',isolationBeforeStartupReference:'offline',costApprovalReference:'offline',cleanupOperator:'offline',externalEffectsPrevented:true,backupCompletedAt:'2026-11-19T06:30:00Z',expiresAt:'2026-11-19T16:00:00Z',cleanupDeadline:'2026-11-19T17:00:00Z',candidate,lineageSha256:h,historySha256:h,financialSha256:h,storageSha256:h,baselineCatalogSha256:h,sourceObservationSha256:h,migrations:STORAGE_RELEASES.map(r=>({version:r.version,sha256:r.sha256}))});
const validate=a=>{const bytes=JSON.stringify(a);return validateRestorationApproval(bytes,sha256(bytes),now);};
test('offline approval validation never treats JSON alone as owner approval',()=>{
 const a=approval();const bytes=JSON.stringify(a);assert.throws(()=>validateRestorationApproval(bytes,'c'.repeat(64),now),/approval_bytes_changed/);assert.equal(validate(a).backupId,'offline-fixture');
});
for(const [key,value] of [['targetProject',PROJECT],['evidenceKind','synthetic'],['externalEffectsPrevented',false],['expiresAt','2026-11-19T14:00:00Z'],['providerRestoreReceipt',''],['isolationBeforeStartupReference',''],['costApprovalReference',''],['financialSha256',''],['migrations',[]]])test(`restoration rejects ${key} drift`,()=>assert.throws(()=>validate({...approval(),[key]:value})));
const versions=Array.from({length:446},(_,i)=>String(i+1));
const state=(count=444)=>({lineage:'historical-v1',lineageSha256:h,historyColumns:['created_by','idempotency_key','name','rollback','statements','version'],versions:versions.slice(0,count),originalHistorySha256:h,financialSha256:h,storageSha256:h,financialMode:'test',requiredFinancialRecords:{pricing:1,rollout:1,costPolicy:1,rateCondition:1},storageStage:count-440,storageContractOk:true});
test('exact predecessor and each successor preserve original evidence',()=>{for(const count of [444,445,446])validateHistoricalObservation(approval(),state(count),versions,count);});
for(const [key,value] of [['lineage','baseline-v1'],['historyColumns',['version']],['originalHistorySha256','c'.repeat(64)],['financialSha256','c'.repeat(64)],['storageSha256','c'.repeat(64)],['versions',versions.slice(0,443)],['financialMode','live'],['requiredFinancialRecords',{}],['storageContractOk',false]])test(`predecessor rejects ${key}`,()=>assert.throws(()=>validateHistoricalObservation(approval(),{...state(),[key]:value},versions,444)));
const healthy=()=>({attemptedStage:446,observedCount:446,originalHistoryUnchanged:true,financialUnchanged:true,storageVersionsReconciled:true,stripeEventsReconciled:true,compatibleArtifacts:true,fenceProven:true,acceptancePassed:true,unresolvedOperations:0});
for(const [name,change,action] of [
 ['445 failed',{attemptedStage:445,observedCount:444},'NEW_AUTHORIZATION_REQUIRED'],
 ['446 failed',{observedCount:445},'NEW_AUTHORIZATION_REQUIRED'],
 ['ambiguous completion',{observedCount:null},'POSTVERIFY_ONLY'],
 ['application deployment failed',{compatibleArtifacts:false},'COMPATIBLE_FORWARD_DEPLOYMENT'],
 ['Checkout or webhook mismatch',{compatibleArtifacts:false},'COMPATIBLE_FORWARD_DEPLOYMENT'],
 ['partial uploads',{storageVersionsReconciled:false},'RECONCILE_EXTERNAL_STATE'],
 ['stale writer',{fenceProven:false},'OWNER_INTERVENTION'],
 ['delayed or duplicated Stripe event',{stripeEventsReconciled:false},'RECONCILE_EXTERNAL_STATE'],
 ['admitted operation unresolved',{unresolvedOperations:1},'RECONCILE_EXTERNAL_STATE'],
 ['acceptance failed',{acceptancePassed:false},'KEEP_FENCED'],
 ['financial drift',{financialUnchanged:false},'OWNER_INTERVENTION'],
 ['unexpected predecessor',{observedCount:444},'OWNER_INTERVENTION'],
])test(`recovery: ${name}`,()=>{const r=recoveryDecision({...healthy(),...change});assert.equal(r.action,action);assert.equal(r.resume,false);});
test('even successful recovery never automatically reopens writes',()=>assert.deepEqual(recoveryDecision(healthy()),{action:'REQUEST_EXPLICIT_RESUME',resume:false,reason:'owner_resume_authorization_required'}));
test('behavior receipt requires every target-bound real-evidence check',()=>{
 const a=approval(),r={schema:'forge.storage-authentic-behavior.v1',targetProject:a.targetProject,candidate,backupId:a.backupId,evidenceKind:a.evidenceKind,checks:Object.fromEntries(REQUIRED_BEHAVIOR_CHECKS.map(k=>[k,{result:'PASS',evidenceSha256:h,procedure:'OFFLINE TEST ONLY'}]))};
 const verify=()=>{const bytes=JSON.stringify(r);return validateBehaviorReceipt(a,r,sha256(bytes),bytes);};
 assert.equal(verify(),true);r.evidenceKind='synthetic';assert.throws(verify);r.evidenceKind=a.evidenceKind;delete r.checks['storage-http-and-retained-bytes'];assert.throws(verify);
});
test('restoration connection rejects production, password, parameter and host substitution',()=>{
 const target=approval().targetProject;
 assert.equal(validateRestorationConnection(`postgresql://postgres.${target}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,target).includes(target),true);
 for(const url of [`postgresql://postgres.${PROJECT}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,`postgresql://postgres:secret@db.${target}.supabase.co/postgres`,`postgresql://postgres@db.${target}.supabase.co/postgres?host=evil`,`postgresql://postgres@evil.invalid/postgres`])assert.throws(()=>validateRestorationConnection(url,target));
});
for(const failStage of [null,445,446])test(`actual coordinator records attempts before execution; failure ${failStage}`,async()=>{
 let count=444;const receipts=new Map(),calls=[];
 const run=()=>runUpgrade({approval:approval(),versions,checkApproval:()=>validate(approval()),observe:()=>state(count),persist:(name,value)=>{assert.ok(!receipts.has(name),'cannot overwrite evidence');receipts.set(name,value);},apply:r=>{assert.ok(receipts.has(`attempt-${r.number}.json`));calls.push(r.number);if(r.number===failStage)throw Error('injected lost response');count=r.number;}});
 if(failStage){await assert.rejects(run,/lost response/);assert.equal(calls.at(-1),failStage);assert.ok(!receipts.has(`verified-${failStage}.json`));}
 else{assert.deepEqual(await run(),{status:'UPGRADE_VERIFIED',authenticCertification:'PENDING_BEHAVIOR_PARITY_AND_CLEANUP'});assert.deepEqual(calls,[445,446]);}
 await assert.rejects(run); // An existing attempt/predecessor is never overwritten.
});
test('coordinator stops if financial authority changes after a migration',async()=>{
 let changed=false;const writes=[];
 await assert.rejects(()=>runUpgrade({approval:approval(),versions,checkApproval:()=>{},observe:()=>({...state(changed?445:444),financialSha256:changed?'f'.repeat(64):h}),persist:()=>{},apply:r=>{writes.push(r.number);changed=true;}}),/financial_state_changed/);
 assert.deepEqual(writes,[445]);
});
