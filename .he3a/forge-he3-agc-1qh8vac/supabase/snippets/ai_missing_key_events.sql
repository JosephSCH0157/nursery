-- Missing-required-key event detail report
-- Default window: last 30 days. Adjust as needed.
select
  created_at,
  user_id,
  workspace_id,
  feature,
  subfeature,
  provider,
  policy_decision_type,
  policy_reason_code,
  effective_ai_key_source,
  key_resolution_status,
  effective_billing_lane,
  status,
  policy_snapshot ->> 'requested_lane' as requested_lane,
  policy_snapshot ->> 'effective_lane' as effective_lane,
  policy_snapshot ->> 'policy_byo_allowed' as policy_byo_allowed,
  policy_snapshot ->> 'policy_byo_required' as policy_byo_required,
  policy_snapshot ->> 'policy_fallback_allowed' as policy_fallback_allowed
from tongs.ai_usage_events
where created_at >= now() - interval '30 days'
  and key_resolution_status = 'missing_required_key'
order by created_at desc;
