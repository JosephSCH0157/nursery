begin;

do $contract$
declare
  constraint_count integer;
begin
  select count(*) into constraint_count
    from pg_constraint
   where conrelid = 'tongs.hammer_transcription_operations'::regclass
     and pg_get_constraintdef(oid, true) = 'CHECK (accepted_customer_charge_micros >= 0)';
  if constraint_count <> 1 then
    raise exception 'exactly one nonnegative Hammer customer-charge constraint required';
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid = 'tongs.hammer_transcription_operations'::regclass
       and pg_get_constraintdef(oid, true) = 'CHECK (accepted_customer_charge_micros > 0)'
  ) then raise exception 'obsolete positive Hammer customer-charge constraint remains'; end if;

  if to_regclass('tongs.hammer_transcription_preoperation_receipts') is null
     or not (select relrowsecurity from pg_class where oid = 'tongs.hammer_transcription_preoperation_receipts'::regclass)
  then raise exception 'Hammer pre-operation receipts lack RLS'; end if;
  if has_table_privilege('anon', 'tongs.hammer_transcription_preoperation_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'tongs.hammer_transcription_preoperation_receipts', 'INSERT')
     or has_table_privilege('authenticated', 'tongs.hammer_transcription_preoperation_receipts', 'UPDATE')
     or has_table_privilege('authenticated', 'tongs.hammer_transcription_preoperation_receipts', 'DELETE')
     or not has_table_privilege('authenticated', 'tongs.hammer_transcription_preoperation_receipts', 'SELECT')
     or not has_table_privilege('service_role', 'tongs.hammer_transcription_preoperation_receipts', 'INSERT')
  then raise exception 'Hammer pre-operation receipt ACL drifted'; end if;

  if has_function_privilege('public', 'tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'tongs.read_hammer_transcription_recovery(uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'tongs.read_hammer_transcription_recovery(uuid,text)', 'EXECUTE')
  then raise exception 'Hammer recovery function ACL drifted'; end if;

  if not exists (
    select 1 from pg_proc
     where oid = 'tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)'::regprocedure
       and prosecdef
       and proconfig = array['search_path=pg_catalog']
  ) or not exists (
    select 1 from pg_proc
     where oid = 'tongs.read_hammer_transcription_recovery(uuid,text)'::regprocedure
       and prosecdef
       and provolatile = 's'
       and proconfig = array['search_path=pg_catalog']
  ) then raise exception 'Hammer recovery function hardening drifted'; end if;

  if exists(select 1 from tongs.hammer_transcription_preoperation_receipts)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2)
     or exists(select 1 from tongs.funding_reservations)
  then raise exception 'integrated recovery migration created financial or execution state'; end if;
end
$contract$;

do $negative$
begin
  begin
    perform tongs.record_hammer_transcription_preoperation_receipt(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      'background_started',
      null,
      '{}'::jsonb
    );
    raise exception 'unbound pre-operation receipt unexpectedly succeeded';
  exception when foreign_key_violation or insufficient_privilege then
    null;
  end;
end
$negative$;

rollback;
