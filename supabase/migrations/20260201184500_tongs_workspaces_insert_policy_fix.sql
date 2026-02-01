-- Replace insert policy to allow inserts where created_by is null
-- (because trg_workspaces_set_creator will set it before insert).
drop policy if exists workspaces_insert_self on tongs.workspaces;
drop policy if exists workspaces_insert_any on tongs.workspaces;

create policy workspaces_insert_self
on tongs.workspaces
for insert
with check (
  created_by = auth.uid()
  OR created_by IS NULL
);
