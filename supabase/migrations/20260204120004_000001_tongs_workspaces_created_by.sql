-- Ensure created_by is always set to the authenticated user
create or replace function tongs.set_workspace_creator()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspaces_set_creator on tongs.workspaces;

create trigger trg_workspaces_set_creator
before insert on tongs.workspaces
for each row
execute function tongs.set_workspace_creator();
