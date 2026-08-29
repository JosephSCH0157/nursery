-- Ensure service_role can operate on tongs schema via PostgREST/API.
grant usage on schema tongs to service_role;
grant all privileges on all tables in schema tongs to service_role;
grant all privileges on all sequences in schema tongs to service_role;
grant all privileges on all routines in schema tongs to service_role;

alter default privileges in schema tongs grant all on tables to service_role;
alter default privileges in schema tongs grant all on sequences to service_role;
alter default privileges in schema tongs grant all on routines to service_role;
