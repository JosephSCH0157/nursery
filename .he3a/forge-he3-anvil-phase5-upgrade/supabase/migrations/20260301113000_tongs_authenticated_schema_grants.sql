-- Ensure authenticated clients can access tongs schema objects.
-- RLS policies remain the authority for row-level access.

grant usage on schema tongs to authenticated;
grant select, insert, update, delete on all tables in schema tongs to authenticated;
grant usage, select on all sequences in schema tongs to authenticated;
grant execute on all routines in schema tongs to authenticated;

alter default privileges in schema tongs
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema tongs
  grant usage, select on sequences to authenticated;
alter default privileges in schema tongs
  grant execute on routines to authenticated;
