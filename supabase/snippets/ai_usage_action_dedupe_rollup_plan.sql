-- AI usage analytics dedupe plan (non-migration snippet)
-- Goal:
-- 1) Preserve raw ai_usage_events rows as immutable truth.
-- 2) Deduplicate by action_id in rollup views to prevent double-counted cost/tokens.
--
-- Notes:
-- - This is a plan snippet, not an applied migration.
-- - Use action_id when present; fall back to row id when action_id is null/blank.
-- - Dedupe key is scoped by user_id to avoid accidental cross-user collisions.

-- Candidate helper view: one representative row per action bucket.
-- If lane/provider/correlation_id columns are not present in your schema, remove them.
create or replace view tongs.v_ai_usage_events_action_dedup as
with ranked as (
  select
    e.*,
    coalesce(nullif(btrim(e.action_id), ''), e.id::text) as action_rollup_key,
    row_number() over (
      partition by e.user_id, coalesce(nullif(btrim(e.action_id), ''), e.id::text)
      order by e.created_at desc, e.id desc
    ) as rn
  from tongs.ai_usage_events e
)
select
  id,
  created_at,
  occurred_at_ms,
  user_id,
  workspace_id,
  workpiece_id,
  session_id,
  action_id,
  action_rollup_key,
  lane,
  provider,
  feature,
  subfeature,
  model,
  reasoning_effort,
  input_tokens,
  output_tokens,
  total_tokens,
  estimated_cost_usd,
  actual_cost_usd,
  billable_tokens,
  trigger,
  status,
  provider_request_id,
  correlation_id
from ranked
where rn = 1;

-- Candidate summary view: daily cost/token rollups using deduped action rows.
create or replace view tongs.v_ai_usage_daily_rollup_dedup as
select
  date_trunc('day', created_at) as day,
  user_id,
  workspace_id,
  lane,
  feature,
  subfeature,
  model,
  count(*) as dedup_action_count,
  sum(total_tokens) as total_tokens,
  sum(billable_tokens) as billable_tokens,
  sum(actual_cost_usd) as actual_cost_usd
from tongs.v_ai_usage_events_action_dedup
group by
  date_trunc('day', created_at),
  user_id,
  workspace_id,
  lane,
  feature,
  subfeature,
  model;

-- Optional extension:
-- Add a second view for raw-row rollups and display both raw vs dedup totals in dashboards.
-- This keeps telemetry visibility while preventing inflated economic rollups.
