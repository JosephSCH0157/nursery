-- PostgREST service clients expose their database role through auth.role().
-- Retain the direct SQL claim check while accepting only the same service_role
-- through the canonical PostgREST identity helper.
begin;

do $$
declare
  v_definition text;
  v_changed text;
  v_old text := '  if coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role'' then';
  v_new text := '  if coalesce(auth.role(), '''') <> ''service_role''
     and coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role'' then';
begin
  select pg_get_functiondef('tongs.resolve_transition_owner_authority(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, chr(13), '');
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition then
    raise exception 'resolve_transition_owner_authority service-role gate patch did not match';
  end if;
  execute v_changed;
end
$$;

revoke all on function tongs.resolve_transition_owner_authority(uuid)
  from public, anon, authenticated, service_role;
grant execute on function tongs.resolve_transition_owner_authority(uuid)
  to service_role;

commit;
