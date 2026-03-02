-- Upgrade workspace delete API to return a structured result for UI confirmation.

create or replace function tongs.delete_workspace_with_owner_check(_workspace_id uuid)
returns table (
  deleted boolean,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_workspace tongs.workspaces%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if _workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  select w.*
  into v_workspace
  from tongs.workspaces w
  where w.id = _workspace_id;

  if not found then
    raise exception 'Workspace not found'
      using errcode = 'P0002';
  end if;

  if not (
    v_workspace.created_by = v_user
    or exists (
      select 1
      from tongs.workspace_members wm
      where wm.workspace_id = _workspace_id
        and wm.user_id = v_user
        and wm.role = 'owner'
    )
  ) then
    raise exception 'Only workspace owners can delete workspaces'
      using errcode = '42501';
  end if;

  delete from tongs.workspaces w
  where w.id = _workspace_id;

  if not found then
    raise exception 'Workspace delete failed'
      using errcode = 'P0001';
  end if;

  return query
  select true, _workspace_id;
end;
$$;

revoke all on function tongs.delete_workspace_with_owner_check(uuid) from public;
grant execute on function tongs.delete_workspace_with_owner_check(uuid) to authenticated;
grant execute on function tongs.delete_workspace_with_owner_check(uuid) to service_role;
