-- Appended inside the existing synthetic owner activation fixture's rollback.
-- No funding records or provider execution are added by this permission proof.
reset role;
do $$ declare fn record; total integer:=0; begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='tongs' and c.relkind='r' and c.relname like 'owner_hearth_research_%')<>15
  or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='tongs' and c.relkind='r' and c.relname like 'owner_hearth_research_%'
    and (not c.relrowsecurity or not c.relforcerowsecurity or not exists(
      select 1 from pg_trigger tr where tr.tgrelid=c.oid and not tr.tgisinternal and tr.tgfoid='tongs._reject_accounting_mutation()'::regprocedure))) then
  raise exception 'research table count, forced RLS, or immutable trigger changed'; end if;
 for fn in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='tongs' and (p.proname like '%owner_hearth_research%' or p.proname='_finish_owner_hearth_research_stage')
 loop
  total:=total+1;
  if pg_get_userbyid(fn.proowner)<>'postgres' or not fn.prosecdef
   or not coalesce('search_path=pg_catalog'=any(fn.proconfig),false)
   or exists(select 1 from aclexplode(fn.proacl) a where a.grantee=0)
   or has_function_privilege('anon',fn.oid,'EXECUTE')
   or has_function_privilege('authenticated',fn.oid,'EXECUTE')<>(fn.proname='record_owner_hearth_research_review')
   or not has_function_privilege('service_role',fn.oid,'EXECUTE') then
   raise exception 'research function access/security mismatch: %',fn.proname; end if;
 end loop;
 if total<>21 then raise exception 'complete research function inventory changed'; end if;
end $$;

set local role anon;
do $$ begin
 begin perform tongs._owner_hearth_research_latest_authorization(null,null);
  raise exception 'anonymous helper execution allowed';
 exception when insufficient_privilege then
  if sqlerrm not like 'permission denied for function %' then raise; end if;
 end;
 begin perform tongs._finish_owner_hearth_research_stage(null,'missing','captured',0,'{}','{}');
  raise exception 'anonymous stage helper execution allowed';
 exception when insufficient_privilege then
  if sqlerrm not like 'permission denied for function %' then raise; end if;
 end;
end $$;
reset role;
set local role authenticated;
-- A forged claim must not bypass the EXECUTE ACL.
set local request.jwt.claim.role='service_role';
do $$ begin
 begin perform tongs._owner_hearth_research_latest_authorization(null,null);
  raise exception 'authenticated helper execution allowed';
 exception when insufficient_privilege then
  if sqlerrm not like 'permission denied for function %' then raise; end if;
 end;
 begin perform tongs._finish_owner_hearth_research_stage(null,'missing','captured',0,'{}','{}');
  raise exception 'authenticated stage helper execution allowed';
 exception when insufficient_privilege then
  if sqlerrm not like 'permission denied for function %' then raise; end if;
 end;
end $$;
reset role;
set local role service_role;
do $$ begin
 perform tongs._owner_hearth_research_latest_authorization(null,null);
 begin perform tongs._finish_owner_hearth_research_stage(null,'missing','captured',0,'{}','{}');
  raise exception 'missing stage accepted';
 exception when insufficient_privilege then
  if sqlerrm<>'research stage authorization missing' then raise; end if;
 end;
end $$;
reset role;

insert into tongs.owner_hearth_research_stage_events values(
 '91000000-0000-4000-8000-000000000305','91000000-0000-4000-8000-000000000033','permission-stage',1,
 'search',1,'authorized',repeat('d',64),0,null,'not_incurred','{}',null,'{}',now());
set local role service_role;
do $$ declare outcome jsonb; begin
 outcome:=tongs._finish_owner_hearth_research_stage('91000000-0000-4000-8000-000000000033','permission-stage','captured',0,'{"response_bytes":0}','{}');
 if outcome->>'event_type'<>'captured' or (outcome->>'replay')::boolean then raise exception 'legitimate service helper execution failed'; end if;
 outcome:=tongs._finish_owner_hearth_research_stage('91000000-0000-4000-8000-000000000033','permission-stage','captured',0,'{"response_bytes":0}','{}');
 if (outcome->>'replay')::boolean is not true then raise exception 'service helper replay failed'; end if;
end $$;
reset role;
insert into tongs.episodes(id,workspace_id) values('91000000-0000-4000-8000-000000000301','91000000-0000-4000-8000-000000000010');
insert into tongs.workspaces(id,name) values('91000000-0000-4000-8000-000000000302','Unrelated membership');
insert into tongs.workspace_members(workspace_id,user_id,role) values
 ('91000000-0000-4000-8000-000000000302','91000000-0000-4000-8000-000000000001','member'),
 ('91000000-0000-4000-8000-000000000302','91000000-0000-4000-8000-000000000002','member');
grant select on tongs.workspace_members to authenticated;
insert into tongs.owner_hearth_research_result_packages values(
 '91000000-0000-4000-8000-000000000303','91000000-0000-4000-8000-000000000033','permission-proof-only',
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000301',
 repeat('a',64),'synthetic-no-provider',0,0,'{}','{}',repeat('b',64),'ready_for_review',now());
insert into tongs.owner_hearth_research_source_records values(
 '91000000-0000-4000-8000-000000000304','91000000-0000-4000-8000-000000000303',1,'fixture-source',
 'https://source.example.test',repeat('c',64),'{}',now());
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare reviewed jsonb; begin
 if (select count(*) from tongs.owner_hearth_research_result_packages)<>1
  or (select count(*) from tongs.owner_hearth_research_source_records)<>1 then
  raise exception 'intended creator reads unavailable'; end if;
 reviewed:=tongs.record_owner_hearth_research_review('91000000-0000-4000-8000-000000000303','permission-owner-review','accepted','fixture');
 if reviewed->>'review_state'<>'accepted' or (reviewed->>'replay')::boolean then raise exception 'creator review unavailable'; end if;
 reviewed:=tongs.record_owner_hearth_research_review('91000000-0000-4000-8000-000000000303','permission-owner-review','accepted','fixture');
 if (reviewed->>'replay')::boolean is not true then raise exception 'authorized review replay failed'; end if;
end $$;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
do $$ begin
 if exists(select 1 from tongs.owner_hearth_research_result_packages)
  or exists(select 1 from tongs.owner_hearth_research_source_records) then raise exception 'another creator read private results'; end if;
 begin perform tongs.record_owner_hearth_research_review('91000000-0000-4000-8000-000000000303','permission-owner-review','accepted','fixture');
  raise exception 'another creator replayed private review';
 exception when insufficient_privilege then if sqlerrm<>'research package review denied' then raise; end if; end;
end $$;
reset role;
delete from tongs.workspace_members where workspace_id='91000000-0000-4000-8000-000000000010' and user_id='91000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from tongs.owner_hearth_research_result_packages)
  or exists(select 1 from tongs.owner_hearth_research_source_records) then raise exception 'unrelated membership substituted for revoked package access'; end if;
 begin perform tongs.record_owner_hearth_research_review('91000000-0000-4000-8000-000000000303','permission-owner-review','accepted','fixture');
  raise exception 'revoked creator replayed private review';
 exception when insufficient_privilege then if sqlerrm<>'research package review denied' then raise; end if; end;
end $$;
reset role;
-- Restore only the synthetic membership for the existing cutover proof.
insert into tongs.workspace_members(workspace_id,user_id,role) values('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000001','owner');
set local request.jwt.claim.role='service_role';
