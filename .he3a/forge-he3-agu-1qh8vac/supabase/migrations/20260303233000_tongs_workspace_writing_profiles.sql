-- Workspace-scoped writing defaults for Hearth generation.
-- One profile per (workspace_id, user_id), with tactical tone memory.

begin;

create table if not exists tongs.workspace_writing_profiles (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  default_audience text null,
  default_structure text null,
  style_notes text null,
  last_used_tone_preset text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_writing_profiles_workspace_updated_idx
  on tongs.workspace_writing_profiles (workspace_id, updated_at desc);

alter table tongs.workspace_writing_profiles enable row level security;

drop policy if exists workspace_writing_profiles_select_self on tongs.workspace_writing_profiles;
create policy workspace_writing_profiles_select_self
on tongs.workspace_writing_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  and tongs.has_workspace_role(workspace_id, 'viewer')
);

create or replace function tongs.get_my_writing_profile(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  user_id uuid,
  default_audience text,
  default_structure text,
  style_notes text,
  last_used_tone_preset text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
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

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  return query
  select
    p.workspace_id,
    p.user_id,
    p.default_audience,
    p.default_structure,
    p.style_notes,
    p.last_used_tone_preset,
    p.updated_at
  from tongs.workspace_writing_profiles p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
end;
$$;

create or replace function tongs.set_my_writing_profile(
  p_workspace_id uuid,
  p_default_audience text default null,
  p_default_structure text default null,
  p_style_notes text default null
)
returns table (
  workspace_id uuid,
  user_id uuid,
  default_audience text,
  default_structure text,
  style_notes text,
  last_used_tone_preset text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_default_audience text := nullif(btrim(coalesce(p_default_audience, '')), '');
  v_default_structure text := nullif(btrim(coalesce(p_default_structure, '')), '');
  v_style_notes text := nullif(btrim(coalesce(p_style_notes, '')), '');
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

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  insert into tongs.workspace_writing_profiles (
    workspace_id,
    user_id,
    default_audience,
    default_structure,
    style_notes,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_user,
    v_default_audience,
    v_default_structure,
    v_style_notes,
    now(),
    now()
  )
  on conflict on constraint workspace_writing_profiles_pkey do update
    set default_audience = excluded.default_audience,
        default_structure = excluded.default_structure,
        style_notes = excluded.style_notes,
        updated_at = now();

  return query
  select
    p.workspace_id,
    p.user_id,
    p.default_audience,
    p.default_structure,
    p.style_notes,
    p.last_used_tone_preset,
    p.updated_at
  from tongs.workspace_writing_profiles p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
end;
$$;

create or replace function tongs.reset_my_writing_profile(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  user_id uuid,
  default_audience text,
  default_structure text,
  style_notes text,
  last_used_tone_preset text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
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

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  insert into tongs.workspace_writing_profiles (
    workspace_id,
    user_id,
    default_audience,
    default_structure,
    style_notes,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_user,
    null,
    null,
    null,
    now(),
    now()
  )
  on conflict on constraint workspace_writing_profiles_pkey do update
    set default_audience = null,
        default_structure = null,
        style_notes = null,
        updated_at = now();

  return query
  select
    p.workspace_id,
    p.user_id,
    p.default_audience,
    p.default_structure,
    p.style_notes,
    p.last_used_tone_preset,
    p.updated_at
  from tongs.workspace_writing_profiles p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
end;
$$;

create or replace function tongs.set_my_writing_tone_preset(
  p_workspace_id uuid,
  p_tone_preset text
)
returns table (
  workspace_id uuid,
  user_id uuid,
  default_audience text,
  default_structure text,
  style_notes text,
  last_used_tone_preset text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_tone_preset text := lower(nullif(btrim(coalesce(p_tone_preset, '')), ''));
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

  if v_tone_preset is null then
    raise exception 'tone_preset is required'
      using errcode = '22023';
  end if;

  if v_tone_preset not in ('neutral_conversational', 'newsroom_neutral', 'spicy_but_safe') then
    raise exception 'Unsupported tone preset: %', v_tone_preset
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  insert into tongs.workspace_writing_profiles (
    workspace_id,
    user_id,
    last_used_tone_preset,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_user,
    v_tone_preset,
    now(),
    now()
  )
  on conflict on constraint workspace_writing_profiles_pkey do update
    set last_used_tone_preset = excluded.last_used_tone_preset,
        updated_at = now();

  return query
  select
    p.workspace_id,
    p.user_id,
    p.default_audience,
    p.default_structure,
    p.style_notes,
    p.last_used_tone_preset,
    p.updated_at
  from tongs.workspace_writing_profiles p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
end;
$$;

revoke all on table tongs.workspace_writing_profiles from public;
grant select on table tongs.workspace_writing_profiles to authenticated;
grant all on table tongs.workspace_writing_profiles to service_role;

revoke all on function tongs.get_my_writing_profile(uuid) from public;
revoke all on function tongs.set_my_writing_profile(uuid, text, text, text) from public;
revoke all on function tongs.reset_my_writing_profile(uuid) from public;
revoke all on function tongs.set_my_writing_tone_preset(uuid, text) from public;

grant execute on function tongs.get_my_writing_profile(uuid) to authenticated;
grant execute on function tongs.set_my_writing_profile(uuid, text, text, text) to authenticated;
grant execute on function tongs.reset_my_writing_profile(uuid) to authenticated;
grant execute on function tongs.set_my_writing_tone_preset(uuid, text) to authenticated;

grant execute on function tongs.get_my_writing_profile(uuid) to service_role;
grant execute on function tongs.set_my_writing_profile(uuid, text, text, text) to service_role;
grant execute on function tongs.reset_my_writing_profile(uuid) to service_role;
grant execute on function tongs.set_my_writing_tone_preset(uuid, text) to service_role;

commit;
