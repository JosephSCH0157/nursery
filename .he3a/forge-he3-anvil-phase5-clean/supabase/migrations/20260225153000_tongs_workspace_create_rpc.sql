-- Harden workspace creation behind one atomic helper.
-- This avoids client-side sequencing issues with triggers/RLS and guarantees
-- creator membership exists immediately.

create or replace function tongs.create_workspace_with_owner(_name text default 'Workspace')
returns table (
  id uuid,
  name text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_name text;
  v_workspace tongs.workspaces%rowtype;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  v_name := nullif(trim(coalesce(_name, '')), '');
  if v_name is null then
    v_name := 'Workspace';
  end if;

  insert into tongs.workspaces (name, created_by)
  values (v_name, v_user)
  returning * into v_workspace;

  insert into tongs.workspace_members (workspace_id, user_id, role, created_at)
  values (v_workspace.id, v_user, 'owner', now())
  on conflict (workspace_id, user_id) do update
    set role = excluded.role;

  return query
  select
    v_workspace.id,
    v_workspace.name,
    v_workspace.created_by,
    v_workspace.created_at;
end;
$$;

revoke all on function tongs.create_workspace_with_owner(text) from public;
grant execute on function tongs.create_workspace_with_owner(text) to authenticated;
grant execute on function tongs.create_workspace_with_owner(text) to service_role;
