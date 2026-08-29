begin;

create or replace function tongs.get_or_create_hearth_project_workpiece(
  p_workspace_id uuid,
  p_project_id uuid,
  p_title text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_user_id uuid := auth.uid();
  v_workpiece_id uuid;
  v_created boolean := false;
  v_title text := coalesce(nullif(btrim(p_title), ''), 'Untitled Project');
  v_operation_key text := btrim(coalesce(p_operation_key, ''));
begin
  if v_user_id is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'denied', 'workpiece_id', null, 'created', false);
  end if;

  if length(v_operation_key) not between 16 and 200 then
    return jsonb_build_object('outcome', 'conflict', 'workpiece_id', null, 'created', false, 'reason', 'invalid_operation_key');
  end if;

  if not exists (
    select 1 from tongs.barstock_assignments
    where id = p_project_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('outcome', 'not_found', 'workpiece_id', null, 'created', false, 'reason', 'project_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_project_id::text, 0));

  select workpiece_id into v_workpiece_id
  from tongs.barstock_project_episode_links
  where workspace_id = p_workspace_id and project_id = p_project_id;

  if v_workpiece_id is not null then
    return jsonb_build_object('outcome', 'existing', 'workpiece_id', v_workpiece_id, 'created', false, 'operation_key', v_operation_key);
  end if;

  insert into tongs.episodes(workspace_id, label)
  values (p_workspace_id, v_title)
  returning id into v_workpiece_id;

  insert into tongs.barstock_project_episode_links(workspace_id, project_id, workpiece_id)
  values (p_workspace_id, p_project_id, v_workpiece_id);
  v_created := true;

  return jsonb_build_object('outcome', 'created', 'workpiece_id', v_workpiece_id, 'created', v_created, 'operation_key', v_operation_key);
end;
$$;

revoke all on function tongs.get_or_create_hearth_project_workpiece(uuid,uuid,text,text) from public, anon;
grant execute on function tongs.get_or_create_hearth_project_workpiece(uuid,uuid,text,text) to authenticated;
alter function tongs.get_or_create_hearth_project_workpiece(uuid,uuid,text,text) owner to postgres;

comment on function tongs.get_or_create_hearth_project_workpiece(uuid,uuid,text,text) is
  'Atomically resolves one canonical Hearth workpiece identity per Bar Stock project. Storage bootstrap remains an idempotent caller responsibility.';

commit;
