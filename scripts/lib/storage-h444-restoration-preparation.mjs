// Offline preparation and authorization checks only. No credential resolver,
// process launcher, database client, target creation or restore implementation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical,digest,validateInterventionReceipt,validateInterventionSnapshot,catalogCommitment} from './storage-quench-intervention.mjs';
import {REQUIRED_LOGICAL_ARTIFACTS,validateIsolationManifest} from './storage-logical-restoration-certification.mjs';
import {decryptExportBundle,clearExportBundle} from './storage-h444-output.mjs';
import {validateHistoricalObservation} from './storage-authentic-certification.mjs';
const historicalVersions=JSON.parse(readFileSync(new URL('../../docs/database/certification/storage-full-tail-446.json',import.meta.url)))
  .migrations.slice(0,444).map(m=>m.version);

export const IMPORT_PLAN_SCHEMA='forge.h444-isolated-import-plan.v1';
export const IMPORT_AUTHORIZATION_SCHEMA='forge.h444-isolated-import-authorization.v1';
export const SOURCE_PROJECT='wtvdjndyxegudufrompx';
export const IMPORT_PROGRAMS=Object.freeze([
  'target-compatibility','pre-import-isolation','transaction-prelude',
  'role-and-sequence-restoration','constraint-validation','post-import-observation',
  'storage-exact-restoration','storage-http-readback','target-cleanup',
]);
const keys=(v,list,name)=>{
  assert.ok(v&&typeof v==='object'&&!Array.isArray(v),`${name}_object`);
  assert.deepEqual(Object.keys(v).sort(),[...list].sort(),`${name}_fields`);
};
const hash=(v,name)=>assert.match(v??'',/^[a-f0-9]{64}$/,name);
const head=(v,name)=>assert.match(v??'',/^[a-f0-9]{40}$/,name);
const ref=(v,name)=>assert.ok(typeof v==='string'&&v.length>=3&&v.length<=512&&!/[\x00-\x1f*?]/.test(v),name);
const byteJson=(v,expected,name)=>{
  assert.ok(Buffer.isBuffer(v)&&v.length>0&&v.length<=32*1024*1024,`${name}_bytes`);
  hash(expected,`${name}_digest`);assert.equal(digest(v),expected,`${name}_changed`);
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(v));
};
const utc=v=>{
  assert.match(v??'',/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,'explicit_utc_required');
  const n=Date.parse(v);assert.ok(Number.isFinite(n),'invalid_utc');
  assert.equal(new Date(n).toISOString().slice(0,19),v.slice(0,19),'invalid_utc_calendar');return n;
};

export function validateImportPlan(plan,{candidate}={}) {
  keys(plan,['schema','candidate','source','target','isolationManifestSha256','programs','controls'],'import_plan');
  assert.equal(plan.schema,IMPORT_PLAN_SCHEMA);head(plan.candidate,'restoration_candidate');
  assert.equal(plan.candidate,candidate,'restoration_candidate_changed');
  const s=plan.source;
  keys(s,['project','snapshotId','acquisitionCandidate','encryptedEvidenceSha256','independentAcquisitionReviewSha256','exportReceiptSha256',
    'sourceObservationSha256','interventionCandidate','intervention','lineageSha256','historySha256',
    'financialSha256','storageSha256','storageObjectSetSha256'],'source');
  assert.equal(s.project,SOURCE_PROJECT);ref(s.snapshotId,'source_snapshot');head(s.interventionCandidate,'intervention_origin');
  head(s.acquisitionCandidate,'acquisition_candidate');
  for(const [k,v] of Object.entries(s))if(k.endsWith('Sha256'))hash(v,k);
  keys(s.intervention,['receiptSha256','authorizationSha256','originalCatalogSha256','correctedCatalogSha256'],'intervention');
  Object.values(s.intervention).forEach(v=>hash(v,'intervention_digest'));
  const t=plan.target;
  keys(t,['project','connectionSha256','disposable','compatibilityReviewSha256','storageCapabilityReviewSha256',
    'storageIdentityPreservation','productionSecretsTransferred','rootKeyTransferred'],'target');
  assert.match(t.project??'',/^[a-z]{20}$/,'target_project');assert.notEqual(t.project,SOURCE_PROJECT,'production_target_forbidden');
  for(const k of ['connectionSha256','compatibilityReviewSha256','storageCapabilityReviewSha256'])hash(t[k],k);
  assert.equal(t.disposable,true,'disposable_target_required');
  assert.equal(t.storageIdentityPreservation,'PROVIDER_SUPPORTED_EXACT_ID_VERSION_METADATA_AND_BYTES','exact_storage_capability_required');
  assert.equal(t.productionSecretsTransferred,false);assert.equal(t.rootKeyTransferred,false);
  hash(plan.isolationManifestSha256,'isolation_manifest_digest');
  keys(plan.programs,IMPORT_PROGRAMS,'programs');Object.values(plan.programs).forEach(v=>hash(v,'program_digest'));
  keys(plan.controls,['operator','independentReviewer','costCeilingUsd','retentionDays','maximumAttempts','automaticRetries','cleanupOperator'],'controls');
  const c=plan.controls;for(const k of ['operator','independentReviewer','cleanupOperator'])ref(c[k],k);
  assert.notEqual(c.operator,c.independentReviewer,'independent_reviewer_required');
  assert.ok(Number.isFinite(c.costCeilingUsd)&&c.costCeilingUsd>=0&&c.costCeilingUsd<=10,'cost_ceiling');
  assert.equal(c.retentionDays,7);assert.equal(c.maximumAttempts,1);assert.equal(c.automaticRetries,0);
  // A validated plan is never authorization, a target observation, or a receipt.
  return {status:'PLAN_SHAPE_VALID_NOT_AUTHORIZED',planSha256:digest(canonical(plan)),connected:false};
}

export function validateImportAuthorization(bytes,approvedSha256,{plan,candidate,now=new Date()}={}) {
  validateImportPlan(plan,{candidate});
  const a=byteJson(bytes,approvedSha256,'import_authorization');
  keys(a,['schema','planSha256','ownerApprovalReference','independentReviewSha256','notBefore','dispatchCutoff','expiresAt',
    'retentionDeadline','cleanupDeadline','ownerSupervisionReference','targetCoordinationReference','maximumAttempts','automaticRetries'],'import_authorization');
  assert.equal(a.schema,IMPORT_AUTHORIZATION_SCHEMA);assert.equal(a.planSha256,digest(canonical(plan)),'import_plan_changed');
  hash(a.independentReviewSha256,'independent_review');
  for(const k of ['ownerApprovalReference','ownerSupervisionReference','targetCoordinationReference'])ref(a[k],k);
  const start=utc(a.notBefore),cutoff=utc(a.dispatchCutoff),end=utc(a.expiresAt),cleanup=utc(a.cleanupDeadline);
  assert.equal(end-start,30*60000,'fixed_30_minute_window');
  assert.ok(cutoff>start&&cutoff<end,'dispatch_cutoff');
  assert.equal(cleanup,end,'cleanup_at_execution_boundary');
  assert.equal(utc(a.retentionDeadline),end+7*86400000,'seven_day_retention');
  const at=Number(now);assert.ok(Number.isFinite(at)&&at>=start&&at<cutoff,'outside_dispatch_window');
  assert.equal(a.maximumAttempts,1);assert.equal(a.automaticRetries,0);
  return a;
}

// Source-shape/protected commitments only, not independent authentication.
// Called below only after envelope authentication and exact source byte binding.
export function validateImportSourceObservation(observation,source) {
  validateHistoricalObservation(source,observation,historicalVersions,444);
  assert.equal(observation.provenance?.candidate,source.acquisitionCandidate,'acquisition_candidate_changed');
  assert.equal(observation.provenance?.interventionReceiptSha256,source.intervention.receiptSha256);
  assert.equal(observation.provenance?.correctedCatalogSha256,source.intervention.correctedCatalogSha256);
}

// Only a future separately authorized caller may supply decrypted target-bound
// inputs. This authenticates the original envelope in memory, never publishes
// plaintext and never connects. It cannot produce successful import receipts.
export async function inspectAuthenticatedImportInputs({plan,candidate,encryptedEvidenceBytes,
  interventionReceiptBytes,isolationManifestBytes,programBytes}) {
  validateImportPlan(plan,{candidate});
  assert.ok(Buffer.isBuffer(encryptedEvidenceBytes),'encrypted_evidence_required');
  assert.equal(digest(encryptedEvidenceBytes),plan.source.encryptedEvidenceSha256,'encrypted_evidence_changed');
  keys(programBytes,IMPORT_PROGRAMS,'program_bytes');
  for(const k of IMPORT_PROGRAMS){assert.ok(Buffer.isBuffer(programBytes[k])&&programBytes[k].length>0,'program_bytes_required');
    assert.equal(digest(programBytes[k]),plan.programs[k],'program_changed');}
  const isolationContext={sourceProject:SOURCE_PROJECT,targetProject:plan.target.project,candidate,
    sourceSnapshotId:plan.source.snapshotId,isolationManifestSha256:plan.isolationManifestSha256};
  const isolation=validateIsolationManifest(isolationManifestBytes,isolationContext);
  let bundle;
  try {
    bundle=await decryptExportBundle(encryptedEvidenceBytes);
    const s=plan.source,receipt=bundle.receipt;
    assert.equal(receipt.schema,'forge.storage-h444-logical-export-receipt.v1','authentic_export_required');
    assert.equal(receipt.sourceProject,SOURCE_PROJECT);assert.equal(receipt.snapshotId,s.snapshotId);
    assert.equal(digest(canonical(receipt)),s.exportReceiptSha256,'export_receipt_changed');
    assert.equal(digest(bundle.sourceObservationBytes),s.sourceObservationSha256,'source_observation_changed');
    const observation=JSON.parse(bundle.sourceObservationBytes).observation;
    validateImportSourceObservation(observation,s);
    const intervention=validateInterventionReceipt(interventionReceiptBytes,s.intervention,
      {...s,sourceProject:SOURCE_PROJECT,candidate:s.interventionCandidate});
    assert.equal(canonical(isolation.sourceCatalog),canonical(catalogCommitment(intervention.correctedCatalog).entries),'corrected_source_catalog_required');
    const role=JSON.parse(bundle.files.get('role-and-acl-manifest.json'));
    assert.equal(canonical(role.securityIntervention?.receipt),canonical(intervention),'immutable_receipt_required');
    assert.equal(role.securityIntervention.receiptSha256,s.intervention.receiptSha256,'embedded_receipt_digest');
    validateInterventionSnapshot(intervention,role.securityIntervention.functions,role.securityIntervention.catalog);
    assert.equal(observation.provenance?.snapshotStartedAt,receipt.snapshotStartedAt);
    assert.ok(Date.parse(intervention.independentReview.reviewedAt)<=Date.parse(receipt.snapshotStartedAt));
    return {status:'AUTHENTICATED_INPUTS_ONLY_NOT_IMPORTED',connected:false,restored:false,
      artifactNames:[...REQUIRED_LOGICAL_ARTIFACTS],sourceSnapshotId:s.snapshotId,planSha256:digest(canonical(plan)),
      requirements:['independent-target-compatibility','pre-import-isolation-observation','exact-storage-capability',
        'transaction-and-constraint-verification','actual-import-and-http-read-receipts','separate-convergence-approval']};
  } finally {clearExportBundle(bundle);}
}

export function psqlImportArguments() {
  // Reviewed program files are materialized only under later handling authority.
  // No connection/password arguments, automatic execution or generated SQL.
  return ['-X','--no-password','--single-transaction','--set=ON_ERROR_STOP=1',
    '--set=VERBOSITY=sqlstate','--set=SHOW_CONTEXT=never',
    '-f','transaction-prelude.sql','-f','schema.sql','-f','supabase-migrations-schema.sql',
    '-f','data.sql','-f','supabase-migrations-data.sql','-f','role-and-sequence-restoration.sql',
    '-f','constraint-validation.sql'];
}
