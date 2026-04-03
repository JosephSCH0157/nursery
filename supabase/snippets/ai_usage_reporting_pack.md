# AI Usage Reporting Pack (Checkpoint D)

These queries are read-only operator snippets for `tongs.ai_usage_events`.
All queries default to a 30-day window; change the `where created_at >= ...` clause as needed.

## Query index

- `ai_usage_by_lane.sql`
  - Daily usage by `effective_billing_lane` with success/error/deny/missing-key counts.
- `ai_usage_by_provider.sql`
  - Daily usage by provider and lane.
- `ai_policy_decision_counts.sql`
  - Daily policy decision and reason-code counts.
- `ai_missing_key_events.sql`
  - Detailed `missing_required_key` events with decision context.
- `ai_kill_switch_impact.sql`
  - Daily impact split for kill-switch-active vs inactive requests.
- `ai_byo_vs_forge_totals.sql`
  - Aggregate BYO vs Forge requests/tokens/cost totals.
- `ai_top_workspaces_by_lane_usage.sql`
  - Top workspaces by lane usage.
- `ai_top_users_by_lane_usage.sql`
  - Top users by lane usage.

## Safety notes

- Do not extend snapshots to include raw API keys, encrypted key blobs, auth headers, or tokens.
- Keep policy snapshots decision-oriented (policy and runtime context only).
- Use these reports with row-level access controls appropriate to operator roles.
