begin;

create or replace function tongs.debug_auth_users_triggers()
returns table (
  trigger_name text,
  function_name text,
  function_schema text,
  enabled text
)
language sql
security definer
set search_path = tongs, public
as $$
  select
    t.tgname::text as trigger_name,
    p.proname::text as function_name,
    n.nspname::text as function_schema,
    t.tgenabled::text as enabled
  from pg_trigger t
  join pg_class c
    on c.oid = t.tgrelid
  join pg_namespace ns
    on ns.oid = c.relnamespace
  join pg_proc p
    on p.oid = t.tgfoid
  join pg_namespace n
    on n.oid = p.pronamespace
  where ns.nspname = 'auth'
    and c.relname = 'users'
    and not t.tgisinternal
  order by t.tgname;
$$;

revoke all on function tongs.debug_auth_users_triggers() from public;
grant execute on function tongs.debug_auth_users_triggers() to service_role;

commit;
