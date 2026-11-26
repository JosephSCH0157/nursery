import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {IMPORT_PLAN_SCHEMA,IMPORT_AUTHORIZATION_SCHEMA,IMPORT_PROGRAMS,SOURCE_PROJECT,
  validateImportPlan,validateImportAuthorization,validateImportSourceObservation,inspectAuthenticatedImportInputs,psqlImportArguments}
  from './lib/storage-h444-restoration-preparation.mjs';
import {canonical,digest} from './lib/storage-quench-intervention.mjs';
const candidate='a'.repeat(40),h='b'.repeat(64);
function plan(){return {schema:IMPORT_PLAN_SCHEMA,candidate,
  source:{project:SOURCE_PROJECT,snapshotId:'00000008-000097FC-1',acquisitionCandidate:'c'.repeat(40),
    encryptedEvidenceSha256:h,independentAcquisitionReviewSha256:h,exportReceiptSha256:h,sourceObservationSha256:h,
    interventionCandidate:'d'.repeat(40),intervention:{receiptSha256:h,authorizationSha256:h,originalCatalogSha256:h,correctedCatalogSha256:h},
    lineageSha256:h,historySha256:h,financialSha256:h,storageSha256:h,storageObjectSetSha256:h},
  target:{project:'abcdefghijklmnopqrst',connectionSha256:h,disposable:true,compatibilityReviewSha256:h,
    storageCapabilityReviewSha256:h,storageIdentityPreservation:'PROVIDER_SUPPORTED_EXACT_ID_VERSION_METADATA_AND_BYTES',
    productionSecretsTransferred:false,rootKeyTransferred:false},isolationManifestSha256:h,
  programs:Object.fromEntries(IMPORT_PROGRAMS.map(k=>[k,h])),
  controls:{operator:'/root',independentReviewer:'/root/fingerprint_review',cleanupOperator:'/root',costCeilingUsd:10,
    retentionDays:7,maximumAttempts:1,automaticRetries:0}};}
function authorization(p){return {schema:IMPORT_AUTHORIZATION_SCHEMA,planSha256:digest(canonical(p)),ownerApprovalReference:'fixture-owner',
  independentReviewSha256:h,notBefore:'2026-01-01T00:00:00.000Z',dispatchCutoff:'2026-01-01T00:10:00.000Z',expiresAt:'2026-01-01T00:30:00.000Z',
  retentionDeadline:'2026-01-08T00:30:00.000Z',cleanupDeadline:'2026-01-01T00:30:00.000Z',ownerSupervisionReference:'fixture-supervision',
  targetCoordinationReference:'fixture-coordination',maximumAttempts:1,automaticRetries:0};}
const bytes=a=>Buffer.from(canonical(a));
const validate=(a,p=plan(),now='2026-01-01T00:05:00Z')=>validateImportAuthorization(bytes(a),digest(bytes(a)),{plan:p,candidate,now:new Date(now)});

test('time-independent plan checks never create authorization or a target',()=>{
  assert.deepEqual(validateImportPlan(plan(),{candidate}),{status:'PLAN_SHAPE_VALID_NOT_AUTHORIZED',planSha256:digest(canonical(plan())),connected:false});
});
test('production, nondisposable, incompatible or unreviewed targets fail closed',()=>{
  for(const change of [{project:SOURCE_PROJECT},{disposable:false},{storageIdentityPreservation:'UPLOAD_SAME_PATH'},
    {storageCapabilityReviewSha256:null},{compatibilityReviewSha256:null},{productionSecretsTransferred:true},{rootKeyTransferred:true}]){
    const p=plan();Object.assign(p.target,change);assert.throws(()=>validateImportPlan(p,{candidate}));
  }
});
test('candidate, origin, complete program commitments and no-retry controls are mandatory',()=>{
  for(const mutate of [p=>p.candidate='e'.repeat(40),p=>delete p.source.interventionCandidate,
    p=>delete p.source.acquisitionCandidate,p=>delete p.programs['constraint-validation'],p=>p.programs.extra=h,
    p=>p.controls.automaticRetries=1,p=>p.controls.maximumAttempts=2,p=>p.controls.costCeilingUsd=11,
    p=>p.controls.independentReviewer='/root',p=>p.controls.retentionDays=8]){
    const p=plan();mutate(p);assert.throws(()=>validateImportPlan(p,{candidate}));
  }
});
test('owner approval digest and exact plan binding are independently required',()=>{
  const p=plan(),a=authorization(p);assert.equal(validate(a,p).schema,IMPORT_AUTHORIZATION_SCHEMA);
  assert.throws(()=>validateImportAuthorization(bytes(a),'0'.repeat(64),{plan:p,candidate}));
  a.planSha256='f'.repeat(64);assert.throws(()=>validate(a,p),/import_plan_changed/);
});
test('dispatch permits exact not-before and rejects exact cutoff and expiration',()=>{
  const a=authorization(plan());validate(a,plan(),'2026-01-01T00:00:00Z');
  for(const at of ['2025-12-31T23:59:59.999Z','2026-01-01T00:10:00Z','2026-01-01T00:30:00Z'])assert.throws(()=>validate(a,plan(),at),/outside_dispatch_window/);
});
test('ambiguous UTC, invalid calendar, extensions, deferred cleanup and extended retention fail closed',()=>{
  for(const change of [{notBefore:'2026-01-01 00:00:00'},{notBefore:'2026-01-01T00:00:00-05:00'},
    {notBefore:'2026-02-30T00:00:00Z'},{expiresAt:'2026-01-01T00:31:00Z'},
    {cleanupDeadline:'2026-01-01T00:31:00Z'},{cleanupDeadline:'2026-01-01T00:02:00Z'},
    {retentionDeadline:'2026-01-09T00:30:00Z'},{maximumAttempts:2},{automaticRetries:1}]){
    const a=authorization(plan());Object.assign(a,change);assert.throws(()=>validate(a));
  }
});
test('input authentication rejects changed ciphertext before decryption or any target operation',async()=>{
  await assert.rejects(()=>inspectAuthenticatedImportInputs({plan:plan(),candidate,encryptedEvidenceBytes:Buffer.from('tampered')}),/encrypted_evidence_changed/);
});
test('real source observation format preserves originalHistorySha256, financial Test-state and all source bindings',()=>{
  const s=plan().source;
  const o={lineage:'historical-v1',lineageSha256:h,originalHistorySha256:h,financialSha256:h,storageSha256:h,
    versions:JSON.parse(readFileSync(new URL('../docs/database/certification/storage-full-tail-446.json',import.meta.url))).migrations.slice(0,444).map(m=>m.version),
    historyColumns:['created_by','idempotency_key','name','rollback','statements','version'],financialMode:'test',
    requiredFinancialRecords:{pricing:1,rollout:1,costPolicy:1,rateCondition:1},storageStage:4,storageContractOk:true,
    provenance:{candidate:s.acquisitionCandidate,interventionReceiptSha256:h,correctedCatalogSha256:h}};
  validateImportSourceObservation(o,s);
  for(const mutate of [x=>delete x.originalHistorySha256,x=>x.originalHistorySha256='0'.repeat(64),x=>x.financialMode='live',
    x=>x.versions.pop(),x=>x.provenance.candidate=candidate,x=>x.provenance.interventionReceiptSha256='0'.repeat(64)]){
    const changed=structuredClone(o);mutate(changed);assert.throws(()=>validateImportSourceObservation(changed,s));
  }
});
test('input preparation requires reviewed program bytes even if ciphertext digest is rebound',async()=>{
  const p=plan(),cipher=Buffer.from('not-an-envelope');p.source.encryptedEvidenceSha256=digest(cipher);
  await assert.rejects(()=>inspectAuthenticatedImportInputs({plan:p,candidate,encryptedEvidenceBytes:cipher,
    programBytes:Object.fromEntries(IMPORT_PROGRAMS.map(k=>[k,Buffer.from('different program')]))}),/program_changed/);
});
test('plain SQL import uses psql single transaction, strict errors, no startup file or credential arguments',()=>{
  const args=psqlImportArguments();assert.ok(args.includes('-X'));assert.ok(args.includes('--single-transaction'));
  assert.ok(args.includes('--set=ON_ERROR_STOP=1'));assert.ok(args.includes('--no-password'));
  const files=args.filter((_,i)=>args[i-1]==='-f');assert.deepEqual(files,[
    'transaction-prelude.sql','schema.sql','supabase-migrations-schema.sql','data.sql','supabase-migrations-data.sql',
    'role-and-sequence-restoration.sql','constraint-validation.sql']);
  assert.ok(!args.some(v=>/postgresql:|password=|pg_restore/.test(v)));
});
