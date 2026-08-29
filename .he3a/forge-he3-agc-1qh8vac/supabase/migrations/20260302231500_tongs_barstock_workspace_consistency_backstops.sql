-- Phase D hardening: enforce Bar Stock workspace consistency across spark/project links.

begin;

-- Backfill legacy rows where spark workspace drifted from its project workspace.
update tongs.barstock_sparks s
set workspace_id = a.workspace_id
from tongs.barstock_assignments a
where s.assignment_id = a.id
  and s.workspace_id is distinct from a.workspace_id;

-- Spark rows must stay in the same workspace as their linked project.
create or replace function tongs.barstock_sparks_enforce_workspace()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_assignment_workspace uuid;
begin
  if new.assignment_id is null then
    return new;
  end if;

  select a.workspace_id
  into v_assignment_workspace
  from tongs.barstock_assignments a
  where a.id = new.assignment_id;

  if v_assignment_workspace is null then
    raise exception 'Bar Stock project not found for spark assignment'
      using errcode = '23503';
  end if;

  if new.workspace_id is null then
    new.workspace_id := v_assignment_workspace;
  end if;

  if new.workspace_id <> v_assignment_workspace then
    raise exception 'Spark/project workspace mismatch'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_barstock_sparks_workspace
  on tongs.barstock_sparks;

create trigger trg_barstock_sparks_workspace
before insert or update on tongs.barstock_sparks
for each row execute function tongs.barstock_sparks_enforce_workspace();

create index if not exists barstock_project_episode_links_workspace_created_idx
  on tongs.barstock_project_episode_links (workspace_id, created_at desc);

commit;
