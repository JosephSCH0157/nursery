// Offline allowlist review only. No connection, credential or acquisition API.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {canonical,sha256,HISTORY_COLUMNS} from './lib/storage-h444-exporter.mjs';
import {checkExportScope} from './lib/storage-h444-secret-screen.mjs';
import {PROTECTED_FINANCIAL_TABLES} from './lib/storage-h444-authorization.mjs';
import {h444Versions,PREFIX_SHA256} from './lib/storage-h444-preflight.mjs';
import {REQUIRED_LOGICAL_ARTIFACTS} from './lib/storage-logical-restoration-certification.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
export function validateExtractionReviewPlan(plan,metadata){
  assert.equal(plan.schema,'forge.h444-extraction-review-plan.v1');
  assert.equal(plan.status,'NOT APPROVED — EXECUTION PROHIBITED');
  assert.equal(plan.sourceProject,'wtvdjndyxegudufrompx');
  assert.equal(plan.legacyManifestSha256,'9de7485012819a3b5b6fb5b70deb56229e176bd556200932e9b891bfd65e9614');
  assert.equal(metadata.sourceProject,plan.sourceProject);
  assert.equal(metadata.candidate,plan.preparedFromCandidate);
  assert.deepEqual(metadata.first.lineage,[{lineage:'historical-v1',singleton:true}]);
  assert.deepEqual(metadata.first.history,{head:'20261111201029',count:444,nullCount:0,distinctCount:444});
  assert.deepEqual(metadata.versions.value,h444Versions(),'exact_history_prefix');
  assert.equal(plan.historyVersionsSha256,PREFIX_SHA256);
  assert.deepEqual(plan.schemas,['auth','extensions','forge_meta','public','storage','supabase_migrations','tongs','vault']);
  assert.deepEqual(plan.financialTables,PROTECTED_FINANCIAL_TABLES,'protected_financial_scope');
  assert.deepEqual(plan.artifacts,REQUIRED_LOGICAL_ARTIFACTS);
  assert.equal(plan.sequenceEvidence,'NON_MVCC_OBSERVATIONS_ONLY');
  const relations=[...metadata.first.relations,...metadata.dependencies.relations];
  assert.equal(new Set(relations.map(r=>r.name)).size,relations.length);
  assert.equal(new Set(plan.tables.map(t=>t.name)).size,plan.tables.length);
  assert.deepEqual(plan.tables.map(t=>t.name).sort(),relations.map(r=>r.name).sort(),'relation_scope');
  checkExportScope(plan.tables);
  for(const table of plan.tables){
    assert.deepEqual(Object.keys(table).sort(),['columns','name']);
    assert.match(table.name,/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/);
    assert.equal(new Set(table.columns).size,table.columns.length);
    table.columns.forEach(c=>assert.match(c,/^[a-z_][a-z0-9_]*$/));
    const relation=relations.find(r=>r.name===table.name);
    assert.ok(['r','p'].includes(relation.kind),'base_table_required');
    const exclusions=plan.excludedColumnData.filter(e=>e.table===table.name);
    for(const excluded of exclusions){
      const column=relation.columns.find(c=>c.name===excluded.column);
      assert.ok(column,'unknown_column_exclusion');
      assert.ok(column.generated || (table.name==='auth.users'&&!table.columns.includes(column.name)),'ordinary_required_column_excluded');
    }
    assert.deepEqual([...table.columns].sort(),relation.columns.filter(c=>!exclusions.some(e=>e.column===c.name)).map(c=>c.name).sort(),'complete_column_projection');
    assert.ok(!table.columns.some(c=>relation.columns.find(a=>a.name===c)?.generated),'generated_insert_forbidden');
    if(table.name==='supabase_migrations.schema_migrations')assert.deepEqual(table.columns,HISTORY_COLUMNS);
    if(table.name==='auth.users')assert.deepEqual(table.columns,['instance_id','id','aud','role','email','email_confirmed_at','invited_at','last_sign_in_at','is_super_admin','created_at','updated_at','phone','phone_confirmed_at','banned_until','is_sso_user','deleted_at','is_anonymous'],'pinned_auth_projection');
    if(plan.financialTables.includes(table.name))assert.ok(exclusions.every(e=>relation.columns.find(c=>c.name===e.column).generated),'complete_financial_projection');
  }
  for(const name of PROTECTED_FINANCIAL_TABLES)assert.ok(plan.tables.some(t=>t.name===name),'missing_financial_relation');
  const edgeKey=e=>e.source+'|'+e.target;
  const observed=[...new Set([...metadata.first.foreignKeys,...metadata.dependencies.foreignKeys].map(edgeKey))].sort();
  assert.deepEqual(plan.foreignKeyDependencies.map(edgeKey).sort(),observed,'dependency_inventory');
  for(const edge of plan.foreignKeyDependencies)assert.ok(plan.tables.some(t=>t.name===edge.target),'missing_dependency');
  assert.deepEqual(Object.keys(plan.sourceObservationSql).sort(),['storage_authentic_predecessor.sql','storage_successor_hosted_release_contract.sql']);
  for(const [name,digest] of Object.entries(plan.sourceObservationSql))assert.equal(sha256(readFileSync(resolve(root,'supabase/tests',name),'utf8').replaceAll('\r\n','\n')),digest,'source_observation_sql_changed');
  return {status:'EXTRACTION_SCOPE_VALID',planSha256:sha256(canonical(plan)),tables:plan.tables.length,
    columns:plan.tables.reduce((n,t)=>n+t.columns.length,0),protectedFinancialRelations:plan.financialTables.length,
    acquisitionApproved:false,operationalPlanComplete:false,sourceValuesInspected:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  assert.equal(process.argv.length,4,'plan_and_metadata_paths_required');
  console.log(JSON.stringify(validateExtractionReviewPlan(JSON.parse(readFileSync(process.argv[2])),JSON.parse(readFileSync(process.argv[3])))));
}
