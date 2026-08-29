-- AI usage by provider and lane (operator report)
-- Default window: last 30 days. Adjust as needed.
select
  date_trunc('day', created_at) as day,
  coalesce(provider, 'unknown') as provider,
  effective_billing_lane,
  count(*) as request_count,
  count(*) filter (where status = 'success') as success_count,
  count(*) filter (where status = 'error') as error_count,
  count(*) filter (where policy_decision_type in ('SOFT_DENY', 'HARD_DENY')) as denied_count,
  sum(total_tokens) as total_tokens,
  sum(actual_cost_usd) as actual_cost_usd
from tongs.ai_usage_events
where created_at >= now() - interval '30 days'
group by
  date_trunc('day', created_at),
  coalesce(provider, 'unknown'),
  effective_billing_lane
order by
  day desc,
  provider,
  effective_billing_lane;
