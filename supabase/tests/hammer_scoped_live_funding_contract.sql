begin;

do $$
begin
  if tongs._current_financial_environment()<>'test' then
    raise exception 'global financial environment changed';
  end if;
  if exists(select 1 from tongs.hammer_scoped_live_funding_authorities)
     or exists(select 1 from tongs.hammer_scoped_live_checkout_claims)
     or exists(select 1 from tongs.hammer_first_transcription_activation_authorities)
     or exists(select 1 from tongs.hammer_first_transcription_activation_consumptions)
  then raise exception 'scoped funding migration created authority or execution state'; end if;

  if not (select relrowsecurity and relforcerowsecurity from pg_class
          where oid='tongs.hammer_scoped_live_funding_authorities'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class
          where oid='tongs.hammer_scoped_live_checkout_claims'::regclass)
  then raise exception 'scoped funding tables must force RLS'; end if;

  if has_table_privilege('public','tongs.hammer_scoped_live_funding_authorities','select')
     or has_table_privilege('anon','tongs.hammer_scoped_live_funding_authorities','select')
     or has_table_privilege('authenticated','tongs.hammer_scoped_live_funding_authorities','select')
     or has_table_privilege('service_role','tongs.hammer_scoped_live_funding_authorities','select')
     or has_table_privilege('public','tongs.hammer_scoped_live_checkout_claims','select')
     or has_table_privilege('anon','tongs.hammer_scoped_live_checkout_claims','select')
     or has_table_privilege('authenticated','tongs.hammer_scoped_live_checkout_claims','select')
     or has_table_privilege('service_role','tongs.hammer_scoped_live_checkout_claims','select')
  then raise exception 'scoped funding table ACL escaped private RPC-only authority'; end if;

  if has_function_privilege('public','tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)','execute')
     or has_function_privilege('anon','tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)','execute')
     or has_function_privilege('authenticated','tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)','execute')
     or not has_function_privilege('service_role','tongs.claim_hammer_scoped_live_checkout(uuid,uuid,uuid,uuid,text,text)','execute')
  then raise exception 'checkout claim RPC ACL mismatch'; end if;

  if exists(select 1 from tongs.hammer_transcription_provider_authorities)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2)
  then raise exception 'scoped funding migration created provider or transcript state'; end if;
end $$;

rollback;
