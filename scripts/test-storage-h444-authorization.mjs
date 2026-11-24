import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonical,sha256,LIMITS,validatePlan} from './lib/storage-h444-exporter.mjs';
import {validateAcquisitionAuthorization,PROTECTED_FINANCIAL_TABLES,authenticObservationSQL} from './lib/storage-h444-authorization.mjs';
import {syntheticExportFixture} from './fixtures/storage-h444-export-source.mjs';
const versions=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
function fixture(){
  const {plan}=syntheticExportFixture(versions);
  Object.assign(plan,{schema:'forge.h444-export-plan.v2',evidenceKind:'authentic-logical-acquisition',sourceProject:'wtvdjndyxegudufrompx'});
  Object.assign(plan.endpoint,{host:'db.wtvdjndyxegudufrompx.supabase.co',caFile:'/fixture/ca.crt'});
  for(const name of PROTECTED_FINANCIAL_TABLES)if(!plan.tables.some(t=>t.name===name))plan.tables.push({name,columns:['id']});
  plan.financialTables=[...PROTECTED_FINANCIAL_TABLES];
  plan.schemas=['auth','extensions','forge_meta','public','storage','supabase_migrations','tongs','vault'];
  const a={schema:'forge.h444-acquisition-approval.v1',allowedOperation:'read-only-h444-export-reuse-preserved-bodies',evidenceKind:'authentic-logical-acquisition',
    sourceProject:plan.sourceProject,candidate:plan.candidate,planSha256:sha256(canonical(plan)),principal:'reviewed_reader',clientImageId:'sha256:'+'a'.repeat(64),
    ownerApprovalReference:'SYNTHETIC_OWNER_NOT_APPROVAL',independentReviewer:'SYNTHETIC_REVIEWER',operator:'SYNTHETIC_OPERATOR',priorStopSupersededReference:'SYNTHETIC_STOP',
    scopeReviewReference:'SYNTHETIC_SCOPE',secretReviewReference:'SYNTHETIC_SECRET_REVIEW',riskAcceptanceReference:'SYNTHETIC_RISK',recoveryReference:'SYNTHETIC_RECOVERY',
    costApprovalReference:'SYNTHETIC_COST',costCeilingUsd:0,payer:'SYNTHETIC_PAYER',notBefore:new Date(Date.now()-1000).toISOString(),
    expiresAt:new Date(Date.now()+1800000).toISOString(),cleanupDeadline:new Date(Date.now()+3600000).toISOString(),
    destination:resolve('.git/forge-private-evidence/h444-acquisition/SYNTHETIC-NEVER-EXECUTE'),
    bodyDirectory:resolve('.git/forge-storage-investigation-20261113/accounting-repair/historical-bytes'),
    bodyReceiptsSha256:'5fdc1e5a24be1530acfc9b9975ba96bbec4370bbe249d43d33ceb512a89ae154',inventorySha256:'7e2813b2774533a5d84330e393923a23e6e17e8efabef2504683d822966e7b07',
    lineageSha256:'a'.repeat(64),historySha256:'b'.repeat(64),financialSha256:'c'.repeat(64),storageSha256:'d'.repeat(64),limits:{...LIMITS}};
  return {a,plan};
}
const seal=({a,plan})=>{a.planSha256=sha256(canonical(plan));const approvalBytes=Buffer.from(canonical(a));return {approvalBytes,approvedSha256:sha256(approvalBytes),head:plan.candidate,plan};};
test('authentic approval shape is separately pinned; validation alone performs no I/O',()=>{
  const f=fixture(),auth=seal(f);assert.equal(validateAcquisitionAuthorization(auth).allowedOperation,'read-only-h444-export-reuse-preserved-bodies');
  validatePlan(f.plan,f.a.planSha256,versions,auth);
  assert.equal(PROTECTED_FINANCIAL_TABLES.length,27);
  assert.match(authenticObservationSQL(),/storage_contract_ok/);
  assert.match(authenticObservationSQL(),/to_jsonb\(o\)-'last_accessed_at'/);
});
for(const [name,change] of [
  ['pooler fallback',f=>f.plan.endpoint.host='aws-0.invalid.pooler.supabase.com'],
  ['other source',f=>f.plan.sourceProject='anotherproject'],
  ['TLS downgrade',f=>f.plan.endpoint.sslmode='require'],
  ['incomplete financial scope',f=>f.plan.financialTables.pop()],
  ['historical receipt substitution',f=>f.a.bodyReceiptsSha256='0'.repeat(64)],
  ['historical inventory substitution',f=>f.a.inventorySha256='0'.repeat(64)],
  ['served destination',f=>f.a.destination=resolve('apps/nursery/public/evidence')],
  ['different preserved body location',f=>f.a.bodyDirectory=resolve('.git/other')],
  ['raised byte limit',f=>f.a.limits.bytes++],
  ['administrator principal',f=>f.a.principal='postgres'],
  ['missing stop override',f=>delete f.a.priorStopSupersededReference],
  ['self-review',f=>f.a.independentReviewer=f.a.operator],
  ['unbounded retention',f=>f.a.cleanupDeadline=new Date(Date.now()+9*86400000).toISOString()],
  ['expired approval',f=>f.a.expiresAt=new Date(0).toISOString()],
])test('rejects '+name+' even if the altered fixture is rehashed',()=>{const f=fixture();change(f);assert.throws(()=>validateAcquisitionAuthorization(seal(f)));});
test('refuses missing or substituted independent digest',()=>{
  const auth=seal(fixture());for(const approvedSha256 of [undefined,'0'.repeat(64)])assert.throws(()=>validateAcquisitionAuthorization({...auth,approvedSha256}));
});
