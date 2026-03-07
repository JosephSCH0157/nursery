-- Fix 42702 ambiguity in hearth creator profile RPCs.
-- Root cause: RETURNS TABLE exposes user_id as a plpgsql variable; ON CONFLICT (user_id)
-- can resolve ambiguously between the OUT variable and table column.

begin;

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
  on conflict on constraint hearth_creator_profiles_pkey do nothing;

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
  on conflict on constraint hearth_creator_profiles_pkey do nothing;

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

commit;
