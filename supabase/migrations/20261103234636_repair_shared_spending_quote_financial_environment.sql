-- Reconcile the canonical baseline's missing Test runtime authority row.
-- The shared quote creator and environment-stamping trigger are already the
-- authoritative hosted contract; this migration deliberately does not replace
-- either function or trigger.
begin;

do $preflight$
declare
  v_stamp_definition text;
  v_quote_definition text;
  v_stamp_oid oid;
begin
  if to_regclass('tongs.financial_runtime_environment_revisions') is null
     or to_regclass('tongs.customer_spending_quotes') is null
     or to_regprocedure('tongs._current_financial_environment()') is null
     or to_regprocedure('tongs._stamp_spending_quote_environment()') is null
     or to_regprocedure(
       'tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz)'
     ) is null then
    raise exception 'shared spending-quote financial authority is missing';
  end if;

  select p.oid, pg_get_functiondef(p.oid)
    into v_stamp_oid, v_stamp_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'tongs'
     and p.proname = '_stamp_spending_quote_environment'
     and p.prorettype = 'trigger'::regtype
     and p.pronargs = 0;

  select pg_get_functiondef(
    'tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz)'::regprocedure
  ) into v_quote_definition;

  if position('new.financial_environment:=v_environment'
       in regexp_replace(v_stamp_definition, '\s', '', 'g')) = 0
     or position('v_environmentnotin(''test'',''live'')'
       in regexp_replace(v_stamp_definition, '\s', '', 'g')) = 0
     or position('tongs._current_financial_environment()' in v_stamp_definition) = 0 then
    raise exception 'spending-quote environment authority changed upstream; explicit review required';
  end if;

  if position('insert into tongs.customer_spending_quotes'
       in lower(v_quote_definition)) = 0 then
    raise exception 'shared spending-quote creator changed upstream; explicit review required';
  end if;

  if not exists (
    select 1
      from pg_trigger trigger_row
     where trigger_row.tgrelid = 'tongs.customer_spending_quotes'::regclass
       and trigger_row.tgname = 'customer_spending_quotes_financial_environment'
       and trigger_row.tgfoid = v_stamp_oid
       and not trigger_row.tgisinternal
       and trigger_row.tgenabled = 'O'
  ) then
    raise exception 'canonical spending-quote environment trigger is missing or disabled';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'tongs'
       and table_name = 'customer_spending_quotes'
       and column_name = 'financial_environment'
       and is_nullable = 'NO'
  ) then
    raise exception 'customer spending quote environment column is not fail-closed';
  end if;

  if has_function_privilege('public', 'tongs._stamp_spending_quote_environment()', 'execute')
     or has_function_privilege('anon', 'tongs._stamp_spending_quote_environment()', 'execute')
     or has_function_privilege('authenticated', 'tongs._stamp_spending_quote_environment()', 'execute')
     or not has_function_privilege('service_role', 'tongs._stamp_spending_quote_environment()', 'execute') then
    raise exception 'shared spending-quote environment trigger ACL drifted';
  end if;
end
$preflight$;

-- Historical databases already contain this exact row. The canonical baseline
-- retained the table and reader but omitted the non-spending Test seed. Insert
-- only into an empty table; never overwrite or append over existing authority.
do $runtime_seed$
declare
  v_count bigint;
begin
  select count(*) into v_count
    from tongs.financial_runtime_environment_revisions;

  if v_count = 0 then
    insert into tongs.financial_runtime_environment_revisions(
      revision,
      financial_environment,
      reason,
      actor_id
    ) values (
      1,
      'test',
      'Development and beta use Stripe Test through the canonical financial path.',
      null
    );
  elsif v_count <> 1
     or not exists (
       select 1
         from tongs.financial_runtime_environment_revisions
        where revision = 1
          and financial_environment = 'test'
          and reason = 'Development and beta use Stripe Test through the canonical financial path.'
          and actor_id is null
     ) then
    raise exception 'existing financial runtime authority differs from the canonical Test baseline';
  end if;
end
$runtime_seed$;

do $verify$
begin
  if (select count(*) from tongs.financial_runtime_environment_revisions) <> 1
     or not exists (
       select 1
         from tongs.financial_runtime_environment_revisions
        where revision = 1
          and financial_environment = 'test'
          and reason = 'Development and beta use Stripe Test through the canonical financial path.'
          and actor_id is null
     )
     or tongs._current_financial_environment() <> 'test' then
    raise exception 'canonical Test financial runtime authority was not established exactly';
  end if;

  if to_regprocedure('tongs._resolve_spending_quote_environment(uuid,text,uuid)') is not null then
    raise exception 'unreviewed spending-quote environment resolver must not be installed';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
commit;
