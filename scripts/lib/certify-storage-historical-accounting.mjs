import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const ids=Array.from({length:5},(_,i)=>`e3000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const orphan='a3000000-0000-4000-8000-000000000001';
const parse=s=>JSON.parse(s.trim().split('\n').at(-1));
const reason='Reviewed disposable historical accounting fixture';
const evidence=createHash('sha256').update('synthetic test bytes; no hosted inventory').digest('hex');
const approve=o=>`select tongs.approve_storage_historical_accounting('${o.id}','${o.manifest_sha256}','${evidence}','${reason}');`;

export function seedHistoricalAccounting(sql) {
 for(const [i,id] of ids.entries())sql(`insert into storage.objects(id,bucket_id,name,metadata,version,created_at,updated_at)
 values('${id}','forge-workpieces','workspaces/${orphan}/history-${i}.json',
 '{"size":${100+i},"eTag":"synthetic-${i}"}','original-${i}','2026-08-01','2026-08-01');`);
}
export function approveHistoricalAccounting({sql,authenticated,service,owner,other}) {
 const operator=q=>authenticated(other,q);
 sql(`insert into tongs.platform_operators(user_id,reason) values('${other}','Disposable accounting operator') on conflict(user_id) do nothing;`);
 const observe=xs=>parse(sql(operator(`select tongs.observe_storage_historical_accounting(array[${xs.map(id=>`'${id}'::uuid`).join(',')}]);`)));
 const fails=(q,re)=>assert.throws(()=>sql(q),re);
 fails(authenticated(owner,`select tongs.observe_storage_historical_accounting(array['${ids[0]}'::uuid]);`),/operator required/);
 fails(service(`select tongs.observe_storage_historical_accounting(array['${ids[0]}'::uuid]);`),/permission denied/);
 fails(authenticated(other,'select * from tongs.storage_historical_objects;'),/permission denied/);
 fails(operator(`select tongs.observe_storage_historical_accounting(array['${ids[0]}'::uuid,'${ids[0]}'::uuid]);`),/unique bounded/);
 const o=observe(ids.slice(0,4));const last=observe(ids.slice(4));
 assert.equal(createHash('sha256').update(o.manifest_canonical_utf8).digest('hex'),o.manifest_sha256);
 fails(operator(approve(o).replace(o.manifest_sha256,'0'.repeat(64))),/manifest mismatch/);
 sql(operator(`begin;${approve(o)}rollback;`));
 assert.equal(sql('select count(*) from tongs.storage_historical_objects;').trim(),'0');
 const receipt=parse(sql(operator(approve(o))));
 assert.deepEqual(parse(sql(operator(approve(o)))),receipt);
 sql(operator(approve(last)));
 fails(operator(approve(o).replace(reason,reason+' changed')),/replay conflict/);
 fails('delete from tongs.storage_historical_approvals;',/immutable/);
 assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='tongs' and c.relname in ('storage_historical_observations','storage_historical_approvals','storage_historical_objects','storage_historical_retirements','storage_historical_revocations') and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres';").trim(),'5');
 return {o,last,receipt};
}
export async function certifyHistoricalAccounting({sql,sqlArgs,authenticated,service,owner,other,workspace,capacity,historical}) {
 const operator=q=>authenticated(other,q);
 const accounting=()=>parse(sql(operator('select tongs.read_storage_historical_accounting();')));
 const fails=(q,re)=>assert.throws(()=>sql(q),re);
 const execute=q=>new Promise(resolve=>{const p=spawn('docker',sqlArgs,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolve({code,out,err}));p.stdin.end(q);});
 const financial=()=>sql("select json_build_object('journals',(select count(*) from tongs.accounting_journal_events),'receipts',(select count(*) from tongs.subscription_cycle_receipts),'subscriptions',(select jsonb_agg(to_jsonb(s) order by s.id) from tongs.billing_subscriptions s));");
 const before=financial(),initial=capacity();
 assert.equal(accounting().excluded_objects,5);assert.equal(accounting().unassigned_retained_bytes,510);
 assert.equal(initial.used_bytes,0);assert.equal(initial.usage_complete,true);
 const fingerprint=sql(`select jsonb_agg(tongs._storage_historical_identity(o) order by id) from storage.objects o where id=any(array[${ids.map(x=>`'${x}'::uuid`).join(',')}]);`);
 sql(service(`update storage.objects set last_accessed_at=now() where id='${ids[0]}';`));
 assert.equal(accounting().excluded_objects,5,'read bookkeeping does not revoke classification');
 assert.equal(sql(`select jsonb_agg(tongs._storage_historical_identity(o) order by id) from storage.objects o where id=any(array[${ids.map(x=>`'${x}'::uuid`).join(',')}]);`),fingerprint);
 fails(service(`update storage.objects set version='replacement' where id='${ids[0]}';`),/owner_unresolved/);
 assert.equal(accounting().retired_objects,0,'rejected write rolls retirement back');
 fails(service(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','workspaces/${orphan}/new.json','{"size":1,"eTag":"x"}','original-0');`),/owner_unresolved/);
 // Only synthetic fixture authority is supplied. Never recover hosted orphans.
 sql(`insert into tongs.workspaces(id,name,created_by,org_id) values('${orphan}','Synthetic recovered fixture','${owner}','91000000-0000-4000-8000-000000000001');`);
 assert.equal(capacity().used_bytes,0,'relationship repair does not retroactively bill original content');
 const update=(id,v,size)=>service(`update storage.objects set version='${v}',metadata=jsonb_build_object('size',${size},'eTag','${v}') where id='${id}';`);
 sql(update(ids[0],'successor-0',100));assert.equal(capacity().used_bytes,100,'same-size successor billed in full');
 assert.equal(accounting().excluded_objects,4);assert.equal(accounting().retired_objects,1);
 sql(update(ids[0],'original-0',100));
 assert.equal(capacity().used_bytes,100,'version reuse never revives historical exclusion');
 sql(service(`update storage.objects set metadata='{"size":100,"eTag":"synthetic-0"}' where id='${ids[0]}';`));
 assert.equal(accounting().excluded_objects,4,'restoring every original field does not revive exclusion');
 const moved=`workpieces/${'d1000000-0000-4000-8000-000000000001'}/historical-copy.json`;
 sql(service(`insert into storage.objects(bucket_id,name,metadata,version) select bucket_id,'${moved}',metadata,version from storage.objects where id='${ids[1]}';`));
 assert.equal(capacity().used_bytes,201,'copy does not inherit allowance');
 sql(service(`update storage.objects set name=name||'.renamed' where id='${ids[1]}';`));
 assert.equal(capacity().used_bytes,302,'rename becomes an ordinary binding');
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where id='${ids[2]}';commit;`));
 sql(service(`insert into storage.objects(id,bucket_id,name,metadata,version,created_at) values('${ids[2]}','forge-workpieces','workspaces/${orphan}/history-2.json','{"size":102,"eTag":"synthetic-2"}','original-2','2026-08-01');`));
 assert.equal(capacity().used_bytes,404,'delete/recreate remains billable');
 const limit=initial.total_bytes;
 sql(service(`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','workspaces/${workspace}/accounting-filler.bin','{"size":${limit-404-103}}','filler');`));
 const race=await Promise.all([execute(update(ids[3],'race-a',103)),execute(update(ids[4],'race-b',104))]);
 assert.equal(race.filter(x=>x.code===0).length,1,JSON.stringify(race));
 assert.match(race.find(x=>x.code!==0).err,/capacity_exceeded/);
 assert.equal(capacity().used_bytes,limit);
 assert.equal(accounting().excluded_objects,1);
 assert.equal(accounting().retired_objects,4);
 const revoke=`select tongs.revoke_storage_historical_accounting('${historical.last.id}','Reviewed disposable revocation');`;
 const beforeRevoke=sql(`select row_to_json(o) from storage.objects o where id='${ids[4]}';`);
 const revoked=parse(sql(operator(revoke)));assert.deepEqual(parse(sql(operator(revoke))),revoked);
 assert.equal(sql(`select row_to_json(o) from storage.objects o where id='${ids[4]}';`),beforeRevoke,'revocation changes no object');
 assert.equal(accounting().excluded_objects,0);
 fails(operator(approve(historical.last)),/revoked/);
 assert.equal(financial(),before,'no financial journal, receipt or subscription mutations');
 sql(service(`begin;set local storage.allow_delete_query='true';delete from storage.objects where id=any(array[${ids.map(x=>`'${x}'::uuid`).join(',')}]) or name in ('${moved}','workspaces/${workspace}/accounting-filler.bin');commit;`));
 assert.equal(capacity().used_bytes,0);assert.equal(capacity().total_bytes,initial.total_bytes);
 return {result:'PASS',scope:'Disposable SQL adapter; not end-user HTTP or hosted acceptance',checks:['operator/RLS denial','exact manifest','interrupted approval','idempotent approval','immutable audit','access bookkeeping','unknown owner denial','rollback','full successor accounting','copy','rename','delete/recreate','same-size overwrite','version replay','two-connection capacity race','revocation','unchanged journals/subscriptions/entitlement']};
}
