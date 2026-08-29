begin;

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
    update tongs.workspace_thumbnail_brand_templates existing
    set is_default = false,
        updated_at = now(),
        updated_by = v_user
    where existing.workspace_id = p_workspace_id
      and existing.archived_at is null;
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
    update tongs.workspace_thumbnail_brand_templates other_templates
    set is_default = false,
        updated_at = now(),
        updated_by = v_user
    where other_templates.workspace_id = p_workspace_id
      and other_templates.id <> p_template_id
      and other_templates.archived_at is null;
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

commit;
