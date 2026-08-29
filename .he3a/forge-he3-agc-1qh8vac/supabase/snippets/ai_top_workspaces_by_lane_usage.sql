-- Top workspaces by lane usage
-- Default window: last 30 days. Adjust as needed.
select
  workspace_id,
  effective_billing_lane,
  count(*) as request_count,
  sum(total_tokens) as total_tokens,
  sum(actual_cost_usd) as actual_cost_usd
from tongs.ai_usage_events
where created_at >= now() - interval '30 days'
  and workspace_id is not null
group by
  workspace_id,
  effective_billing_lane
order by
  request_count desc,
  total_tokens desc
limit 100;
