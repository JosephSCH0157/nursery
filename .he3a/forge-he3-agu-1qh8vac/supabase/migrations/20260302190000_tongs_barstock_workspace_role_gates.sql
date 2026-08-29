-- Phase 3: Bar Stock workspace hard-scoping + role-gated writes.

begin;

-- Normalize spark workspace and creator ownership for legacy rows.
update tongs.barstock_sparks s
set workspace_id = a.workspace_id
from tongs.barstock_assignments a
where s.workspace_id is null
  and s.assignment_id = a.id;

update tongs.barstock_sparks s
set workspace_id = e.workspace_id
from tongs.episodes e
where s.workspace_id is null
  and s.assignment_id = e.id;

do $$
declare
  v_default_workspace_id uuid;
begin
  select w.id
  into v_default_workspace_id
  from tongs.workspaces w
  order by w.created_at asc
  limit 1;

  if v_default_workspace_id is not null then
    update tongs.barstock_sparks
    set workspace_id = v_default_workspace_id
    where workspace_id is null;
  end if;
end;
$$;

update tongs.barstock_sparks s
set created_by = coalesce(
  s.created_by,
  (
    select a.created_by
    from tongs.barstock_assignments a
    where a.id = s.assignment_id
    limit 1
  ),
  (
    select w.created_by
    from tongs.workspaces w
    where w.id = s.workspace_id
    limit 1
  ),
  (
    select m.user_id
    from tongs.workspace_members m
    where m.workspace_id = s.workspace_id
    order by m.created_at asc
    limit 1
  )
)
where s.created_by is null;

-- Make workspace scope explicit for all shared Bar Stock rows.
alter table if exists tongs.barstock_sparks
  alter column workspace_id set not null;

create index if not exists barstock_assignments_workspace_updated_idx
  on tongs.barstock_assignments (workspace_id, updated_at desc);

create index if not exists barstock_sparks_workspace_updated_idx
  on tongs.barstock_sparks (workspace_id, updated_at desc);

create index if not exists episodes_workspace_updated_idx
  on tongs.episodes (workspace_id, updated_at desc);

-- Enforce workspace consistency on project -> episode links.
create or replace function tongs.barstock_project_episode_links_enforce_workspace()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_project_workspace uuid;
  v_episode_workspace uuid;
begin
  select a.workspace_id
  into v_project_workspace
  from tongs.barstock_assignments a
  where a.id = new.project_id;

  if v_project_workspace is null then
    raise exception 'Bar Stock project not found for link'
      using errcode = '23503';
  end if;

  select e.workspace_id
  into v_episode_workspace
  from tongs.episodes e
  where e.id = new.workpiece_id;

  if v_episode_workspace is null then
    raise exception 'Episode/workpiece not found for link'
      using errcode = '23503';
  end if;

  if new.workspace_id is null then
    new.workspace_id := v_project_workspace;
  end if;

  if new.workspace_id <> v_project_workspace or new.workspace_id <> v_episode_workspace then
    raise exception 'Project/workpiece link workspace mismatch'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_barstock_project_episode_links_workspace
  on tongs.barstock_project_episode_links;

create trigger trg_barstock_project_episode_links_workspace
before insert or update on tongs.barstock_project_episode_links
for each row execute function tongs.barstock_project_episode_links_enforce_workspace();

-- Role-gated policies for episodes (workpieces).
drop policy if exists episodes_select_if_workspace_access on tongs.episodes;
drop policy if exists episodes_insert_if_workspace_access on tongs.episodes;
drop policy if exists episodes_update_if_workspace_access on tongs.episodes;
drop policy if exists episodes_delete_if_workspace_access on tongs.episodes;

create policy episodes_select_if_workspace_viewer
on tongs.episodes
for select
to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create policy episodes_insert_if_workspace_editor
on tongs.episodes
for insert
to authenticated
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy episodes_update_if_workspace_editor
on tongs.episodes
for update
to authenticated
using (tongs.has_workspace_role(workspace_id, 'editor'))
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy episodes_delete_if_workspace_admin
on tongs.episodes
for delete
to authenticated
using (tongs.has_workspace_role(workspace_id, 'admin'));

-- Role-gated policies for Bar Stock projects.
drop policy if exists barstock_assignments_select_if_workspace_access on tongs.barstock_assignments;
drop policy if exists barstock_assignments_insert_if_workspace_access on tongs.barstock_assignments;
drop policy if exists barstock_assignments_update_if_workspace_access on tongs.barstock_assignments;
drop policy if exists barstock_assignments_delete_if_workspace_access on tongs.barstock_assignments;

create policy barstock_assignments_select_if_workspace_viewer
on tongs.barstock_assignments
for select
to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create policy barstock_assignments_insert_if_workspace_editor
on tongs.barstock_assignments
for insert
to authenticated
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy barstock_assignments_update_if_workspace_editor
on tongs.barstock_assignments
for update
to authenticated
using (tongs.has_workspace_role(workspace_id, 'editor'))
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy barstock_assignments_delete_if_workspace_admin
on tongs.barstock_assignments
for delete
to authenticated
using (tongs.has_workspace_role(workspace_id, 'admin'));

-- Role-gated policies for Bar Stock sparks.
drop policy if exists barstock_sparks_select_if_workspace_access on tongs.barstock_sparks;
drop policy if exists barstock_sparks_insert_if_workspace_access on tongs.barstock_sparks;
drop policy if exists barstock_sparks_update_if_workspace_access on tongs.barstock_sparks;
drop policy if exists barstock_sparks_delete_if_workspace_access on tongs.barstock_sparks;

create policy barstock_sparks_select_if_workspace_viewer
on tongs.barstock_sparks
for select
to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create policy barstock_sparks_insert_if_workspace_editor
on tongs.barstock_sparks
for insert
to authenticated
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy barstock_sparks_update_if_workspace_editor
on tongs.barstock_sparks
for update
to authenticated
using (tongs.has_workspace_role(workspace_id, 'editor'))
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy barstock_sparks_delete_if_workspace_admin
on tongs.barstock_sparks
for delete
to authenticated
using (tongs.has_workspace_role(workspace_id, 'admin'));

-- Role-gated policies for explicit project -> episode links.
drop policy if exists barstock_project_episode_links_select_if_workspace_access on tongs.barstock_project_episode_links;
drop policy if exists barstock_project_episode_links_insert_if_workspace_access on tongs.barstock_project_episode_links;
drop policy if exists barstock_project_episode_links_update_if_workspace_access on tongs.barstock_project_episode_links;
drop policy if exists barstock_project_episode_links_delete_if_workspace_access on tongs.barstock_project_episode_links;

create policy barstock_project_episode_links_select_if_workspace_viewer
on tongs.barstock_project_episode_links
for select
to authenticated
using (tongs.has_workspace_role(workspace_id, 'viewer'));

create policy barstock_project_episode_links_insert_if_workspace_editor
on tongs.barstock_project_episode_links
for insert
to authenticated
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy barstock_project_episode_links_update_if_workspace_editor
on tongs.barstock_project_episode_links
for update
to authenticated
using (tongs.has_workspace_role(workspace_id, 'editor'))
with check (tongs.has_workspace_role(workspace_id, 'editor'));

create policy barstock_project_episode_links_delete_if_workspace_admin
on tongs.barstock_project_episode_links
for delete
to authenticated
using (tongs.has_workspace_role(workspace_id, 'admin'));

commit;
