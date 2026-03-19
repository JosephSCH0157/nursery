-- Workspace-scoped thumbnail brand templates for deterministic overlay rendering.
-- Templates are shared within a workspace and selected by Hearth concepts via brand_template_id.

begin;

create table if not exists tongs.workspace_thumbnail_brand_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  slug text not null,
  name text not null,
  template_json jsonb not null,
  is_default boolean not null default false,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  constraint workspace_thumbnail_brand_templates_slug_check check (length(btrim(slug)) > 0),
  constraint workspace_thumbnail_brand_templates_name_check check (length(btrim(name)) > 0),
  constraint workspace_thumbnail_brand_templates_json_object_check check (jsonb_typeof(template_json) = 'object')
);

create unique index if not exists workspace_thumbnail_brand_templates_workspace_slug_uidx
  on tongs.workspace_thumbnail_brand_templates (workspace_id, slug);

create unique index if not exists workspace_thumbnail_brand_templates_one_default_uidx
  on tongs.workspace_thumbnail_brand_templates (workspace_id)
  where is_default = true and archived_at is null;

create index if not exists workspace_thumbnail_brand_templates_workspace_updated_idx
  on tongs.workspace_thumbnail_brand_templates (workspace_id, updated_at desc);

drop trigger if exists trg_workspace_thumbnail_brand_templates_updated_at on tongs.workspace_thumbnail_brand_templates;
create trigger trg_workspace_thumbnail_brand_templates_updated_at
before update on tongs.workspace_thumbnail_brand_templates
for each row execute function tongs.set_updated_at();

alter table tongs.workspace_thumbnail_brand_templates enable row level security;

drop policy if exists thumbnail_brand_templates_select_if_workspace_viewer on tongs.workspace_thumbnail_brand_templates;
drop policy if exists thumbnail_brand_templates_insert_if_workspace_editor on tongs.workspace_thumbnail_brand_templates;
drop policy if exists thumbnail_brand_templates_update_if_workspace_editor on tongs.workspace_thumbnail_brand_templates;
drop policy if exists thumbnail_brand_templates_delete_if_workspace_editor on tongs.workspace_thumbnail_brand_templates;

create policy thumbnail_brand_templates_select_if_workspace_viewer
on tongs.workspace_thumbnail_brand_templates
for select
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'viewer')
);

create policy thumbnail_brand_templates_insert_if_workspace_editor
on tongs.workspace_thumbnail_brand_templates
for insert
to authenticated
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

create policy thumbnail_brand_templates_update_if_workspace_editor
on tongs.workspace_thumbnail_brand_templates
for update
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(workspace_id, 'editor')
  and updated_by = auth.uid()
);

create policy thumbnail_brand_templates_delete_if_workspace_editor
on tongs.workspace_thumbnail_brand_templates
for delete
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'editor')
);

create or replace function tongs.list_my_thumbnail_brand_templates(
  p_workspace_id uuid,
  p_include_archived boolean default false
)
returns table (
  template_id uuid,
  workspace_id uuid,
  slug text,
  name text,
  template_json jsonb,
  is_default boolean,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  return query
  select
    t.id,
    t.workspace_id,
    t.slug,
    t.name,
    t.template_json,
    t.is_default,
    t.archived_at,
    t.created_at,
    t.updated_at,
    t.updated_by
  from tongs.workspace_thumbnail_brand_templates t
  where t.workspace_id = p_workspace_id
    and (p_include_archived or t.archived_at is null)
  order by t.is_default desc, t.created_at asc, t.name asc;
end;
$$;

create or replace function tongs.create_my_thumbnail_brand_template(
  p_workspace_id uuid,
  p_slug text,
  p_name text,
  p_template_json jsonb,
  p_is_default boolean default false
)
returns table (
  template_id uuid,
  workspace_id uuid,
  slug text,
  name text,
  template_json jsonb,
  is_default boolean,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_slug text := lower(regexp_replace(coalesce(p_slug, ''), '[^a-z0-9]+', '-', 'g'));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_template_json jsonb := coalesce(p_template_json, '{}'::jsonb);
  v_make_default boolean := coalesce(p_is_default, false);
  v_id uuid := gen_random_uuid();
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'editor');

  v_slug := trim(both '-' from v_slug);
  if v_slug is null or length(v_slug) = 0 then
    raise exception 'slug is required'
      using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'name is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_template_json) <> 'object' then
    raise exception 'template_json must be an object'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from tongs.workspace_thumbnail_brand_templates existing
    where existing.workspace_id = p_workspace_id
      and existing.archived_at is null
  ) then
    v_make_default := true;
  end if;

  if v_make_default then
    update tongs.workspace_thumbnail_brand_templates
    set is_default = false,
        updated_at = now(),
        updated_by = v_user
    where workspace_id = p_workspace_id
      and archived_at is null;
  end if;

  insert into tongs.workspace_thumbnail_brand_templates (
    id,
    workspace_id,
    slug,
    name,
    template_json,
    is_default,
    archived_at,
    created_at,
    updated_at,
    updated_by
  )
  values (
    v_id,
    p_workspace_id,
    v_slug,
    v_name,
    jsonb_strip_nulls(v_template_json),
    v_make_default,
    null,
    now(),
    now(),
    v_user
  );

  return query
  select
    t.id,
    t.workspace_id,
    t.slug,
    t.name,
    t.template_json,
    t.is_default,
    t.archived_at,
    t.created_at,
    t.updated_at,
    t.updated_by
  from tongs.workspace_thumbnail_brand_templates t
  where t.id = v_id;
end;
$$;

create or replace function tongs.update_my_thumbnail_brand_template(
  p_workspace_id uuid,
  p_template_id uuid,
  p_name text default null,
  p_template_json jsonb default null,
  p_is_default boolean default null
)
returns table (
  template_id uuid,
  workspace_id uuid,
  slug text,
  name text,
  template_json jsonb,
  is_default boolean,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_template_json jsonb := p_template_json;
  v_target tongs.workspace_thumbnail_brand_templates%rowtype;
  v_make_default boolean;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null or p_template_id is null then
    raise exception 'workspace_id and template_id are required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'editor');

  select *
  into v_target
  from tongs.workspace_thumbnail_brand_templates t
  where t.workspace_id = p_workspace_id
    and t.id = p_template_id
  limit 1;

  if not found then
    raise exception 'template not found'
      using errcode = 'P0002';
  end if;

  if v_target.archived_at is not null then
    raise exception 'template is archived'
      using errcode = '22023';
  end if;

  if p_template_json is not null and jsonb_typeof(v_template_json) <> 'object' then
    raise exception 'template_json must be an object'
      using errcode = '22023';
  end if;

  v_make_default := coalesce(p_is_default, v_target.is_default);

  if v_make_default then
    update tongs.workspace_thumbnail_brand_templates
    set is_default = false,
        updated_at = now(),
        updated_by = v_user
    where workspace_id = p_workspace_id
      and id <> p_template_id
      and archived_at is null;
  end if;

  update tongs.workspace_thumbnail_brand_templates t
  set name = coalesce(v_name, t.name),
      template_json = coalesce(jsonb_strip_nulls(v_template_json), t.template_json),
      is_default = v_make_default,
      updated_at = now(),
      updated_by = v_user
  where t.workspace_id = p_workspace_id
    and t.id = p_template_id;

  return query
  select
    t.id,
    t.workspace_id,
    t.slug,
    t.name,
    t.template_json,
    t.is_default,
    t.archived_at,
    t.created_at,
    t.updated_at,
    t.updated_by
  from tongs.workspace_thumbnail_brand_templates t
  where t.id = p_template_id;
end;
$$;

create or replace function tongs.archive_my_thumbnail_brand_template(
  p_workspace_id uuid,
  p_template_id uuid
)
returns table (
  template_id uuid,
  workspace_id uuid,
  slug text,
  name text,
  template_json jsonb,
  is_default boolean,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_was_default boolean := false;
  v_fallback_id uuid := null;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null or p_template_id is null then
    raise exception 'workspace_id and template_id are required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'editor');

  select is_default
  into v_was_default
  from tongs.workspace_thumbnail_brand_templates t
  where t.workspace_id = p_workspace_id
    and t.id = p_template_id
    and t.archived_at is null
  limit 1;

  if not found then
    raise exception 'template not found'
      using errcode = 'P0002';
  end if;

  update tongs.workspace_thumbnail_brand_templates t
  set archived_at = now(),
      is_default = false,
      updated_at = now(),
      updated_by = v_user
  where t.workspace_id = p_workspace_id
    and t.id = p_template_id;

  if v_was_default then
    select t.id
    into v_fallback_id
    from tongs.workspace_thumbnail_brand_templates t
    where t.workspace_id = p_workspace_id
      and t.archived_at is null
    order by t.created_at asc, t.id asc
    limit 1;

    if v_fallback_id is not null then
      update tongs.workspace_thumbnail_brand_templates t
      set is_default = true,
          updated_at = now(),
          updated_by = v_user
      where t.id = v_fallback_id;
    end if;
  end if;

  return query
  select
    t.id,
    t.workspace_id,
    t.slug,
    t.name,
    t.template_json,
    t.is_default,
    t.archived_at,
    t.created_at,
    t.updated_at,
    t.updated_by
  from tongs.workspace_thumbnail_brand_templates t
  where t.id = p_template_id;
end;
$$;

create or replace function tongs.seed_my_thumbnail_brand_templates(
  p_workspace_id uuid
)
returns table (
  inserted_count integer
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_existing_count integer := 0;
  v_inserted_count integer := 0;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'editor');

  select count(*)
  into v_existing_count
  from tongs.workspace_thumbnail_brand_templates t
  where t.workspace_id = p_workspace_id
    and t.archived_at is null;

  if v_existing_count > 0 then
    return query select 0;
    return;
  end if;

  insert into tongs.workspace_thumbnail_brand_templates (
    workspace_id, slug, name, template_json, is_default, updated_by
  )
  values
    (
      p_workspace_id,
      'bold-commentary',
      'Bold Commentary',
      jsonb_build_object(
        'title_style', jsonb_build_object(
          'font_preset', 'bold_sans',
          'text_color', '#FFFFFF',
          'shadow', jsonb_build_object('enabled', true, 'strength', 'strong')
        ),
        'layout', jsonb_build_object(
          'title_position', 'bottom',
          'alignment', 'center',
          'max_lines', 3
        ),
        'background_treatment', jsonb_build_object(
          'darken', 0.18,
          'blur', 0
        ),
        'accent', jsonb_build_object(
          'border_color', null,
          'border_width', 0,
          'corner_radius', 8
        )
      ),
      true,
      v_user
    ),
    (
      p_workspace_id,
      'news-alert',
      'News Alert',
      jsonb_build_object(
        'title_style', jsonb_build_object(
          'font_preset', 'condensed_sans',
          'text_color', '#FFFFFF',
          'shadow', jsonb_build_object('enabled', true, 'strength', 'medium')
        ),
        'layout', jsonb_build_object(
          'title_position', 'top',
          'alignment', 'left',
          'max_lines', 3
        ),
        'background_treatment', jsonb_build_object(
          'darken', 0.28,
          'blur', 0
        ),
        'accent', jsonb_build_object(
          'border_color', '#B91C1C',
          'border_width', 6,
          'corner_radius', 8
        )
      ),
      false,
      v_user
    ),
    (
      p_workspace_id,
      'minimal-clean',
      'Minimal Clean',
      jsonb_build_object(
        'title_style', jsonb_build_object(
          'font_preset', 'modern_clean',
          'text_color', '#F8FAFC',
          'shadow', jsonb_build_object('enabled', true, 'strength', 'soft')
        ),
        'layout', jsonb_build_object(
          'title_position', 'bottom',
          'alignment', 'left',
          'max_lines', 3
        ),
        'background_treatment', jsonb_build_object(
          'darken', 0.12,
          'blur', 0
        ),
        'accent', jsonb_build_object(
          'border_color', '#CBD5E1',
          'border_width', 2,
          'corner_radius', 8
        )
      ),
      false,
      v_user
    ),
    (
      p_workspace_id,
      'cinematic',
      'Cinematic',
      jsonb_build_object(
        'title_style', jsonb_build_object(
          'font_preset', 'cinematic_serif',
          'text_color', '#F8F5EC',
          'shadow', jsonb_build_object('enabled', true, 'strength', 'strong')
        ),
        'layout', jsonb_build_object(
          'title_position', 'bottom',
          'alignment', 'center',
          'max_lines', 3
        ),
        'background_treatment', jsonb_build_object(
          'darken', 0.24,
          'blur', 1
        ),
        'accent', jsonb_build_object(
          'border_color', '#D4A373',
          'border_width', 3,
          'corner_radius', 8
        )
      ),
      false,
      v_user
    );

  get diagnostics v_inserted_count = row_count;
  return query select v_inserted_count;
end;
$$;

revoke all on table tongs.workspace_thumbnail_brand_templates from public;
grant select, insert, update, delete on table tongs.workspace_thumbnail_brand_templates to authenticated;
grant all on table tongs.workspace_thumbnail_brand_templates to service_role;

revoke all on function tongs.list_my_thumbnail_brand_templates(uuid, boolean) from public;
revoke all on function tongs.create_my_thumbnail_brand_template(uuid, text, text, jsonb, boolean) from public;
revoke all on function tongs.update_my_thumbnail_brand_template(uuid, uuid, text, jsonb, boolean) from public;
revoke all on function tongs.archive_my_thumbnail_brand_template(uuid, uuid) from public;
revoke all on function tongs.seed_my_thumbnail_brand_templates(uuid) from public;

grant execute on function tongs.list_my_thumbnail_brand_templates(uuid, boolean) to authenticated;
grant execute on function tongs.create_my_thumbnail_brand_template(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function tongs.update_my_thumbnail_brand_template(uuid, uuid, text, jsonb, boolean) to authenticated;
grant execute on function tongs.archive_my_thumbnail_brand_template(uuid, uuid) to authenticated;
grant execute on function tongs.seed_my_thumbnail_brand_templates(uuid) to authenticated;

grant execute on function tongs.list_my_thumbnail_brand_templates(uuid, boolean) to service_role;
grant execute on function tongs.create_my_thumbnail_brand_template(uuid, text, text, jsonb, boolean) to service_role;
grant execute on function tongs.update_my_thumbnail_brand_template(uuid, uuid, text, jsonb, boolean) to service_role;
grant execute on function tongs.archive_my_thumbnail_brand_template(uuid, uuid) to service_role;
grant execute on function tongs.seed_my_thumbnail_brand_templates(uuid) to service_role;

commit;
