-- Hotfix: break workspaces <-> workspace_members RLS recursion (42P17).
-- Symptom: querying tongs.workspace_members with embedded workspaces can recurse
-- through workspaces SELECT policy and fail with:
--   infinite recursion detected in policy for relation "workspaces"
--
-- Strategy:
-- 1) keep workspaces SELECT policy membership/creator based
-- 2) make workspace_members SELECT self-only (no cross-table predicates)
--    so workspaces policy subquery does not re-enter recursive checks.

begin;

alter table tongs.workspaces enable row level security;
alter table tongs.workspace_members enable row level security;

drop policy if exists workspaces_read_if_member on tongs.workspaces;
drop policy if exists workspaces_read_if_creator on tongs.workspaces;
drop policy if exists workspaces_read_if_access on tongs.workspaces;

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

drop policy if exists workspace_members_read_if_workspace_member on tongs.workspace_members;
drop policy if exists workspace_members_read_if_member on tongs.workspace_members;
drop policy if exists workspace_members_read_self_or_owner on tongs.workspace_members;
drop policy if exists workspace_members_read_self on tongs.workspace_members;

create policy workspace_members_read_self
on tongs.workspace_members
for select
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
);

commit;

