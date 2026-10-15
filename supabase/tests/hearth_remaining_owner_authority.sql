begin;

create function pg_temp.is_guarded_hearth_historical_replay(
  p_marker text,
  p_database_name text,
  p_latest_migration text,
  p_fixture_identity_verified boolean
) returns boolean
language sql
immutable
set search_path=pg_catalog
as $$
  select coalesce((p_marker='hearth-historical-domain-v1'
    and p_database_name='postgres'
    and p_latest_migration='20261011870000'
    and p_fixture_identity_verified is true),false)
$$;

create temporary table hearth_historical_regression_context(
  disposable_replay boolean not null
) on commit drop;

do $$
declare
  v_marker text:=current_setting('forge.local_historical_replay',true);
  v_latest text;
  v_fixture_identity boolean;
  v_disposable_replay boolean;
begin
  select max(version) into v_latest
  from supabase_migrations.schema_migrations;

  select
    exists(
      select 1 from auth.users
      where id='fe000000-0000-4000-8000-000000000001'
    )
    and exists(
      select 1 from tongs.workspaces
      where id='fe000000-0000-4000-8000-000000000201'
        and created_by='fe000000-0000-4000-8000-000000000001'
    )
    and exists(
      select 1 from tongs.platform_operators
      where user_id='fe000000-0000-4000-8000-000000000001'
        and reason='Local-only historical prerequisite for 20260916110806'
    )
    and exists(
      select 1 from tongs.episodes
      where id='fe110000-0000-4000-8000-000000000001'
        and workspace_id='fe000000-0000-4000-8000-000000000201'
        and created_by='fe000000-0000-4000-8000-000000000001'
        and label='Synthetic historical Hearth replay workpiece'
        and creation_origin='synthetic_historical_replay'
    )
    and (select count(*) from tongs.unified_visual_plan_operations
      where workspace_id='fe000000-0000-4000-8000-000000000201'
        and workpiece_id='fe110000-0000-4000-8000-000000000001'
        and created_by='fe000000-0000-4000-8000-000000000001'
        and normalized_inputs_json->>'fixture'='synthetic-historical-replay'
        and provider_response_json->>'fixture'='synthetic-historical-replay'
        and receipt_json->>'fixture'='synthetic-historical-replay'
        and (receipt_json->>'not_production_evidence')::boolean is true)=30
    and (select count(*) from tongs.broll_operation_receipts
      where workspace_id='fe000000-0000-4000-8000-000000000201'
        and workpiece_id='fe110000-0000-4000-8000-000000000001'
        and created_by='fe000000-0000-4000-8000-000000000001'
        and operation_type='prompt_interpretation'
        and normalized_inputs_json->>'fixture'='synthetic-historical-replay'
        and provider_response_json->>'fixture'='synthetic-historical-replay'
        and receipt_json->>'fixture'='synthetic-historical-replay'
        and (receipt_json->>'not_production_evidence')::boolean is true)=29
    into v_fixture_identity;

  v_disposable_replay:=pg_temp.is_guarded_hearth_historical_replay(
    v_marker,current_database(),v_latest,v_fixture_identity);

  -- A marker by itself is never sufficient. Exercise every independent guard.
  if pg_temp.is_guarded_hearth_historical_replay(
       null,current_database(),v_latest,v_fixture_identity)
     or pg_temp.is_guarded_hearth_historical_replay(
       'wrong-marker',current_database(),v_latest,v_fixture_identity)
     or pg_temp.is_guarded_hearth_historical_replay(
       'hearth-historical-domain-v1',current_database(),v_latest,false)
     or pg_temp.is_guarded_hearth_historical_replay(
       'hearth-historical-domain-v1','not-the-disposable-database',v_latest,true)
     or pg_temp.is_guarded_hearth_historical_replay(
       'hearth-historical-domain-v1',current_database(),'20261011860000',true)
  then raise exception 'disposable replay guard accepted a missing, incorrect, or spoofed identity'; end if;

  insert into hearth_historical_regression_context(disposable_replay)
  values(v_disposable_replay);
end $$;

grant select on hearth_historical_regression_context to service_role;
set local role service_role;

do $$
declare
  v_owner_before bigint;
  v_journal_before bigint;
  v_disposable_replay boolean;
  v_expected_visual_bindings bigint;
  v_expected_motion_bindings bigint;
  v_expected_thumbnail_results bigint;
begin
  select disposable_replay into v_disposable_replay
  from hearth_historical_regression_context;
  v_expected_visual_bindings:=case when v_disposable_replay then 0 else 3 end;
  v_expected_motion_bindings:=case when v_disposable_replay then 0 else 2 end;
  v_expected_thumbnail_results:=case when v_disposable_replay then 0 else 1 end;

  select count(*) into v_owner_before from tongs.owner_cost_operations;
  select count(*) into v_journal_before from tongs.accounting_journal_events;

  if (select count(*) from tongs.unified_visual_plan_historical_authorities) <> 30 then
    raise exception 'expected exactly 30 grandfathered unified visual plans';
  end if;
  if (select count(*) from tongs.broll_interpretation_historical_authorities) <> 29 then
    raise exception 'expected exactly 29 grandfathered B-roll interpretations';
  end if;
  if exists (
    select 1 from tongs.unified_visual_plan_historical_authorities historical
    join tongs.openai_text_funding_bindings binding on binding.operation_id=historical.operation_id
  ) or exists (
    select 1 from tongs.broll_interpretation_historical_authorities historical
    join tongs.openai_text_funding_bindings binding on binding.operation_id=historical.operation_id
  ) then raise exception 'historical authority acquired a customer funding binding'; end if;
  if exists (
    select 1 from tongs.unified_visual_plan_historical_authorities historical
    join tongs.owner_cost_operations operation on operation.operation_key=historical.operation_id
  ) or exists (
    select 1 from tongs.broll_interpretation_historical_authorities historical
    join tongs.owner_cost_operations operation on operation.operation_key=historical.operation_id
  ) then raise exception 'historical authority acquired an owner-cost operation'; end if;
  if (select count(*) from tongs.openai_text_funding_bindings where route_code='visual.unified_plan') <> v_expected_visual_bindings
    or (select count(*) from tongs.openai_text_funding_bindings where route_code='motion.broll_interpretation') <> v_expected_motion_bindings
    or (select count(*) from tongs.hearth_thumbnail_direction_generation_results
        where reservation_id is not null and owner_cost_attempt_id is null) <> v_expected_thumbnail_results
  then raise exception 'existing customer authority counts changed for % mode',
    case when v_disposable_replay then 'guarded disposable replay' else 'production historical' end;
  end if;

  if (select count(*)
      from tongs.unified_visual_plan_historical_authorities historical
      join tongs.unified_visual_plan_operations operation
        on operation.operation_id=historical.operation_id
       and operation.provider_response_hash=historical.provider_response_hash
       and encode(extensions.digest(convert_to(operation.receipt_json::text,'UTF8'),'sha256'),'hex')=historical.receipt_hash)<>30
    or (select count(*)
      from tongs.broll_interpretation_historical_authorities historical
      join tongs.broll_operation_receipts receipt
        on receipt.operation_id=historical.operation_id
       and receipt.result_prompt_revision_id=historical.prompt_revision_id
       and receipt.provider_response_hash=historical.provider_response_hash
       and encode(extensions.digest(convert_to(receipt.receipt_json::text,'UTF8'),'sha256'),'hex')=historical.receipt_hash
      join tongs.broll_prompt_revisions prompt
        on prompt.id=historical.prompt_revision_id)<>29
  then raise exception 'historical Hearth cross-record receipt integrity changed'; end if;
  if exists (
    select 1 from tongs.hearth_thumbnail_direction_generation_results
    where num_nonnulls(reservation_id,owner_cost_attempt_id)<>1
  ) then raise exception 'thumbnail direction XOR authority failed'; end if;
  if (select count(*) from tongs.owner_cost_operations) <> v_owner_before
    or (select count(*) from tongs.accounting_journal_events) <> v_journal_before
  then raise exception 'historical verification invented financial evidence'; end if;

  if not exists(select 1 from pg_trigger where tgrelid='tongs.unified_visual_plan_operations'::regclass
      and tgname='unified_visual_plan_execution_authority' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgrelid='tongs.broll_operation_receipts'::regclass
      and tgname='broll_operation_receipts_execution_authority' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgrelid='tongs.broll_prompt_revisions'::regclass
      and tgname='broll_prompt_revision_owner_authority' and not tgisinternal)
  then raise exception 'forward authority enforcement trigger missing'; end if;

  if has_function_privilege('anon','tongs.begin_owner_unified_visual_plan(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text)','EXECUTE')
    or has_function_privilege('authenticated','tongs.begin_owner_unified_visual_plan(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text)','EXECUTE')
    or not has_function_privilege('service_role','tongs.begin_owner_unified_visual_plan(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','tongs.begin_owner_broll_prompt_interpretation(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text,text,text,text,text,text,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','tongs.begin_owner_broll_prompt_interpretation(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text,text,text,text,text,text,text,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','tongs.begin_owner_broll_prompt_interpretation(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text,text,text,text,text,text,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','tongs.finalize_owner_hearth_thumbnail_direction_generation_result(uuid,uuid,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','tongs.finalize_owner_hearth_thumbnail_direction_generation_result(uuid,uuid,uuid,text)','EXECUTE')
    or not has_function_privilege('service_role','tongs.finalize_owner_hearth_thumbnail_direction_generation_result(uuid,uuid,uuid,text)','EXECUTE')
  then raise exception 'owner RPC execute boundary is incorrect'; end if;

  begin
    insert into tongs.unified_visual_plan_historical_authorities
    select * from tongs.unified_visual_plan_historical_authorities limit 1;
    raise exception 'historical unified authority accepted a runtime insert';
  exception when sqlstate '42501' then null;
  end;
  begin
    delete from tongs.broll_interpretation_historical_authorities
    where operation_id=(select operation_id from tongs.broll_interpretation_historical_authorities limit 1);
    raise exception 'historical B-roll authority accepted a delete';
  exception when sqlstate '42501' then null;
  end;

end $$;

rollback;
