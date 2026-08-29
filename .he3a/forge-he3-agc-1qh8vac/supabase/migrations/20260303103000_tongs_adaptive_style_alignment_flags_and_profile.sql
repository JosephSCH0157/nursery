-- Adaptive Style Alignment v1:
-- - Workspace-level feature flags
-- - Canonical per-user/per-workspace structural style profile
-- - Guarded RPCs for feature reads/writes and profile lifecycle

begin;

alter table if exists tongs.workspaces
  add column if not exists adaptive_style_alignment_enabled boolean not null default false,
  add column if not exists adaptive_style_ai_accelerate_enabled boolean not null default false;

create table if not exists tongs.user_style_profile (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avg_sentence_length double precision not null default 0,
  sentence_length_variance double precision not null default 0,
  pause_per_1000_words double precision not null default 0,
  reflective_pause_ratio double precision not null default 0,
  avg_s1_block_length double precision not null default 0,
  avg_s2_block_length double precision not null default 0,
  structural_intent_vector jsonb not null default '{}'::jsonb,
  adaptation_weight double precision not null default 0.15
    check (adaptation_weight >= 0 and adaptation_weight <= 1),
  scripts_analyzed_count integer not null default 0
    check (scripts_analyzed_count >= 0),
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists user_style_profile_workspace_last_updated_idx
  on tongs.user_style_profile (workspace_id, last_updated desc);

create index if not exists user_style_profile_user_last_updated_idx
  on tongs.user_style_profile (user_id, last_updated desc);

alter table tongs.user_style_profile enable row level security;

drop policy if exists user_style_profile_select_self on tongs.user_style_profile;
create policy user_style_profile_select_self
on tongs.user_style_profile
for select
to authenticated
using (
  user_id = auth.uid()
  and tongs.has_workspace_role(workspace_id, 'viewer')
);

create or replace function tongs.get_my_workspace_features(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  adaptive_style_alignment_enabled boolean,
  adaptive_style_ai_accelerate_enabled boolean
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
    w.id,
    w.adaptive_style_alignment_enabled,
    w.adaptive_style_ai_accelerate_enabled
  from tongs.workspaces w
  where w.id = p_workspace_id;
end;
$$;

create or replace function tongs.set_adaptive_style_features(
  p_workspace_id uuid,
  p_alignment_enabled boolean,
  p_ai_accelerate_enabled boolean
)
returns table (
  workspace_id uuid,
  adaptive_style_alignment_enabled boolean,
  adaptive_style_ai_accelerate_enabled boolean
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

  perform tongs.assert_workspace_role(p_workspace_id, 'admin');

  return query
  update tongs.workspaces w
  set
    adaptive_style_alignment_enabled = coalesce(p_alignment_enabled, false),
    adaptive_style_ai_accelerate_enabled = coalesce(p_ai_accelerate_enabled, false)
  where w.id = p_workspace_id
  returning
    w.id,
    w.adaptive_style_alignment_enabled,
    w.adaptive_style_ai_accelerate_enabled;

  if not found then
    raise exception 'Workspace not found'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function tongs.blend_structural_intent_vector(
  p_existing jsonb,
  p_incoming jsonb,
  p_weight double precision
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_existing jsonb := case
    when jsonb_typeof(coalesce(p_existing, '{}'::jsonb)) = 'object' then coalesce(p_existing, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_incoming jsonb := case
    when jsonb_typeof(coalesce(p_incoming, '{}'::jsonb)) = 'object' then coalesce(p_incoming, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_weight double precision := least(1.0, greatest(0.01, coalesce(p_weight, 0.15)));
  v_key text;
  v_result jsonb := '{}'::jsonb;
  v_has_existing boolean;
  v_has_incoming boolean;
  v_existing_num double precision;
  v_incoming_num double precision;
begin
  for v_key in
    select keys.key
    from (
      select jsonb_object_keys(v_existing) as key
      union
      select jsonb_object_keys(v_incoming) as key
    ) keys
  loop
    v_has_existing := jsonb_typeof(v_existing -> v_key) = 'number';
    v_has_incoming := jsonb_typeof(v_incoming -> v_key) = 'number';

    if v_has_existing and v_has_incoming then
      v_existing_num := (v_existing ->> v_key)::double precision;
      v_incoming_num := (v_incoming ->> v_key)::double precision;
      v_result := v_result || jsonb_build_object(
        v_key,
        (v_existing_num * (1.0 - v_weight)) + (v_incoming_num * v_weight)
      );
    elsif v_has_incoming then
      v_incoming_num := (v_incoming ->> v_key)::double precision;
      v_result := v_result || jsonb_build_object(v_key, v_incoming_num);
    elsif v_has_existing then
      v_existing_num := (v_existing ->> v_key)::double precision;
      v_result := v_result || jsonb_build_object(v_key, v_existing_num);
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function tongs.upsert_style_profile_metrics(
  p_workspace_id uuid,
  p_avg_sentence_length double precision,
  p_sentence_length_variance double precision,
  p_pause_per_1000_words double precision,
  p_reflective_pause_ratio double precision,
  p_avg_s1_block_length double precision,
  p_avg_s2_block_length double precision,
  p_structural_intent_vector jsonb default '{}'::jsonb,
  p_adaptation_weight double precision default 0.15
)
returns table (
  workspace_id uuid,
  user_id uuid,
  avg_sentence_length double precision,
  sentence_length_variance double precision,
  pause_per_1000_words double precision,
  reflective_pause_ratio double precision,
  avg_s1_block_length double precision,
  avg_s2_block_length double precision,
  structural_intent_vector jsonb,
  adaptation_weight double precision,
  scripts_analyzed_count integer,
  last_updated timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_flags tongs.workspaces%rowtype;
  v_existing tongs.user_style_profile%rowtype;
  v_weight double precision := least(1.0, greatest(0.01, coalesce(p_adaptation_weight, 0.15)));
  v_avg_sentence_length double precision := greatest(0, coalesce(p_avg_sentence_length, 0));
  v_sentence_length_variance double precision := greatest(0, coalesce(p_sentence_length_variance, 0));
  v_pause_per_1000_words double precision := greatest(0, coalesce(p_pause_per_1000_words, 0));
  v_reflective_pause_ratio double precision := least(1.0, greatest(0, coalesce(p_reflective_pause_ratio, 0)));
  v_avg_s1_block_length double precision := greatest(0, coalesce(p_avg_s1_block_length, 0));
  v_avg_s2_block_length double precision := greatest(0, coalesce(p_avg_s2_block_length, 0));
  v_structural_intent_vector jsonb := case
    when jsonb_typeof(coalesce(p_structural_intent_vector, '{}'::jsonb)) = 'object'
      then coalesce(p_structural_intent_vector, '{}'::jsonb)
    else '{}'::jsonb
  end;
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

  select w.*
  into v_flags
  from tongs.workspaces w
  where w.id = p_workspace_id;

  if not found then
    raise exception 'Workspace not found'
      using errcode = 'P0002';
  end if;

  if coalesce(v_flags.adaptive_style_alignment_enabled, false) is false then
    raise exception 'Adaptive style alignment is disabled for this workspace'
      using errcode = '42501';
  end if;

  select p.*
  into v_existing
  from tongs.user_style_profile p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user
  for update;

  if not found then
    insert into tongs.user_style_profile (
      workspace_id,
      user_id,
      avg_sentence_length,
      sentence_length_variance,
      pause_per_1000_words,
      reflective_pause_ratio,
      avg_s1_block_length,
      avg_s2_block_length,
      structural_intent_vector,
      adaptation_weight,
      scripts_analyzed_count,
      created_at,
      last_updated
    )
    values (
      p_workspace_id,
      v_user,
      v_avg_sentence_length,
      v_sentence_length_variance,
      v_pause_per_1000_words,
      v_reflective_pause_ratio,
      v_avg_s1_block_length,
      v_avg_s2_block_length,
      v_structural_intent_vector,
      v_weight,
      1,
      now(),
      now()
    );
  else
    update tongs.user_style_profile p
    set
      avg_sentence_length = (v_existing.avg_sentence_length * (1.0 - v_weight))
        + (v_avg_sentence_length * v_weight),
      sentence_length_variance = (v_existing.sentence_length_variance * (1.0 - v_weight))
        + (v_sentence_length_variance * v_weight),
      pause_per_1000_words = (v_existing.pause_per_1000_words * (1.0 - v_weight))
        + (v_pause_per_1000_words * v_weight),
      reflective_pause_ratio = (v_existing.reflective_pause_ratio * (1.0 - v_weight))
        + (v_reflective_pause_ratio * v_weight),
      avg_s1_block_length = (v_existing.avg_s1_block_length * (1.0 - v_weight))
        + (v_avg_s1_block_length * v_weight),
      avg_s2_block_length = (v_existing.avg_s2_block_length * (1.0 - v_weight))
        + (v_avg_s2_block_length * v_weight),
      structural_intent_vector = tongs.blend_structural_intent_vector(
        v_existing.structural_intent_vector,
        v_structural_intent_vector,
        v_weight
      ),
      adaptation_weight = v_weight,
      scripts_analyzed_count = v_existing.scripts_analyzed_count + 1,
      last_updated = now()
    where p.workspace_id = p_workspace_id
      and p.user_id = v_user;
  end if;

  return query
  select
    p.workspace_id,
    p.user_id,
    p.avg_sentence_length,
    p.sentence_length_variance,
    p.pause_per_1000_words,
    p.reflective_pause_ratio,
    p.avg_s1_block_length,
    p.avg_s2_block_length,
    p.structural_intent_vector,
    p.adaptation_weight,
    p.scripts_analyzed_count,
    p.last_updated
  from tongs.user_style_profile p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
end;
$$;

create or replace function tongs.get_my_style_profile(
  p_workspace_id uuid
)
returns table (
  workspace_id uuid,
  user_id uuid,
  avg_sentence_length double precision,
  sentence_length_variance double precision,
  pause_per_1000_words double precision,
  reflective_pause_ratio double precision,
  avg_s1_block_length double precision,
  avg_s2_block_length double precision,
  structural_intent_vector jsonb,
  adaptation_weight double precision,
  scripts_analyzed_count integer,
  last_updated timestamptz
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
    p.avg_sentence_length,
    p.sentence_length_variance,
    p.pause_per_1000_words,
    p.reflective_pause_ratio,
    p.avg_s1_block_length,
    p.avg_s2_block_length,
    p.structural_intent_vector,
    p.adaptation_weight,
    p.scripts_analyzed_count,
    p.last_updated
  from tongs.user_style_profile p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
end;
$$;

create or replace function tongs.reset_my_style_profile(
  p_workspace_id uuid
)
returns table (
  reset boolean,
  workspace_id uuid,
  user_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_deleted_count integer := 0;
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

  delete from tongs.user_style_profile p
  where p.workspace_id = p_workspace_id
    and p.user_id = v_user;
  get diagnostics v_deleted_count = row_count;

  return query
  select (v_deleted_count > 0), p_workspace_id, v_user;
end;
$$;

revoke all on table tongs.user_style_profile from public;
grant select on table tongs.user_style_profile to authenticated;
grant all on table tongs.user_style_profile to service_role;

revoke all on function tongs.get_my_workspace_features(uuid) from public;
revoke all on function tongs.set_adaptive_style_features(uuid, boolean, boolean) from public;
revoke all on function tongs.blend_structural_intent_vector(jsonb, jsonb, double precision) from public;
revoke all on function tongs.upsert_style_profile_metrics(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  jsonb,
  double precision
) from public;
revoke all on function tongs.get_my_style_profile(uuid) from public;
revoke all on function tongs.reset_my_style_profile(uuid) from public;

grant execute on function tongs.get_my_workspace_features(uuid) to authenticated;
grant execute on function tongs.set_adaptive_style_features(uuid, boolean, boolean) to authenticated;
grant execute on function tongs.upsert_style_profile_metrics(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  jsonb,
  double precision
) to authenticated;
grant execute on function tongs.get_my_style_profile(uuid) to authenticated;
grant execute on function tongs.reset_my_style_profile(uuid) to authenticated;

grant execute on function tongs.get_my_workspace_features(uuid) to service_role;
grant execute on function tongs.set_adaptive_style_features(uuid, boolean, boolean) to service_role;
grant execute on function tongs.blend_structural_intent_vector(jsonb, jsonb, double precision) to service_role;
grant execute on function tongs.upsert_style_profile_metrics(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  jsonb,
  double precision
) to service_role;
grant execute on function tongs.get_my_style_profile(uuid) to service_role;
grant execute on function tongs.reset_my_style_profile(uuid) to service_role;

commit;
