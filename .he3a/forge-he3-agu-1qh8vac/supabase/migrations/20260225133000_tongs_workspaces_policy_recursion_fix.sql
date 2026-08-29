-- Break cross-table RLS recursion between tongs.workspaces and tongs.workspace_members.
-- Uses SECURITY DEFINER helpers so policy checks do not re-enter RLS on these tables.

alter table tongs.workspaces enable row level security;
alter table tongs.workspace_members enable row level security;

create or replace function tongs.workspace_is_member(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function tongs.workspace_is_creator(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select exists (
    select 1
    from tongs.workspaces w
    where w.id = _workspace_id
      and w.created_by = auth.uid()
  );
$$;

create or replace function tongs.workspace_is_owner(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select
    tongs.workspace_is_creator(_workspace_id)
    or exists (
      select 1
      from tongs.workspace_members wm
      where wm.workspace_id = _workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    );
$$;

create or replace function tongs.can_access_workspace(_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select
    tongs.workspace_is_member(_workspace_id)
    or tongs.workspace_is_creator(_workspace_id);
$$;

drop policy if exists workspaces_read_if_member on tongs.workspaces;
drop policy if exists workspaces_read_if_creator on tongs.workspaces;
drop policy if exists workspaces_read_if_access on tongs.workspaces;

create policy workspaces_read_if_member
on tongs.workspaces
for select
to authenticated
using (
  tongs.workspaces.created_by = auth.uid()
  or tongs.workspace_is_member(tongs.workspaces.id)
);

drop policy if exists workspace_members_read_if_member on tongs.workspace_members;
drop policy if exists workspace_members_read_self_or_owner on tongs.workspace_members;

create policy workspace_members_read_self_or_owner
on tongs.workspace_members
for select
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
  or tongs.workspace_is_owner(tongs.workspace_members.workspace_id)
);

drop policy if exists workspace_members_delete_if_member on tongs.workspace_members;
drop policy if exists workspace_members_delete_self_or_owner on tongs.workspace_members;

create policy workspace_members_delete_self_or_owner
on tongs.workspace_members
for delete
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
  or tongs.workspace_is_owner(tongs.workspace_members.workspace_id)
);
