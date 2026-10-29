begin;

do $$
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20261029033827'
  ) then
    raise exception 'hammer scoped Live funding predecessor is required';
  end if;
end $$;

-- Trigger functions execute only as a consequence of writes to their owning
-- tables. They are not public RPC entry points. Preserve the existing trigger
-- and function body while removing the default PUBLIC execute grant that made
-- the function appear callable through the Data API.
revoke all on function tongs._stamp_spending_quote_environment() from public;
revoke all on function tongs._stamp_spending_quote_environment() from anon;
revoke all on function tongs._stamp_spending_quote_environment() from authenticated;
revoke all on function tongs._stamp_spending_quote_environment() from service_role;
grant execute on function tongs._stamp_spending_quote_environment() to service_role;

do $$
declare
  v_trigger_function oid;
begin
  select p.oid into v_trigger_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tongs'
    and p.proname = '_stamp_spending_quote_environment'
    and p.prorettype = 'trigger'::regtype
    and p.pronargs = 0;

  if v_trigger_function is null then
    raise exception 'spending quote environment trigger function is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'tongs.customer_spending_quotes'::regclass
      and trigger_row.tgname = 'customer_spending_quotes_financial_environment'
      and trigger_row.tgfoid = v_trigger_function
      and not trigger_row.tgisinternal
  ) then
    raise exception 'spending quote environment trigger binding changed';
  end if;

  if has_function_privilege('public', 'tongs._stamp_spending_quote_environment()', 'execute')
     or has_function_privilege('anon', 'tongs._stamp_spending_quote_environment()', 'execute')
     or has_function_privilege('authenticated', 'tongs._stamp_spending_quote_environment()', 'execute')
     or not has_function_privilege('service_role', 'tongs._stamp_spending_quote_environment()', 'execute')
  then
    raise exception 'spending quote environment trigger ACL mismatch';
  end if;

  if tongs._current_financial_environment() <> 'test' then
    raise exception 'global financial environment changed';
  end if;

  if exists (select 1 from tongs.hammer_scoped_live_funding_authorities)
     or exists (select 1 from tongs.hammer_scoped_live_checkout_claims)
     or exists (select 1 from tongs.hammer_first_transcription_activation_authorities)
     or exists (select 1 from tongs.hammer_first_transcription_activation_consumptions)
  then
    raise exception 'trigger ACL migration created financial authority';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
