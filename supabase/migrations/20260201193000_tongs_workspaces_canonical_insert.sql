-- Canonical: tongs.workspaces ownership is DB-enforced via trigger.
-- Insert policy must NOT require created_by because trigger sets it.

alter table tongs.workspaces
  add column if not exists created_by uuid;

-- Ensure trigger function exists (idempotent)
create or replace function tongs.set_workspaces_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspaces_set_creator on tongs.workspaces;

create trigger trg_workspaces_set_creator
before insert on tongs.workspaces
for each row execute function tongs.set_workspaces_created_by();

alter table tongs.workspaces enable row level security;

-- INSERT: allow authenticated inserts; trigger stamps created_by
drop policy if exists workspaces_insert_self on tongs.workspaces;
drop policy if exists workspaces_insert_any on tongs.workspaces;

create policy workspaces_insert_self
on tongs.workspaces
for insert
to authenticated
with check (true);

-- READ: creator can read their own workspaces (good enough for now)
drop policy if exists workspaces_read_if_creator on tongs.workspaces;
drop policy if exists workspaces_read_if_member on tongs.workspaces;

create policy workspaces_read_if_creator
on tongs.workspaces
for select
to authenticated
using (created_by = auth.uid());
