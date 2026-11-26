import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readAdmissionSuccessor} from './storage-admission-successor.mjs';

// Only the synthetic fixture in certify-storage-capacity-isolated.mjs. Never
// imports creator inventory, grants real capacity or restarts historical cert.
export function certifyStorageReviewAdmission({sql,service,authenticated,owner,other,workspace,capacity}) {
 const id='e3000000-0000-4000-8000-000000000001',orphan='a3000000-0000-4000-8000-000000000001';
 const parse=s=>JSON.parse(s.trim().split('\n').at(-1));
 const record=()=>sql(`select jsonb_build_object('object',to_jsonb(o),'excluded',tongs._storage_historical_matches(o),'retirements',(select count(*) from tongs.storage_historical_retirements)) from storage.objects o where id='${id}';`);
 const before=record(),limit=capacity().total_bytes;
 const update=assignment=>`update storage.objects set ${assignment} where id='${id}';`;
 const recover=`insert into tongs.workspaces(id,name,created_by,org_id) values('${orphan}','Synthetic review fixture','${owner}','91000000-0000-4000-8000-000000000001');`;
 const filler=`insert into storage.objects(bucket_id,name,metadata,version) values('forge-workpieces','workspaces/${workspace}/review-filler.bin','{"size":${limit-10}}','review');`;
 // Establish that these regressions fail on the actual unmodified predecessor.
 sql(service(`begin;${update("user_metadata='{\"changed\":true}'")}set constraints all immediate;rollback;`));
 assert.equal(record(),before,'predecessor reproduction is rolled back');
 assert.throws(()=>sql(service(`begin;${recover}${filler}${update("version='1'")}rollback;`)),/storage_capacity_exceeded/);
 const access=()=>sql("select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),'objects_acl',(select jsonb_build_object('owner',relowner,'acl',relacl,'rls',relrowsecurity) from pg_class where oid='storage.objects'::regclass),'capacity_acl',(select jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig) from pg_proc where oid='tongs._enforce_storage_capacity()'::regprocedure));");
 const {contract,sql:proposal}=readAdmissionSuccessor();
 const catalog=()=>parse(sql(`select jsonb_object_agg(key,value) from (
  select 'function|'||p.oid::regprocedure::text key,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) value
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('tongs','storage','public','auth') and p.prokind in ('f','p')
  union all select 'trigger|'||t.tgrelid::regclass::text||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('tongs','storage','public','auth')
  union all select 'relation|'||c.oid::regclass::text,jsonb_build_object('owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('tongs','storage','public','auth') and c.relkind in ('r','v','S')
 ) x;`));
 const checkSql=readFileSync(contract.executionContract,'utf8').trim().replace(/;$/,'');
 const check=(prefix='',suffix='')=>parse(sql(`${prefix}select row_to_json(x) from (${checkSql}) x;${suffix}`)).storage_contract_ok;
 assert.equal(check('begin read only;','commit;'),false,'predecessor cannot pass successor execution contract');
 const beforeAccess=access(),beforeCatalog=catalog();
 assert.throws(()=>sql(proposal.replace(/commit;\s*$/,'select 1/0; commit;')),/division by zero/);
 assert.equal(access(),beforeAccess,'interrupted correction rolls back');
 assert.deepEqual(catalog(),beforeCatalog,'interrupted migration leaves catalog exact');
 sql(proposal);
 const afterCatalog=catalog();
 const delta={added:Object.keys(afterCatalog).filter(k=>!Object.hasOwn(beforeCatalog,k)).sort(),
  changed:Object.keys(beforeCatalog).filter(k=>Object.hasOwn(afterCatalog,k)&&JSON.stringify(beforeCatalog[k])!==JSON.stringify(afterCatalog[k])).sort(),
  removed:Object.keys(beforeCatalog).filter(k=>!Object.hasOwn(afterCatalog,k)).sort()};
 assert.deepEqual(delta,contract.catalogDelta,'only the reviewed three catalog objects may differ');
 assert.equal(check('begin read only;','commit;'),true);
 for(const mutation of [
  'alter table storage.objects disable trigger forge_storage_capacity_identity_guard;',
  'drop trigger forge_storage_capacity_identity_guard on storage.objects;',
  "create or replace function tongs._enforce_storage_capacity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$begin return new;end$$;",
  'drop trigger forge_storage_capacity_statement_guard on storage.objects;create trigger forge_storage_capacity_statement_guard after insert or update on storage.objects for each row execute function tongs._enforce_storage_capacity();'
 ])assert.equal(check('begin;'+mutation,'rollback;'),false,'successor catalog drift must fail closed');
 for(const path of ['supabase/tests/storage_billing_hosted_release_contract.sql','supabase/tests/storage_successor_hosted_release_contract.sql']){
  const legacy=readFileSync(path,'utf8').trim().replace(/;$/,'');
  assert.equal(parse(sql(`begin read only;select row_to_json(x) from (${legacy}) x;commit;`)).storage_contract_ok,true,'previous cumulative access contracts remain valid');
 }
 assert.equal(access(),beforeAccess,'RLS, relation/function ACLs, ownership and search_path unchanged');
 for(const assignment of ["user_metadata='{\"changed\":true}'",`owner='${other}'`,`owner_id='${other}'`,"created_at='2026-08-02'"]){
  assert.throws(()=>sql(service(update(assignment))),/storage_billing_owner_unresolved/);
  assert.equal(record(),before,'rejected identity change preserves original and exclusion');
 }
 sql(service(`update storage.objects set last_accessed_at=now(),updated_at=now() where id='${id}';`));
 assert.equal(parse(record()).excluded,true,'access bookkeeping remains excluded');
 const historicalIdentity=()=>sql(`select tongs._storage_historical_identity(o) from storage.objects o where id='${id}';`);
 const identity=historicalIdentity();
 const unauthorized=sql(authenticated(other,`with changed as (${update(`owner='${other}',owner_id='${other}'`).replace(/;$/,'')} returning id) select count(*) from changed;`));
 assert.equal(unauthorized.trim(),'0','RLS prevents unrelated ownership reassignment');
 assert.equal(historicalIdentity(),identity);
 for(const assignment of ["user_metadata='{\"changed\":true}'",`owner='${other}'`,`owner_id='${other}'`]){
  assert.throws(()=>sql(service(`begin;${recover}${filler}${update(assignment)}rollback;`)),/storage_capacity_exceeded/);
 }
 // Same shape as Storage's ON CONFLICT probe; rollback is allowed, commit is not.
 const probe=`insert into storage.objects(bucket_id,name,version) select bucket_id,name,'1' from storage.objects where id='${id}' on conflict(bucket_id,name) do update set version=excluded.version;`;
 sql(service(`begin;${recover}${filler}${probe}rollback;`));
 assert.throws(()=>sql(service(`begin;${recover}${filler}${probe}commit;`)),/storage_capacity_exceeded/);
 // Naming metadata in the final publication statement must enforce admission
 // immediately even if byte-for-byte identical, before the following rollback.
 assert.throws(()=>sql(service(`begin;${recover}${filler}${update("version='new',metadata=metadata")}rollback;`)),/storage_capacity_exceeded/);
 assert.throws(()=>sql(service(`begin;${recover}${filler}${update("version='large',metadata='{\"size\":11,\"eTag\":\"large\"}'")}rollback;`)),/storage_capacity_exceeded/);
 sql(service(`begin;${recover}${filler}${update("version='small',metadata='{\"size\":5,\"eTag\":\"small\"}'")}set constraints all immediate;rollback;`));
 assert.equal(historicalIdentity(),identity,'all test replacements roll back');
 // Once fully billable, descriptive user metadata is allowed even after expiry;
 // version changes and growth still require admission. Use a rollback fixture.
 sql(service(`begin;${recover}${update("version='billable',metadata='{\"size\":5,\"eTag\":\"billable\"}'")}set constraints all immediate;
  update tongs.billing_subscriptions set status='canceled' where stripe_subscription_id='sub_base';
  ${update("user_metadata='{\"description\":\"valid edit\"}'")}
  ${update("metadata=metadata || '{\"mimetype\":\"application/json\",\"cacheControl\":\"60\"}'::jsonb")}set constraints all immediate;rollback;`));
 assert.throws(()=>sql(service(`begin;${recover}${update("version='billable',metadata='{\"size\":5,\"eTag\":\"billable\"}'")}set constraints all immediate;
  update tongs.billing_subscriptions set status='canceled' where stripe_subscription_id='sub_base';
  ${update("metadata=metadata || '{\"size\":6}'::jsonb")}rollback;`)),/storage_capacity_exceeded/);
 return {result:'PASS',migrationVersion:contract.migration.version,migrationSha256:createHash('sha256').update(proposal).digest('hex'),catalogDelta:delta,checks:[
  'both predecessor defects reproduced with rollback','transactional correction','unchanged RLS/ACL/owners',
  'all pinned identity fields admitted','bookkeeping allowed','over-capacity metadata retirement denied',
  'rollback-only upsert probe allowed','durable probe rejected','identical-metadata publication rejected synchronously',
  'small replacement admitted','large replacement rejected','ordinary descriptive metadata allowed after expiry']};
}
