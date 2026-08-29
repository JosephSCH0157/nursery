-- Hearth Producer Gate + Creator Learning Loop primitives.
-- Adds:
-- - tongs.hearth_creator_profiles
-- - tongs.hearth_interaction_events
-- - tongs.get_or_create_creator_profile()
-- - tongs.record_hearth_event(...)
-- - tongs.update_creator_profile_from_event(...)

begin;

create table if not exists tongs.hearth_creator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  clarify_first_bias real not null default 0.5 check (clarify_first_bias >= 0 and clarify_first_bias <= 1),
  outline_first_bias real not null default 0.5 check (outline_first_bias >= 0 and outline_first_bias <= 1),
  script_first_bias real not null default 0.5 check (script_first_bias >= 0 and script_first_bias <= 1),
  tone_style text not null default 'neutral_conversational',
  risk_sensitivity real not null default 0.5 check (risk_sensitivity >= 0 and risk_sensitivity <= 1),
  confidence real not null default 0.0 check (confidence >= 0 and confidence <= 1),
  profile_json jsonb not null default '{}'::jsonb
);

create table if not exists tongs.hearth_interaction_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid null references tongs.workspaces(id) on delete set null,
  episode_id uuid null references tongs.episodes(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists hearth_interaction_events_user_created_idx
  on tongs.hearth_interaction_events (user_id, created_at desc);

create index if not exists hearth_interaction_events_type_created_idx
  on tongs.hearth_interaction_events (event_type, created_at desc);

drop trigger if exists trg_hearth_creator_profiles_updated_at on tongs.hearth_creator_profiles;
create trigger trg_hearth_creator_profiles_updated_at
before update on tongs.hearth_creator_profiles
for each row execute function tongs.set_updated_at();

alter table tongs.hearth_creator_profiles enable row level security;
alter table tongs.hearth_interaction_events enable row level security;

drop policy if exists hearth_creator_profiles_select_self on tongs.hearth_creator_profiles;
create policy hearth_creator_profiles_select_self
on tongs.hearth_creator_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists hearth_creator_profiles_insert_self on tongs.hearth_creator_profiles;
create policy hearth_creator_profiles_insert_self
on tongs.hearth_creator_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists hearth_creator_profiles_update_self on tongs.hearth_creator_profiles;
create policy hearth_creator_profiles_update_self
on tongs.hearth_creator_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists hearth_interaction_events_select_self on tongs.hearth_interaction_events;
create policy hearth_interaction_events_select_self
on tongs.hearth_interaction_events
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists hearth_interaction_events_insert_self on tongs.hearth_interaction_events;
create policy hearth_interaction_events_insert_self
on tongs.hearth_interaction_events
for insert
to authenticated
with check (user_id = auth.uid());

create or replace function tongs.get_or_create_creator_profile()
returns table (
  user_id uuid,
  updated_at timestamptz,
  clarify_first_bias real,
  outline_first_bias real,
  script_first_bias real,
  tone_style text,
  risk_sensitivity real,
  confidence real,
  profile_json jsonb
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

  insert into tongs.hearth_creator_profiles (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  return query
  select
    p.user_id,
    p.updated_at,
    p.clarify_first_bias,
    p.outline_first_bias,
    p.script_first_bias,
    p.tone_style,
    p.risk_sensitivity,
    p.confidence,
    p.profile_json
  from tongs.hearth_creator_profiles p
  where p.user_id = v_user;
end;
$$;

create or replace function tongs.update_creator_profile_from_event(
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns table (
  user_id uuid,
  clarify_first_bias real,
  outline_first_bias real,
  script_first_bias real,
  tone_style text,
  risk_sensitivity real,
  confidence real
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_event text;
  v_payload jsonb;
  v_delta_clarify real := 0.0;
  v_delta_outline real := 0.0;
  v_delta_script real := 0.0;
  v_delta_conf real := 0.02;
  v_tone_style text;
  v_risk real;
  v_from_gate_text text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  v_event := lower(trim(coalesce(p_event_type, '')));
  v_payload := coalesce(p_payload, '{}'::jsonb);

  insert into tongs.hearth_creator_profiles (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  if v_event = 'user_requested_outline' then
    v_delta_outline := v_delta_outline + 0.05;
    v_delta_script := v_delta_script - 0.03;
  elsif v_event = 'user_requested_script' then
    v_delta_outline := v_delta_outline - 0.03;
    v_delta_script := v_delta_script + 0.05;
  elsif v_event = 'user_explicit_draft_now' then
    v_delta_clarify := v_delta_clarify - 0.05;
  elsif v_event = 'proposal_discarded' then
    v_delta_clarify := v_delta_clarify + 0.02;
  elsif v_event = 'outline_generated' then
    v_delta_outline := v_delta_outline + 0.02;
  elsif v_event = 'draft_generated' then
    v_delta_script := v_delta_script + 0.02;
  elsif v_event = 'proposal_applied' then
    v_from_gate_text := lower(trim(coalesce(v_payload->>'from_gate', '')));
    if v_from_gate_text in ('1', 'true', 't', 'yes', 'y') then
      v_delta_clarify := v_delta_clarify + 0.03;
    end if;
  end if;

  select p.tone_style, p.risk_sensitivity
  into v_tone_style, v_risk
  from tongs.hearth_creator_profiles p
  where p.user_id = v_user;

  if jsonb_typeof(v_payload->'tone_style') = 'string' then
    v_tone_style := nullif(trim(v_payload->>'tone_style'), '');
  end if;
  if v_tone_style is null then
    v_tone_style := 'neutral_conversational';
  end if;

  if jsonb_typeof(v_payload->'risk_sensitivity') = 'number' then
    v_risk := least(1.0, greatest(0.0, (v_payload->>'risk_sensitivity')::real));
  elsif v_risk is null then
    v_risk := 0.5;
  end if;

  update tongs.hearth_creator_profiles p
  set
    clarify_first_bias = least(1.0, greatest(0.0, (p.clarify_first_bias * 0.98) + v_delta_clarify)),
    outline_first_bias = least(1.0, greatest(0.0, (p.outline_first_bias * 0.98) + v_delta_outline)),
    script_first_bias = least(1.0, greatest(0.0, (p.script_first_bias * 0.98) + v_delta_script)),
    tone_style = v_tone_style,
    risk_sensitivity = v_risk,
    confidence = least(1.0, greatest(0.0, p.confidence + v_delta_conf)),
    profile_json = coalesce(p.profile_json, '{}'::jsonb) || jsonb_build_object(
      'last_event', v_event,
      'last_event_at', now()
    ),
    updated_at = now()
  where p.user_id = v_user;

  return query
  select
    p.user_id,
    p.clarify_first_bias,
    p.outline_first_bias,
    p.script_first_bias,
    p.tone_style,
    p.risk_sensitivity,
    p.confidence
  from tongs.hearth_creator_profiles p
  where p.user_id = v_user;
end;
$$;

create or replace function tongs.record_hearth_event(
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_episode_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_event text;
  v_payload jsonb;
  v_workspace_id uuid;
  v_id uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  v_event := lower(trim(coalesce(p_event_type, '')));
  if v_event = '' then
    raise exception 'p_event_type required'
      using errcode = '22023';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb);

  if p_episode_id is not null then
    select e.workspace_id
    into v_workspace_id
    from tongs.episodes e
    where e.id = p_episode_id;
  end if;

  insert into tongs.hearth_interaction_events (
    user_id,
    workspace_id,
    episode_id,
    event_type,
    payload
  )
  values (
    v_user,
    v_workspace_id,
    p_episode_id,
    v_event,
    v_payload
  )
  returning id into v_id;

  if v_event in (
    'user_requested_outline',
    'user_requested_script',
    'user_explicit_draft_now',
    'proposal_discarded',
    'proposal_applied',
    'outline_generated',
    'draft_generated'
  ) then
    perform tongs.update_creator_profile_from_event(v_event, v_payload);
  end if;

  return v_id;
end;
$$;

revoke all on tongs.hearth_creator_profiles from public;
revoke all on tongs.hearth_interaction_events from public;

grant select, insert, update on tongs.hearth_creator_profiles to authenticated;
grant select, insert on tongs.hearth_interaction_events to authenticated;
grant all on tongs.hearth_creator_profiles to service_role;
grant all on tongs.hearth_interaction_events to service_role;

revoke all on function tongs.get_or_create_creator_profile() from public;
revoke all on function tongs.record_hearth_event(text, jsonb, uuid) from public;
revoke all on function tongs.update_creator_profile_from_event(text, jsonb) from public;

grant execute on function tongs.get_or_create_creator_profile() to authenticated;
grant execute on function tongs.record_hearth_event(text, jsonb, uuid) to authenticated;
grant execute on function tongs.update_creator_profile_from_event(text, jsonb) to authenticated;
grant execute on function tongs.get_or_create_creator_profile() to service_role;
grant execute on function tongs.record_hearth_event(text, jsonb, uuid) to service_role;
grant execute on function tongs.update_creator_profile_from_event(text, jsonb) to service_role;

commit;
