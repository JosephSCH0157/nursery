-- No activation, funding, price, or credential is created here. Rollout revisions
-- are appended separately after the compatible application is published.
begin;

alter table tongs.openai_text_rollout_revisions add column funding_scope text not null default 'all'
  check (funding_scope in ('all','forge'));

create function tongs._openai_rollout_for_funding(p_route_code text,p_credential_funding text)
returns setof tongs.openai_text_rollout_revisions
language sql stable security definer set search_path=pg_catalog as $$
 select r.* from tongs.openai_text_rollout_revisions r where r.route_code=p_route_code
 and (r.funding_scope='all' or p_credential_funding='forge') order by r.revision desc limit 1;
$$;

create function tongs.read_openai_execution_requirement(p_route_code text,p_credential_funding text default 'forge')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare r tongs.openai_text_rollout_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_credential_funding not in ('forge','byo_customer') then raise exception 'invalid credential funding'; end if;
 select * into r from tongs._openai_rollout_for_funding(p_route_code,p_credential_funding);
 if not found then raise exception 'paid_execution_control_unavailable'; end if;
 return jsonb_build_object('mode',r.mode,'route_code',r.route_code,'rollout_revision',r.revision,
   'funding_context_required',r.mode in ('enforce','halt_new'),'cost_policy_revision_id',r.cost_policy_revision_id);
end $$;

-- Current membership controls delivery, not service-side economic continuation.
create function tongs.assert_openai_result_delivery_access(p_user_id uuid,p_workspace_id uuid,p_workpiece_id text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform tongs._require_pricing_service_role();
 if p_user_id is null or not exists(select 1 from tongs.workspace_members
   where user_id=p_user_id and workspace_id=p_workspace_id) then
   raise exception 'current workspace access required for result delivery' using errcode='42501';
 end if;
 return true;
end $$;

-- Clone the fully validated immutable binding resolver, retaining its evolved
-- audio/payer fields. Only execution-time eligibility is removed for recovery.
do $$ declare src text; dst text;
begin
 src:=pg_get_functiondef('tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'::regprocedure);
 dst:=replace(src,'resolve_openai_text_paid_execution_context','resolve_openai_text_recovery_context');
 dst:=replace(dst, 'or v_rollout.mode<>''enforce'' or v_rollout.cost_policy_revision_id<>v_cost.id or v_cost.lifecycle_state not in (''pilot_candidate'',''active'')','');
 dst:=replace(dst, 'if not tongs._validate_quote_authority_before_provider(v_quote.id, p_route_code) then raise exception ''accepted payer authority changed or was revoked'' using errcode=''42501''; end if;', '');
 if dst=src or position('v_rollout.mode<>''enforce''' in dst)>0
   or position('_validate_quote_authority_before_provider' in dst)>0 then
   raise exception 'recovery resolver shape changed: review required'; end if;
 dst:=replace(dst,'perform tongs._require_pricing_service_role();',
   'perform tongs._require_pricing_service_role();
    if not exists(select 1 from tongs.openai_text_provider_captures where reservation_id=p_reservation_id)
       and tongs._funding_reservation_state(p_reservation_id) not in (''settled'',''submission_unknown'',''attempt_started'') then
      raise exception ''recovery evidence required; provider execution forbidden'' using errcode=''42501''; end if;');
 execute dst;
end $$;

-- BYO uses its previous all-funding policy; Forge-only halts must not select a
-- different policy for a customer's direct-provider credential.
do $$ declare src text; dst text; fn text;
begin
 foreach fn in array array[
 'create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)',
 'reserve_customer_openai_text_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text)',
 'resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'] loop
   src:=pg_get_functiondef(('tongs.'||fn)::regprocedure);
   dst:=replace(src,'tongs._current_openai_text_rollout(p_route_code)',
     'tongs._openai_rollout_for_funding(p_route_code,'||case when fn like 'resolve_%' then 'v_binding.credential_funding' else 'p_credential_funding' end||')');
   if src=dst then raise exception 'funding rollout insertion point changed: %',fn; end if;
   execute dst;
 end loop;
end $$;

-- Absence of an aggregate assignment is never admission for real Forge work.
do $$ declare src text; dst text; target regprocedure;
begin
 -- Production's customer-authorization wrapper delegates to this retained
 -- implementation. Preserve the wrapper and patch only its rollout lookup.
 target:=coalesce(to_regprocedure('tongs._authorize_openai_text_provider_attempt_before_customer_test_scope(uuid,text,smallint,bigint,integer,jsonb)'),
   'tongs.authorize_openai_text_provider_attempt(uuid,text,smallint,bigint,integer,jsonb)'::regprocedure);
 src:=pg_get_functiondef(target);
 dst:=replace(src,'tongs._current_openai_text_rollout(v_binding.route_code)',
   'tongs._openai_rollout_for_funding(v_binding.route_code,v_binding.credential_funding)');
 if src=dst then raise exception 'provider attempt rollout insertion point changed'; end if;
 execute dst;
end $$;

do $$ declare src text; dst text;
begin
 src:=pg_get_functiondef('tongs.authorize_openai_text_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)'::regprocedure);
 dst:=replace(src,'aggregate_result:=tongs.begin_paid_operation_aggregate_attempt',
 'if exists(select 1 from tongs.openai_text_funding_bindings b
      join tongs.openai_text_cost_policy_revisions c on c.id=b.cost_policy_revision_id
      where b.reservation_id=p_reservation_id and (b.credential_funding=''forge'' or c.supporting_cost_ceiling_micros>0))
    and not exists(select 1 from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id) then
    return jsonb_build_object(''provider_execution_authorized'',false,''reason'',''aggregate_admission_required''); end if;
  aggregate_result:=tongs.begin_paid_operation_aggregate_attempt');
 if src=dst then raise exception 'aggregate attempt insertion point changed'; end if;
 execute dst;
end $$;

create function tongs._guard_openai_job_cutover() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare route text; mode text;
begin
 if new.job_type not in ('hammer_transcript_prep','hammer_transcript_regeneration') then return new; end if;
 route:=case new.job_type when 'hammer_transcript_prep' then 'hammer.transcript_prep' else 'hammer.transcript_regeneration' end;
 select r.mode into mode from tongs._current_openai_text_rollout(route) r;
 if mode='halt_new' and (tg_op='INSERT' or (new.status in ('queued','running') and new.status is distinct from old.status)) then
   raise exception 'paid_submissions_halted: existing evidence can reconcile; no transcription job may start' using errcode='42501';
 end if;
 return new;
end $$;
do $$ begin
 if to_regclass('tongs.workpiece_jobs') is not null then
   create trigger openai_job_cutover before insert or update on tongs.workpiece_jobs
   for each row execute function tongs._guard_openai_job_cutover();
 end if;
end $$;

-- Direct customer result RPC also rechecks access after revocation.
do $$ declare src text; dst text;
begin
 src:=pg_get_functiondef('tongs.read_my_openai_transcription_result(text)'::regprocedure);
 dst:=replace(src,'if not found then return null; end if;',
 'if not found then return null; end if;
  if not exists(select 1 from tongs.workspace_members where workspace_id=r.workspace_id and user_id=uid) then
    raise exception ''current workspace access required'' using errcode=''42501''; end if;');
 if src=dst then raise exception 'transcription delivery guard insertion point changed'; end if;
 execute dst;
end $$;

revoke all on function tongs._openai_rollout_for_funding(text,text),tongs.read_openai_execution_requirement(text,text),
 tongs.assert_openai_result_delivery_access(uuid,uuid,text),tongs.resolve_openai_text_recovery_context(text,text,uuid,uuid,uuid,text,text),
 tongs._guard_openai_job_cutover() from public,anon,authenticated;
grant execute on function tongs.read_openai_execution_requirement(text,text),tongs.assert_openai_result_delivery_access(uuid,uuid,text),
 tongs.resolve_openai_text_recovery_context(text,text,uuid,uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
