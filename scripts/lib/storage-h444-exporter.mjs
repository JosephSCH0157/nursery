// Shared bounded collector. Authentic transport additionally requires independent acquisition approval.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {REQUIRED_LOGICAL_ARTIFACTS} from './storage-logical-restoration-certification.mjs';
import {validateAcquisitionAuthorization,authenticObservationSQL} from './storage-h444-authorization.mjs';
import {validateHistoricalObservation} from './storage-authentic-certification.mjs';
import {checkExportScope,screenExportValue} from './storage-h444-secret-screen.mjs';
import {selectPreservedObjects} from './storage-h444-preserved-bodies.mjs';

export const FIXTURE_PROJECT = 'syntheticfixtureonly';
export const HISTORY_COLUMNS = ['created_by','idempotency_key','name','rollback','statements','version'];
export const LIMITS = Object.freeze({queryMs:30000, dumpMs:180000, sessionMs:600000, lockMs:2000, bytes:128*1024*1024, rowsPerTable:100000});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);
const jsonBytes = value => Buffer.from(canonical(value)+'\n');
export class ExportHold extends Error { constructor(code) { super(code); this.name='ExportHold'; } }
const requireThat = (ok,code) => { if (!ok) throw new ExportHold(code); };
const exactKeys = (value,keys,code) => requireThat(value && canonical(Object.keys(value).sort())===canonical([...keys].sort()),code);
const ident = value => { requireThat(typeof value==='string' && /^[a-z_][a-z0-9_]*$/.test(value),'invalid_identifier'); return '"'+value+'"'; };
const qualified = name => { requireThat(typeof name==='string' && name.split('.').length===2,'invalid_relation'); return name.split('.').map(ident).join('.'); };
const literal = value => "'"+String(value).replaceAll("'","''")+"'";
const hashRows = rows => sha256(rows.join('\n'));
const identityKeys = ['id','bucket_id','name','version','metadata','owner','owner_id','user_metadata','created_at'];
export function storageIdentityDigest(rows) {
  return sha256(canonical(rows.map(r=>Object.fromEntries(identityKeys.map(k=>[k,r[k]]))).sort((a,b)=>a.id<b.id?-1:1)));
}

const authorities = [
  ['pricing','tongs.private_pricing_revisions',{id:'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'}],
  ['rollout','tongs.openai_text_rollout_revisions',{route_code:'hearth.chat_completion',revision:12}],
  ['costPolicy','tongs.openai_text_cost_policy_revisions',{id:'10000000-0000-4000-8000-000000000010'}],
  ['rateCondition','tongs.openai_text_rate_condition_revisions',{id:'51100000-0000-4000-8000-000000000004'}],
];
export const FINANCIAL_AUTHORITIES = authorities;

export function validatePlan(plan, expectedDigest, versions, authorization) {
  const authentic=plan?.evidenceKind==='authentic-logical-acquisition';
  if(authentic)validateAcquisitionAuthorization({...authorization,plan});
  requireThat(sha256(canonical(plan))===expectedDigest,'plan_digest_mismatch');
  exactKeys(plan,['schema','evidenceKind','sourceProject','candidate','historyVersionsSha256','tables','schemas','financialTables','storageIdentitySha256','tools','endpoint'],'unexpected_plan_fields');
  exactKeys(plan.endpoint,['host','port','database','sslmode','caFile','caSha256'],'unexpected_endpoint_fields');
  exactKeys(plan.tools,['psqlSha256','pgDumpSha256'],'unexpected_tool_fields');
  requireThat(authentic || (plan.schema==='forge.h444-export-plan.v1' && plan.evidenceKind==='synthetic-offline'),'authentic_acquisition_not_approved');
  requireThat((authentic || plan.sourceProject===FIXTURE_PROJECT) && /^[a-f0-9]{40}$/.test(plan.candidate),'source_identity');
  requireThat(Array.isArray(versions) && versions.length===444 && versions.at(-1)==='20261111201029'
    && new Set(versions).size===444 && versions.every((v,i)=>!i||versions[i-1]<v),'history_prefix');
  requireThat(plan.historyVersionsSha256===sha256(versions.join('\n')),'history_manifest');
  requireThat(Array.isArray(plan.tables) && plan.tables.length>0,'table_scope');
  requireThat(new Set(plan.tables.map(t=>t.name)).size===plan.tables.length,'duplicate_table');
  for(const t of plan.tables) {
    exactKeys(t,['name','columns'],'unexpected_table_fields');
    qualified(t.name);
    requireThat(Array.isArray(t.columns)&&t.columns.length>0&&new Set(t.columns).size===t.columns.length,'column_scope');
    t.columns.forEach(ident);
  }
  checkExportScope(plan.tables);
  const table = name => plan.tables.find(t=>t.name===name);
  requireThat(canonical(table('supabase_migrations.schema_migrations')?.columns)===canonical(HISTORY_COLUMNS),'missing_migration_columns');
  for(const name of ['forge_meta.database_lineage','storage.objects',...authorities.map(a=>a[1])])requireThat(table(name),'missing_required_table');
  for(const key of [...identityKeys,'updated_at','last_accessed_at'])requireThat(table('storage.objects').columns.includes(key),'missing_storage_columns');
  requireThat(table('forge_meta.database_lineage').columns.includes('lineage') && table('forge_meta.database_lineage').columns.includes('singleton'),'lineage_projection');
  requireThat(Array.isArray(plan.financialTables) && plan.financialTables.length>0 && new Set(plan.financialTables).size===plan.financialTables.length,'financial_scope');
  for(const name of plan.financialTables)requireThat(table(name),'financial_scope_missing_table');
  for(const [,name,selector] of authorities) {
    requireThat(plan.financialTables.includes(name),'missing_financial_authority');
    for(const key of Object.keys(selector))requireThat(table(name).columns.includes(key),'missing_financial_column');
  }
  requireThat(/^[a-f0-9]{64}$/.test(plan.storageIdentitySha256),'storage_identity_commitment');
  requireThat(canonical(plan.schemas)===canonical(authentic?['auth','extensions','forge_meta','public','storage','supabase_migrations','tongs','vault']:[...new Set(plan.tables.map(t=>t.name.split('.')[0]))].sort()),'schema_scope');
  requireThat(plan.tools?.psqlSha256?.match(/^[a-f0-9]{64}$/) && plan.tools?.pgDumpSha256?.match(/^[a-f0-9]{64}$/),'tool_provenance');
  requireThat((authentic || plan.endpoint?.host==='fixture.invalid') && plan.endpoint.port===5432 && plan.endpoint.database==='postgres','endpoint_scope');
  requireThat(plan.endpoint.sslmode==='verify-full' && /^[a-f0-9]{64}$/.test(plan.endpoint.caSha256),'verified_tls_required');
  requireThat(plan.endpoint.caFile && !/[\r\n\0]/.test(plan.endpoint.caFile),'ca_file_required');
}

// Connection arguments are prepared, never launched here. There is no credential
// resolver or network client in this module. A future launcher requires review.
export function dumpRequest(plan, snapshotId, migrationSchema) {
  requireThat(/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-[A-Fa-f0-9]+$/.test(snapshotId),'invalid_snapshot_id');
  const schemas = migrationSchema ? ['supabase_migrations'] : plan.schemas.filter(s=>s!=='supabase_migrations');
  return {
    args:['--format=plain','--schema-only','--quote-all-identifiers','--no-password',
      '--lock-wait-timeout='+LIMITS.lockMs,'--snapshot='+snapshotId,...schemas.map(s=>'--schema='+s)],
    environment:{PGHOST:plan.endpoint.host,PGPORT:String(plan.endpoint.port),PGDATABASE:plan.endpoint.database,
      PGSSLMODE:'verify-full',PGSSLROOTCERT:plan.endpoint.caFile,PGCONNECT_TIMEOUT:'10',
      PGOPTIONS:'-c default_transaction_read_only=on -c row_security=off -c statement_timeout=180000 -c lock_timeout=2000'},
    snapshotId, schemas, executableSha256:plan.tools.pgDumpSha256,
  };
}

const contextSQL = "json_build_object('pid',pg_backend_pid(),'snapshot',pg_current_snapshot()::text,'isolation',current_setting('transaction_isolation'),'readOnly',current_setting('transaction_read_only'),'database',current_database(),'role',current_user,'serverVersion',current_setting('server_version'),'ssl',coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false))";
export const BEGIN_SQL = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout=30000; SET LOCAL lock_timeout=2000; SET LOCAL idle_in_transaction_session_timeout=600000; SET LOCAL row_security=off; SET LOCAL standard_conforming_strings=on; SET LOCAL TIME ZONE \'UTC\'; SET LOCAL datestyle=\'ISO,YMD\'; SET LOCAL extra_float_digits=3; SET LOCAL search_path=pg_catalog;';
const frameSQL = expression => 'SELECT json_build_object(\'context\','+contextSQL+',\'value\',('+expression+'));';
function rowProjection(table,maxRows) {
  requireThat(Number.isSafeInteger(maxRows)&&maxRows>0&&maxRows<=LIMITS.rowsPerTable,'invalid_row_bound');
  return '(select row_to_json(r)::text j from (select '+table.columns.map(ident).join(',')+' from '+qualified(table.name)+' limit '+(maxRows+1)+') r) rows';
}
export function rowsSQL(table,maxRows=LIMITS.rowsPerTable) {
  return frameSQL("select coalesce(json_agg(j order by j collate \"C\"),'[]'::json) from "+rowProjection(table,maxRows));
}
function sizeSQL(table,maxRows) {
  return frameSQL("select json_build_object('rowCount',count(*),'rawBytes',coalesce(sum(octet_length(j)),0)::text) from "+rowProjection(table,maxRows));
}
function privilegeSQL(plan) {
  const values=plan.tables.map(t=>'('+literal(t.name)+',ARRAY['+t.columns.map(literal).join(',')+']::text[])').join(',');
  return frameSQL("select json_agg(json_build_object('name',p.name,'columns',p.cols,'present',c.oid is not null,'schemaUsage',has_schema_privilege(current_user,n.oid,'USAGE'),'selectAll',not exists(select 1 from unnest(p.cols) col where not coalesce(has_column_privilege(current_user,c.oid,col,'SELECT'),false)),'unfiltered',not c.relrowsecurity or r.rolsuper or r.rolbypassrls or (c.relowner=r.oid and not c.relforcerowsecurity),'actualColumns',(select json_agg(attname order by attnum) from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped),'generatedColumns',(select coalesce(json_agg(attname order by attnum),'[]'::json) from pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped and attgenerated<>''))) from (values "+values+") p(name,cols) left join pg_class c on c.oid=to_regclass(p.name) left join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where r.rolname=current_user");
}
const rolesSQL = frameSQL("select json_build_object('roles',(select json_agg(json_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls) order by rolname) from pg_roles),'memberships',(select json_agg(json_build_object('role',roleid::regrole::text,'member',member::regrole::text,'grantor',grantor::regrole::text,'admin',admin_option) order by roleid,member,grantor) from pg_auth_members),'defaultAcls',(select json_agg(json_build_object('role',defaclrole::regrole::text,'namespace',defaclnamespace,'type',defaclobjtype,'acl',defaclacl) order by defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl))");

function normalizeDump(bytes) {
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  requireThat(text.trim().length>0 && !text.includes('\0'),'invalid_schema_dump');
  const lines=text.split('\n');
  const meaningful=lines.map((s,i)=>({s,i})).filter(({s})=>s.trim()&&!s.trimStart().startsWith('--'));
  const first=meaningful[0],last=meaningful.at(-1);
  const open=/^\\restrict ([A-Za-z0-9]+)(\r?)$/.exec(first?.s??'');
  if(!open){requireThat(!/^\\unrestrict /.test(last?.s??''),'dump_restrict_mismatch');return Buffer.from(text);}
  requireThat(last?.s.replace(/\r$/,'')==='\\unrestrict '+open[1] && first.i<last.i,'dump_restrict_mismatch');
  // pg_dump's randomized psql restriction key is transport scaffolding, not DDL.
  // Keep the restriction commands paired, with a reproducible content-derived key.
  // Change only the outer pg_dump scaffold, never similar lines in function bodies.
  const body=lines.filter((_,i)=>i!==first.i&&i!==last.i).join('\n');
  const key=sha256(body);lines[first.i]='\\restrict '+key+open[2];lines[last.i]='\\unrestrict '+key+(last.s.endsWith('\r')?'\r':'');
  return Buffer.from(lines.join('\n'));
}

function dataSql(tables,rows,authentic=false) {
  const parts=[(authentic?"-- Approved acquisition; restoration requires separate authorization.":"-- Synthetic preparation output; NOT AUTHENTIC EVIDENCE.")+"\nSET standard_conforming_strings = on;\n"];
  for(const t of [...tables].sort((a,b)=>a.name<b.name?-1:1)) {
    const cols=t.columns.map(ident).join(',');
    for(const row of rows.get(t.name))parts.push('INSERT INTO '+qualified(t.name)+' ('+cols+') OVERRIDING SYSTEM VALUE SELECT '+cols+' FROM jsonb_populate_record(NULL::'+qualified(t.name)+','+literal(row)+'::jsonb);\n');
  }
  return Buffer.from(parts.join(''));
}

export async function collectH444Export({mode,transport,plan,expectedPlanSha256,versions,limits={},authorization,receiptBytes,acquireBodies,sessionDeadline=Infinity}) {
  const authentic=mode==='authentic-acquisition';
  const approved=authorization?validateAcquisitionAuthorization({...authorization,plan,synthetic:!authentic}):null;
  requireThat(authentic ? approved && transport?.kind==='approved-postgresql' : mode==='synthetic-offline' && transport?.kind==='synthetic-fixture','authentic_acquisition_not_approved');
  validatePlan(plan,expectedPlanSha256,versions,authorization);
  if(approved)requireThat(canonical(limits)===canonical(approved.limits),'approved_limits_changed');
  const budget={...LIMITS,...limits};
  for(const k of Object.keys(budget))requireThat(Number.isSafeInteger(budget[k])&&budget[k]>0&&budget[k]<=LIMITS[k],'invalid_bound');
  const started=performance.now(); let consumed=0,anchor,beginAttempted=false;
  const operations=[];
  async function bounded(kind,input,timeoutMs) {
    const controller=new AbortController();let timer;
    const duration=Math.min(timeoutMs,budget.sessionMs-(performance.now()-started),sessionDeadline-Date.now());
    requireThat(duration>0,'session_timeout');
    if(approved)requireThat(Date.now()<Date.parse(approved.expiresAt),'acquisition_expired');
    try {
      return await Promise.race([
        (async()=>{
          const chunks=[];let length=0;
          for await(const chunk of transport[kind](input,{signal:controller.signal,timeoutMs:duration,maxBytes:budget.bytes-consumed})) {
            requireThat(Buffer.isBuffer(chunk)||chunk instanceof Uint8Array,'invalid_transport_chunk');
            length+=chunk.length; consumed+=chunk.length;
            requireThat(consumed<=budget.bytes,'capture_byte_limit'); chunks.push(Buffer.from(chunk));
          }
          const bytes=Buffer.concat(chunks,length);
          // Dump hashes belong to the normalized final artifacts; recording the
          // randomized transport key here would make the consistency proof vary.
          operations.push({kind,inputSha256:sha256(typeof input==='string'?input:canonical(input)),
            ...(kind==='query'?{outputSha256:sha256(bytes)}:{}),bytes:length});
          return bytes;
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ExportHold('operation_timeout'));},duration);}),
      ]);
    } catch(e) { controller.abort(); throw e instanceof ExportHold?e:new ExportHold('source_operation_failed'); }
    finally {clearTimeout(timer);}
  }
  function checkContext(c) {
    requireThat(c?.readOnly==='on'&&c.isolation==='repeatable read'&&c.database===plan.endpoint.database&&c.ssl===true,'unsafe_transaction');
    requireThat(Number.isSafeInteger(c.pid)&&c.pid>0&&typeof c.snapshot==='string'&&c.snapshot.length>0&&c.role&&c.serverVersion,'source_provenance_missing');
    if(anchor)requireThat(canonical(c)===canonical(anchor),'inconsistent_snapshot');
    else anchor=c;
  }
  async function query(sql) {
    let f;try{f=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded('query',sql,budget.queryMs)));}
    catch(e){throw e instanceof ExportHold?e:new ExportHold('invalid_source_response');}
    checkContext(f.context);return f.value;
  }
  let bundle;
  try {
    const peer=transport.connectionEvidence;
    requireThat(peer?.host===plan.endpoint.host&&peer.port===plan.endpoint.port&&peer.database===plan.endpoint.database
      &&peer.sslmode==='verify-full'&&peer.hostnameVerified===true&&peer.chainVerified===true&&peer.caSha256===plan.endpoint.caSha256
      &&peer.psqlSha256===plan.tools.psqlSha256,'verified_tls_required');
    beginAttempted=true;await bounded('query',BEGIN_SQL,budget.queryMs);
    const start=await query(frameSQL("select json_build_object('snapshotId',pg_export_snapshot(),'at',clock_timestamp())"));
    requireThat(/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-[A-Fa-f0-9]+$/.test(start.snapshotId)&&Number.isFinite(Date.parse(start.at)),'snapshot_provenance');
    const privileges=await query(privilegeSQL(plan));
    requireThat(Array.isArray(privileges)&&privileges.length===plan.tables.length&&new Set(privileges.map(p=>p.name)).size===plan.tables.length,'privilege_inventory');
    for(const t of plan.tables){const p=privileges.find(p=>p.name===t.name);requireThat(p?.present===true&&p.schemaUsage===true&&p.selectAll===true&&p.unfiltered===true,'inadequate_source_privileges');requireThat(t.columns.every(c=>p.actualColumns?.includes(c)),'missing_source_columns');
      if(plan.financialTables.includes(t.name)||(approved&&['forge_meta.database_lineage','storage.objects','supabase_migrations.schema_migrations'].includes(t.name))){
        // Generated values are reproduced by the captured schema; PostgreSQL does
        // not permit explicit INSERT values for them. Every ordinary column stays required.
        requireThat(Array.isArray(p.generatedColumns)&&p.generatedColumns.every(c=>p.actualColumns.includes(c)),'generated_column_inventory');
        requireThat(canonical(p.actualColumns.filter(c=>!p.generatedColumns.includes(c)).sort())===canonical([...t.columns].sort()),'incomplete_financial_projection');
      }}
    let authenticObservation,auxiliary;
    if(approved){
      authenticObservation=await query(frameSQL(authenticObservationSQL()));
      try{validateHistoricalObservation(approved,authenticObservation,versions,444);}catch{throw new ExportHold('approved_source_fingerprint_changed');}
    }
    const rows=new Map(),parsed=new Map();let projectedBytes=0n;
    for(const t of [...plan.tables].sort((a,b)=>a.name<b.name?-1:1)) {
      const size=await query(sizeSQL(t,budget.rowsPerTable));
      requireThat(Number.isSafeInteger(size?.rowCount)&&size.rowCount>=0&&size.rowCount<=budget.rowsPerTable&&/^[0-9]+$/.test(size.rawBytes),'table_row_limit');
      projectedBytes+=BigInt(size.rawBytes);requireThat(projectedBytes<=BigInt(budget.bytes),'projected_byte_limit');
      const values=await query(rowsSQL(t,budget.rowsPerTable));requireThat(Array.isArray(values)&&values.every(r=>typeof r==='string'),'row_projection');
      requireThat(values.length===size.rowCount&&values.reduce((s,r)=>s+BigInt(Buffer.byteLength(r)),0n)===BigInt(size.rawBytes),'inconsistent_projection');
      const objects=values.map(r=>{try{return JSON.parse(r);}catch{throw new ExportHold('invalid_row_json');}});
      screenExportValue(objects);
      for(const row of objects)requireThat(row&&canonical(Object.keys(row).sort())===canonical([...t.columns].sort()),'incomplete_row_projection');
      rows.set(t.name,values);parsed.set(t.name,objects);
    }
    const history=parsed.get('supabase_migrations.schema_migrations');
    requireThat(history.length===444&&canonical(history.map(r=>r.version).sort())===canonical(versions),'incomplete_history');
    const lineage=parsed.get('forge_meta.database_lineage');
    requireThat(lineage.length===1&&lineage[0].singleton===true&&lineage[0].lineage==='historical-v1','source_lineage');
    const counts={};for(const [key,name,selector] of authorities){counts[key]=parsed.get(name).filter(r=>Object.entries(selector).every(([k,v])=>r[k]===v)).length;requireThat(counts[key]===1,'incomplete_financial_authority');}
    // The source financial-mode function is read within the same transaction.
    requireThat(await query(frameSQL('select tongs._current_financial_environment()'))==='test','financial_mode');
    // Preserve ALL Storage metadata rows in data.sql and its canonical fingerprint.
    // Only the independently pinned original receipt IDs identify the 475 bodies.
    const storage=approved?selectPreservedObjects(parsed.get('storage.objects'),receiptBytes,approved.bodyReceiptsSha256):parsed.get('storage.objects');
    requireThat(storage.length===475&&new Set(storage.map(r=>r.id)).size===475,'storage_inventory');
    requireThat(storage.every(r=>/^[0-9]+$/.test(String(r.metadata?.size)))&&storage.reduce((s,r)=>s+BigInt(r.metadata.size),0n)===447475n,'storage_bytes');
    requireThat(storageIdentityDigest(storage)===plan.storageIdentitySha256,'storage_identity_mismatch');
    if(approved){
      requireThat(typeof acquireBodies==='function','preserved_bodies_required');
      auxiliary=await acquireBodies(storage,start.snapshotId);
    }
    const roles=await query(rolesSQL);
    requireThat(Array.isArray(roles?.roles)&&roles.roles.length>0&&Object.hasOwn(roles,'memberships')&&Object.hasOwn(roles,'defaultAcls'),'role_acl_inventory');
    const sequenceNames=await query(frameSQL("select coalesce(json_agg(json_build_object('schema',schemaname,'name',sequencename) order by schemaname,sequencename),'[]'::json) from pg_sequences where schemaname in ("+plan.schemas.map(literal).join(',')+')'));
    requireThat(Array.isArray(sequenceNames),'sequence_inventory');const sequences=[];
    for(const s of sequenceNames){requireThat(plan.schemas.includes(s.schema),'sequence_scope');const observation=await query(frameSQL('select json_build_object(\'lastValue\',last_value::text,\'isCalled\',is_called,\'observedAt\',clock_timestamp()) from '+qualified(s.schema+'.'+s.name)));requireThat(/^-?[0-9]+$/.test(observation.lastValue)&&typeof observation.isCalled==='boolean'&&Number.isFinite(Date.parse(observation.observedAt)),'sequence_observation');sequences.push({...s,...observation});}
    const files=new Map();
    for(const migration of [false,true]){
      const bytes=normalizeDump(await bounded('dump',dumpRequest(plan,start.snapshotId,migration),budget.dumpMs));
      screenExportValue(bytes);files.set(migration?'supabase-migrations-schema.sql':'schema.sql',bytes);
    }
    files.set('data.sql',dataSql(plan.tables.filter(t=>t.name!=='supabase_migrations.schema_migrations'),rows,authentic));
    files.set('supabase-migrations-data.sql',dataSql(plan.tables.filter(t=>t.name==='supabase_migrations.schema_migrations'),rows,authentic));
    const end=await query(frameSQL('select clock_timestamp()'));
    requireThat(Number.isFinite(Date.parse(end))&&Date.parse(end)>=Date.parse(start.at),'snapshot_time_order');
    const sourceObservation={schema:'forge.storage-h444-logical-source-observation.v1',sourceProject:plan.sourceProject,snapshotId:start.snapshotId,
      observation:{lineage:'historical-v1',lineageSha256:hashRows(rows.get('forge_meta.database_lineage')),historyColumns:HISTORY_COLUMNS,versions,
        originalHistorySha256:hashRows(rows.get('supabase_migrations.schema_migrations')),
        financialSha256:sha256(canonical([...plan.financialTables].sort().map(n=>[n,rows.get(n)]))),storageSha256:hashRows(rows.get('storage.objects')),
        financialMode:'test',requiredFinancialRecords:counts,
        provenance:{evidenceKind:plan.evidenceKind,candidate:plan.candidate,planSha256:expectedPlanSha256,storageIdentitySha256:plan.storageIdentitySha256,exporterSha256:sha256(readFileSync(new URL(import.meta.url))),endpoint:plan.endpoint,
          tools:plan.tools,transport:transport.provenance??{executionClass:'in-memory-fixture'},transaction:anchor,operations,snapshotStartedAt:start.at,snapshotCompletedAt:end}}};
    if(approved){const provenance=sourceObservation.observation.provenance;sourceObservation.observation={...authenticObservation,provenance:{...provenance,acquisitionApprovalSha256:authorization.approvedSha256}};}
    const sourceBytes=jsonBytes(sourceObservation);
    files.set('role-and-acl-manifest.json',jsonBytes({schema:'forge.h444-role-acl-export.v1',evidenceKind:plan.evidenceKind,snapshotId:start.snapshotId,
      rolesAndMemberships:roles,relationPrivileges:privileges,ddlAclFiles:['schema.sql','supabase-migrations-schema.sql'],
      sequences:{consistency:'NON_MVCC_OBSERVATIONS_ONLY',values:sequences,restorationInstructionsIncluded:false}}));
    const artifacts=()=>[...files].map(([name,bytes])=>({name,snapshotId:start.snapshotId,sha256:sha256(bytes),sizeBytes:bytes.length})).sort((a,b)=>a.name<b.name?-1:1);
    const proof={schema:'forge.storage-h444-logical-snapshot-consistency.v1',sourceProject:plan.sourceProject,snapshotId:start.snapshotId,
      consistencyMethod:'single-transaction-snapshot',snapshotStartedAt:start.at,snapshotCompletedAt:end,
      databaseSnapshotId:start.snapshotId,migrationHistorySnapshotId:start.snapshotId,financialStateSnapshotId:start.snapshotId,storageMetadataSnapshotId:start.snapshotId,
      sourceObservationSha256:sha256(sourceBytes),artifactSetSha256:sha256(JSON.stringify(artifacts().map(a=>[a.name,a.sha256,a.sizeBytes])))};
    files.set('snapshot-consistency.json',jsonBytes(proof));
    requireThat(canonical([...files.keys()].sort())===canonical([...REQUIRED_LOGICAL_ARTIFACTS].sort()),'artifact_membership');
    requireThat([...files.values()].reduce((s,b)=>s+b.length,0)<=budget.bytes,'artifact_byte_limit');
    // No productionSecretsIncluded assertion: preparation does not perform an
    // approved authentic secret screen. This receipt cannot pass the authentic
    // restoration validator, even though its six artifact/proof shapes match.
    let receipt={schema:'forge.h444-synthetic-export-receipt.v1',evidenceKind:'synthetic-offline',sourceProject:plan.sourceProject,
      snapshotId:start.snapshotId,consistencyMethod:'single-transaction-snapshot',snapshotStartedAt:start.at,snapshotCompletedAt:end,
      consistencyProofSha256:sha256(files.get('snapshot-consistency.json')),sourceObservationSha256:sha256(sourceBytes),artifacts:artifacts(),
      acquisitionApproved:false,confidentialityVerified:false};
    if(authentic){const {evidenceKind,acquisitionApproved,confidentialityVerified,...logical}=receipt;receipt={...logical,schema:'forge.storage-h444-logical-export-receipt.v1',productionSecretsIncluded:false};}
    bundle={files,sourceObservationBytes:sourceBytes,receipt,...(auxiliary?{auxiliary}:{})};
  } catch(e) { throw e instanceof ExportHold?e:new ExportHold('export_failed'); }
  finally {
    // Close must cancel/drain any failed operation, rollback the owning session,
    // and reap dump clients. A timeout/failure here prevents publishing a bundle.
    let timer;try{await Promise.race([transport.close({rollback:beginAttempted}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ExportHold('cleanup_timeout')),Math.min(budget.queryMs,5000));})]);}
    catch{throw new ExportHold('cleanup_failed');}finally{clearTimeout(timer);}
  }
  requireThat(performance.now()-started<=budget.sessionMs,'session_timeout');
  return bundle;
}
