begin;

do $contract$
declare
  renewal regprocedure :=
    'tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure;
  revoker regprocedure :=
    'tongs.revoke_hammer_first_transcription_activation(uuid,uuid,uuid,text)'::regprocedure;
  definition text;
begin
  if to_regclass('tongs.hammer_first_transcription_activation_revocations') is null
     or not (select relrowsecurity and relforcerowsecurity from pg_class
       where oid='tongs.hammer_first_transcription_activation_revocations'::regclass)
  then raise exception 'Hammer activation revocation ledger must exist with forced RLS'; end if;

  if has_table_privilege('public','tongs.hammer_first_transcription_activation_revocations','SELECT')
     or has_table_privilege('anon','tongs.hammer_first_transcription_activation_revocations','SELECT')
     or has_table_privilege('authenticated','tongs.hammer_first_transcription_activation_revocations','SELECT')
     or not has_table_privilege('service_role','tongs.hammer_first_transcription_activation_revocations','SELECT')
     or has_table_privilege('service_role','tongs.hammer_first_transcription_activation_revocations','INSERT')
     or has_table_privilege('service_role','tongs.hammer_first_transcription_activation_revocations','UPDATE')
     or has_table_privilege('service_role','tongs.hammer_first_transcription_activation_revocations','DELETE')
  then raise exception 'Hammer activation revocation ledger ACL drifted'; end if;

  if exists (
    select 1 from pg_constraint
    where conrelid='tongs.hammer_first_transcription_activation_authorities'::regclass
      and contype='u'
      and pg_get_constraintdef(oid) like 'UNIQUE (user_id, canonical_recording_id, recording_revision_id)%'
  ) then raise exception 'single-row activation constraint still blocks audited renewal'; end if;

  if not exists(select 1 from pg_trigger
      where tgrelid='tongs.hammer_first_transcription_activation_authorities'::regclass
        and tgname='hammer_first_transcription_activation_insert_guard' and tgenabled='O')
     or not exists(select 1 from pg_trigger
      where tgrelid='tongs.hammer_first_transcription_activation_consumptions'::regclass
        and tgname='hammer_first_transcription_consumption_insert_guard' and tgenabled='O')
  then raise exception 'renewal overlap or cross-renewal consumption trigger is missing'; end if;

  if exists (
    select 1
    from unnest(array[
      renewal,
      revoker,
      'tongs._guard_hammer_first_transcription_activation_insert()'::regprocedure,
      'tongs._guard_hammer_first_transcription_consumption_insert()'::regprocedure
    ]) signature
    join pg_proc function on function.oid=signature
    where not function.prosecdef
       or not function.proconfig @> array['search_path=pg_catalog']
  ) then raise exception 'Hammer renewal function lost definer or hardened search_path'; end if;

  if has_function_privilege('public',renewal,'EXECUTE')
     or has_function_privilege('anon',renewal,'EXECUTE')
     or has_function_privilege('authenticated',renewal,'EXECUTE')
     or not has_function_privilege('service_role',renewal,'EXECUTE')
     or has_function_privilege('public',revoker,'EXECUTE')
     or has_function_privilege('anon',revoker,'EXECUTE')
     or has_function_privilege('authenticated',revoker,'EXECUTE')
     or not has_function_privilege('service_role',revoker,'EXECUTE')
  then raise exception 'Hammer renewal or revocation RPC is not service-only'; end if;

  definition:=pg_get_functiondef(renewal);
  if position('previous Hammer authority is still active' in definition)=0
     or position('Hammer renewal cannot reset or duplicate prior execution authority' in definition)=0
     or position('submission_unknown' in definition)=0
     or position('hammer_transcription_provider_attempts' in definition)=0
     or position('customer_payment_micros' in definition)=0
     or position('customer_credit_units' in definition)=0
     or position('maximum_wholesale_exposure_micros' in definition)=0
     or position('execution_authorized' in definition)=0
     or position('provider_submitted' in definition)=0
  then raise exception 'Hammer renewal lost expiry, ambiguity, attempt, or zero-debit bounds'; end if;

  definition:=pg_get_functiondef(
    'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure
  );
  if position('hammer_first_transcription_activation_revocations' in definition)=0 then
    raise exception 'provider attempt authorization does not fail closed after revocation';
  end if;
  definition:=pg_get_functiondef(
    'tongs.create_hammer_first_transcription_quote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)'::regprocedure
  );
  if position('hammer_first_transcription_activation_revocations' in definition)=0 then
    raise exception 'owner-sponsored quote selection does not exclude revoked authority';
  end if;

  if exists(select 1 from tongs.hammer_first_transcription_activation_revocations)
     or exists(select 1 from tongs.hammer_first_transcription_activation_authorities)
     or exists(select 1 from tongs.hammer_owner_funded_transcription_authorities)
     or exists(select 1 from tongs.owner_operating_budgets budget
       where lower(coalesce(budget.provider,''))='assemblyai'
         and lower(coalesce(budget.route,''))='hammer.transcript_prep')
     or exists(select 1 from tongs.funding_reservations)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2)
  then raise exception 'renewal migration must remain financially and operationally inert'; end if;
  if tongs._current_financial_environment()<>'test' then
    raise exception 'renewal migration changed the global financial environment';
  end if;
end
$contract$;

rollback;
