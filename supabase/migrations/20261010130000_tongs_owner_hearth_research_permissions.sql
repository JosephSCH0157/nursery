-- Forward-only permission correction. The original research migration is frozen.
-- This file alone does NOT protect the interval after the original COMMIT:
-- production application requires the separately reviewed default-ACL guard.
-- No spending authority, credentials, activation, or financial terms are changed.
begin;

do $$
declare fn record; names text[] := array[
 '_owner_hearth_research_latest_authorization','read_owner_hearth_research_execution_requirement',
 'quote_owner_hearth_research_operation','accept_owner_hearth_research_operation',
 'acquire_owner_hearth_research_aggregate_admission','begin_owner_hearth_research_stage',
 '_finish_owner_hearth_research_stage','complete_owner_hearth_research_stage',
 'fail_owner_hearth_research_stage','mark_owner_hearth_research_stage_unknown',
 'freeze_owner_hearth_research_synthesis_request','bind_owner_hearth_research_bounded_provider_request',
 'resolve_owner_hearth_research_paid_execution_context','authorize_owner_hearth_research_openai_attempt',
 'settle_owner_hearth_research_operation','settle_owner_hearth_research_before_synthesis',
 'persist_owner_hearth_research_result','read_owner_hearth_research_result',
 'record_owner_hearth_research_review','read_owner_hearth_research_canary_reconciliation',
 'activate_owner_hearth_research_package'];
begin
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='tongs' and p.proname=any(names))<>21 then
  raise exception 'research function inventory mismatch';
 end if;
 for fn in select p.oid::regprocedure as signature,p.proname,p.prosecdef,p.proconfig,
                  pg_get_userbyid(p.proowner) as owner
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='tongs' and p.proname=any(names)
 loop
  if fn.owner<>'postgres' or not fn.prosecdef or not coalesce('search_path=pg_catalog'=any(fn.proconfig),false) then
   raise exception 'research function security properties mismatch: %',fn.signature;
  end if;
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
  if fn.proname='record_owner_hearth_research_review' then
   execute format('grant execute on function %s to authenticated',fn.signature);
  end if;
 end loop;
end $$;

-- Qualify the outer workspace: an unrelated membership must not satisfy RLS.
alter policy owner_hearth_research_result_read on tongs.owner_hearth_research_result_packages
 using(owner_user_id=auth.uid() and exists(
  select 1 from tongs.workspace_members m
  where m.workspace_id=owner_hearth_research_result_packages.workspace_id and m.user_id=auth.uid()));

-- Replays are reads and must pass the same current owner/membership check.
create or replace function tongs.record_owner_hearth_research_review(
 p_result_package_id uuid,p_event_key text,p_review_state text,p_note text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pkg tongs.owner_hearth_research_result_packages%rowtype;
 existing tongs.owner_hearth_research_review_events%rowtype; seq int; actor uuid:=auth.uid();
begin
 if actor is null or p_review_state not in('accepted','changes_requested','rejected') then
  raise exception 'authenticated research review required' using errcode='42501'; end if;
 select * into pkg from tongs.owner_hearth_research_result_packages where id=p_result_package_id;
 if pkg.id is null or pkg.owner_user_id<>actor or not exists(
  select 1 from tongs.workspace_members m where m.workspace_id=pkg.workspace_id and m.user_id=actor) then
  raise exception 'research package review denied' using errcode='42501'; end if;
 select * into existing from tongs.owner_hearth_research_review_events where event_key=btrim(p_event_key);
 if found then
  if existing.result_package_id<>pkg.id or existing.reviewer_id<>actor then
   raise exception 'research review replay binding mismatch' using errcode='42501'; end if;
  return to_jsonb(existing)||jsonb_build_object('replay',true);
 end if;
 select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_research_review_events where result_package_id=pkg.id;
 insert into tongs.owner_hearth_research_review_events values(
  gen_random_uuid(),pkg.id,seq,btrim(p_event_key),p_review_state,actor,nullif(btrim(coalesce(p_note,'')),''),now()) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

notify pgrst,'reload schema';
commit;
