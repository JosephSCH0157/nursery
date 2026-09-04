begin;

alter table tongs.workspaces
  add column if not exists reference_material_review_enabled boolean not null default false;

create or replace function tongs.get_my_reference_material_rollout(p_workspace_id uuid)
returns table (workspace_id uuid, reference_material_review_enabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required' using errcode = '22023';
  end if;
  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');
  return query
  select w.id, w.reference_material_review_enabled
  from tongs.workspaces w
  where w.id = p_workspace_id;
end;
$function$;

create or replace function tongs.set_reference_material_rollout(p_workspace_id uuid, p_enabled boolean)
returns table (workspace_id uuid, reference_material_review_enabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_workspace_id is null then
    raise exception 'workspace_id is required' using errcode = '22023';
  end if;
  perform tongs.assert_workspace_role(p_workspace_id, 'admin');
  return query
  update tongs.workspaces w
  set reference_material_review_enabled = coalesce(p_enabled, false)
  where w.id = p_workspace_id
  returning w.id, w.reference_material_review_enabled;
  if not found then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function tongs.get_my_reference_material_rollout(uuid) from public;
revoke all on function tongs.set_reference_material_rollout(uuid, boolean) from public;
grant execute on function tongs.get_my_reference_material_rollout(uuid) to authenticated, service_role;
grant execute on function tongs.set_reference_material_rollout(uuid, boolean) to authenticated, service_role;

commit;
