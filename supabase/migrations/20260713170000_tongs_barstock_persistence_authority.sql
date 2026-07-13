-- Phase 3 schema gate: server-authoritative Bar-Stock writes.
-- This migration must be deployed and verified before the Bar-Stock UI is
-- changed to rely on these contracts.

begin;

alter table tongs.barstock_assignments
  add column if not exists revision bigint not null default 1,
  add column if not exists import_key text;

alter table tongs.barstock_sparks
  add column if not exists revision bigint not null default 1,
  add column if not exists import_key text;

alter table tongs.barstock_assignments
  drop constraint if exists barstock_assignments_revision_positive;
alter table tongs.barstock_assignments
  add constraint barstock_assignments_revision_positive check (revision > 0);

alter table tongs.barstock_sparks
  drop constraint if exists barstock_sparks_revision_positive;
alter table tongs.barstock_sparks
  add constraint barstock_sparks_revision_positive check (revision > 0);

create unique index if not exists barstock_assignments_workspace_import_key_uidx
  on tongs.barstock_assignments (workspace_id, import_key)
  where import_key is not null;

create unique index if not exists barstock_sparks_workspace_import_key_uidx
  on tongs.barstock_sparks (workspace_id, import_key)
  where import_key is not null;

create index if not exists barstock_assignments_workspace_revision_idx
  on tongs.barstock_assignments (workspace_id, revision);

create index if not exists barstock_sparks_workspace_revision_idx
  on tongs.barstock_sparks (workspace_id, revision);

create or replace function tongs.barstock_advance_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
begin
  new.revision := old.revision + 1;
  return new;
end;
$function$;

drop trigger if exists trg_barstock_assignments_revision on tongs.barstock_assignments;
create trigger trg_barstock_assignments_revision
before update on tongs.barstock_assignments
for each row execute function tongs.barstock_advance_revision();

drop trigger if exists trg_barstock_sparks_revision on tongs.barstock_sparks;
create trigger trg_barstock_sparks_revision
before update on tongs.barstock_sparks
for each row execute function tongs.barstock_advance_revision();

-- A null expected revision means create. A non-null expected revision means an
-- optimistic update. The database, never a client clock, orders writes.
create or replace function tongs.barstock_apply_assignment(
  p_row jsonb,
  p_expected_revision bigint default null,
  p_import_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
declare
  v_workspace_id uuid := nullif(p_row->>'workspace_id', '')::uuid;
  v_id uuid := nullif(p_row->>'id', '')::uuid;
  v_existing tongs.barstock_assignments%rowtype;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Authentication is required for Bar-Stock writes.';
  end if;
  if v_workspace_id is null or not tongs.has_workspace_role(v_workspace_id, 'editor') then
    raise insufficient_privilege using message = 'Bar-Stock assignment write requires workspace editor authority.';
  end if;
  if v_id is null or nullif(btrim(p_row->>'title'), '') is null then
    raise invalid_parameter_value using message = 'Assignment id and title are required.';
  end if;

  if p_expected_revision is null then
    insert into tongs.barstock_assignments (
      id, workspace_id, created_by, title, status, import_key
    ) values (
      v_id, v_workspace_id, auth.uid(), btrim(p_row->>'title'),
      coalesce(nullif(p_row->>'status', ''), 'open'), nullif(p_import_key, '')
    )
    on conflict do nothing
    returning * into v_existing;

    if found then
      return jsonb_build_object('outcome', 'saved', 'row', to_jsonb(v_existing));
    end if;

    select * into v_existing
    from tongs.barstock_assignments
    where workspace_id = v_workspace_id
      and (id = v_id or (p_import_key is not null and import_key = p_import_key))
    order by (id = v_id) desc
    limit 1;

    if found then
      return jsonb_build_object('outcome', 'duplicate', 'row', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome', 'conflict', 'row', null);
  end if;

  update tongs.barstock_assignments
  set title = coalesce(nullif(btrim(p_row->>'title'), ''), title),
      status = coalesce(nullif(p_row->>'status', ''), status)
  where workspace_id = v_workspace_id
    and id = v_id
    and revision = p_expected_revision
  returning * into v_existing;

  if found then
    return jsonb_build_object('outcome', 'saved', 'row', to_jsonb(v_existing));
  end if;

  select * into v_existing from tongs.barstock_assignments
  where workspace_id = v_workspace_id and id = v_id;
  return case when found
    then jsonb_build_object('outcome', 'stale', 'row', to_jsonb(v_existing))
    else jsonb_build_object('outcome', 'not_found', 'row', null)
  end;
end;
$function$;

create or replace function tongs.barstock_apply_spark(
  p_row jsonb,
  p_expected_revision bigint default null,
  p_import_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
declare
  v_workspace_id uuid := nullif(p_row->>'workspace_id', '')::uuid;
  v_id uuid := nullif(p_row->>'id', '')::uuid;
  v_existing tongs.barstock_sparks%rowtype;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message = 'Authentication is required for Bar-Stock writes.';
  end if;
  if v_workspace_id is null or not tongs.has_workspace_role(v_workspace_id, 'editor') then
    raise insufficient_privilege using message = 'Bar-Stock Spark write requires workspace editor authority.';
  end if;
  if v_id is null or nullif(btrim(p_row->>'body'), '') is null then
    raise invalid_parameter_value using message = 'Spark id and body are required.';
  end if;

  if p_expected_revision is null then
    insert into tongs.barstock_sparks (
      id, workspace_id, created_by, assignment_id, title, body, tags,
      status, source, pinned, import_key
    ) values (
      v_id, v_workspace_id, auth.uid(), nullif(p_row->>'assignment_id', '')::uuid,
      nullif(p_row->>'title', ''), p_row->>'body',
      coalesce(array(select jsonb_array_elements_text(coalesce(p_row->'tags', '[]'::jsonb))), '{}'::text[]),
      coalesce(nullif(p_row->>'status', ''), 'raw'),
      coalesce(nullif(p_row->>'source', ''), 'typed'),
      coalesce((p_row->>'pinned')::boolean, false), nullif(p_import_key, '')
    )
    on conflict do nothing
    returning * into v_existing;

    if found then
      return jsonb_build_object('outcome', 'saved', 'row', to_jsonb(v_existing));
    end if;

    select * into v_existing
    from tongs.barstock_sparks
    where workspace_id = v_workspace_id
      and (id = v_id or (p_import_key is not null and import_key = p_import_key))
    order by (id = v_id) desc
    limit 1;
    if found then
      return jsonb_build_object('outcome', 'duplicate', 'row', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome', 'conflict', 'row', null);
  end if;

  update tongs.barstock_sparks
  set assignment_id = case when p_row ? 'assignment_id' then nullif(p_row->>'assignment_id', '')::uuid else assignment_id end,
      title = case when p_row ? 'title' then nullif(p_row->>'title', '') else title end,
      body = coalesce(nullif(p_row->>'body', ''), body),
      tags = case when p_row ? 'tags' then array(select jsonb_array_elements_text(p_row->'tags')) else tags end,
      status = coalesce(nullif(p_row->>'status', ''), status),
      source = coalesce(nullif(p_row->>'source', ''), source),
      pinned = case when p_row ? 'pinned' then (p_row->>'pinned')::boolean else pinned end
  where workspace_id = v_workspace_id and id = v_id and revision = p_expected_revision
  returning * into v_existing;

  if found then
    return jsonb_build_object('outcome', 'saved', 'row', to_jsonb(v_existing));
  end if;
  select * into v_existing from tongs.barstock_sparks
  where workspace_id = v_workspace_id and id = v_id;
  return case when found
    then jsonb_build_object('outcome', 'stale', 'row', to_jsonb(v_existing))
    else jsonb_build_object('outcome', 'not_found', 'row', null)
  end;
end;
$function$;

create or replace function tongs.barstock_archive_assignment(
  p_workspace_id uuid, p_id uuid, p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
declare v_existing tongs.barstock_assignments%rowtype;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    raise insufficient_privilege using message = 'Bar-Stock assignment archive requires workspace editor authority.';
  end if;
  update tongs.barstock_assignments set status = 'archived'
  where workspace_id = p_workspace_id and id = p_id and revision = p_expected_revision
  returning * into v_existing;
  if found then return jsonb_build_object('outcome', 'saved', 'row', to_jsonb(v_existing)); end if;
  select * into v_existing from tongs.barstock_assignments where workspace_id = p_workspace_id and id = p_id;
  return case when found then jsonb_build_object('outcome', 'stale', 'row', to_jsonb(v_existing))
    else jsonb_build_object('outcome', 'not_found', 'row', null) end;
end;
$function$;

create or replace function tongs.barstock_archive_spark(
  p_workspace_id uuid, p_id uuid, p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
declare v_existing tongs.barstock_sparks%rowtype;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    raise insufficient_privilege using message = 'Bar-Stock Spark archive requires workspace editor authority.';
  end if;
  update tongs.barstock_sparks set status = 'archived', deleted_at = now()
  where workspace_id = p_workspace_id and id = p_id and revision = p_expected_revision
  returning * into v_existing;
  if found then return jsonb_build_object('outcome', 'saved', 'row', to_jsonb(v_existing)); end if;
  select * into v_existing from tongs.barstock_sparks where workspace_id = p_workspace_id and id = p_id;
  return case when found then jsonb_build_object('outcome', 'stale', 'row', to_jsonb(v_existing))
    else jsonb_build_object('outcome', 'not_found', 'row', null) end;
end;
$function$;

-- Hard deletion is intentionally narrow. A linked assignment cannot be
-- deleted because its project -> workpiece identity link is durable history.
create or replace function tongs.barstock_delete_assignment(
  p_workspace_id uuid, p_id uuid, p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, tongs
as $function$
declare v_existing tongs.barstock_assignments%rowtype;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'admin') then
    raise insufficient_privilege using message = 'Bar-Stock assignment deletion requires workspace admin authority.';
  end if;
  if exists (select 1 from tongs.barstock_project_episode_links where workspace_id = p_workspace_id and project_id = p_id) then
    return jsonb_build_object('outcome', 'linked', 'row', null);
  end if;
  delete from tongs.barstock_assignments
  where workspace_id = p_workspace_id and id = p_id and revision = p_expected_revision
  returning * into v_existing;
  if found then return jsonb_build_object('outcome', 'deleted', 'row', to_jsonb(v_existing)); end if;
  select * into v_existing from tongs.barstock_assignments where workspace_id = p_workspace_id and id = p_id;
  return case when found then jsonb_build_object('outcome', 'stale', 'row', to_jsonb(v_existing))
    else jsonb_build_object('outcome', 'not_found', 'row', null) end;
end;
$function$;

revoke all on function tongs.barstock_apply_assignment(jsonb, bigint, text) from public, anon;
revoke all on function tongs.barstock_apply_spark(jsonb, bigint, text) from public, anon;
revoke all on function tongs.barstock_archive_assignment(uuid, uuid, bigint) from public, anon;
revoke all on function tongs.barstock_archive_spark(uuid, uuid, bigint) from public, anon;
revoke all on function tongs.barstock_delete_assignment(uuid, uuid, bigint) from public, anon;
grant execute on function tongs.barstock_apply_assignment(jsonb, bigint, text) to authenticated;
grant execute on function tongs.barstock_apply_spark(jsonb, bigint, text) to authenticated;
grant execute on function tongs.barstock_archive_assignment(uuid, uuid, bigint) to authenticated;
grant execute on function tongs.barstock_archive_spark(uuid, uuid, bigint) to authenticated;
grant execute on function tongs.barstock_delete_assignment(uuid, uuid, bigint) to authenticated;

comment on column tongs.barstock_assignments.revision is 'Server-controlled optimistic concurrency token.';
comment on column tongs.barstock_sparks.revision is 'Server-controlled optimistic concurrency token.';
comment on column tongs.barstock_assignments.import_key is 'Workspace-scoped idempotency key for one-time legacy import.';
comment on column tongs.barstock_sparks.import_key is 'Workspace-scoped idempotency key for one-time legacy import.';

commit;
