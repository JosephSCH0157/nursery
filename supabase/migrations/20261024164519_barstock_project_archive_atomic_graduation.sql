begin;

do $preflight$
declare
  v_trigger_definition text;
  v_function_owner text;
  v_function_security_definer boolean;
  v_function_search_path text[];
  v_atomicity_function_definition text;
  v_status_constraint text;
begin
  if to_regclass('tongs.barstock_assignments') is null
     or to_regclass('tongs.barstock_sparks') is null then
    raise exception 'Gate 6H requires the canonical Bar Stock Project and Spark tables.';
  end if;

  select
    pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig
  into
    v_function_owner,
    v_function_security_definer,
    v_function_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tongs'
    and p.proname = 'barstock_archive_project_graduates_sparks'
    and pg_get_function_identity_arguments(p.oid) = ''
    and p.prorettype = 'trigger'::regtype;

  if not found
     or v_function_owner <> 'postgres'
     or v_function_security_definer
     or v_function_search_path is distinct from array['search_path=tongs, pg_temp']::text[] then
    raise exception 'Gate 6H found an incompatible Bar Stock Project archive trigger function contract.';
  end if;

  select pg_get_functiondef(p.oid)
  into v_atomicity_function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tongs'
    and p.proname = 'enforce_barstock_project_atomicity_on_sparks'
    and pg_get_function_identity_arguments(p.oid) = ''
    and p.prorettype = 'trigger'::regtype
    and pg_get_userbyid(p.proowner) = 'postgres'
    and not p.prosecdef
    and p.proconfig = array['search_path=tongs, pg_temp']::text[];

  if v_atomicity_function_definition is null
     or (
       v_atomicity_function_definition not like '%old is not null and old.status = ''graduated''%'
       and v_atomicity_function_definition not like '%tg_op = ''UPDATE'' and old.status = ''graduated''%'
     ) then
    raise exception 'Gate 6H found an incompatible Bar Stock Spark atomicity trigger function contract.';
  end if;

  select pg_get_triggerdef(t.oid, false)
  into v_trigger_definition
  from pg_trigger t
  where t.tgrelid = 'tongs.barstock_assignments'::regclass
    and t.tgname = 'trg_barstock_assignments_archive_graduates_sparks'
    and not t.tgisinternal;

  if v_trigger_definition is null then
    raise exception 'Gate 6H requires the existing Bar Stock Project archive trigger.';
  end if;

  if v_trigger_definition not like
       'CREATE TRIGGER trg_barstock_assignments_archive_graduates_sparks BEFORE UPDATE OF status ON tongs.barstock_assignments FOR EACH ROW EXECUTE FUNCTION tongs.barstock_archive_project_graduates_sparks()'
     and v_trigger_definition not like
       'CREATE TRIGGER trg_barstock_assignments_archive_graduates_sparks AFTER UPDATE OF status ON tongs.barstock_assignments FOR EACH ROW EXECUTE FUNCTION tongs.barstock_archive_project_graduates_sparks()' then
    raise exception 'Gate 6H found an incompatible Bar Stock Project archive trigger definition: %',
      v_trigger_definition;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'tongs.barstock_assignments'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'tongs.barstock_sparks'::regclass) then
    raise exception 'Gate 6H requires RLS on the Bar Stock Project and Spark tables.';
  end if;

  select pg_get_constraintdef(c.oid, false)
  into v_status_constraint
  from pg_constraint c
  where c.conrelid = 'tongs.barstock_sparks'::regclass
    and c.conname = 'barstock_sparks_status_check'
    and c.contype = 'c';

  if v_status_constraint not in (
    'CHECK ((status = ANY (ARRAY[''raw''::text, ''warming''::text, ''forged''::text, ''archived''::text])))',
    'CHECK ((status = ANY (ARRAY[''raw''::text, ''warming''::text, ''forged''::text, ''archived''::text, ''graduated''::text])))'
  ) then
    raise exception 'Gate 6H found an incompatible Bar Stock Spark status constraint: %',
      coalesce(v_status_constraint, '<missing>');
  end if;
end
$preflight$;

alter table tongs.barstock_sparks
  drop constraint barstock_sparks_status_check;

alter table tongs.barstock_sparks
  add constraint barstock_sparks_status_check
  check (status = any (array['raw', 'warming', 'forged', 'archived', 'graduated']::text[]));

do $replace_atomicity_function$
begin
  execute $definition$
create or replace function tongs.enforce_barstock_project_atomicity_on_sparks()
returns trigger
language plpgsql
set search_path to 'tongs', 'pg_temp'
as $body$
declare
  v_project_status text;
begin
  if new.assignment_id is not null then
    select a.status
      into v_project_status
      from tongs.barstock_assignments a
     where a.id = new.assignment_id;

    if v_project_status is null then
      raise exception using
        errcode = '23503',
        message = 'Spark references non-existent Project (assignment_id).';
    end if;

    if new.status = 'graduated' and coalesce(v_project_status, 'open') <> 'archived' then
      raise exception using
        errcode = '23514',
        message = 'Cannot graduate an individual spark inside an open Project. Archive (graduate) the Project instead.';
    end if;

    if tg_op = 'UPDATE'
       and old.status = 'graduated'
       and new.status <> 'graduated'
       and v_project_status = 'archived' then
      raise exception using
        errcode = '23514',
        message = 'Cannot un-graduate sparks in an archived Project.';
    end if;
  end if;

  return new;
end;
$body$
$definition$;
end
$replace_atomicity_function$;

create or replace trigger trg_barstock_assignments_archive_graduates_sparks
after update of status on tongs.barstock_assignments
for each row execute function tongs.barstock_archive_project_graduates_sparks();

do $postcondition$
declare
  v_trigger_definition text;
  v_status_constraint text;
  v_atomicity_function_definition text;
begin
  select pg_get_triggerdef(t.oid, false)
  into strict v_trigger_definition
  from pg_trigger t
  where t.tgrelid = 'tongs.barstock_assignments'::regclass
    and t.tgname = 'trg_barstock_assignments_archive_graduates_sparks'
    and not t.tgisinternal;

  if v_trigger_definition <> 'CREATE TRIGGER trg_barstock_assignments_archive_graduates_sparks AFTER UPDATE OF status ON tongs.barstock_assignments FOR EACH ROW EXECUTE FUNCTION tongs.barstock_archive_project_graduates_sparks()' then
    raise exception 'Gate 6H failed to establish the approved AFTER trigger contract.';
  end if;

  select pg_get_constraintdef(c.oid, false)
  into strict v_status_constraint
  from pg_constraint c
  where c.conrelid = 'tongs.barstock_sparks'::regclass
    and c.conname = 'barstock_sparks_status_check'
    and c.contype = 'c';

  if v_status_constraint <> 'CHECK ((status = ANY (ARRAY[''raw''::text, ''warming''::text, ''forged''::text, ''archived''::text, ''graduated''::text])))' then
    raise exception 'Gate 6H failed to establish the approved Spark terminal status contract.';
  end if;

  select pg_get_functiondef(p.oid)
  into strict v_atomicity_function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tongs'
    and p.proname = 'enforce_barstock_project_atomicity_on_sparks'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_atomicity_function_definition not like '%tg_op = ''UPDATE''%old.status = ''graduated''%'
     or v_atomicity_function_definition like '%old is not null and old.status = ''graduated''%' then
    raise exception 'Gate 6H failed to establish the Spark terminal reversal guard.';
  end if;
end
$postcondition$;

commit;
