begin;

create or replace function tongs.get_my_ai_spend_rollup(
  p_days integer default 1
)
returns table (
  day date,
  feature text,
  subfeature text,
  lane text,
  call_count bigint,
  deduped_action_count bigint,
  total_actual_cost_usd numeric,
  total_billable_tokens bigint
)
language sql
security definer
set search_path = tongs, public
as $$
  with params as (
    select
      greatest(coalesce(p_days, 1), 1) as days_window,
      auth.uid() as user_id
  ),
  base as (
    select
      e.id,
      e.created_at,
      e.feature,
      e.subfeature,
      e.lane,
      e.actual_cost_usd,
      e.billable_tokens,
      coalesce(nullif(btrim(e.action_id), ''), e.id::text) as action_rollup_key
    from tongs.ai_usage_events e
    cross join params p
    where e.user_id = p.user_id
      and e.created_at >= (
        date_trunc('day', now())
        - make_interval(days => (p.days_window - 1))
      )
  ),
  call_agg as (
    select
      date_trunc('day', b.created_at)::date as day,
      b.feature,
      b.subfeature,
      b.lane,
      count(*)::bigint as call_count
    from base b
    group by
      date_trunc('day', b.created_at)::date,
      b.feature,
      b.subfeature,
      b.lane
  ),
  dedup as (
    select
      b.*,
      row_number() over (
        partition by b.action_rollup_key
        order by b.created_at desc, b.id desc
      ) as rn
    from base b
  ),
  dedup_agg as (
    select
      date_trunc('day', d.created_at)::date as day,
      d.feature,
      d.subfeature,
      d.lane,
      count(*)::bigint as deduped_action_count,
      coalesce(sum(d.actual_cost_usd), 0)::numeric as total_actual_cost_usd,
      coalesce(sum(d.billable_tokens), 0)::bigint as total_billable_tokens
    from dedup d
    where d.rn = 1
    group by
      date_trunc('day', d.created_at)::date,
      d.feature,
      d.subfeature,
      d.lane
  )
  select
    c.day,
    c.feature,
    c.subfeature,
    c.lane,
    c.call_count,
    coalesce(d.deduped_action_count, 0)::bigint as deduped_action_count,
    coalesce(d.total_actual_cost_usd, 0)::numeric as total_actual_cost_usd,
    coalesce(d.total_billable_tokens, 0)::bigint as total_billable_tokens
  from call_agg c
  left join dedup_agg d
    on d.day = c.day
    and d.feature is not distinct from c.feature
    and d.subfeature is not distinct from c.subfeature
    and d.lane is not distinct from c.lane
  order by c.day desc, total_actual_cost_usd desc, c.call_count desc;
$$;

create or replace function tongs.get_my_ai_top_actions(
  p_days integer default 7,
  p_limit integer default 10
)
returns table (
  action_key text,
  feature text,
  subfeature text,
  lane text,
  call_count bigint,
  total_actual_cost_usd numeric,
  total_billable_tokens bigint,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = tongs, public
as $$
  with params as (
    select
      greatest(coalesce(p_days, 1), 1) as days_window,
      greatest(coalesce(p_limit, 10), 1) as row_limit,
      auth.uid() as user_id
  ),
  base as (
    select
      e.id,
      e.created_at,
      e.feature,
      e.subfeature,
      e.lane,
      e.actual_cost_usd,
      e.billable_tokens,
      coalesce(nullif(btrim(e.action_id), ''), e.id::text) as action_rollup_key
    from tongs.ai_usage_events e
    cross join params p
    where e.user_id = p.user_id
      and e.created_at >= (
        date_trunc('day', now())
        - make_interval(days => (p.days_window - 1))
      )
  ),
  action_calls as (
    select
      b.action_rollup_key,
      count(*)::bigint as call_count,
      max(b.created_at) as last_seen_at
    from base b
    group by b.action_rollup_key
  ),
  dedup as (
    select
      b.*,
      row_number() over (
        partition by b.action_rollup_key
        order by b.created_at desc, b.id desc
      ) as rn
    from base b
  )
  select
    d.action_rollup_key as action_key,
    d.feature,
    d.subfeature,
    d.lane,
    c.call_count,
    coalesce(d.actual_cost_usd, 0)::numeric as total_actual_cost_usd,
    coalesce(d.billable_tokens, 0)::bigint as total_billable_tokens,
    c.last_seen_at
  from dedup d
  join action_calls c
    on c.action_rollup_key = d.action_rollup_key
  cross join params p
  where d.rn = 1
  order by total_actual_cost_usd desc, c.call_count desc, c.last_seen_at desc
  limit p.row_limit;
$$;

revoke all on function tongs.get_my_ai_spend_rollup(integer) from public;
revoke all on function tongs.get_my_ai_top_actions(integer, integer) from public;

grant execute on function tongs.get_my_ai_spend_rollup(integer) to authenticated;
grant execute on function tongs.get_my_ai_spend_rollup(integer) to service_role;
grant execute on function tongs.get_my_ai_top_actions(integer, integer) to authenticated;
grant execute on function tongs.get_my_ai_top_actions(integer, integer) to service_role;

commit;
