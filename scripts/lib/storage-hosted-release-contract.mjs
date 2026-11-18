import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateHostedRecoveryEvidence } from './hosted-recovery-readiness-policy.mjs';

export const PROJECT = 'wtvdjndyxegudufrompx';
export const PAYLOAD = 'd3a481eaf5b688cbefe4ad1314a52446d5bd6a22';
// Closed set, never caller-supplied migration paths, hashes, counts or SQL.
export const STORAGE_RELEASES = Object.freeze([
 ['441','20261111180013','storage_capacity_authority','835312f662e5e2583f478a7b1c4eef9a174ce6b28baf4004c7aa8aed5c8a8d55'],
 ['442','20261111185031','storage_capacity_statement_enforcement','6f857b1cf4c971054cc01d268737496229b516048ed8119deb87d113f0f67080'],
 ['443','20261111192458','storage_subscription_lifecycle_fencing','8f50f8c3f6e3df22ae835bbf3a3cee0a7fe4cea7ee5449b938721bf15ecbb349'],
 ['444','20261111201029','storage_historical_quarantine','98fb99e3b5797d5266efe92d6e6b3cd8cb2e2e436fb4549cfaff1f1aa12563b6'],
].map(([number,version,name,sha256],i,a)=>Object.freeze({number:Number(number),version,name,sha256,filename:`${version}_${name}.sql`,predecessor:i?a[i-1][1]:'20261105025313',stage:i+1})));

export function releaseFor(version) {
 const release=STORAGE_RELEASES.find(r=>r.version===version);
 assert.ok(release,'unsupported_storage_release'); return release;
}
export function validateStorageAuthorization(r,options) {
 assert.ok(['Preflight','Apply','PostVerify'].includes(options.action),'action_invalid');
 assert.ok(typeof options.operator==='string' && options.operator.trim(),'operator_missing');
 if(options.action==='Apply') {
  assert.ok(typeof options.authorization==='string' && options.authorization.startsWith(`FORGE-STORAGE-${r.number}:${PROJECT}:${r.version}:`),'version_specific_authorization_required');
  assert.match(options.authorizationSha256??'',/^[0-9a-f]{64}$/);
  assert.equal(createHash('sha256').update(options.authorization).digest('hex'),options.authorizationSha256,'authorization_mismatch');
 }
 return {operator:options.operator};
}
export function validateStorageState(r,state,options) {
 validateStorageAuthorization(r,options);
 assert.equal(state.projectRef,PROJECT,'project_mismatch');
 assert.equal(state.lineage,'historical-v1','lineage_mismatch');
 assert.equal(state.financialMode,'test','financial_mode_mismatch');
 assert.equal(state.certifiedPayloadCommit,PAYLOAD,'candidate_mismatch');
 assert.equal(state.payloadProvenanceOk,true,'payload_provenance');
 assert.equal(state.migrationSha256,r.sha256,'migration_hash');
 assert.equal(state.databasePasswordAvailable,true,'managed_credential_required');
 const post=options.action==='PostVerify';
 assert.equal(state.installedCount,r.number-(post?0:1),'migration_count');
 assert.equal(state.hostedHead,post?r.version:r.predecessor,'migration_head');
 assert.deepEqual(state.pendingVersions,post?[]:[r.version],'pending_versions');
 assert.equal(state.storageStage,post?r.stage:r.stage-1,'storage_stage');
 assert.equal(state.storageContractOk,true,'storage_contract');
 assert.equal(state.predecessorVerified,true,'previous_stage_verification');
 assert.match(state.protectedAuthoritySha256??'',/^[0-9a-f]{64}$/);
 return true;
}
export function validateStorageRecovery(r,evidence,now,observation) {
 assert.equal(evidence?.schema,'forge.hosted-recovery-readiness.v2','management_api_evidence_required');
 return validateHostedRecoveryEvidence(evidence,{projectRef:PROJECT,approvalPrefix:`FORGE-STORAGE-${r.number}:`,targetVersion:r.version,apiObservation:observation,now});
}
