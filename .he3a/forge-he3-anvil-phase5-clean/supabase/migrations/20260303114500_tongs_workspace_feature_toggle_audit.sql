-- Workspace feature toggle audit breadcrumbs.
-- Records one event per changed flag whenever set_adaptive_style_features runs.

begin;

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
  v_before tongs.workspaces%rowtype;
  v_alignment_enabled boolean := coalesce(p_alignment_enabled, false);
  v_ai_accelerate_enabled boolean := coalesce(p_ai_accelerate_enabled, false);
  v_event_timestamp timestamptz := now();
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

  select w.*
  into v_before
  from tongs.workspaces w
  where w.id = p_workspace_id
  for update;

  if not found then
    raise exception 'Workspace not found'
      using errcode = 'P0002';
  end if;

  update tongs.workspaces w
  set
    adaptive_style_alignment_enabled = v_alignment_enabled,
    adaptive_style_ai_accelerate_enabled = v_ai_accelerate_enabled
  where w.id = p_workspace_id;

  if to_regclass('tongs.hearth_interaction_events') is not null then
    if v_before.adaptive_style_alignment_enabled is distinct from v_alignment_enabled then
      insert into tongs.hearth_interaction_events (
        user_id,
        workspace_id,
        episode_id,
        event_type,
        payload
      )
      values (
        v_user,
        p_workspace_id,
        null,
        'workspace.feature.toggled',
        jsonb_build_object(
          'workspace_id', p_workspace_id,
          'flag_name', 'adaptive_style_alignment_enabled',
          'old', coalesce(v_before.adaptive_style_alignment_enabled, false),
          'new', v_alignment_enabled,
          'actor_user_id', v_user,
          'timestamp', v_event_timestamp
        )
      );
    end if;

    if v_before.adaptive_style_ai_accelerate_enabled is distinct from v_ai_accelerate_enabled then
      insert into tongs.hearth_interaction_events (
        user_id,
        workspace_id,
        episode_id,
        event_type,
        payload
      )
      values (
        v_user,
        p_workspace_id,
        null,
        'workspace.feature.toggled',
        jsonb_build_object(
          'workspace_id', p_workspace_id,
          'flag_name', 'adaptive_style_ai_accelerate_enabled',
          'old', coalesce(v_before.adaptive_style_ai_accelerate_enabled, false),
          'new', v_ai_accelerate_enabled,
          'actor_user_id', v_user,
          'timestamp', v_event_timestamp
        )
      );
    end if;
  end if;

  return query
  select
    p_workspace_id,
    v_alignment_enabled,
    v_ai_accelerate_enabled;
end;
$$;

commit;
