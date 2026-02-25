-- Remove recursive workspace_members policies that query workspace_members
-- from inside workspace_members RLS policy expressions.

alter table tongs.workspace_members enable row level security;

drop policy if exists workspace_members_read_if_member on tongs.workspace_members;
drop policy if exists workspace_members_read_self_or_owner on tongs.workspace_members;

create policy workspace_members_read_self_or_owner
on tongs.workspace_members
for select
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
  or exists (
    select 1
    from tongs.workspaces w
    where w.id = tongs.workspace_members.workspace_id
      and w.created_by = auth.uid()
  )
);

drop policy if exists workspace_members_delete_if_member on tongs.workspace_members;
drop policy if exists workspace_members_delete_self_or_owner on tongs.workspace_members;

create policy workspace_members_delete_self_or_owner
on tongs.workspace_members
for delete
to authenticated
using (
  tongs.workspace_members.user_id = auth.uid()
  or exists (
    select 1
    from tongs.workspaces w
    where w.id = tongs.workspace_members.workspace_id
      and w.created_by = auth.uid()
  )
);
