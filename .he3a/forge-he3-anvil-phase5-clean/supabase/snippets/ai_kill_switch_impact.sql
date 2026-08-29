-- Requests affected by user-key kill switch
-- Default window: last 30 days. Adjust as needed.
-- Detects the runtime snapshot flag:
-- policy_snapshot.kill_switch_user_keys_disabled
with events as (
  select
    created_at,
    user_id,
    workspace_id,
    provider,
    feature,
    subfeature,
    status,
    policy_decision_type,
    policy_reason_code,
    key_source,
    effective_ai_key_source,
    key_resolution_status,
    effective_billing_lane,
    case
      when lower(coalesce(policy_snapshot ->> 'kill_switch_user_keys_disabled', 'false'))
        in ('true', 't', '1', 'yes', 'on')
      then true
      else false
    end as kill_switch_active
  from tongs.ai_usage_events
  where created_at >= now() - interval '30 days'
)
select
  date_trunc('day', created_at) as day,
  kill_switch_active,
  count(*) as request_count,
  count(*) filter (where effective_billing_lane = 'forge') as forge_lane_count,
  count(*) filter (where effective_billing_lane = 'byo') as byo_lane_count,
  count(*) filter (where key_resolution_status = 'missing_required_key') as missing_required_key_count,
  count(*) filter (where policy_decision_type in ('SOFT_DENY', 'HARD_DENY')) as denied_count
from events
group by
  date_trunc('day', created_at),
  kill_switch_active
order by
  day desc,
  kill_switch_active desc;
