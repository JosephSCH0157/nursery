begin;

do $$
declare
  stamp_definition text;
  bind_definition text;
  authorize_definition text;
  settle_definition text;
begin
  if to_regclass('tongs.hammer_owner_funded_transcription_authorities') is null then
    raise exception 'owner-funded Hammer authority table is missing';
  end if;
  if exists(select 1 from tongs.hammer_owner_funded_transcription_authorities) then
    raise exception 'migration installed owner-funded Hammer authority rows';
  end if;
  if exists(select 1 from tongs.owner_operating_budgets budget
    where lower(coalesce(budget.provider,''))='assemblyai'
      and lower(coalesce(budget.route,''))='hammer.transcript_prep') then
    raise exception 'migration installed an AssemblyAI owner budget';
  end if;
  if tongs._current_financial_environment()<>'test' then
    raise exception 'global financial environment changed';
  end if;
  if has_table_privilege('anon','tongs.hammer_owner_funded_transcription_authorities','SELECT')
     or has_table_privilege('authenticated','tongs.hammer_owner_funded_transcription_authorities','SELECT')
     or not has_table_privilege('service_role','tongs.hammer_owner_funded_transcription_authorities','SELECT')
     or not has_table_privilege('service_role','tongs.hammer_owner_funded_transcription_authorities','INSERT') then
    raise exception 'owner-funded Hammer authority ACL drifted';
  end if;
  if has_function_privilege('anon',
      'tongs.install_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text)','EXECUTE')
     or has_function_privilege('authenticated',
      'tongs.install_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text)','EXECUTE')
     or not has_function_privilege('service_role',
      'tongs.install_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text)','EXECUTE') then
    raise exception 'owner-funded Hammer installer ACL drifted';
  end if;
  select pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure)
    into stamp_definition;
  select pg_get_functiondef('tongs.bind_inactive_hammer_assemblyai_operation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure)
    into bind_definition;
  select pg_get_functiondef('tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure)
    into authorize_definition;
  select pg_get_functiondef('tongs.settle_hammer_first_transcription_operation(uuid,uuid,text,bigint,jsonb)'::regprocedure)
    into settle_definition;
  if position('exact owner-sponsored Hammer funding required' in stamp_definition)=0
     or position('exact economically backed Hammer Live funding required' in stamp_definition)=0 then
    raise exception 'owner sponsorship did not preserve the ordinary Live Hammer funding guard';
  end if;
  if position('owner_budget' in bind_definition)=0
     or bind_definition !~ 'reserved_customer_charge_micros\s*<>\s*0'
     or bind_definition !~ 'reserved_credit_units\s*<>\s*0' then
    raise exception 'operation binder lacks exact zero-debit owner-budget admission';
  end if;
  if position('begin_owner_provider_attempt' in authorize_definition)=0
     or position('test_funding_real_provider_forbidden' in authorize_definition)=0
     or position('automatic_retries' in authorize_definition)=0 then
    raise exception 'provider boundary lost owner admission or Test-funding prohibition';
  end if;
  if position('canonical persistence and authoritative supplier reconciliation required before settlement' in settle_definition)=0
     or position('promotional_credit_offset_micros' in settle_definition)=0
     or position('settle_owner_operation' in settle_definition)=0 then
    raise exception 'owner settlement lacks persistence, bounds, or promotional-offset reconciliation';
  end if;
  if not exists(
    select 1 from pg_constraint
    where conrelid='tongs.hammer_transcription_operations'::regclass
      and pg_get_constraintdef(oid)='CHECK ((accepted_customer_charge_micros >= 0))'
  ) then raise exception 'zero-debit operation constraint is absent'; end if;
  if exists(select 1 from tongs.funding_reservations)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2) then
    raise exception 'migration created financial or provider execution state';
  end if;
end $$;

rollback;
