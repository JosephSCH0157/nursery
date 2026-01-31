create schema if not exists tongs;

create table if not exists tongs.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  created_by uuid,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_workspace_start_idx
  on tongs.calendar_events (workspace_id, start_at);

create or replace function tongs.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_calendar_events_updated_at on tongs.calendar_events;

create trigger trg_calendar_events_updated_at
before update on tongs.calendar_events
for each row execute function tongs.set_updated_at();

alter table tongs.calendar_events enable row level security;

drop policy if exists calendar_events_read_if_member on tongs.calendar_events;
create policy calendar_events_read_if_member
on tongs.calendar_events
for select
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = calendar_events.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists calendar_events_insert_if_member on tongs.calendar_events;
create policy calendar_events_insert_if_member
on tongs.calendar_events
for insert
with check (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = calendar_events.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists calendar_events_update_if_member on tongs.calendar_events;
create policy calendar_events_update_if_member
on tongs.calendar_events
for update
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = calendar_events.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = calendar_events.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists calendar_events_delete_if_member on tongs.calendar_events;
create policy calendar_events_delete_if_member
on tongs.calendar_events
for delete
using (
  exists (
    select 1
    from tongs.workspace_members wm
    where wm.workspace_id = calendar_events.workspace_id
      and wm.user_id = auth.uid()
  )
);

-- Optional safety net:
alter table tongs.workspace_members
alter column role set default 'member';
