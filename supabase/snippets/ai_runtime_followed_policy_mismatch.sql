-- Runtime-vs-policy mismatch detector (integrity/drift tripwire)
-- Default window: last 30 days. Adjust as needed.
--
-- Returns one row per mismatch reason so operators can triage quickly.
with base as (
  select
    id,
    created_at,
    to_timestamp(occurred_at_ms / 1000.0) as occurred_at,
    user_id,
    workspace_id,
    provider,
    policy_decision_type,
    policy_reason_code,
    effective_ai_key_source,
    effective_billing_lane,
    key_resolution_status,
    status,
    total_tokens,
    billable_tokens,
    actual_cost_usd,
    provider_request_id,
    lower(coalesce(policy_snapshot ->> 'policy_effective_key_source', '')) as policy_effective_key_source,
    lower(coalesce(policy_snapshot ->> 'kill_switch_user_keys_disabled', 'false')) in ('true', 't', '1', 'yes', 'on') as kill_switch_active,
    lower(coalesce(policy_snapshot ->> 'byo_required', 'false')) in ('true', 't', '1', 'yes', 'on') as byo_required
  from tongs.ai_usage_events
  where created_at >= now() - interval '30 days'
)
select
  id as event_id,
  occurred_at,
  user_id,
  workspace_id,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  effective_billing_lane,
  key_resolution_status,
  'policy_expected_forge_but_runtime_used_user_byo' as mismatch_reason
from base
where policy_effective_key_source = 'forge_managed'
  and effective_ai_key_source = 'user_byo'

union all

select
  id as event_id,
  occurred_at,
  user_id,
  workspace_id,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  effective_billing_lane,
  key_resolution_status,
  'policy_required_byo_but_runtime_used_forge_managed' as mismatch_reason
from base
where byo_required
  and effective_ai_key_source = 'forge_managed'

union all

select
  id as event_id,
  occurred_at,
  user_id,
  workspace_id,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  effective_billing_lane,
  key_resolution_status,
  'billing_lane_mismatch_for_effective_key_source' as mismatch_reason
from base
where (
  effective_ai_key_source = 'forge_managed' and effective_billing_lane <> 'forge'
) or (
  effective_ai_key_source = 'user_byo' and effective_billing_lane <> 'byo'
)

union all

select
  id as event_id,
  occurred_at,
  user_id,
  workspace_id,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  effective_billing_lane,
  key_resolution_status,
  'policy_denied_with_execution_like_attribution' as mismatch_reason
from base
where policy_decision_type in ('SOFT_DENY', 'HARD_DENY')
  and (
    status = 'success'
    or total_tokens > 0
    or billable_tokens > 0
    or actual_cost_usd > 0
    or provider_request_id is not null
  )

union all

select
  id as event_id,
  occurred_at,
  user_id,
  workspace_id,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  effective_billing_lane,
  key_resolution_status,
  'missing_required_key_with_execution_like_attribution' as mismatch_reason
from base
where key_resolution_status = 'missing_required_key'
  and (
    status = 'success'
    or total_tokens > 0
    or billable_tokens > 0
    or actual_cost_usd > 0
    or provider_request_id is not null
  )

union all

select
  id as event_id,
  occurred_at,
  user_id,
  workspace_id,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  effective_billing_lane,
  key_resolution_status,
  'kill_switch_active_but_byo_execution_attribution_present' as mismatch_reason
from base
where kill_switch_active
  and (
    effective_billing_lane = 'byo'
    or effective_ai_key_source = 'user_byo'
  )

order by occurred_at desc;
