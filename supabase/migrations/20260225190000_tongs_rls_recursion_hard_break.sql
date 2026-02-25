-- Hard-break workspace/workspace_members RLS recursion loops.
-- Strategy:
-- 1) workspace_members policies are self-only (no cross-table references)
-- 2) workspaces policy may reference workspace_members safely
-- 3) helper access functions are SECURITY DEFINER

begin;

alter table tongs.workspaces enable row level security;
alter table tongs.workspace_members enable row level security;

-- Workspaces policies
drop policy if exists workspaces_read_if_member on tongs.workspaces;
drop policy if exists workspaces_read_if_creator on tongs.workspaces;
drop policy if exists workspaces_read_if_access on tongs.workspaces;
drop policy if exists workspaces_insert_any on tongs.workspaces;
drop policy if exists workspaces_insert_self on tongs.workspaces;

create policy workspaces_insert_self
on tongs.workspaces
for insert
to authenticated
with check (
  auth.uid() is not null
  and (tongs.workspaces.created_by is null or tongs.workspaces.created_by = auth.uid())
);

create policy workspaces_read_if_member
on tongs.workspaces
for select
to authenticated
using (
  tongs.workspaces.created_by = auth.uid()
  or exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = tongs.workspaces.id
      and wm.user_id = auth.uid()
  )
);

-- Workspace members policies (self-only to avoid recursion)
drop policy if exists workspace_members_read_if_member on tongs.workspace_members;
drop policy if exists workspace_members_read_self_or_owner on tongs.workspace_members;
drop policy if exists workspace_members_read_self on tongs.workspace_members;
drop policy if exists workspace_members_insert_self on tongs.workspace_members;
drop policy if exists workspace_members_delete_if_member on tongs.workspace_members;
drop policy if exists workspace_members_delete_self_or_owner on tongs.workspace_members;
drop policy if exists workspace_members_delete_self on tongs.workspace_members;

create policy workspace_members_read_self
on tongs.workspace_members
for select
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
);

create policy workspace_members_insert_self
on tongs.workspace_members
for insert
to authenticated
with check (
  tongs.workspace_members.user_id = auth.uid()
);

create policy workspace_members_delete_self
on tongs.workspace_members
for delete
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
);

-- Helper functions: security definer to avoid re-entering RLS policy checks.
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

create or replace function tongs.can_access_workspace(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tongs, public
as $$
  select
    tongs.workspace_is_creator(_workspace_id)
    or tongs.workspace_is_member(_workspace_id);
$$;

revoke all on function tongs.workspace_is_member(uuid) from public;
revoke all on function tongs.workspace_is_creator(uuid) from public;
revoke all on function tongs.can_access_workspace(uuid) from public;

grant execute on function tongs.workspace_is_member(uuid) to authenticated;
grant execute on function tongs.workspace_is_member(uuid) to service_role;
grant execute on function tongs.workspace_is_creator(uuid) to authenticated;
grant execute on function tongs.workspace_is_creator(uuid) to service_role;
grant execute on function tongs.can_access_workspace(uuid) to authenticated;
grant execute on function tongs.can_access_workspace(uuid) to service_role;

commit;
