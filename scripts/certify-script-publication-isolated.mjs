import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const container=process.env.SUPABASE_DB_CONTAINER;
if(!container || !/^supabase_db_forge-/.test(container)) throw Error('Explicit disposable Forge source container required');
const database=`forge_script_${randomUUID().replaceAll('-','').slice(0,12)}`;
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:100*1024*1024});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout;}
const info=JSON.parse(run(['inspect',container]))[0];assert.ok(info.Config.Labels['com.supabase.cli.project']);
const lineage=run(['exec',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-c','select lineage from forge_meta.database_lineage;']).trim();
assert.ok(['baseline-v1','historical-v1'].includes(lineage));
const upgradedCI = process.argv.includes('--upgraded-ci-source');
if(upgradedCI){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'JosephSCH0157/nursery');
 assert.match(process.env.GITHUB_RUN_ID??'',/^\d+$/);assert.match(process.env.GITHUB_RUN_ATTEMPT??'',/^\d+$/);
 assert.equal(container,`supabase_db_forge-he3-browser-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
 assert.equal(lineage,'baseline-v1');
 assert.equal(run(['exec',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-c','select max(version) from supabase_migrations.schema_migrations']).trim(),'20261111054816');
}
// Schema-only behavioral adapter sourced from the verified full-tail CI database; not historical equivalence.
const sqlArgs=['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
const sql=input=>run(sqlArgs,input);
const owner='11000000-0000-4000-8000-000000000003', workspace='a1000000-0000-4000-8000-000000000001', episode='d1000000-0000-4000-8000-000000000001';
const op=()=>randomUUID(); const hashA='a'.repeat(64),hashB='b'.repeat(64);
const command=(action,id,rev=0,hash=null,next=hashA)=>`select tongs.script_publication_command('${action}','${owner}','${workspace}','${episode}','${id}',${rev},${hash?`'${hash}'`:'null'},'${next}',32)::text;`;
const service=q=>`set role service_role;set request.jwt.claims='{"role":"service_role"}';${q}`;
const parse=x=>JSON.parse(x.trim().split('\n').at(-1));
function competing(q){return new Promise((resolve,reject)=>{const p=spawn('docker',sqlArgs,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve({...parse(out),certificationBackendPid:Number(out.trim().split("\n")[0])}));p.stdin.end(service(`select pg_backend_pid();select pg_sleep(0.1);${q}`));});}
let created=false;
try {
 run(['exec',container,'createdb','-U','postgres',database]);created=true;
 const dump=run(['exec',container,'pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=tongs','--schema=auth','--schema=extensions','--schema=public']).replace(/^CREATE SCHEMA public;\r?\n/m,'').replace(/^ALTER DEFAULT PRIVILEGES[\s\S]*?;\r?\n/gm,'');
 sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;');sql(dump.replace(/^CREATE SCHEMA extensions;\r?\n/m,''));
 if(!upgradedCI) sql(readFileSync('supabase/migrations/20261111054816_tongs_atomic_script_publication.sql','utf8'));
 else assert.equal(sql("select to_regprocedure('tongs.script_publication_command(text,uuid,uuid,uuid,uuid,bigint,text,text,bigint)') is not null;").trim(),'t');
 sql(`insert into auth.users(id) values('${owner}');insert into tongs.orgs(id,name,created_by) values('91000000-0000-4000-8000-000000000001','Script adapter','${owner}');insert into tongs.workspaces(id,name,created_by,org_id) values('${workspace}','Script adapter','${owner}','91000000-0000-4000-8000-000000000001');insert into tongs.episodes(id,workspace_id,label) values('${episode}','${workspace}','Script adapter');`);
 // Admission fixture only; no funding, pricing or financial policies are activated.
 sql(`insert into tongs.legacy_account_admission_cohort(user_id) values('${owner}');insert into tongs.account_admission_events(user_id,revision,operation_id,event_type,origin_kind,origin_legacy_user_id,actor_id,reason) values('${owner}',1,'${op()}','grant','legacy','${owner}',null,'Disposable script certification fixture');`);
 const a=op(),b=op();sql(service(command('prepare',a)));sql(service(command('prepare',b,0,null,hashB)));
 const results=await Promise.all([competing(command('finalize',a)),competing(command('finalize',b))]);
 assert.notEqual(results[0].certificationBackendPid,results[1].certificationBackendPid);
 assert.deepEqual(results.map(x=>x.state).sort(),['committed','conflict']);
 const winner=results.find(x=>x.state==='committed');assert.equal(winner.receipt.revision,1);
 assert.deepEqual(parse(sql(service(command('finalize',winner.operation_id)))).receipt,winner.receipt);
 const c=op(),d=op();sql(service(command('prepare',c,1,winner.receipt.sha256,'c'.repeat(64))));sql(service(command('prepare',d,1,winner.receipt.sha256,'d'.repeat(64))));
 const updates=await Promise.all([competing(command('finalize',c)),competing(command('finalize',d))]);assert.deepEqual(updates.map(x=>x.state).sort(),['committed','conflict']);
 const abandoned=op();sql(service(command('prepare',abandoned,2,updates.find(x=>x.state==='committed').receipt.sha256)));sql(service(command('abandon',abandoned)));assert.equal(parse(sql(service(command('finalize',abandoned)))).state,'abandoned');

 const current=updates.find(x=>x.state==='committed').receipt;
 const fails=(query,pattern)=>assert.throws(()=>sql(query),pattern);
 fails(service(command('prepare',a,0,null,'e'.repeat(64))),/fingerprint conflict/);
 fails(`set role authenticated;${command('status',a)}`,/permission denied/);
 fails(`set role service_role;select * from tongs.script_publication_operations;`,/permission denied/);
 fails(`delete from tongs.script_publication_operations where operation_id='${a}';`,/immutable/);
 fails(`update tongs.workpiece_files set hash_value='${hashA}' where workpiece_id='${episode}' and path='script/script.md';`,/conditional script publication/);
 const unchanged=op();sql(service(command('prepare',unchanged,2,current.sha256,current.sha256)));
 const noop=parse(sql(service(command('finalize',unchanged))));assert.equal(noop.receipt.revision,2);assert.equal(noop.receipt.unchanged,true);assert.equal(noop.receipt.storage_key,current.storage_key);
 const revoked=op();sql(service(command('prepare',revoked,2,current.sha256)));
 sql(`update tongs.workspace_members set role='viewer' where workspace_id='${workspace}' and user_id='${owner}';`);
 fails(service(command('finalize',revoked)),/editor required/);
 sql(`update tongs.workspace_members set role='owner' where workspace_id='${workspace}' and user_id='${owner}';`);
 const racing=op();sql(service(command('prepare',racing,2,current.sha256)));
 const cleanupRace=await Promise.allSettled([
   competing(command('finalize',racing)),
   competing(`begin;update tongs.episodes set archived_at=clock_timestamp(),archived_by='${owner}' where id='${episode}';select tongs.close_episode_script_publications('${owner}','${workspace}','${episode}');commit;select '{"state":"closed"}'::jsonb;`),
 ]);
 assert.equal(cleanupRace[1].status,'fulfilled');
 if(cleanupRace[0].status==='rejected')assert.match(String(cleanupRace[0].reason),/active episode required|deadlock/);
 const raceState=sql(`select state from tongs.script_publication_operations where operation_id='${racing}';`).trim();
 assert.ok(['committed','abandoned'].includes(raceState));
 assert.equal(sql(`select relrowsecurity from pg_class where oid='tongs.script_publication_operations'::regclass;`).trim(),'t');
 assert.equal(sql(`select has_function_privilege('authenticated','tongs.script_publication_command(text,uuid,uuid,uuid,uuid,bigint,text,text,bigint)','execute');`).trim(),'f');
 assert.equal(sql(`select has_function_privilege('service_role','tongs.script_publication_command(text,uuid,uuid,uuid,uuid,bigint,text,text,bigint)','execute');`).trim(),'t');

 const keys=parse(sql(service(`select tongs.close_episode_script_publications('${owner}','${workspace}','${episode}')::text;`)));
 assert.ok(keys.includes(current.storage_key));
 fails(service(command('finalize',revoked)),/active episode required/);
 assert.equal(sql(`select state from tongs.script_publication_operations where operation_id='${revoked}';`).trim(),'abandoned');
 const result={sourceLineage:lineage,upgradedCI,sourceHead:upgradedCI?'20261111054816':null,fixtureDatabase:database,creation:results,updates,recovery:'PASS',abandonment:'PASS',privileges:'PASS',immutableEvidence:'PASS',duplicateFingerprint:'PASS',unchanged:'PASS',revocation:'PASS',archiveCleanup:'PASS',cleanupRace:raceState,rlsAndFunctionGrants:'PASS',limitation:'Schema-only disposable adapter. Separate psql processes exercise real PostgreSQL concurrency; not full-tail certification.'};
 if(process.env.SCRIPT_PUBLICATION_EVIDENCE)writeFileSync(process.env.SCRIPT_PUBLICATION_EVIDENCE,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{if(created)run(['exec',container,'dropdb','-U','postgres',database]);}
