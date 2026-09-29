begin;
set local role service_role;

do $$
declare
  v_owner_before bigint;
  v_journal_before bigint;
begin
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
  if (select count(*) from tongs.openai_text_funding_bindings where route_code='visual.unified_plan') <> 3
    or (select count(*) from tongs.openai_text_funding_bindings where route_code='motion.broll_interpretation') <> 2
    or (select count(*) from tongs.hearth_thumbnail_direction_generation_results
        where reservation_id is not null and owner_cost_attempt_id is null) <> 1
  then raise exception 'existing customer authority counts changed'; end if;
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
