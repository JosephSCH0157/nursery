-- Phase 4: calendar event <-> episode links and role-gated calendar writes.

begin;

create table if not exists tongs.calendar_event_assignments (
  event_id uuid not null references tongs.calendar_events(id) on delete cascade,
  assignment_id uuid not null references tongs.episodes(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (event_id, assignment_id)
);

create index if not exists calendar_event_assignments_workspace_event_idx
  on tongs.calendar_event_assignments (workspace_id, event_id);

create index if not exists calendar_event_assignments_workspace_assignment_idx
  on tongs.calendar_event_assignments (workspace_id, assignment_id);

create or replace function tongs.calendar_event_assignments_enforce_workspace()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_event_workspace uuid;
  v_assignment_workspace uuid;
begin
  select ce.workspace_id
  into v_event_workspace
  from tongs.calendar_events ce
  where ce.id = new.event_id;

  if v_event_workspace is null then
    raise exception 'Calendar event not found for assignment link'
      using errcode = '23503';
  end if;

  select e.workspace_id
  into v_assignment_workspace
  from tongs.episodes e
  where e.id = new.assignment_id;

  if v_assignment_workspace is null then
    raise exception 'Episode/workpiece not found for calendar assignment link'
      using errcode = '23503';
  end if;

  if new.workspace_id is null then
    new.workspace_id := v_event_workspace;
  end if;

  if new.workspace_id <> v_event_workspace
     or new.workspace_id <> v_assignment_workspace then
    raise exception 'Calendar event assignment workspace mismatch'
      using errcode = '22023';
  end if;

  return new;
end
$$;

drop trigger if exists trg_calendar_event_assignments_enforce_workspace
  on tongs.calendar_event_assignments;
create trigger trg_calendar_event_assignments_enforce_workspace
before insert or update on tongs.calendar_event_assignments
for each row execute function tongs.calendar_event_assignments_enforce_workspace();

-- Backfill only valid historical links where assignment_id points to an episode id
-- in the same workspace.
insert into tongs.calendar_event_assignments (
  event_id,
  assignment_id,
  workspace_id,
  created_at,
  created_by
)
select
  ce.id as event_id,
  ce.assignment_id,
  ce.workspace_id,
  coalesce(ce.updated_at, ce.created_at, now()),
  ce.created_by
from tongs.calendar_events ce
join tongs.episodes e
  on e.id = ce.assignment_id
 and e.workspace_id = ce.workspace_id
where ce.assignment_id is not null
on conflict (event_id, assignment_id) do nothing;

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array['calendar_events', 'calendar_event_assignments']
  loop
    for v_policy in
      select p.policyname
      from pg_policies p
      where p.schemaname = 'tongs'
        and p.tablename = v_table
    loop
      execute format('drop policy if exists %I on tongs.%I', v_policy, v_table);
    end loop;
  end loop;
end
$$;

alter table tongs.calendar_events enable row level security;
alter table tongs.calendar_event_assignments enable row level security;

create policy calendar_events_select_if_workspace_viewer
on tongs.calendar_events
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.calendar_events.workspace_id, 'viewer')
);

create policy calendar_events_insert_if_workspace_editor
on tongs.calendar_events
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.calendar_events.workspace_id, 'editor')
);

create policy calendar_events_update_if_workspace_editor
on tongs.calendar_events
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.calendar_events.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.calendar_events.workspace_id, 'editor')
);

create policy calendar_events_delete_if_workspace_admin
on tongs.calendar_events
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.calendar_events.workspace_id, 'admin')
);

create policy calendar_event_assignments_select_if_workspace_viewer
on tongs.calendar_event_assignments
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.calendar_event_assignments.workspace_id, 'viewer')
);

create policy calendar_event_assignments_insert_if_workspace_editor
on tongs.calendar_event_assignments
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.calendar_event_assignments.workspace_id, 'editor')
);

create policy calendar_event_assignments_delete_if_workspace_editor
on tongs.calendar_event_assignments
for delete
to authenticated
using (
  tongs.has_workspace_role(tongs.calendar_event_assignments.workspace_id, 'editor')
);

grant select, insert, delete on table tongs.calendar_event_assignments to authenticated;
grant select on table tongs.calendar_event_assignments to anon;
grant all on table tongs.calendar_event_assignments to service_role;

commit;
