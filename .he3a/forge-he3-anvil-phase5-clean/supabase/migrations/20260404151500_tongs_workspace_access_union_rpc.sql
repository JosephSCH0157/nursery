-- Slice 1: canonical workspace-access union (owned OR explicitly assigned),
-- with source metadata for workspace switcher labeling.
begin;

create or replace function tongs.list_my_workspace_access()
returns table (
  workspace_id uuid,
  workspace_name text,
  role text,
  created_at timestamptz,
  source_type text,
  org_id uuid,
  org_name text
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  return query
  with candidate as (
    select
      w.id as workspace_id,
      w.name as workspace_name,
      w.created_at,
      w.org_id,
      w.created_by,
      wm.role as member_role
    from tongs.workspaces w
    left join tongs.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = v_user
    where w.created_by = v_user
       or wm.user_id = v_user
  )
  select
    c.workspace_id,
    c.workspace_name,
    case
      when c.created_by = v_user then 'owner'
      else coalesce(c.member_role, 'viewer')
    end as role,
    c.created_at,
    case when c.org_id is null then 'personal' else 'shared' end as source_type,
    c.org_id,
    o.name as org_name
  from candidate c
  left join tongs.orgs o
    on o.id = c.org_id
  order by
    tongs.workspace_role_rank(
      case
        when c.created_by = v_user then 'owner'
        else coalesce(c.member_role, 'viewer')
      end
    ) desc,
    c.created_at asc,
    lower(c.workspace_name) asc;
end;
$$;

create or replace function tongs.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = tongs, public
as $$
  select
    x.workspace_id,
    x.workspace_name,
    x.role,
    x.created_at
  from tongs.list_my_workspace_access() x
  order by
    tongs.workspace_role_rank(x.role) desc,
    x.created_at asc,
    lower(x.workspace_name) asc;
$$;

revoke all on function tongs.list_my_workspace_access() from public;
grant execute on function tongs.list_my_workspace_access() to authenticated;
grant execute on function tongs.list_my_workspace_access() to service_role;

revoke all on function tongs.list_my_workspaces() from public;
grant execute on function tongs.list_my_workspaces() to authenticated;
grant execute on function tongs.list_my_workspaces() to service_role;

commit;
