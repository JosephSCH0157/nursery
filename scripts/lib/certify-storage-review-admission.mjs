import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const proposalPath='database/proposals/20261120161347_storage_accounting_identity_admission.sql';

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
 const beforeAccess=access(),proposal=readFileSync(proposalPath,'utf8');
 assert.throws(()=>sql(proposal.replace(/commit;\s*$/,'select 1/0; commit;')),/division by zero/);
 assert.equal(access(),beforeAccess,'interrupted correction rolls back');
 sql(proposal);
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
  ${update("user_metadata='{\"description\":\"valid edit\"}'")}set constraints all immediate;rollback;`));
 return {result:'PASS',proposalSha256:createHash('sha256').update(proposal).digest('hex'),checks:[
  'both predecessor defects reproduced with rollback','transactional correction','unchanged RLS/ACL/owners',
  'all pinned identity fields admitted','bookkeeping allowed','over-capacity metadata retirement denied',
  'rollback-only upsert probe allowed','durable probe rejected','identical-metadata publication rejected synchronously',
  'small replacement admitted','large replacement rejected','ordinary descriptive metadata allowed after expiry']};
}
