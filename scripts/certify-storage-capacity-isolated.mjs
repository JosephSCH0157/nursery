import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { certifyStorageQuarantine } from './lib/certify-storage-quarantine.mjs';
import { certifyStorageLifecycle } from './lib/certify-storage-lifecycle.mjs';
import { certifyStorageHttp } from './lib/certify-storage-http.mjs';
import { seedHistoricalAccounting, approveHistoricalAccounting, certifyHistoricalAccounting } from './lib/certify-storage-historical-accounting.mjs';
console.log(JSON.stringify({phase:'storage-cert-imports-loaded'}));
const container=process.env.SUPABASE_DB_CONTAINER;
if(!container || !/^supabase_db_forge-/.test(container)) throw Error('Explicit existing disposable Forge container required');
const database=`forge_storage_${randomUUID().replaceAll('-','').slice(0,12)}`;
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:100*1024*1024});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout;}
const info=JSON.parse(run(['inspect',container]))[0];assert.ok(info.Config.Labels['com.supabase.cli.project']);
const source=q=>run(['exec',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-c',q]).trim();
const lineage=source('select lineage from forge_meta.database_lineage');assert.equal(lineage,'baseline-v1');
const head=source('select max(version) from supabase_migrations.schema_migrations');
assert.ok(['20261104071802','20261105025313'].includes(head),'Reviewed supported schema source required');
const dbPassword=info.Config.Env.find(v=>v.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
if(!dbPassword)throw Error('Existing disposable admin credential unavailable');
const sqlArgs=['exec','-i','-e',`PGPASSWORD=${dbPassword}`,container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database];
const sql=q=>run(sqlArgs,q);
const owner='11000000-0000-4000-8000-000000000003',other='11000000-0000-4000-8000-000000000004';
const workspace='a1000000-0000-4000-8000-000000000001',episode='d1000000-0000-4000-8000-000000000001';
const service=q=>`set role service_role;set request.jwt.claims='{"role":"service_role"}';${q}`;
const authenticated=(user,q)=>`set role authenticated;set request.jwt.claims='{"role":"authenticated","sub":"${user}"}';${q}`;
const parse=x=>JSON.parse(x.trim().split('\n').at(-1));
const capacity=()=>parse(sql(authenticated(owner,'select tongs.read_my_storage_capacity();')));
const path=name=>`workpieces/${episode}/${name}`;
const insert=(name,bytes)=>`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','${path(name)}','{"size":${bytes}}','${randomUUID()}');`;
const fails=(query,pattern)=>assert.throws(()=>sql(query),pattern);
const GiB=1024**3;
const certifyReleaseStages=process.env.FORGE_STORAGE_RELEASE_CERT==='1';
const releaseContractSql=certifyReleaseStages?readFileSync('supabase/tests/storage_billing_hosted_release_contract.sql','utf8').trim().replace(/;$/,''):null;
function verifyReleaseStage(expected) {
 if(!certifyReleaseStages)return;
 // A server-enforced read-only transaction, not merely a client promise.
 const state=JSON.parse(sql(`begin read only;select row_to_json(s) from (${releaseContractSql}) s;commit;`).trim());
 assert.equal(state.storage_stage,expected);assert.equal(state.storage_contract_ok,true);
 console.log(JSON.stringify({hostedReleaseContractStage:expected,result:'PASS',readOnly:true}));
}

function verifyInterruptedRelease(sqlText,previousStage) {
 if(!certifyReleaseStages)return;
 assert.match(sqlText,/commit;\s*$/i);
 const interrupted=sqlText.replace(/commit;\s*$/i,'select 1/0; commit;');
 fails(interrupted,/division by zero/);
 verifyReleaseStage(previousStage);
}

function receipt(sub,item,type,live=false){const id=randomUUID();return service(`select tongs.record_subscription_cycle_receipt('${id}','${owner}','evt_${id}','in_${id}','${sub}',null,${live},'${type}','${item}',1000000,'USD',date_trunc('day',now())-interval '1 day',date_trunc('day',now())+interval '29 days',now(),'{}');`);}
function subscription(sub,item,type,status='active'){return service(`select tongs.upsert_billing_subscription('${owner}','cus_storage_fixture','${sub}','${type}','${item}','monthly','${status}',null,now()-interval '1 day',now()+interval '29 days',false,null,'{}');`);}
function concurrent(query){return new Promise(resolve=>{const p=spawn('docker',sqlArgs,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,out,err}));p.stdin.end(service(`begin;${query}select pg_sleep(0.1);commit;`));});}
let created=false;
try{
 run(['exec',container,'createdb','-U','postgres',database]);created=true;
 const dump=run(['exec',container,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=tongs','--schema=auth','--schema=storage','--schema=extensions','--schema=public']).replace(/^CREATE SCHEMA public;\r?\n/m,'').replace(/^ALTER DEFAULT PRIVILEGES[\s\S]*?;\r?\n/gm,'');
 sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;');
 console.log(JSON.stringify({phase:'schema-copy'}));
 sql(dump.replace(/^CREATE SCHEMA extensions;\r?\n/m,''));
 sql(run(['exec',container,'pg_dump','-U','postgres','-d','postgres','--data-only','--table=storage.migrations']));
 sql(`insert into auth.users(id) values('${owner}'),('${other}');insert into tongs.orgs(id,name,created_by) values('91000000-0000-4000-8000-000000000001','Storage adapter','${owner}');insert into tongs.workspaces(id,name,created_by,org_id) values('${workspace}','Storage adapter','${owner}','91000000-0000-4000-8000-000000000001');insert into tongs.episodes(id,workspace_id,label) values('${episode}','${workspace}','Storage adapter');insert into storage.buckets(id,name) values('forge-workpieces','forge-workpieces'),('bellows-capture','bellows-capture');`);
 sql(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','legacy-unattributed-fixture.bin','{"size":3}','fixture');`);
 sql(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','workspaces/a1000000-0000-4000-8000-000000000099/orphan.bin','{"size":2}','fixture');`);
 if(process.env.FORGE_STORAGE_QUARANTINE_CERT==='1') {
  for(let i=1;i<=5;i++) sql(`insert into storage.objects(id,bucket_id,name,metadata,version,created_at,updated_at) values('e1000000-0000-4000-8000-00000000000${i}','forge-workpieces','${i===2?'workspaces/a1000000-0000-4000-8000-000000000088/retained.bin':`quarantine-synthetic-${i}.bin`}','{"size":${i*10}}','fixture',${i===4?'now()':"'2026-08-01T00:00:00Z'"},${i===4?'now()':"'2026-08-01T00:00:00Z'"});`);
 }
 if(process.env.FORGE_STORAGE_HISTORICAL_ACCOUNTING_CERT==='1') seedHistoricalAccounting(sql);
 verifyReleaseStage(0);
 verifyInterruptedRelease(readFileSync('supabase/migrations/20261111180013_storage_capacity_authority.sql','utf8'),0);
 sql(readFileSync('supabase/migrations/20261111180013_storage_capacity_authority.sql','utf8'));
 verifyReleaseStage(1);
 verifyReleaseStage(1);
 verifyInterruptedRelease(readFileSync('supabase/migrations/20261111185031_storage_capacity_statement_enforcement.sql','utf8'),1);
 sql(readFileSync('supabase/migrations/20261111185031_storage_capacity_statement_enforcement.sql','utf8'));
 verifyReleaseStage(2);
 verifyInterruptedRelease(readFileSync('supabase/migrations/20261111192458_storage_subscription_lifecycle_fencing.sql','utf8'),2);
 sql(readFileSync('supabase/migrations/20261111192458_storage_subscription_lifecycle_fencing.sql','utf8'));
 verifyReleaseStage(3);
 const quarantineSql=readFileSync('supabase/migrations/20261111201029_storage_historical_quarantine.sql','utf8');
 console.log(JSON.stringify({quarantineMigrationSha256:createHash('sha256').update(quarantineSql).digest('hex')}));
 verifyInterruptedRelease(quarantineSql,3);
 sql(quarantineSql);
 verifyReleaseStage(4);
 let historical;
 if(process.env.FORGE_STORAGE_HISTORICAL_ACCOUNTING_CERT==='1') {
  sql(readFileSync('supabase/migrations/20261113175455_storage_historical_accounting.sql','utf8'));
  historical=approveHistoricalAccounting({sql,authenticated,service,owner,other});
 }
 if(process.env.FORGE_STORAGE_QUARANTINE_CERT==='1')console.log(JSON.stringify({quarantine:await certifyStorageQuarantine({sql,sqlArgs,authenticated,service,owner,other})}));
 assert.equal(capacity().usage_complete,false,'legacy objects without ownership are not silently unbilled');
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where bucket_id='forge-workpieces' and name='legacy-unattributed-fixture.bin';commit;`));
 assert.equal(capacity().usage_complete,false,'missing workspace must not be silently unbilled');
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where name='workspaces/a1000000-0000-4000-8000-000000000099/orphan.bin';commit;`));
 assert.equal(capacity().usage_complete,true);
 assert.equal(capacity().total_bytes,0);
 fails(service(insert('free.bin',1)),/storage_capacity_exceeded/);
 // Match Storage canUpload's metadata-less permission probe: rollback never
 // publishes the row or runs deferred capacity enforcement.
 sql(service(`begin;insert into storage.objects(bucket_id,name,version) values('forge-workpieces','${path('probe.bin')}','1');rollback;`));
 fails(service(`insert into storage.objects(bucket_id,name,version) values('forge-workpieces','${path('unknown.bin')}','1');`),/storage_usage_size_unverified/);
 sql(`insert into tongs.financial_runtime_environment_revisions(revision,financial_environment,reason) values(1,'test','Disposable storage fixture; no provider activation');`);
 sql(subscription('sub_base','creator','subscription'));
 assert.equal(capacity().base_bytes,0,'unpaid status cannot invent paid authority');
 const baseReceipt=receipt('sub_base','creator','subscription');
 sql(baseReceipt);const receiptCount=sql('select count(*) from tongs.subscription_cycle_receipts;');
 sql(baseReceipt);assert.equal(sql('select count(*) from tongs.subscription_cycle_receipts;'),receiptCount,'duplicate receipt remains idempotent');
 assert.equal(capacity().base_bytes,5*GiB);
 if(historical)console.log(JSON.stringify({historicalAccounting:await certifyHistoricalAccounting({sql,sqlArgs,authenticated,service,owner,other,workspace,episode,capacity,historical})}));
 if(process.env.FORGE_STORAGE_HTTP_CERT==='1'){console.log(JSON.stringify({phase:'storage-http-start'}));const http=await certifyStorageHttp({run,sql,database,workspace,episode,capacity});console.log(JSON.stringify({http}));if(http.result!=='PASS')process.exitCode=1;}
 sql(subscription('sub_base','creator','subscription','trialing'));assert.equal(capacity().base_bytes,0,'no unapproved permanent trial allowance');
 sql(subscription('sub_base','creator','subscription','past_due'));assert.equal(capacity().base_bytes,5*GiB,'paid-through period preserved');
 sql(`update tongs.billing_subscriptions set current_period_end=now()-interval '1 second' where stripe_subscription_id='sub_base';`);
 assert.equal(capacity().base_bytes,0,'expired period denies capacity');
 sql(subscription('sub_base','creator','subscription'));
 sql(subscription('sub_pack','50gb_v2','cloud_storage'));
 sql(receipt('sub_pack','50gb_v2','cloud_storage',true));
 assert.equal(capacity().addon_bytes,0,'Live receipt cannot fund Test storage');
 sql(receipt('sub_pack','50gb_v2','cloud_storage'));
 assert.equal(capacity().addon_bytes,50*GiB);
 sql(subscription('sub_pack','500gb','cloud_storage'));
 assert.equal(capacity().addon_bytes,50*GiB,'unpaid upgrade cannot increase capacity');
 sql(receipt('sub_pack','500gb','cloud_storage'));
 assert.equal(capacity().addon_bytes,500*GiB);
 sql(subscription('sub_pack','150gb','cloud_storage'));
 assert.equal(capacity().addon_bytes,150*GiB,'downgrade clamps paid capacity');
 sql(subscription('sub_pack','150gb','cloud_storage','canceled'));
 assert.equal(capacity().addon_bytes,0);
 sql(subscription('sub_legacy','50gb','cloud_storage'));sql(receipt('sub_legacy','50gb','cloud_storage'));
 sql(subscription('sub_extra','50gb_v2','cloud_storage'));sql(receipt('sub_extra','50gb_v2','cloud_storage'));
 assert.equal(capacity().addon_bytes,300*GiB,'legacy 250 GiB and new 50 GiB stack without reinterpretation');
 sql(subscription('sub_legacy','50gb','cloud_storage','canceled'));sql(subscription('sub_extra','50gb_v2','cloud_storage','canceled'));
 sql(`insert into tongs.workspace_members(workspace_id,user_id,role) values('${workspace}','${other}','editor');`);
 fails(service(`begin isolation level repeatable read;${insert('isolation.bin',1)}commit;`),/requires_read_committed/);
 sql(service(insert('_uploads/fixture/chunks/0.part',10*GiB)));
 assert.equal(capacity().used_bytes,0,'temporary chunks excluded');
 const bellowsKey=`${workspace}/${episode}/${owner}/${episode}/segment.webm`;
 sql(service(`insert into storage.objects(bucket_id,name,metadata,version) values('bellows-capture','${bellowsKey}','{"size":5}','fixture');`));
 assert.equal(capacity().used_bytes,5,'playable Bellows segments are retained, not temporary');
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where bucket_id='bellows-capture' and name='${bellowsKey}';commit;`));
 sql(service(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','hearth/attachments/${workspace}/${episode}/fixture/source.txt','{"size":7}','fixture');`));
 assert.equal(capacity().used_bytes,7,'existing attachment path uses canonical episode/workspace ownership');
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where name='hearth/attachments/${workspace}/${episode}/fixture/source.txt';commit;`));
 sql(service(insert('retained.bin',5*GiB-10)));
 const journalBefore=sql('select count(*) from tongs.accounting_journal_events;');
 const results=await Promise.all([concurrent(insert('race-a.bin',8)),concurrent(insert('race-b.bin',8))]);
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert.match(results.find(r=>r.code!==0).err,/storage_capacity_exceeded/);
 assert.equal(capacity().used_bytes,5*GiB-2);
 assert.equal(parse(sql(authenticated(other,'select tongs.read_my_storage_capacity();'))).used_bytes,0,'collaborator is not charged');
 sql(subscription('sub_base','creator','subscription','canceled'));
 assert.equal(capacity().delete_only,true);
 fails(service(insert('over-quota.bin',1)),/storage_capacity_exceeded/);
 fails(service(`delete from storage.objects where bucket_id='forge-workpieces';`),/Use the Storage API/);
 // Synthetic metadata adapter only: mirror the Storage API transaction setting.
 // Never use this SQL against a real object or remove the provider guard.
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where bucket_id='forge-workpieces';commit;`));
 assert.equal(capacity().used_bytes,0,'deletion remains available after cancellation');
 assert.equal(sql('select count(*) from tongs.accounting_journal_events;'),journalBefore,'capacity never charges processing credits or rewrites journals');
 fails(`set role anon;select tongs.read_my_storage_capacity();`,/permission denied/);
 fails(authenticated(other,`select tongs._storage_capacity_entitlement('${owner}');`),/permission denied/);
 assert.equal(sql(`select tgdeferrable and tginitdeferred from pg_trigger where tgname='forge_storage_capacity_guard';`).trim(),'t');
 if(process.env.FORGE_STORAGE_LIFECYCLE_CERT==='1'){const lifecycle=await certifyStorageLifecycle({sql,sqlArgs,service,subscription,receipt,capacity});console.log(JSON.stringify({lifecycle}));if(lifecycle.result!=='PASS')process.exitCode=1;}
 if(process.env.FORGE_STRIPE_SANDBOX_CERT==='1'){const {certifyStripeSandbox}=await import('./lib/certify-stripe-sandbox.mjs');const result=await certifyStripeSandbox({run,sql,database,sourceContainer:container});console.log(JSON.stringify({stripeSandbox:result}));if(result.result!=='PASS')process.exitCode=1;}
 assert.equal(source('select max(version) from supabase_migrations.schema_migrations'),head,'source unchanged');
 console.log(JSON.stringify({result:'PASS',sourceLineage:lineage,sourceHead:head,database,tests:['duplicate receipt','trial denial','paid-through grace','expiry','legacy stacking','restricted isolation rejection','free denial','receipt-backed 5 GiB','paid add-ons','Test/Live isolation','upgrade payment gate','downgrade','cancellation','temporary exclusion','two-connection concurrency','owner attribution','delete-only','journal unchanged','RPC privilege isolation','Storage permission-probe rollback'],limitation:'Schema-only disposable PostgreSQL adapter. Storage rows are synthetic metadata, not real media; not full-tail or Storage HTTP certification.'},null,2));
}finally{if(created)run(['exec',container,'dropdb','-U','postgres',database]);}
