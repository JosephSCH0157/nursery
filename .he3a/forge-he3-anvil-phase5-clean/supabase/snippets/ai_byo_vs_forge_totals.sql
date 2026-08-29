-- BYO vs Forge totals (requests, tokens, cost)
-- Default window: last 30 days. Adjust as needed.
select
  effective_billing_lane,
  count(*) as request_count,
  count(*) filter (where status = 'success') as success_count,
  count(*) filter (where status = 'error') as error_count,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(total_tokens) as total_tokens,
  sum(billable_tokens) as billable_tokens,
  sum(estimated_cost_usd) as estimated_cost_usd,
  sum(actual_cost_usd) as actual_cost_usd
from tongs.ai_usage_events
where created_at >= now() - interval '30 days'
group by effective_billing_lane
order by effective_billing_lane;
