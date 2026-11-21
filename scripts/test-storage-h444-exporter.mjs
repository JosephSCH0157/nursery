import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {collectH444Export,sha256,canonical,BEGIN_SQL} from './lib/storage-h444-exporter.mjs';
import {syntheticExportFixture} from './fixtures/storage-h444-export-source.mjs';
import {validateLogicalArtifactDirectory,validateLogicalRestorationApproval,REQUIRED_LOGICAL_ARTIFACTS} from './lib/storage-logical-restoration-certification.mjs';
const versions=JSON.parse(readFileSync('docs/database/certification/storage-full-tail-446.json')).migrations.slice(0,444).map(m=>m.version);
const fixture=()=>syntheticExportFixture(versions);
const reseal=f=>{f.expectedPlanSha256=sha256(canonical(f.plan));return f;};

test('six artifacts pass the unchanged logical-directory contract without any restoration receipt',async()=>{
  const f=fixture(),b=await collectH444Export(f);
  assert.deepEqual([...b.files.keys()].sort(),[...REQUIRED_LOGICAL_ARTIFACTS].sort());
  const dir=mkdtempSync(join(tmpdir(),'forge-h444-export-fixture-'));
  try {
    for(const [name,bytes] of b.files)writeFileSync(join(dir,name),bytes,{flag:'wx',mode:0o600});
    await validateLogicalArtifactDirectory(dir,b.receipt,{sourceProject:f.plan.sourceProject,sourceSnapshotId:b.receipt.snapshotId,sourceObservationSha256:b.receipt.sourceObservationSha256});
    writeFileSync(join(dir,'data.sql'),'changed synthetic SQL');
    await assert.rejects(validateLogicalArtifactDirectory(dir,b.receipt,{sourceProject:f.plan.sourceProject,sourceSnapshotId:b.receipt.snapshotId}),/logical_artifact_size_mismatch|logical_artifact_bytes_changed/);
  }finally{
    assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep)&&dir.includes('forge-h444-export-fixture-'));
    rmSync(dir,{recursive:true,force:true});
  }
  assert.equal(f.transport.trace[0].sql,BEGIN_SQL);assert.equal(f.transport.closed,true);
  assert.deepEqual(f.transport.trace.at(-1),{kind:'close',rollback:true});
  const dumps=f.transport.trace.filter(t=>t.kind==='dump');assert.equal(dumps.length,2);
  for(const d of dumps){assert.equal(d.request.snapshotId,b.receipt.snapshotId);assert.ok(d.request.args.includes('--no-password'));assert.equal(d.request.environment.PGSSLMODE,'verify-full');}
  const acl=JSON.parse(b.files.get('role-and-acl-manifest.json'));
  assert.equal(acl.sequences.consistency,'NON_MVCC_OBSERVATIONS_ONLY');assert.equal(acl.sequences.values[0].lastValue,'9007199254740993');
  assert.doesNotMatch(b.files.get('data.sql').toString(),/setval\(/);
  assert.equal(b.receipt.acquisitionApproved,false);assert.equal(b.receipt.confidentialityVerified,false);
});

test('hashes are reproducible despite pg_dump randomized restriction keys',async()=>{
  const a=fixture(),b=fixture();a.transport.dumpNonce='AAA';b.transport.dumpNonce='BBB';
  const left=await collectH444Export(a),right=await collectH444Export(b);
  assert.deepEqual(left.receipt,right.receipt);for(const [n,v] of left.files)assert.deepEqual(v,right.files.get(n));
});

test('row SQL retains exact numeric JSON text, nulls and escaped literals',async()=>{
  const f=fixture();f.transport.rawRowsMutation=(name,rows)=>{if(name==='tongs.private_pricing_revisions')rows[0]=rows[0].replace('"synthetic authority"','12345678901234567890.123456789');};
  f.transport.rows.get('supabase_migrations.schema_migrations')[0].statements=["select 'quote'; \\ path\n-- synthetic"];
  const b=await collectH444Export(f);assert.match(b.files.get('data.sql').toString(),/12345678901234567890\.123456789/);
  assert.match(b.files.get('supabase-migrations-data.sql').toString(),/''quote''/);
});

test('dump normalization preserves function bodies and their original line endings',async()=>{
  const f=fixture();
  const body="CREATE FUNCTION fixture() RETURNS text LANGUAGE sql AS $body$\r\nSELECT 'literal\r\n\\restrict INNER\r\n\\unrestrict INNER';\r\n$body$;\r\n";
  f.transport.dump=async function*(){yield Buffer.from('\\restrict OUTER\r\n'+body+'\\unrestrict OUTER\r\n');};
  const b=await collectH444Export(f),sql=b.files.get('schema.sql').toString();
  assert.ok(sql.includes(body));assert.match(sql,/^\\restrict [a-f0-9]{64}\r\n/);assert.doesNotMatch(sql,/OUTER/);
});

for(const [name,dump,error] of [
  ['empty schema',Buffer.alloc(0),'invalid_schema_dump'],
  ['mismatched restriction keys',Buffer.from('\\restrict A\nSELECT 1;\n\\unrestrict B\n'),'dump_restrict_mismatch'],
  ['invalid UTF-8',Buffer.from([0xff]),'export_failed'],
])test('rejects '+name,async()=>{
  const f=fixture();f.transport.dump=async function*(){yield dump;};
  await assert.rejects(collectH444Export(f),new RegExp('^ExportHold: '+error+'$'));assert.equal(f.transport.closed,true);
});

for(const [name,mutate,error] of [
  ['authentic mode',f=>{f.mode='authentic';},'authentic_acquisition_not_approved'],
  ['nonfixture transport',f=>{f.transport.kind='postgres';},'authentic_acquisition_not_approved'],
  ['substituted plan',f=>{f.plan.candidate='0'.repeat(40);},'plan_digest_mismatch'],
  ['credential field in plan',f=>{f.plan.endpoint.password='SYNTHETIC_SECRET';reseal(f);},'unexpected_endpoint_fields'],
  ['secret column projection',f=>{f.plan.tables[0].columns=[...f.plan.tables[0].columns,'encrypted_password'];reseal(f);},'secret_scope_forbidden'],
  ['Vault table projection',f=>{f.plan.tables.push({name:'vault.secrets',columns:['id']});reseal(f);},'secret_scope_forbidden'],
  ['incomplete history columns',f=>{f.plan.tables.find(t=>t.name==='supabase_migrations.schema_migrations').columns=f.plan.tables.find(t=>t.name==='supabase_migrations.schema_migrations').columns.slice(1);reseal(f);},'missing_migration_columns'],
  ['unverified TLS chain',f=>{f.transport.connectionEvidence.chainVerified=false;},'verified_tls_required'],
  ['wrong TLS hostname',f=>{f.transport.connectionEvidence.host='evil.invalid';},'verified_tls_required'],
  ['TLS verify-ca downgrade',f=>{f.plan.endpoint.sslmode='verify-ca';reseal(f);},'verified_tls_required'],
  ['wrong CA identity',f=>{f.transport.connectionEvidence.caSha256='0'.repeat(64);},'verified_tls_required'],
  ['missing source column',f=>{f.transport.privilegeMutation=p=>p[0].actualColumns.pop();},'missing_source_columns'],
  ['SELECT denial',f=>{f.transport.privilegeMutation=p=>{p[0].selectAll=false;};},'inadequate_source_privileges'],
  ['RLS filtered export',f=>{f.transport.privilegeMutation=p=>{p[0].unfiltered=false;};},'inadequate_source_privileges'],
  ['incomplete financial projection',f=>{f.transport.privilegeMutation=p=>p.find(t=>t.name==='tongs.private_pricing_revisions').actualColumns.push('omitted_authority');},'incomplete_financial_projection'],
  ['wrong financial authority',f=>{f.transport.rows.get('tongs.private_pricing_revisions')[0].id='wrong';},'incomplete_financial_authority'],
  ['financial authority absent',f=>{f.transport.rows.set('tongs.openai_text_cost_policy_revisions',[]);},'incomplete_financial_authority'],
  ['duplicate history version',f=>{const r=f.transport.rows.get('supabase_migrations.schema_migrations');r[1].version=r[0].version;},'incomplete_history'],
  ['missing original history row',f=>{f.transport.rows.get('supabase_migrations.schema_migrations').pop();},'incomplete_history'],
  ['different lineage',f=>{f.transport.rows.get('forge_meta.database_lineage')[0].lineage='baseline-v1';},'source_lineage'],
  ['live mode',f=>{f.transport.financialMode='live';},'financial_mode'],
  ['wrong Storage version',f=>{f.transport.rows.get('storage.objects')[0].version='replacement';},'storage_identity_mismatch'],
  ['missing Storage object',f=>{f.transport.rows.get('storage.objects').pop();},'storage_inventory'],
  ['snapshot drift',f=>{f.transport.responseMutation=(r,sql)=>{if(sql.includes('has_column_privilege'))r.context.snapshot='401:402:';};},'inconsistent_snapshot'],
  ['session replacement',f=>{f.transport.responseMutation=(r,sql)=>{if(sql.includes('has_column_privilege'))r.context.pid++;};},'inconsistent_snapshot'],
  ['read-write transaction',f=>{f.transport.context.readOnly='off';},'unsafe_transaction'],
  ['read committed transaction',f=>{f.transport.context.isolation='read committed';},'unsafe_transaction'],
  ['source byte overflow',f=>{f.limits={bytes:100};},'capture_byte_limit'],
  ['source row overflow',f=>{f.limits={rowsPerTable:443};},'table_row_limit'],
  ['projected byte overflow',f=>{f.transport.responseMutation=(r,sql)=>{if(sql.includes('octet_length(j)'))r.value.rawBytes='134217729';};},'projected_byte_limit'],
  ['size and row disagreement',f=>{f.transport.responseMutation=(r,sql)=>{if(sql.includes('octet_length(j)'))r.value.rowCount++;};},'inconsistent_projection'],
  ['raised bounds',f=>{f.limits={queryMs:30001};},'invalid_bound'],
  ['bad snapshot identifier',f=>{f.transport.snapshotId="x';drop table";},'snapshot_provenance'],
  ['failed rollback/cleanup',f=>{f.transport.close=async()=>{throw Error('private cleanup detail');};},'cleanup_failed'],
])test('fails closed: '+name,async()=>{
  const f=fixture();mutate(f);await assert.rejects(collectH444Export(f),new RegExp('^ExportHold: '+error+'$'));
  if(f.transport.queryCount && error!=='cleanup_failed')assert.equal(f.transport.inTransaction,false,'failure must close owning session');
});

test('blocked source responses time out, cancel, clean up and publish no bundle',async()=>{
  const f=fixture();f.limits={queryMs:20};let aborted=false;
  f.transport.query=async function*(_,{signal}){await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));};
  await assert.rejects(collectH444Export(f),/operation_timeout/);assert.equal(aborted,true);assert.equal(f.transport.closed,true);
});

test('upstream errors never expose private source diagnostics',async()=>{
  const f=fixture();f.transport.dump=async function*(){throw Error('PASSWORD=secret private row');};
  await assert.rejects(collectH444Export(f),e=>e.message==='source_operation_failed'&&!e.stack.includes('secret'));
  assert.equal(f.transport.closed,true);
});

test('a cleanup timeout prevents returning completed artifacts',async()=>{
  const f=fixture();f.limits={queryMs:100};f.transport.close=()=>new Promise(()=>{});
  await assert.rejects(collectH444Export(f),/^ExportHold: cleanup_failed$/);
});

test('the session deadline also covers post-query cleanup',async()=>{
  const f=fixture();f.limits={sessionMs:200};
  const close=f.transport.close.bind(f.transport);f.transport.close=async options=>{await new Promise(resolve=>setTimeout(resolve,220));await close(options);};
  await assert.rejects(collectH444Export(f),/session_timeout/);assert.equal(f.transport.closed,true);
});

test('synthetic receipts cannot be mistaken for independently approved authentic restoration',async()=>{
  const b=await collectH444Export(fixture());const bytes=Buffer.from(JSON.stringify(b.receipt));
  assert.throws(()=>validateLogicalRestorationApproval(bytes,sha256(bytes)),/logical_approval_fields|ERR_ASSERTION/);
});
