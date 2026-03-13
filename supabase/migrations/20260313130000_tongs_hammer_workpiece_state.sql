-- Slice B2: canonical Hammer persistence seam backed by Tongs workpiece files.

begin;

create table if not exists tongs.hammer_workpiece_state (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  active_session_id text null,
  editor_session_path text null,
  transcript_artifact_path text null,
  speaker_map_artifact_path text null,
  visual_placement_artifact_path text null,
  audio_polish_artifact_path text null,
  edit_plan_artifact_path text null,
  edit_plan_signature text null,
  prep_status text not null default 'not_started' check (
    prep_status in ('not_started', 'preparing', 'prepared', 'needs_review')
  ),
  alignment_status text not null default 'not_started' check (
    alignment_status in ('not_started', 'pending', 'aligned', 'needs_review')
  ),
  macro_recipe_ref text null,
  last_macro_run_ref text null,
  last_opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint hammer_workpiece_state_pkey primary key (workspace_id, workpiece_id)
);

create index if not exists hammer_workpiece_state_workspace_updated_idx
  on tongs.hammer_workpiece_state (workspace_id, updated_at desc);

create index if not exists hammer_workpiece_state_workspace_prep_idx
  on tongs.hammer_workpiece_state (workspace_id, prep_status, alignment_status, last_opened_at desc);

drop trigger if exists trg_hammer_workpiece_state_updated_at on tongs.hammer_workpiece_state;
create trigger trg_hammer_workpiece_state_updated_at
before update on tongs.hammer_workpiece_state
for each row execute function tongs.set_updated_at();

alter table tongs.hammer_workpiece_state enable row level security;

drop policy if exists hammer_workpiece_state_select_if_workspace_viewer on tongs.hammer_workpiece_state;
drop policy if exists hammer_workpiece_state_insert_if_workspace_editor on tongs.hammer_workpiece_state;
drop policy if exists hammer_workpiece_state_update_if_workspace_editor on tongs.hammer_workpiece_state;
drop policy if exists hammer_workpiece_state_delete_if_workspace_editor on tongs.hammer_workpiece_state;

create policy hammer_workpiece_state_select_if_workspace_viewer
on tongs.hammer_workpiece_state
for select
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'viewer')
);

create policy hammer_workpiece_state_insert_if_workspace_editor
on tongs.hammer_workpiece_state
for insert
to authenticated
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

create policy hammer_workpiece_state_update_if_workspace_editor
on tongs.hammer_workpiece_state
for update
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

create policy hammer_workpiece_state_delete_if_workspace_editor
on tongs.hammer_workpiece_state
for delete
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
);

grant select, insert, update, delete on table tongs.hammer_workpiece_state to authenticated;
grant all on table tongs.hammer_workpiece_state to service_role;

create table if not exists tongs.hammer_workpiece_presence (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text null,
  display_name text,
  mode text not null default 'viewing' check (mode in ('viewing', 'editing')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (workspace_id, workpiece_id, user_id)
);

create index if not exists hammer_presence_workspace_workpiece_last_seen_idx
  on tongs.hammer_workpiece_presence (workspace_id, workpiece_id, last_seen_at desc);

create index if not exists hammer_presence_user_last_seen_idx
  on tongs.hammer_workpiece_presence (user_id, last_seen_at desc);

alter table tongs.hammer_workpiece_presence enable row level security;

drop policy if exists hammer_presence_select_if_workspace_viewer on tongs.hammer_workpiece_presence;
drop policy if exists hammer_presence_insert_if_self_workspace_member on tongs.hammer_workpiece_presence;
drop policy if exists hammer_presence_update_if_self_workspace_member on tongs.hammer_workpiece_presence;
drop policy if exists hammer_presence_delete_if_self_or_workspace_admin on tongs.hammer_workpiece_presence;

create policy hammer_presence_select_if_workspace_viewer
on tongs.hammer_workpiece_presence
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.hammer_workpiece_presence.workspace_id, 'viewer')
);

create policy hammer_presence_insert_if_self_workspace_member
on tongs.hammer_workpiece_presence
for insert
to authenticated
with check (
  tongs.hammer_workpiece_presence.user_id = auth.uid()
  and tongs.has_workspace_role(tongs.hammer_workpiece_presence.workspace_id, 'viewer')
);

create policy hammer_presence_update_if_self_workspace_member
on tongs.hammer_workpiece_presence
for update
to authenticated
using (
  tongs.hammer_workpiece_presence.user_id = auth.uid()
  and tongs.has_workspace_role(tongs.hammer_workpiece_presence.workspace_id, 'viewer')
)
with check (
  tongs.hammer_workpiece_presence.user_id = auth.uid()
  and tongs.has_workspace_role(tongs.hammer_workpiece_presence.workspace_id, 'viewer')
);

create policy hammer_presence_delete_if_self_or_workspace_admin
on tongs.hammer_workpiece_presence
for delete
to authenticated
using (
  tongs.hammer_workpiece_presence.user_id = auth.uid()
  or tongs.has_workspace_role(tongs.hammer_workpiece_presence.workspace_id, 'admin')
);

grant select, insert, update, delete on table tongs.hammer_workpiece_presence to authenticated;
grant all on table tongs.hammer_workpiece_presence to service_role;

commit;
