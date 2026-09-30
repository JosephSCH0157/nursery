-- Accept both legacy service-role JWTs and Supabase secret API keys. Secret API
-- keys assume the service_role database role without exposing a JWT claim.

create or replace function tongs._require_credential_lifecycle_reader()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    ''
  );
begin
  if v_request_role <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs._require_credential_lifecycle_writer()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    ''
  );
begin
  if v_request_role <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function tongs._require_credential_lifecycle_reader() from public,anon,authenticated,service_role;
revoke all on function tongs._require_credential_lifecycle_writer() from public,anon,authenticated,service_role;

comment on function tongs._require_credential_lifecycle_reader() is
  'Recognizes service-role JWTs and Supabase secret API keys, otherwise requires platform-operator identity.';
comment on function tongs._require_credential_lifecycle_writer() is
  'Recognizes service-role JWTs and Supabase secret API keys; ordinary authenticated and anonymous callers remain denied.';
