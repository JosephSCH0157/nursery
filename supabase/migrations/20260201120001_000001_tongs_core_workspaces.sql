-- tongs core: workspaces + workspace_members (minimal)
create schema if not exists tongs;

-- Workspaces
create table if not exists tongs.workspaces (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Workspace members
create table if not exists tongs.workspace_members (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- RLS
alter table tongs.workspaces enable row level security;
alter table tongs.workspace_members enable row level security;

-- Policies: members can read their workspaces
drop policy if exists workspaces_read_if_member on tongs.workspaces;
create policy workspaces_read_if_member
on tongs.workspaces
for select
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = auth.uid()
  )
);

-- Policies: user can create a workspace (owner flow handled app-side)
drop policy if exists workspaces_insert_any on tongs.workspaces;
create policy workspaces_insert_any
on tongs.workspaces
for insert
with check (true);

-- Policies: members table CRUD is limited to members; inserts require same user or owner (keep simple for now)
drop policy if exists workspace_members_read_if_member on tongs.workspace_members;
create policy workspace_members_read_if_member
on tongs.workspace_members
for select
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists workspace_members_insert_self on tongs.workspace_members;
create policy workspace_members_insert_self
on tongs.workspace_members
for insert
with check (workspace_members.user_id = auth.uid());

drop policy if exists workspace_members_delete_if_member on tongs.workspace_members;
create policy workspace_members_delete_if_member
on tongs.workspace_members
for delete
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
  )
);
