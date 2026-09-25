begin;

do $$
declare
  function_source text;
begin
  if exists(select 1 from pg_constraint where conrelid='tongs.customer_spending_quotes'::regclass
    and conname='customer_spending_quotes_user_id_operation_id_key') then
    raise exception 'expired quote uniqueness was not replaced';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='tongs.runway_customer_test_quote_bindings'::regclass
    and conname='runway_customer_test_quote_bindings_pkey'
    and pg_get_constraintdef(oid)='PRIMARY KEY (authorization_id, quote_id)') then
    raise exception 'quote history binding key is not post-chain';
  end if;
  if exists(select 1 from tongs.runway_customer_test_authorizations where maximum_quote_count<>2) then
    raise exception 'replacement quote bound mismatch';
  end if;
  select pg_get_functiondef('tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)'::regprocedure)
    into function_source;
  if function_source not like '%v_quote_count>=%' or function_source not like '%quote_row.expires_at>now()%'
     or function_source not like '%customer_credit_units<>160%' then
    raise exception 'final renewable quote authority definition mismatch';
  end if;
  if has_function_privilege('public','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('anon','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('authenticated','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or not has_function_privilege('service_role','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute') then
    raise exception 'quote function privilege mismatch';
  end if;
  if has_table_privilege('authenticated','tongs.runway_customer_test_quote_bindings','select,insert,update,delete')
     or has_table_privilege('anon','tongs.runway_customer_test_quote_bindings','select') then
    raise exception 'quote binding table leaked';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.runway_customer_test_quote_bindings'::regclass) then
    raise exception 'quote binding RLS mismatch';
  end if;
  if exists(select 1 from tongs.funding_reservations group by user_id,operation_id having count(*)>1) then
    raise exception 'one-reservation invariant regressed';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live is not inactive-ready';
  end if;
end $$;

rollback;
