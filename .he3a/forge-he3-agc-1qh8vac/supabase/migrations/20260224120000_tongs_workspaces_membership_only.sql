-- Restore canonical: membership is the only access gate for workspaces.
-- Also: auto-add the creator as an owner member on workspace creation.

-- 1) Ensure RLS is on (idempotent)
alter table tongs.workspaces enable row level security;
alter table tongs.workspace_members enable row level security;

-- 2) WORKSPACES: SELECT is membership-only (Option A)
drop policy if exists workspaces_read_if_creator on tongs.workspaces;
drop policy if exists workspaces_read_if_member on tongs.workspaces;

create policy workspaces_read_if_member
on tongs.workspaces
for select
to authenticated
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = tongs.workspaces.id
      and wm.user_id = auth.uid()
  )
);

-- 3) Keep inserts allowed (creator is stamped by your existing trigger)
drop policy if exists workspaces_insert_self on tongs.workspaces;
drop policy if exists workspaces_insert_any on tongs.workspaces;

create policy workspaces_insert_any
on tongs.workspaces
for insert
to authenticated
with check (true);

-- 4) WORKSPACE_MEMBERS: allow members to read membership rows for workspaces they belong to
drop policy if exists workspace_members_read_if_member on tongs.workspace_members;

create policy workspace_members_read_if_member
on tongs.workspace_members
for select
to authenticated
using (
  exists (
    select 1
    from tongs.workspace_members me
    where me.workspace_id = tongs.workspace_members.workspace_id
      and me.user_id = auth.uid()
  )
);

-- 5) WORKSPACE_MEMBERS: keep your simple "insert self" rule (already in core schema)
drop policy if exists workspace_members_insert_self on tongs.workspace_members;

create policy workspace_members_insert_self
on tongs.workspace_members
for insert
to authenticated
with check (tongs.workspace_members.user_id = auth.uid());

-- 6) Auto-add creator as owner member after workspace insert
-- (Works with your existing created_by trigger: new.created_by will be auth.uid()).
create or replace function tongs.workspace_add_creator_member()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  insert into tongs.workspace_members (workspace_id, user_id, role, created_at)
  values (new.id, new.created_by, 'owner', now())
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_workspaces_add_creator_member on tongs.workspaces;

create trigger trg_workspaces_add_creator_member
after insert on tongs.workspaces
for each row
execute function tongs.workspace_add_creator_member();
