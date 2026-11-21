// Metadata-only H444 preparation. Execution remains confined to synthetic fixtures.
// No exporter collection, dumps, credentials, hosted adapter or authorization override.
import {readFileSync} from 'node:fs';
import {ExportHold,canonical,sha256,HISTORY_COLUMNS,FINANCIAL_AUTHORITIES} from './storage-h444-exporter.mjs';

export const PREFLIGHT_LIMITS=Object.freeze({queryMs:30000,lockMs:2000,idleMs:60000,sessionMs:120000,bytes:65536});
export const PREFIX_SHA256='b6642437f694d11e9ca29fb82046f556e699f7952a7e33f1f10916b71afeecc1';
const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
export function h444Versions(){
  const contract=JSON.parse(readFileSync(new URL('../../docs/database/certification/storage-full-tail-446.json',import.meta.url)));
  const versions=contract.migrations.slice(0,444).map(m=>m.version);
  hold(versions.length===444&&versions.at(-1)==='20261111201029'&&sha256(versions.join('\n'))===PREFIX_SHA256,'preflight_prefix_contract');
  return versions;
}
export const REQUIRED_METADATA=Object.freeze([
  {name:'forge_meta.database_lineage',columns:['singleton','lineage'],read:['singleton','lineage']},
  {name:'supabase_migrations.schema_migrations',columns:HISTORY_COLUMNS,read:['version']},
  {name:'storage.objects',columns:['id','bucket_id','name','version','metadata','owner','owner_id','user_metadata','created_at','updated_at','last_accessed_at'],read:[]},
  ...FINANCIAL_AUTHORITIES.map(([,name,selector])=>({name,columns:Object.keys(selector),read:[]})),
]);
const context="json_build_object('pid',pg_backend_pid(),'snapshot',pg_current_snapshot()::text,'isolation',current_setting('transaction_isolation'),'readOnly',current_setting('transaction_read_only'),'database',current_database(),'role',current_user,'serverVersion',current_setting('server_version'),'ssl',coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false))";
const frame=value=>"SELECT json_build_object('context',"+context+",'value',("+value+"));";
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const array=a=>'ARRAY['+a.map(literal).join(',')+']::text[]';
const scope=REQUIRED_METADATA.map(t=>'('+literal(t.name)+','+array(t.columns)+','+array(t.read)+')').join(',');

// No stored application function, sequence counter, SQL definition, financial row,
// history payload, Storage metadata row or body is evaluated by these queries.
export const PREFLIGHT_SQL=Object.freeze({
  identity:frame("SELECT json_build_object('at',clock_timestamp(),'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication) FROM pg_roles WHERE rolname=current_user"),
  schema:frame(`SELECT json_agg(json_build_object(
    'name',p.name,'present',c.oid IS NOT NULL,'kind',c.relkind,
    'schemaUsage',coalesce(has_schema_privilege(current_user,n.oid,'USAGE'),false),
    'metadataSelect',NOT EXISTS(SELECT 1 FROM unnest(p.readcols) col WHERE NOT coalesce(has_column_privilege(current_user,c.oid,col,'SELECT'),false)),
    'requiredSelect',NOT EXISTS(SELECT 1 FROM unnest(p.cols) col WHERE NOT coalesce(has_column_privilege(current_user,c.oid,col,'SELECT'),false)),
    'unfiltered',NOT coalesce(c.relrowsecurity,true) OR (c.relowner=r.oid AND NOT c.relforcerowsecurity),
    'columns',(SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attname=ANY(p.cols))
    ) ORDER BY p.name)
    FROM (VALUES ${scope}) p(name,cols,readcols)
    LEFT JOIN pg_class c ON c.oid=to_regclass(p.name)
    LEFT JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN pg_roles r WHERE r.rolname=current_user`),
  lineage:frame("SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT singleton,lineage FROM forge_meta.database_lineage LIMIT 2) r"),
  history:frame("SELECT json_build_object('count',count(*),'distinctCount',count(DISTINCT version),'head',max(version),'nullCount',count(*) FILTER (WHERE version IS NULL)) FROM supabase_migrations.schema_migrations"),
  versions:frame("SELECT coalesce(json_agg(version ORDER BY version COLLATE \"C\"),'[]'::json) FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version COLLATE \"C\" LIMIT 445) v"),
  finish:frame("SELECT json_build_object('at',clock_timestamp(),'statementMs',(SELECT setting::integer FROM pg_settings WHERE name='statement_timeout'),'lockMs',(SELECT setting::integer FROM pg_settings WHERE name='lock_timeout'),'idleMs',(SELECT setting::integer FROM pg_settings WHERE name='idle_in_transaction_session_timeout'))"),
});
export function preflightLimits(overrides={}){
  hold(Object.keys(overrides).every(k=>Object.hasOwn(PREFLIGHT_LIMITS,k)),'preflight_limit_field');
  const limits={...PREFLIGHT_LIMITS,...overrides};
  for(const k of Object.keys(limits))hold(Number.isSafeInteger(limits[k])&&limits[k]>0&&limits[k]<=PREFLIGHT_LIMITS[k],'preflight_limit');
  return limits;
}
export function preflightBegin(limits=PREFLIGHT_LIMITS){
  limits=preflightLimits(limits);
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout=${limits.queryMs}; SET LOCAL lock_timeout=${limits.lockMs}; SET LOCAL idle_in_transaction_session_timeout=${limits.idleMs}; SET LOCAL row_security=off; SET LOCAL search_path=pg_catalog; SET LOCAL TIME ZONE 'UTC';`;
}

// The passed transport must already be the existing verified local fixture transport.
// The public runner supplies it; no real endpoint or arbitrary SQL option is exposed.
export async function collectSyntheticH444Preflight({transport,limits:overrides={}}){
  hold(transport?.kind==='synthetic-fixture'&&transport.executionClass==='local-postgresql','preflight_synthetic_only');
  let limits,versions;const started=performance.now();
  let received=0,anchor,result;
  const queryDigests=[];
  const request=async sql=>{
    const remaining=limits.sessionMs-(performance.now()-started);
    hold(remaining>0,'preflight_session_timeout');
    const chunks=[];
    for await(const chunk of transport.query(sql,{timeoutMs:Math.max(1,Math.min(limits.queryMs,Math.floor(remaining))),maxBytes:limits.bytes-received})){
      received+=chunk.length;hold(received<=limits.bytes,'preflight_output_limit');chunks.push(chunk);
    }
    hold(performance.now()-started<=limits.sessionMs,'preflight_session_timeout');
    queryDigests.push(sha256(sql));return Buffer.concat(chunks);
  };
  const query=async sql=>{
    let f;try{f=JSON.parse(await request(sql));}catch(e){throw e instanceof ExportHold?e:new ExportHold('preflight_invalid_response');}
    const c=f?.context;
    hold(c?.readOnly==='on'&&c.isolation==='repeatable read'&&c.database==='postgres'&&c.role==='fixture_reader'&&c.ssl===true&&Number.isSafeInteger(c.pid)&&typeof c.snapshot==='string'&&c.snapshot.length>0,'preflight_context');
    if(anchor)hold(canonical(anchor)===canonical(c),'preflight_snapshot_changed');else anchor=c;
    return f.value;
  };
  try{
    limits=preflightLimits(overrides);versions=h444Versions();
    const peer=transport.connectionEvidence;
    hold(peer?.host==='fixture.invalid'&&peer.port===5432&&peer.database==='postgres'&&peer.sslmode==='verify-full'&&peer.hostnameVerified===true&&peer.chainVerified===true,'preflight_tls');
    await request(preflightBegin(limits));
    const identity=await query(PREFLIGHT_SQL.identity);
    hold(identity&&['superuser','bypassRls','createRole','createDb','replication'].every(k=>identity[k]===false),'preflight_privileged_role');
    hold(Number.isFinite(Date.parse(identity.at)),'preflight_timestamp');
    const schema=await query(PREFLIGHT_SQL.schema);
    hold(Array.isArray(schema)&&schema.length===REQUIRED_METADATA.length&&new Set(schema.map(r=>r.name)).size===schema.length,'preflight_schema_shape');
    for(const required of REQUIRED_METADATA){
      const found=schema.find(r=>r.name===required.name);
      hold(found?.present===true&&['r','p'].includes(found.kind)&&found.schemaUsage===true,'preflight_required_relation');
      hold(Array.isArray(found.columns)&&required.columns.every(c=>found.columns.some(a=>a.name===c&&typeof a.type==='string')),'preflight_required_columns');
      if(required.read.length)hold(found.metadataSelect===true&&found.unfiltered===true,'preflight_metadata_access');
    }
    const lineage=await query(PREFLIGHT_SQL.lineage);
    hold(lineage?.length===1&&lineage[0].singleton===true&&lineage[0].lineage==='historical-v1','preflight_lineage');
    const history=await query(PREFLIGHT_SQL.history);
    hold(history?.count===444&&history.distinctCount===444&&history.nullCount===0&&history.head==='20261111201029','preflight_history_boundary');
    const observed=await query(PREFLIGHT_SQL.versions);
    hold(canonical(observed)===canonical(versions),'preflight_history_prefix');
    const finish=await query(PREFLIGHT_SQL.finish);
    hold(finish?.statementMs===limits.queryMs&&finish.lockMs===limits.lockMs&&finish.idleMs===limits.idleMs,'preflight_timeout_settings');
    hold(Number.isFinite(Date.parse(finish.at)),'preflight_timestamp');
    result={schema:'forge.h444-metadata-preflight.v1',evidenceKind:'SYNTHETIC_ONLY',metadataEligibility:'PASS',acquisitionApproved:false,
      authenticSourceVerified:false,acquisitionReadiness:'NOT_VERIFIED',context:anchor,startedAt:identity.at,completedAt:finish.at,
      history,historyVersionsSha256:sha256(observed.join('\n')),capabilities:schema,limits,receivedBytes:received,queryDigests,
      transport:transport.provenance,clientSha256:peer.psqlSha256,caSha256:peer.caSha256,
      requiredFinancialRows:'NOT_INSPECTED',storageIdentityAndBodies:'NOT_INSPECTED',fullExtractionScope:'NOT_VERIFIED'};
  }catch(e){throw e instanceof ExportHold?e:new ExportHold('preflight_failed');}
  finally{
    try{await transport.close();}catch{throw new ExportHold('preflight_cleanup_failed');}
  }
  hold(transport.rollbackVerified===true&&transport.closed===true,'preflight_cleanup_unverified');
  return {...result,rollbackVerified:true,connectionClosed:true};
}
