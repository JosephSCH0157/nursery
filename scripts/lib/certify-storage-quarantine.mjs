import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
export async function certifyStorageQuarantine({sql,sqlArgs,authenticated,service,owner,other}) {
 const ids=['e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000003'];
 const parse=x=>JSON.parse(x.trim().split('\n').at(-1));
 const operator=q=>authenticated(other,q);
 const observe=xs=>parse(sql(operator(`select tongs.observe_storage_quarantine(array[${xs.map(id=>`'${id}'::uuid`).join(',')}]);`)));
 const approve=(o,hash=o.manifest_sha256)=>`select tongs.approve_storage_quarantine('${o.id}','${hash}','Reviewed synthetic historical inventory');`;
 const deletion=id=>service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where id='${id}';commit;`);
 const accounting=()=>parse(sql(operator('select tongs.read_storage_quarantine_accounting();')));
 const execute=q=>new Promise(resolve=>{const p=spawn('docker',sqlArgs,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,out,err}));p.stdin.end(q);});
 const before=sql(`select count(*) from tongs.accounting_journal_events;`);
 sql(`insert into tongs.platform_operators(user_id,reason,granted_by) values('${other}','Disposable quarantine operator','${other}');`);
 assert.throws(()=>sql(authenticated(owner,`select tongs.observe_storage_quarantine(array['${ids[0]}'::uuid]);`)),/operator required/);
 assert.throws(()=>sql(service(`select tongs.observe_storage_quarantine(array['${ids[0]}'::uuid]);`)),/permission denied/);
 assert.throws(()=>observe(Array.from({length:476},(_,i)=>`e2000000-0000-4000-8000-${String(i).padStart(12,'0')}`)),/unique bounded/);
 assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='tongs' and c.relname in ('storage_quarantine_observations','storage_quarantine_authorizations','storage_quarantine_objects','storage_quarantine_deletions') and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres';").trim(),'4');
 assert.throws(()=>sql(authenticated(owner,'select * from tongs.storage_quarantine_objects;')),/permission denied/);
 const observation=observe(ids.slice(0,2));
 assert.equal(observation.manifest.objects.length,2);
 assert.equal(observation.manifest_sha256.length,64);
 assert.equal(createHash('sha256').update(observation.manifest_canonical_utf8,'utf8').digest('hex'),observation.manifest_sha256,'independent manifest byte verification');
 assert.throws(()=>sql(operator(approve(observation,'0'.repeat(64)))),/manifest mismatch/);
 assert.throws(()=>observe([ids[0],ids[0]]),/unique bounded/);
 assert.throws(()=>observe(['e1000000-0000-4000-8000-000000000099']),/missing object/);
 assert.throws(()=>observe(['e1000000-0000-4000-8000-000000000004']),/not eligible/);
 // No capacity or cash is invented by an operator approval.
 const capacityBefore=parse(sql(authenticated(owner,'select tongs.read_my_storage_capacity();'))).total_bytes;
 const approval=execute(operator(`set application_name='quarantine-approval';begin;${approve(observation)}select pg_sleep(2);commit;`));
 let ready=false;for(let i=0;i<100;i++){
  if(sql("select exists(select 1 from pg_stat_activity where application_name='quarantine-approval' and wait_event='PgSleep');").trim()==='t'){ready=true;break;}
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(ready,true,'approval holds object lock before racing mutation');
 const writer=execute(service(`update storage.objects set version='racing-writer' where id='${ids[0]}';`));
 const raced=await Promise.all([approval,writer]);
 assert.equal(raced[0].code,0,raced[0].err);assert.notEqual(raced[1].code,0);assert.match(raced[1].err,/quarantine forbids/);
 const receipt=parse(raced[0].out);
 assert.deepEqual(parse(sql(operator(approve(observation)))),receipt);
 assert.equal(accounting().unassigned_retained_bytes,30);
 assert.equal(accounting().customer_charge,0);
 sql(`insert into tongs.workspaces(id,name,created_by,org_id) values('a1000000-0000-4000-8000-000000000088','Later workspace repair','${owner}','91000000-0000-4000-8000-000000000001');`);
 assert.equal(parse(sql(authenticated(owner,'select tongs.read_my_storage_capacity();'))).used_bytes,0,'workspace repair cannot silently assign quarantined bytes');
 assert.equal(parse(sql(authenticated(owner,'select tongs.read_my_storage_capacity();'))).total_bytes,capacityBefore);
 for(const patch of ["version='changed'","metadata='{\"size\":11}'","metadata='{\"size\":10,\"mimetype\":\"changed\"}'","name='changed.bin'","bucket_id='bellows-capture'","created_at=now()","updated_at=now()","owner_id='someone'","id='e1000000-0000-4000-8000-000000000090'"]) {
  assert.throws(()=>sql(service(`update storage.objects set ${patch} where id='${ids[0]}';`)),/quarantine forbids/);
 }
 sql(`create function tongs.quarantine_fixture_late_mutation() returns trigger language plpgsql as $$begin new.version:='late-provider-trigger';return new;end$$;create trigger zzz_quarantine_fixture before update on storage.objects for each row execute function tongs.quarantine_fixture_late_mutation();`);
 assert.throws(()=>sql(service(`update storage.objects set last_accessed_at=now() where id='${ids[0]}';`)),/quarantine forbids/);
 sql('drop trigger zzz_quarantine_fixture on storage.objects;drop function tongs.quarantine_fixture_late_mutation();');
 assert.throws(()=>sql(operator(`update tongs.storage_quarantine_authorizations set reason='tampered';`)),/permission denied/);
 assert.throws(()=>sql(`delete from tongs.storage_quarantine_authorizations;`),/immutable/);
 assert.throws(()=>sql(service(`delete from storage.objects where id='${ids[0]}';`)),/Use the Storage API/);
 sql(deletion(ids[0]));assert.equal(accounting().unassigned_retained_bytes,20);assert.equal(accounting().deleted_objects,1);
 for(const id of [ids[0],'e1000000-0000-4000-8000-000000000091']) {
  assert.throws(()=>sql(service(`insert into storage.objects(id,bucket_id,name,metadata,version) values('${id}','forge-workpieces','quarantine-synthetic-1.bin','{"size":10}','fixture');`)),/quarantine forbids/);
 }
 assert.throws(()=>sql(service(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','unknown-new.bin','{"size":1}','fixture');`)),/owner_unresolved/);
 // A deleted observed object cannot be approved later, even if a fresh object
 // with the same path exists. Neither approvals nor receipts are fabricated.
 const stale=observe([ids[2]]);
 sql(service(`update storage.objects set created_at=now() where id='${ids[2]}';`));
 assert.throws(()=>sql(operator(approve(stale))),/object changed/);
 sql(deletion(ids[2]));
 assert.throws(()=>sql(operator(approve(stale))),/object changed/);
 // Two independent PostgreSQL connections replay the same immutable receipt
 // without double accounting, including after one object was deleted.

 const concurrent=await Promise.all([execute(operator(approve(observation))),execute(operator(approve(observation)))]);
 for(const r of concurrent){assert.equal(r.code,0,r.err);assert.deepEqual(parse(r.out),receipt);}
 assert.equal(accounting().approved_objects,2);
 sql(`delete from tongs.platform_operators where user_id='${other}';`);
 assert.throws(()=>sql(operator(approve(observation))),/operator required/);
 sql(`insert into tongs.platform_operators(user_id,reason) values('${other}','Restored disposable operator');`);
 sql(deletion(ids[1]));
 sql(deletion('e1000000-0000-4000-8000-000000000004'));
 assert.equal(accounting().unassigned_retained_bytes,0);
 assert.equal(accounting().deleted_objects,2);
 assert.equal(accounting().approved_bytes,30,'historical evidence survives cleanup');
 const deleteId='e1000000-0000-4000-8000-000000000005',deleteObservation=observe([deleteId]);
 sql(operator(`begin;${approve(deleteObservation)}rollback;`));
 assert.equal(accounting().approved_objects,2,'interrupted approval leaves no receipt or exclusion');
 const pending=execute(operator(`set application_name='quarantine-delete-race';begin;${approve(deleteObservation)}select pg_sleep(2);commit;`));
 ready=false;for(let i=0;i<100;i++){
  if(sql("select exists(select 1 from pg_stat_activity where application_name='quarantine-delete-race' and wait_event='PgSleep');").trim()==='t'){ready=true;break;}
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(ready,true);
 const deleted=execute(deletion(deleteId));
 const deletionRace=await Promise.all([pending,deleted]);
 for(const r of deletionRace)assert.equal(r.code,0,r.err);
 assert.equal(accounting().approved_objects,3);assert.equal(accounting().deleted_objects,3);
 assert.equal(accounting().unassigned_retained_bytes,0);assert.equal(accounting().approved_bytes,80);
 assert.equal(sql('select count(*) from tongs.accounting_journal_events;'),before);
 return {result:'PASS',exactManifest:true,unauthorizedDenied:true,revocation:true,mutationMismatches:9,finalProviderTriggerMutationDenied:true,approvalVersusWriter:true,approvalVersusDeletion:true,interruptedApproval:true,noAutomaticAttribution:true,concurrentReplay:true,deletionAuthorityPreserved:true,reappearanceDenied:true,newUnknownDenied:true,journalUnchanged:true};
}
