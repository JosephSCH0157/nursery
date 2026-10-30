begin;

do $contract$
declare
  definition text;
begin
  select pg_get_functiondef(
    'tongs.reserve_operation(uuid,uuid,text,uuid,text)'::regprocedure
  ) into definition;

  if position('_quote_owner_budget_allows(v_quote.id, v_budget.id)' in definition)=0
     or position('_active_hammer_owner_sponsorship_for_quote(v_quote.id)' in definition)=0
     or position('sponsorship.owner_budget_id=v_budget.id' in definition)=0
     or position('sponsorship.beneficiary_user_id=v_quote.user_id' in definition)=0
     or position('owner-budget spending is not activated' in definition)=0
     or position('insufficient owner operating budget' in definition)=0
  then
    raise exception 'owner sponsorship reservation compatibility contract is incomplete';
  end if;

  if has_function_privilege('public','tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
     or has_function_privilege('anon','tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated','tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
     or not has_function_privilege('service_role','tongs.reserve_operation(uuid,uuid,text,uuid,text)','EXECUTE')
  then
    raise exception 'reserve_operation is not service-only';
  end if;

  if exists(select 1 from tongs.hammer_owner_funded_transcription_authorities)
     or exists(select 1 from tongs.hammer_transcription_operations)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.hammer_canonical_transcripts_v2)
  then
    raise exception 'migration 426 must remain financially and operationally inert';
  end if;
end
$contract$;

rollback;
