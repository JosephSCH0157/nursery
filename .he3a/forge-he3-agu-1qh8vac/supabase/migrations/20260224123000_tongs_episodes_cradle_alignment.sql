-- Align cradle container to tongs.episodes (membership-only access).

create table if not exists tongs.episodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists episodes_workspace_idx
  on tongs.episodes (workspace_id, created_at desc);

drop trigger if exists trg_episodes_updated_at on tongs.episodes;
create trigger trg_episodes_updated_at
before update on tongs.episodes
for each row execute function tongs.set_updated_at();

alter table tongs.episodes enable row level security;

drop policy if exists episodes_select_if_workspace_access on tongs.episodes;
create policy episodes_select_if_workspace_access
on tongs.episodes
for select
to authenticated
using (tongs.can_access_workspace(workspace_id));

drop policy if exists episodes_insert_if_workspace_access on tongs.episodes;
create policy episodes_insert_if_workspace_access
on tongs.episodes
for insert
to authenticated
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists episodes_update_if_workspace_access on tongs.episodes;
create policy episodes_update_if_workspace_access
on tongs.episodes
for update
to authenticated
using (tongs.can_access_workspace(workspace_id))
with check (tongs.can_access_workspace(workspace_id));

drop policy if exists episodes_delete_if_workspace_access on tongs.episodes;
create policy episodes_delete_if_workspace_access
on tongs.episodes
for delete
to authenticated
using (tongs.can_access_workspace(workspace_id));

create or replace function tongs.can_access_workpiece(_workpiece_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tongs.episodes e
    where e.id = _workpiece_id
      and tongs.can_access_workspace(e.workspace_id)
  );
$$;

do $$
begin
  if to_regclass('tongs.workpiece_files') is not null then
    alter table tongs.workpiece_files drop constraint if exists workpiece_files_workpiece_id_fkey;
    alter table tongs.workpiece_files
      add constraint workpiece_files_workpiece_id_fkey
      foreign key (workpiece_id) references tongs.episodes(id) on delete cascade;
  end if;

  if to_regclass('tongs.workpiece_events') is not null then
    alter table tongs.workpiece_events drop constraint if exists workpiece_events_workpiece_id_fkey;
    alter table tongs.workpiece_events
      add constraint workpiece_events_workpiece_id_fkey
      foreign key (workpiece_id) references tongs.episodes(id) on delete cascade;
  end if;
end;
$$;
