import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateExtractionReviewPlan} from './verify-h444-extraction-review-plan.mjs';
import {h444Versions} from './lib/storage-h444-preflight.mjs';
import {selectPreservedObjects} from './lib/storage-h444-preserved-bodies.mjs';
import {syntheticExportFixture} from './fixtures/storage-h444-export-source.mjs';
import {canonical,sha256,collectH444Export} from './lib/storage-h444-exporter.mjs';

const plan=JSON.parse(readFileSync(new URL('../docs/database/proposals/h444-extraction-review-plan.json',import.meta.url)));
function fixture(){
  // Synthetic catalog shape exercises the offline checker, not source authenticity.
  const relations=plan.tables.map(t=>({name:t.name,kind:'r',columns:[...t.columns.map(name=>({name,generated:''})),
    ...plan.excludedColumnData.filter(e=>e.table===t.name).map(e=>({name:e.column,generated:e.reason.startsWith('database-generated')?'s':''}))]}));
  return {plan:structuredClone(plan),metadata:{sourceProject:plan.sourceProject,candidate:plan.preparedFromCandidate,
    versions:{value:h444Versions()},first:{lineage:[{lineage:'historical-v1',singleton:true}],history:{head:'20261111201029',count:444,nullCount:0,distinctCount:444},relations,foreignKeys:plan.foreignKeyDependencies},dependencies:{relations:[],foreignKeys:[]}}};
}
test('review plan contains complete projected evidence without becoming execution approval',()=>{
  const f=fixture(),r=validateExtractionReviewPlan(f.plan,f.metadata);
  assert.equal(r.tables,110);assert.equal(r.columns,1459);assert.equal(r.protectedFinancialRelations,27);
  assert.equal(r.operationalPlanComplete,false);assert.equal(r.acquisitionApproved,false);
});
for(const [name,change] of [
  ['ordinary financial column omitted',f=>f.plan.tables.find(t=>t.name==='tongs.funding_reservations').columns.pop()],
  ['unobserved schema drift',f=>f.metadata.first.relations.find(t=>t.name==='tongs.funding_reservations').columns.push({name:'new_authority',generated:''})],
  ['missing FK evidence',f=>f.plan.foreignKeyDependencies.pop()],
  ['missing FK target',f=>{const name='tongs.hammer_transcription_provider_authorities';f.plan.tables=f.plan.tables.filter(t=>t.name!==name);f.metadata.first.relations=f.metadata.first.relations.filter(t=>t.name!==name);}],
  ['history column omitted',f=>f.plan.tables.find(t=>t.name==='supabase_migrations.schema_migrations').columns.pop()],
  ['Auth secret added',f=>f.plan.tables.find(t=>t.name==='auth.users').columns.push('encrypted_password')],
  ['Auth identity removed',f=>{f.plan.tables.find(t=>t.name==='auth.users').columns.splice(1,1);f.plan.excludedColumnData.push({table:'auth.users',column:'id'});}],
  ['generated value inserted',f=>{f.plan.tables.find(t=>t.name==='storage.objects').columns.push('path_tokens');f.plan.excludedColumnData=f.plan.excludedColumnData.filter(e=>e.column!=='path_tokens');}],
  ['changed source lineage',f=>f.metadata.first.lineage[0].lineage='baseline-v1'],
])test('rejects '+name,()=>{const f=fixture();change(f);assert.throws(()=>validateExtractionReviewPlan(f.plan,f.metadata));});

function storageFixture(){
  const objects=syntheticExportFixture(h444Versions()).transport.rows.get('storage.objects');
  const receipts=objects.map(o=>({object_id:o.id,path:o.name,version:o.version,etag:o.metadata.eTag,bytes:o.metadata.size,sha256:'a'.repeat(64)}));
  const bytes=Buffer.from(canonical(receipts));return {objects,bytes,hash:sha256(bytes)};
}
test('all Storage metadata survives while receipt IDs select only original bodies',()=>{
  const f=storageFixture(),extra={...f.objects[0],id:'ffffffff-ffff-4fff-8fff-ffffffffffff',name:'new-object'};
  const all=[...f.objects,extra],selected=selectPreservedObjects(all,f.bytes,f.hash);
  assert.equal(selected.length,475);assert.equal(all.length,476);assert.ok(!selected.includes(extra));
});
for(const [name,change] of [
  ['missing original',f=>f.objects.pop()],
  ['replacement version',f=>f.objects[0].version='new-version'],
  ['reused path with unrelated ID',f=>f.objects[0].id='ffffffff-ffff-4fff-8fff-ffffffffffff'],
  ['duplicate object identity',f=>f.objects.push({...f.objects[0]})],
  ['unapproved receipt bytes',f=>f.bytes=Buffer.from('[]')],
])test('rejects '+name,()=>{const f=storageFixture();change(f);assert.throws(()=>selectPreservedObjects(f.objects,f.bytes,f.hash));});
test('generated financial columns can be reproduced from schema; ordinary omissions still fail',async()=>{
  const f=syntheticExportFixture(h444Versions());
  f.transport.privilegeMutation=rows=>{const r=rows.find(r=>r.name===f.plan.financialTables[0]);r.actualColumns.push('computed_value');r.generatedColumns.push('computed_value');};
  await collectH444Export(f);
  const bad=syntheticExportFixture(h444Versions());
  bad.transport.privilegeMutation=rows=>rows.find(r=>r.name===bad.plan.financialTables[0]).actualColumns.push('ordinary_authority');
  await assert.rejects(collectH444Export(bad),/incomplete_financial_projection/);
});
