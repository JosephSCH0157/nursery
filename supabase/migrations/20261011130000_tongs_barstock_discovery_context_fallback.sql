-- Preserve the latest successful Bar-Stock topic suggestions while revised
-- preferences await their first successful refresh.
begin;

create or replace function tongs.barstock_discovery_next_eligible_at(
  p_workspace_id uuid,
  p_user_id uuid
) returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, tongs
as $$
  with recent as (
    select first_provider_call_at
    from tongs.barstock_discovery_runs
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and first_provider_call_at > now() - interval '24 hours'
  ),
  boundaries as (
    select
      case
        when count(*) filter (
          where first_provider_call_at > now() - interval '6 hours'
        ) >= 1
          then max(first_provider_call_at) filter (
            where first_provider_call_at > now() - interval '6 hours'
          ) + interval '6 hours'
        else null
      end as six_hour_boundary,
      case
        when count(*) >= 4
          then (
            select first_provider_call_at + interval '24 hours'
            from recent
            order by first_provider_call_at desc
            offset 3
            limit 1
          )
        else null
      end as twenty_four_hour_boundary
    from recent
  )
  select case
    when six_hour_boundary is null then twenty_four_hour_boundary
    when twenty_four_hour_boundary is null then six_hour_boundary
    else greatest(six_hour_boundary, twenty_four_hour_boundary)
  end
  from boundaries;
$$;

alter function tongs.barstock_discovery_next_eligible_at(uuid, uuid) owner to postgres;
revoke all on function tongs.barstock_discovery_next_eligible_at(uuid, uuid) from public, anon, authenticated;
grant execute on function tongs.barstock_discovery_next_eligible_at(uuid, uuid) to service_role;

create or replace function tongs.get_my_barstock_discovery_context(
  p_workspace_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, tongs
as $$
declare
  u uuid := auth.uid();
  p tongs.workspace_discovery_preferences%rowtype;
  r tongs.barstock_discovery_runs%rowtype;
  next_eligible timestamptz;
begin
  if u is null or not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    return jsonb_build_object('outcome', 'denied');
  end if;

  select * into p
  from tongs.workspace_discovery_preferences
  where workspace_id = p_workspace_id and user_id = u;

  if p.user_id is not null and p.enabled then
    select * into r
    from tongs.barstock_discovery_runs
    where workspace_id = p_workspace_id
      and user_id = u
      and status in ('ready', 'partial', 'empty')
    order by (preference_revision = p.revision) desc,
      generated_at desc nulls last
    limit 1;

    next_eligible := tongs.barstock_discovery_next_eligible_at(p_workspace_id, u);
  end if;

  return jsonb_build_object(
    'outcome', 'found',
    'preference', case when p.user_id is null then null else to_jsonb(p) end,
    'run', case when r.id is null then null else to_jsonb(r) end,
    'next_eligible_at', next_eligible,
    'stories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'ordinal', m.ordinal,
          'revision', to_jsonb(v),
          'story', to_jsonb(s),
          'sources', coalesce((
            select jsonb_agg(to_jsonb(src) order by src.ordinal)
            from tongs.barstock_discovery_sources src
            where src.story_revision_id = v.id
          ), '[]'::jsonb),
          'accepted', a.id is not null
        ) order by m.ordinal
      )
      from tongs.barstock_discovery_batch_members m
      join tongs.barstock_discovery_story_revisions v on v.id = m.story_revision_id
      join tongs.barstock_discovery_stories s on s.id = v.story_id
      left join tongs.barstock_discovery_acceptances a
        on a.workspace_id = p_workspace_id
        and a.user_id = u
        and a.story_id = s.id
      left join tongs.barstock_discovery_dismissals d
        on d.workspace_id = p_workspace_id
        and d.user_id = u
        and d.story_id = s.id
        and d.expires_at > now()
      where m.run_id = r.id and d.story_id is null
    ), '[]'::jsonb)
  );
end;
$$;

alter function tongs.get_my_barstock_discovery_context(uuid) owner to postgres;
revoke all on function tongs.get_my_barstock_discovery_context(uuid) from public, anon;
grant execute on function tongs.get_my_barstock_discovery_context(uuid) to authenticated, service_role;

create or replace function tongs.claim_barstock_discovery_refresh(
  p_workspace_id uuid,
  p_preference_revision bigint,
  p_trigger text,
  p_operation_key text,
  p_lease_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  u uuid := auth.uid();
  p tongs.workspace_discovery_preferences%rowtype;
  r tongs.barstock_discovery_runs%rowtype;
  c6 int;
  c24 int;
  next_eligible timestamptz;
begin
  if u is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'denied');
  end if;

  select * into p
  from tongs.workspace_discovery_preferences
  where workspace_id = p_workspace_id
    and user_id = u
    and revision = p_preference_revision;

  if p.user_id is null
    or not p.enabled
    or (p_trigger = 'automatic' and not p.auto_refresh_authorized) then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_workspace_id::text || ':' || u::text || ':topic-discovery', 0)
  );

  select * into r
  from tongs.barstock_discovery_runs
  where workspace_id = p_workspace_id
    and user_id = u
    and operation_key = p_operation_key
  for update;

  if r.id is not null then
    if r.preference_revision <> p_preference_revision then
      return jsonb_build_object('outcome', 'operation_identity_conflict', 'run_id', r.id);
    end if;
    if r.status in ('ready', 'partial', 'empty') then
      return jsonb_build_object('outcome', 'existing', 'run_id', r.id);
    end if;
    if r.lease_expires_at > now() then
      return jsonb_build_object('outcome', 'in_progress', 'run_id', r.id);
    end if;
    if r.attempt_count >= 2 then
      return jsonb_build_object('outcome', 'attempts_exhausted', 'run_id', r.id);
    end if;

    update tongs.barstock_discovery_runs
    set attempt_count = attempt_count + 1,
      status = 'leased',
      lease_token_hash = p_lease_token_hash,
      lease_expires_at = now() + interval '5 minutes',
      failure_reason = null,
      updated_at = now()
    where id = r.id
    returning * into r;

    return jsonb_build_object(
      'outcome', 'claimed',
      'run_id', r.id,
      'lease_expires_at', r.lease_expires_at,
      'recovered', true
    );
  end if;

  if exists(
    select 1
    from tongs.barstock_discovery_runs
    where workspace_id = p_workspace_id
      and user_id = u
      and status in ('leased', 'refreshing')
      and lease_expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'in_progress');
  end if;

  select
    count(*) filter (where first_provider_call_at > now() - interval '6 hours'),
    count(*) filter (where first_provider_call_at > now() - interval '24 hours')
  into c6, c24
  from tongs.barstock_discovery_runs
  where workspace_id = p_workspace_id and user_id = u;

  if c6 >= 1 or c24 >= 4 then
    next_eligible := tongs.barstock_discovery_next_eligible_at(p_workspace_id, u);
    return jsonb_build_object(
      'outcome', 'budget_blocked',
      'next_eligible_at', next_eligible
    );
  end if;

  insert into tongs.barstock_discovery_runs(
    workspace_id,
    user_id,
    preference_revision,
    preference_hash,
    operation_key,
    trigger_kind,
    status,
    lease_token_hash,
    lease_expires_at
  ) values (
    p_workspace_id,
    u,
    p.revision,
    encode(extensions.digest(convert_to(to_jsonb(p)::text, 'UTF8'), 'sha256'), 'hex'),
    p_operation_key,
    p_trigger,
    'leased',
    p_lease_token_hash,
    now() + interval '5 minutes'
  ) returning * into r;

  return jsonb_build_object(
    'outcome', 'claimed',
    'run_id', r.id,
    'lease_expires_at', r.lease_expires_at,
    'recovered', false
  );
end;
$$;

alter function tongs.claim_barstock_discovery_refresh(uuid, bigint, text, text, text) owner to postgres;
revoke all on function tongs.claim_barstock_discovery_refresh(uuid, bigint, text, text, text) from public, anon;
grant execute on function tongs.claim_barstock_discovery_refresh(uuid, bigint, text, text, text) to authenticated, service_role;

commit;
