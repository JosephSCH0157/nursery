-- Phase F6: canonical authored Ready queue state for Hearth Session List ordering/hide.

begin;

create table if not exists tongs.workspace_ready_queue_state (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  queue_rank bigint null,
  hidden_at timestamptz null,
  hidden_by uuid null references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint workspace_ready_queue_state_pkey primary key (workspace_id, workpiece_id),
  constraint workspace_ready_queue_state_hidden_check check (
    (hidden_at is null and hidden_by is null)
    or (hidden_at is not null and hidden_by is not null)
  ),
  constraint workspace_ready_queue_state_rank_check check (
    queue_rank is null or queue_rank >= 0
  )
);

create index if not exists ready_queue_state_workspace_rank_idx
  on tongs.workspace_ready_queue_state (workspace_id, queue_rank asc nulls last, updated_at desc);

create index if not exists ready_queue_state_workspace_hidden_idx
  on tongs.workspace_ready_queue_state (workspace_id, hidden_at);

drop trigger if exists trg_workspace_ready_queue_state_updated_at on tongs.workspace_ready_queue_state;
create trigger trg_workspace_ready_queue_state_updated_at
before update on tongs.workspace_ready_queue_state
for each row execute function tongs.set_updated_at();

alter table tongs.workspace_ready_queue_state enable row level security;

drop policy if exists ready_queue_state_select_if_workspace_viewer on tongs.workspace_ready_queue_state;
drop policy if exists ready_queue_state_insert_if_workspace_editor on tongs.workspace_ready_queue_state;
drop policy if exists ready_queue_state_update_if_workspace_editor on tongs.workspace_ready_queue_state;
drop policy if exists ready_queue_state_delete_if_workspace_editor on tongs.workspace_ready_queue_state;

create policy ready_queue_state_select_if_workspace_viewer
on tongs.workspace_ready_queue_state
for select
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'viewer')
);

create policy ready_queue_state_insert_if_workspace_editor
on tongs.workspace_ready_queue_state
for insert
to authenticated
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
  and (hidden_by is null or hidden_by = auth.uid())
);

create policy ready_queue_state_update_if_workspace_editor
on tongs.workspace_ready_queue_state
for update
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
  and (hidden_by is null or hidden_by = auth.uid())
);

create policy ready_queue_state_delete_if_workspace_editor
on tongs.workspace_ready_queue_state
for delete
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
);

grant select, insert, update, delete on table tongs.workspace_ready_queue_state to authenticated;
grant all on table tongs.workspace_ready_queue_state to service_role;

commit;
