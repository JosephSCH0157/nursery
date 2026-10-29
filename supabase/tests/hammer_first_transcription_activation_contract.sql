begin;

do $hammer_first_transcription_contract$
declare
  target_name text;
  target regclass;
  signature regprocedure;
  definition text;
begin
  foreach target_name in array array[
    'hammer_first_transcription_capacity_authorities',
    'hammer_first_transcription_activation_authorities',
    'hammer_first_transcription_activation_consumptions',
    'hammer_first_transcription_quote_bindings'
  ] loop
    target := format('tongs.%I', target_name)::regclass;
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=target) then
      raise exception 'Hammer first-transcription table % must force RLS', target_name;
    end if;
    if has_table_privilege('public',target,'SELECT')
       or has_table_privilege('anon',target,'SELECT')
       or has_table_privilege('authenticated',target,'SELECT')
       or has_table_privilege('authenticated',target,'INSERT')
       or has_table_privilege('authenticated',target,'UPDATE')
       or has_table_privilege('authenticated',target,'DELETE') then
      raise exception 'public customer roles can access private Hammer authority table %', target_name;
    end if;
    if not has_table_privilege('service_role',target,'SELECT')
       or not has_table_privilege('service_role',target,'INSERT')
       or has_table_privilege('service_role',target,'UPDATE')
       or has_table_privilege('service_role',target,'DELETE') then
      raise exception 'service role privileges differ from append-only Hammer contract on %', target_name;
    end if;
  end loop;

  if exists(select 1 from tongs.hammer_transcription_provider_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_capacity_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_activation_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions)
     or exists(select 1 from tongs.hammer_first_transcription_quote_bindings)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2) then
    raise exception 'migration 421 created authority, funding, operation, attempt, or transcript data';
  end if;

  foreach signature in array array[
    'tongs.install_hammer_first_transcription_activation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure,
    'tongs.create_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure,
    'tongs.reserve_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
    'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure,
    'tongs.mark_hammer_first_transcription_submission_unknown(uuid,uuid,text,jsonb)'::regprocedure,
    'tongs.record_hammer_first_transcription_submission(uuid,uuid,text,jsonb)'::regprocedure,
    'tongs.complete_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure,
    'tongs.fail_hammer_first_transcription_attempt(uuid,uuid,text,jsonb)'::regprocedure,
    'tongs.settle_hammer_first_transcription_operation(uuid,uuid,text,bigint,jsonb)'::regprocedure
  ] loop
    if has_function_privilege('public',signature,'EXECUTE')
       or has_function_privilege('anon',signature,'EXECUTE')
       or has_function_privilege('authenticated',signature,'EXECUTE')
       or not has_function_privilege('service_role',signature,'EXECUTE') then
      raise exception 'Hammer service-only function ACL differs: %', signature;
    end if;
    if not exists(
      select 1 from pg_proc p where p.oid=signature and p.prosecdef
        and p.proconfig @> array['search_path=pg_catalog']
    ) then
      raise exception 'Hammer service-only function lacks reviewed definer/search_path contract: %', signature;
    end if;
  end loop;

  definition := pg_get_functiondef('tongs.install_hammer_first_transcription_activation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure);
  if definition not like '%4cc846e3-187c-46d9-8733-e7402488236c%'
     or definition not like '%9c991aa7-f551-4f03-a4d6-41eb40ef81ec%'
     or definition not like '%595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24%'
     or definition not like '%38589%'
     or definition not like '%6000%'
     or definition not like '%44589%'
     or definition not like '%60000%' then
    raise exception 'exact source, supplier, support, or quote binding is missing';
  end if;

  definition := pg_get_functiondef('tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure);
  if lower(definition) not like '%test_funding_real_provider_forbidden%'
     or lower(definition) not like '%pg_advisory_xact_lock%' then
    raise exception 'Test-funded denial or one-attempt/concurrency authority is missing';
  end if;

  definition := pg_get_functiondef('tongs.fail_hammer_first_transcription_attempt(uuid,uuid,text,jsonb)'::regprocedure);
  if definition not like '%release_operation%'
     or definition not like '%supplier_ceiling_micros%'
     or definition like '%failure-settlement%' then
    raise exception 'customer relief or retained supplier exposure differs from the reviewed failure contract';
  end if;

  definition := pg_get_functiondef('tongs.settle_hammer_first_transcription_operation(uuid,uuid,text,bigint,jsonb)'::regprocedure);
  if definition not like '%canonical persistence and authoritative supplier reconciliation required before settlement%'
     or definition not like '%record_paid_operation_aggregate_outcome%' then
    raise exception 'persistence-before-settlement or reconciliation contract is missing';
  end if;

  if (select mode from tongs.openai_text_rollout_revisions
      where route_code='hammer.transcript_prep' order by revision desc limit 1)
     not in ('inactive','halt_new') then
    raise exception 'Hammer transcript creation is not halted';
  end if;
end
$hammer_first_transcription_contract$;

rollback;
