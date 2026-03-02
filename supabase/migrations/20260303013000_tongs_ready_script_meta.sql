-- Phase F5: canonical ready-script attribution metadata.

begin;

create table if not exists tongs.workpiece_ready_script_meta (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  script_path text not null,
  marked_ready_by uuid not null references auth.users(id),
  marked_ready_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint workpiece_ready_script_meta_path_check check (
    length(btrim(script_path)) > 0
    and left(script_path, 1) <> '/'
    and position('..' in script_path) = 0
    and position(chr(92) in script_path) = 0
  ),
  constraint workpiece_ready_script_meta_pkey primary key (workpiece_id, script_path)
);

create index if not exists ready_script_meta_workspace_workpiece_idx
  on tongs.workpiece_ready_script_meta (workspace_id, workpiece_id);

create index if not exists ready_script_meta_workspace_marked_ready_idx
  on tongs.workpiece_ready_script_meta (workspace_id, marked_ready_at desc);

drop trigger if exists trg_workpiece_ready_script_meta_updated_at on tongs.workpiece_ready_script_meta;
create trigger trg_workpiece_ready_script_meta_updated_at
before update on tongs.workpiece_ready_script_meta
for each row execute function tongs.set_updated_at();

alter table tongs.workpiece_ready_script_meta enable row level security;

drop policy if exists ready_script_meta_select_if_workspace_viewer on tongs.workpiece_ready_script_meta;
drop policy if exists ready_script_meta_insert_if_workspace_editor on tongs.workpiece_ready_script_meta;
drop policy if exists ready_script_meta_update_if_workspace_editor on tongs.workpiece_ready_script_meta;
drop policy if exists ready_script_meta_delete_if_workspace_editor on tongs.workpiece_ready_script_meta;

create policy ready_script_meta_select_if_workspace_viewer
on tongs.workpiece_ready_script_meta
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.workpiece_ready_script_meta.workspace_id, 'viewer')
);

create policy ready_script_meta_insert_if_workspace_editor
on tongs.workpiece_ready_script_meta
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.workpiece_ready_script_meta.workspace_id, 'editor')
  and tongs.workpiece_ready_script_meta.marked_ready_by = auth.uid()
  and tongs.workpiece_ready_script_meta.updated_by = auth.uid()
);

create policy ready_script_meta_update_if_workspace_editor
on tongs.workpiece_ready_script_meta
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.workpiece_ready_script_meta.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.workpiece_ready_script_meta.workspace_id, 'editor')
  and tongs.workpiece_ready_script_meta.marked_ready_by = auth.uid()
  and tongs.workpiece_ready_script_meta.updated_by = auth.uid()
);

create policy ready_script_meta_delete_if_workspace_editor
on tongs.workpiece_ready_script_meta
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.workpiece_ready_script_meta.workspace_id, 'editor')
);

grant select, insert, update, delete on table tongs.workpiece_ready_script_meta to authenticated;
grant all on table tongs.workpiece_ready_script_meta to service_role;

commit;
