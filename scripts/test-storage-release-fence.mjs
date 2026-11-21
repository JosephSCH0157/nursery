// Narrow PostgreSQL primitive rehearsal. This is deliberately NOT a Forge
// lineage, restored predecessor, Storage HTTP test or historical certification.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';

assert.deepEqual(process.argv.slice(2),['--lineage','baseline','--unit-fixture'], 'Explicit baseline-contract unit-fixture lane required');
const contract=JSON.parse(readFileSync('docs/database/baseline/v1-gate2/lineage-contract.json'));
assert.equal(contract.baseline.lineage,'baseline-v1');assert.equal(contract.requiredSupabaseCliVersion,'2.84.2');
execFileSync('docker',['info'],{stdio:'pipe'}); // Never start or repair the daemon.
const image=execFileSync('docker',['image','inspect','postgres:17','--format','{{.Id}}'],{encoding:'utf8'}).trim();
assert.match(image,/^sha256:[a-f0-9]{64}$/);
const container=`forge-storage-fence-unit-${randomUUID().slice(0,8)}`;
const label='forge.storage-release-fence-unit=true';
const sqlText=readFileSync('database/proposals/20261119144633_storage_release_database_fence.sql','utf8');
const invoke=sql=>execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const denied=sql=>assert.throws(()=>invoke(sql));
const queryAsync=sql=>new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(sql);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];let started=false;
try{
 execFileSync('docker',['run','--detach','--rm','--pull=never','--network=none','--name',container,'--label',label,'--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=256m','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],{stdio:'pipe'});started=true;
 let ready=false;for(let i=0;i<100;i++){try{invoke('select 1');ready=true;break;}catch{await sleep(100);}}assert.ok(ready,'unit PostgreSQL readiness');
 invoke(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema tongs;create schema storage;create schema forge_meta;
 create table tongs.workpiece_files(id int primary key,value text);
 create table tongs.billing_subscriptions(id int primary key,value text);
 create table storage.objects(id int primary key,value text);
 create table storage.s3_multipart_uploads(id int primary key,value text);
 create table public.application_state(id int primary key,value text);
 grant usage on schema tongs,storage,public to anon,authenticated,service_role;
 grant all on all tables in schema tongs,storage,public to anon,authenticated,service_role;`);
 invoke(sqlText);checks.push('proposal installs transactionally with default paused state');
 for(const role of ['anon','authenticated','service_role'])for(const table of ['storage.objects','storage.s3_multipart_uploads','tongs.workpiece_files','tongs.billing_subscriptions','public.application_state']){
  denied(`set role ${role};insert into ${table} values(1,'blocked');`);
  denied(`set role ${role};update ${table} set value='blocked';`);
  denied(`set role ${role};delete from ${table};`);
  denied(`set role ${role};truncate ${table};`);
 }
 checks.push('60 anon/authenticated/service-role INSERT UPDATE DELETE TRUNCATE attempts denied');
 denied("select forge_meta.set_storage_release_fence(0,false,'forge.storage-manifest.v2',repeat('a',64))");
 invoke('create function tongs.read_workpiece_manifest_version(uuid) returns text language sql as $$select null::text$$');
 denied("select forge_meta.set_storage_release_fence(0,false,'old-manifest',repeat('a',64))");
 denied("select forge_meta.set_storage_release_fence(99,false,'forge.storage-manifest.v2',repeat('a',64))");
 for(const role of ['anon','authenticated','service_role'])denied(`set role ${role};select forge_meta.set_storage_release_fence(0,false,'forge.storage-manifest.v2',repeat('a',64))`);
 assert.equal(invoke("select forge_meta.set_storage_release_fence(0,false,'forge.storage-manifest.v2',repeat('a',64))"),'1');
 checks.push('resume rejects missing/incompatible DB contract, stale generation and application roles');
 const admitted=queryAsync("begin;set role service_role;insert into storage.objects values(1,'admitted');select pg_sleep(2);commit;");
 let sleeping=false;for(let i=0;i<60;i++){if(invoke("select count(*) from pg_stat_activity where wait_event='PgSleep'")==='1'){sleeping=true;break;}await sleep(25);}assert.ok(sleeping,'admitted transaction reached barrier');
 const closeStart=Date.now();
 const pause=queryAsync("select forge_meta.set_storage_release_fence(1,true,null,repeat('b',64))");
 await admitted;assert.equal(await pause,'2');assert.ok(Date.now()-closeStart>500,'pause must wait for admitted transaction');
 assert.equal(invoke('select value from storage.objects where id=1'),'admitted');
 denied("set role service_role;insert into storage.objects values(2,'late');");
 denied("begin;set local session_replication_role=replica;insert into storage.objects values(2,'replica bypass');commit;");
 checks.push('pause drains admitted transaction; later and replica-mode writes denied; accepted row retained');
 // A failed pause times out without claiming quiescence. Its state change and
 // audit event roll back, preserving an explicit operator-visible failure.
 assert.equal(invoke("select forge_meta.set_storage_release_fence(2,false,'forge.storage-manifest.v2',repeat('c',64))"),'3');
 const busy=queryAsync("begin;insert into tongs.workpiece_files values(1,'accepted');select pg_sleep(2);commit;");
 for(let i=0;i<60;i++){if(invoke("select count(*) from pg_stat_activity where wait_event='PgSleep'")==='1')break;await sleep(25);}
 denied("begin;set local lock_timeout='100ms';select forge_meta.set_storage_release_fence(3,true,null,repeat('d',64));commit;");
 await busy;assert.equal(invoke('select generation from forge_meta.storage_release_fence'),'3');
 invoke("select forge_meta.set_storage_release_fence(3,true,null,repeat('d',64))");
 checks.push('timed-out drain never reports a successful pause or appends an audit event');
 invoke('alter table storage.objects disable trigger forge_storage_release_write_fence');
 denied("select forge_meta.set_storage_release_fence(4,false,'forge.storage-manifest.v2',repeat('e',64))");
 invoke('alter table storage.objects enable always trigger forge_storage_release_write_fence;create table tongs.uncovered(id int)');
 denied("select forge_meta.set_storage_release_fence(4,false,'forge.storage-manifest.v2',repeat('e',64))");
 denied('delete from forge_meta.storage_release_fence_events');
 checks.push('disabled trigger/new uncovered table prevents resume; audit events immutable');
 console.log(JSON.stringify({status:'PASS',scope:'PostgreSQL unit-fixture only',image,proposalSha256:createHash('sha256').update(sqlText).digest('hex'),checks,limitations:['no Forge lineage or authentic financial fixture','no provider byte-write cancellation proof','no first-cutover bootstrap fence','no end-to-end application compatibility proof']}));
}finally{
 if(started){
  assert.equal(execFileSync('docker',['inspect',container,'--format','{{index .Config.Labels "forge.storage-release-fence-unit"}}'],{encoding:'utf8'}).trim(),'true');
  execFileSync('docker',['stop','--time','5',container],{stdio:'pipe'});
  const remaining=execFileSync('docker',['ps','-a','--filter',`name=^/${container}$`,'--format','{{.Names}}'],{encoding:'utf8'}).trim();assert.equal(remaining,'');
  console.log(JSON.stringify({cleanup:'PASS',container,privateDataUsed:false}));
 }
}
