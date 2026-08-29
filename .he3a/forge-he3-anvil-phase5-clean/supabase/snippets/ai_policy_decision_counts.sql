-- AI policy decision counts with reason-code breakdown
-- Default window: last 30 days. Adjust as needed.
select
  date_trunc('day', created_at) as day,
  coalesce(policy_decision_type, 'UNSET') as policy_decision_type,
  coalesce(policy_reason_code, 'UNSET') as policy_reason_code,
  count(*) as request_count
from tongs.ai_usage_events
where created_at >= now() - interval '30 days'
group by
  date_trunc('day', created_at),
  coalesce(policy_decision_type, 'UNSET'),
  coalesce(policy_reason_code, 'UNSET')
order by
  day desc,
  policy_decision_type,
  policy_reason_code;
