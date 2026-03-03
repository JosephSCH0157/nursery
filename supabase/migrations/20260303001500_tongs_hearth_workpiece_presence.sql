-- Phase F (Team Mode): shared Hearth presence with TTL-backed read model.

begin;

create table if not exists tongs.hearth_workpiece_presence (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  mode text not null default 'viewing' check (mode in ('viewing', 'editing')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (workspace_id, workpiece_id, user_id)
);

create index if not exists hearth_presence_workspace_workpiece_last_seen_idx
  on tongs.hearth_workpiece_presence (workspace_id, workpiece_id, last_seen_at desc);

create index if not exists hearth_presence_user_last_seen_idx
  on tongs.hearth_workpiece_presence (user_id, last_seen_at desc);

alter table tongs.hearth_workpiece_presence enable row level security;

drop policy if exists hearth_presence_select_if_workspace_viewer on tongs.hearth_workpiece_presence;
drop policy if exists hearth_presence_insert_if_self_workspace_member on tongs.hearth_workpiece_presence;
drop policy if exists hearth_presence_update_if_self_workspace_member on tongs.hearth_workpiece_presence;
drop policy if exists hearth_presence_delete_if_self_or_workspace_admin on tongs.hearth_workpiece_presence;

create policy hearth_presence_select_if_workspace_viewer
on tongs.hearth_workpiece_presence
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.hearth_workpiece_presence.workspace_id, 'viewer')
);

create policy hearth_presence_insert_if_self_workspace_member
on tongs.hearth_workpiece_presence
for insert
to authenticated
with check (
  tongs.hearth_workpiece_presence.user_id = auth.uid()
  and tongs.has_workspace_role(tongs.hearth_workpiece_presence.workspace_id, 'viewer')
);

create policy hearth_presence_update_if_self_workspace_member
on tongs.hearth_workpiece_presence
for update
to authenticated
using (
  tongs.hearth_workpiece_presence.user_id = auth.uid()
  and tongs.has_workspace_role(tongs.hearth_workpiece_presence.workspace_id, 'viewer')
)
with check (
  tongs.hearth_workpiece_presence.user_id = auth.uid()
  and tongs.has_workspace_role(tongs.hearth_workpiece_presence.workspace_id, 'viewer')
);

create policy hearth_presence_delete_if_self_or_workspace_admin
on tongs.hearth_workpiece_presence
for delete
to authenticated
using (
  tongs.hearth_workpiece_presence.user_id = auth.uid()
  or tongs.has_workspace_role(tongs.hearth_workpiece_presence.workspace_id, 'admin')
);

grant select, insert, update, delete on table tongs.hearth_workpiece_presence to authenticated;
grant all on table tongs.hearth_workpiece_presence to service_role;

commit;
