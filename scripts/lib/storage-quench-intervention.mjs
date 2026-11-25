// One closed security intervention. This module never connects, writes SQL,
// signs approvals, suppresses catalog differences, or permits another scope.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {convergenceSuccessor} from './storage-quench-successor.mjs';
export const INTERVENTION_SCHEMA='forge.h444-quench-acl-intervention.v1';
export const ACQUISITION_INTERVENTION_SCHEMA='forge.h444-acquisition-approval.v3';
export const LOGICAL_INTERVENTION_SCHEMA='forge.storage-h444-logical-restoration-approval.v3';
export const INTERVENTION_COMPLETION_SCHEMA='forge.storage-h444-448-logical-completion.v1';
export const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const digest=v=>createHash('sha256').update(v).digest('hex');
const hash=v=>assert.match(v??'',/^[a-f0-9]{64}$/,'intervention_digest');
const keys=(v,k)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),k.split(' ').sort(),'intervention_fields');};
const ref=v=>assert.ok(typeof v==='string'&&v.trim().length>=3&&v.length<=512,'intervention_reference');
export const QUENCH_FUNCTIONS=Object.freeze([
 {signature:'tongs.enqueue_youtube_publication_job(uuid,uuid,uuid)',identity:'tongs.enqueue_youtube_publication_job(p_publication_operation_id uuid, p_publication_attempt_id uuid, p_finalized_package_id uuid)',definitionSha256:'aa751eb4de581055b0b3284d566990336ad27b92e9a8ceaa8e079a85106ff7c7'},
 {signature:'tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb)',identity:'tongs.finalize_quench_destination_package(p_operation_key uuid, p_workspace_id uuid, p_workpiece_id uuid, p_executable_destination_id uuid, p_manifest_snapshot_id uuid, p_manifest_content_hash text, p_metadata_revision integer, p_metadata_content_hash text, p_destination_capability_revision_id uuid, p_resolved_package jsonb)',definitionSha256:'f535a58d9c2787b83810ce0d980427f345e45dc31d161553130191a54f89267d'},
 {signature:'tongs.retry_youtube_publication_stage(uuid,uuid,uuid)',identity:'tongs.retry_youtube_publication_stage(p_workspace_id uuid, p_workpiece_id uuid, p_publication_operation_id uuid)',definitionSha256:'d9cae8b90990d02245a74a2b527134ef03c046712f2dab75852d7229cd0e992f'},
]);
const versions=JSON.parse(readFileSync(new URL('../../docs/database/certification/storage-full-tail-446.json',import.meta.url))).migrations.slice(0,444).map(m=>m.version);
const catalogSql=readFileSync(new URL('../../supabase/tests/catalog/canonical_baseline_v1_contract_rows.sql',import.meta.url),'utf8').trim().replace(/;$/,'');
export const INTERVENTION_CATALOG_SQL=`SELECT coalesce(json_agg(r ORDER BY category COLLATE "C",identity COLLATE "C"),'[]') FROM (${catalogSql}) r`;
export const CATALOG_QUERY_SHA256=digest(catalogSql);
const observationSql=readFileSync(new URL('../../docs/database/proposals/h444-quench-public-execute-observation.sql',import.meta.url),'utf8');
export const QUENCH_OBSERVATION_SQL=observationSql.slice(observationSql.indexOf('WITH targets'),observationSql.indexOf('\nROLLBACK;')).trim().replace(/;$/,'');
export function catalogCommitment(rows){
 assert.ok(Array.isArray(rows)&&rows.length>3,'complete_catalog_required');
 const sorted=[...rows].sort((a,b)=>{const x=a.category+'|'+a.identity,y=b.category+'|'+b.identity;return x<y?-1:x>y?1:0;});
 const seen=new Set();
 const entries=sorted.map(r=>{keys(r,'category identity canonical');ref(r.category);assert.ok(typeof r.identity==='string'&&r.identity.length>0);assert.equal(typeof r.canonical,'string');const key=r.category+'|'+r.identity;assert.ok(!seen.has(key),'duplicate_catalog_identity');seen.add(key);return {category:r.category,identity:r.identity,sha256:digest(r.canonical)};});
 return {entries,sha256:digest(entries.map(e=>`${e.category}|${e.identity}|${e.sha256}`).join('\n'))};
}
function functionRecords(json,phase){
 assert.equal(typeof json,'string');const records=JSON.parse(json);assert.equal(records.length,3);
 records.forEach((r,i)=>{keys(r,'identity oid owner securityDefiner config definitionSha256 acl');const f=QUENCH_FUNCTIONS[i];assert.equal(r.identity,f.signature);assert.ok(Number.isSafeInteger(r.oid)&&r.oid>0);assert.equal(r.owner,'postgres');assert.equal(r.securityDefiner,true);assert.equal(r.definitionSha256,f.definitionSha256);
  assert.deepEqual(r.config,[i===1?'search_path=pg_catalog, tongs, extensions':'search_path=pg_catalog, tongs']);
  assert.deepEqual(r.acl,(phase==='before'?['PUBLIC','authenticated','postgres','service_role']:['authenticated','postgres','service_role']).map(grantee=>({grantee,grantor:'postgres',privilege:'EXECUTE',grantable:false})));
 });return records;
}
export function validateInterventionBinding(binding){
 keys(binding,'receiptSha256 authorizationSha256 originalCatalogSha256 correctedCatalogSha256');Object.values(binding).forEach(hash);return binding;
}
export function validateInterventionReceipt(bytes,binding,context){
 validateInterventionBinding(binding);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=64*1024*1024,'intervention_receipt_required');assert.equal(digest(bytes),binding.receiptSha256,'intervention_receipt_changed');
 const now=Number(new Date(context.now??Date.now()));assert.ok(Number.isFinite(now));
 const r=JSON.parse(bytes);keys(r,'schema sourceProject candidate authorization authorizationSha256 attempt before after originalCatalog correctedCatalog catalogQuerySha256 independentReview');
 assert.equal(r.schema,INTERVENTION_SCHEMA);assert.equal(r.sourceProject,context.sourceProject);assert.equal(r.candidate,context.candidate);
 const a=r.authorization;keys(a,'schema sourceProject candidate operation ownerApprovalReference securityNecessityReference operator independentReviewer reviewReference recoveryReference costApprovalReference costCeilingUsd notBefore expiresAt sqlSha256 observationSqlSha256 convergenceMigrationSha256 originalCatalogSha256 correctedCatalogSha256 beforeRecordsSha256 afterRecordsSha256 lineageSha256 historySha256 financialSha256 storageSha256');
 assert.equal(a.schema,'forge.h444-quench-acl-authorization.v1');assert.equal(a.operation,'revoke-three-quench-public-execute');assert.equal(a.sourceProject,r.sourceProject);assert.equal(a.candidate,r.candidate);
 assert.equal(digest(canonical(a)),r.authorizationSha256);assert.equal(r.authorizationSha256,binding.authorizationSha256);
 for(const k of ['ownerApprovalReference','securityNecessityReference','operator','independentReviewer','reviewReference','recoveryReference','costApprovalReference'])ref(a[k]);assert.notEqual(a.operator,a.independentReviewer);
 assert.ok(Number.isFinite(a.costCeilingUsd)&&a.costCeilingUsd>=0);
 const start=Date.parse(a.notBefore),end=Date.parse(a.expiresAt);assert.ok(Number.isFinite(start)&&end>start&&end-start<=30*60000,'intervention_window');
 assert.equal(a.sqlSha256,convergenceSuccessor.correctionSqlSha256);assert.equal(a.observationSqlSha256,convergenceSuccessor.observationSqlSha256);assert.equal(a.convergenceMigrationSha256,convergenceSuccessor.migration.sha256);
 keys(r.attempt,'authorizationSha256 sqlSha256 startedAt dispatchCount');assert.equal(r.attempt.authorizationSha256,r.authorizationSha256);assert.equal(r.attempt.sqlSha256,a.sqlSha256);assert.equal(r.attempt.dispatchCount,1);const dispatch=Date.parse(r.attempt.startedAt);assert.ok(dispatch>=start&&dispatch<end);
 const states=[];
 for(const phase of ['before','after']){
  const s=r[phase];keys(s,'sourceProject candidate observedAt snapshotId lineage historyColumns versions lineageSha256 historySha256 financialSha256 storageSha256 recordsJson recordsSha256 catalogSha256 transactionOutcome evidenceReference');
  assert.equal(s.sourceProject,r.sourceProject);assert.equal(s.candidate,r.candidate);assert.equal(s.lineage,'historical-v1');assert.deepEqual(s.versions,versions);assert.deepEqual(s.historyColumns,['created_by','idempotency_key','name','rollback','statements','version']);ref(s.snapshotId);ref(s.evidenceReference);
  const at=Date.parse(s.observedAt);assert.ok(Number.isFinite(at)&&at>=start&&at<=end&&at<=now);assert.ok(phase==='before'?at<=dispatch:at>=dispatch,'intervention_observation_order');
  assert.equal(s.transactionOutcome,phase==='before'?'READ_ONLY_ROLLED_BACK':'COMMIT_INDEPENDENTLY_POSTVERIFIED');
  for(const k of ['lineageSha256','historySha256','financialSha256','storageSha256']){hash(s[k]);assert.equal(s[k],a[k]);assert.equal(s[k],context[k],'intervention_protected_state_changed');}
  assert.equal(digest(s.recordsJson),s.recordsSha256);assert.equal(s.recordsSha256,a[phase+'RecordsSha256']);states.push(functionRecords(s.recordsJson,phase));
 }
 assert.notEqual(r.before.snapshotId,r.after.snapshotId,'fresh_committed_postverify_required');
 assert.deepEqual(states[1],states[0].map(x=>({...x,acl:x.acl.filter(a=>a.grantee!=='PUBLIC')})),'unexpected_acl_delta');
 assert.equal(r.catalogQuerySha256,CATALOG_QUERY_SHA256,'full_catalog_query_changed');
 const old=catalogCommitment(r.originalCatalog),corrected=catalogCommitment(r.correctedCatalog);
 assert.equal(old.sha256,binding.originalCatalogSha256);assert.equal(corrected.sha256,binding.correctedCatalogSha256);
 assert.equal(old.sha256,a.originalCatalogSha256);assert.equal(corrected.sha256,a.correctedCatalogSha256);assert.equal(old.sha256,r.before.catalogSha256);assert.equal(corrected.sha256,r.after.catalogSha256);
 const original=new Map(r.originalCatalog.map(x=>[x.category+'|'+x.identity,x]));const next=new Map(r.correctedCatalog.map(x=>[x.category+'|'+x.identity,x]));assert.deepEqual([...original.keys()].sort(),[...next.keys()].sort(),'catalog_membership_changed');
 const changed=[...original].filter(([k,v])=>v.canonical!==next.get(k).canonical).map(([k])=>k).sort();assert.deepEqual(changed,QUENCH_FUNCTIONS.map(f=>'function|'+f.identity).sort(),'unexpected_full_catalog_delta');
 for(const f of QUENCH_FUNCTIONS){const before=JSON.parse(original.get('function|'+f.identity).canonical),after=JSON.parse(next.get('function|'+f.identity).canonical);assert.equal(before.identity,f.identity);assert.equal(before.owner,'postgres');assert.equal(before.security_definer,true);assert.equal(digest(before.definition),f.definitionSha256);assert.deepEqual([...before.acl].sort(),['=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']);assert.deepEqual(after,{...before,acl:before.acl.filter(x=>x!=='=X/postgres')});}
 keys(r.independentReview,'reviewer reviewReference reviewedAt evidenceSha256 verdict');assert.equal(r.independentReview.reviewer,a.independentReviewer);ref(r.independentReview.reviewReference);assert.equal(r.independentReview.verdict,'PASS_COMMITTED_EXACT_ACL_DELTA');assert.equal(r.independentReview.evidenceSha256,digest(canonical(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='independentReview')))));assert.ok(Date.parse(r.independentReview.reviewedAt)>=Date.parse(r.after.observedAt)&&Date.parse(r.independentReview.reviewedAt)<=now,'intervention_review_time');
 return r;
}
export function validateInterventionSnapshot(receipt,observation,catalog){
 assert.equal(observation.found,3);assert.deepEqual(observation.records,JSON.parse(receipt.after.recordsJson),'intervention_runtime_function_drift');
 assert.equal(catalogCommitment(catalog).sha256,receipt.after.catalogSha256,'intervention_runtime_catalog_drift');return true;
}
export function validateOriginalQuenchSnapshot(observation){functionRecords(JSON.stringify(observation.records),'before');assert.equal(observation.found,3,'legacy_intervention_downgrade');}
