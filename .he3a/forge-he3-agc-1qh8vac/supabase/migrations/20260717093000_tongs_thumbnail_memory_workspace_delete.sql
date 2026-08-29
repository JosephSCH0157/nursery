-- Preserve append-only authoring while allowing canonical workspace/workpiece privacy deletion to cascade.
begin;
create or replace function tongs.reject_thumbnail_memory_mutation()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Thumbnail editorial memory is append-only; append a new revision instead.' using errcode = '55000';
end;
$$;
commit;
