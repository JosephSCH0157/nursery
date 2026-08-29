-- cspell:words subfeature btrim

begin;

create table if not exists tongs.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at_ms bigint not null default ((extract(epoch from now()) * 1000)::bigint),

  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid null references tongs.workspaces(id) on delete set null,
  workpiece_id uuid null references tongs.episodes(id) on delete set null,
  session_id uuid null references tongs.recording_sessions(id) on delete set null,

  action_id text null,
  feature text not null,
  subfeature text null,

  model text not null,
  reasoning_effort text null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,

  estimated_cost_usd numeric(12, 6) not null default 0,
  actual_cost_usd numeric(12, 6) not null default 0,
  billable_tokens integer not null default 0,

  trigger text not null,
  status text not null,
  provider_request_id text null,

  constraint ai_usage_events_feature_nonempty check (btrim(feature) <> ''),
  constraint ai_usage_events_model_nonempty check (btrim(model) <> ''),
  constraint ai_usage_events_trigger_check check (trigger in ('user', 'system')),
  constraint ai_usage_events_status_check check (status in ('success', 'error')),
  constraint ai_usage_events_input_tokens_nonnegative check (input_tokens >= 0),
  constraint ai_usage_events_output_tokens_nonnegative check (output_tokens >= 0),
  constraint ai_usage_events_total_tokens_nonnegative check (total_tokens >= 0),
  constraint ai_usage_events_billable_tokens_nonnegative check (billable_tokens >= 0),
  constraint ai_usage_events_estimated_cost_nonnegative check (estimated_cost_usd >= 0),
  constraint ai_usage_events_actual_cost_nonnegative check (actual_cost_usd >= 0)
);

create index if not exists ai_usage_events_created_idx
  on tongs.ai_usage_events (created_at desc);

create index if not exists ai_usage_events_feature_created_idx
  on tongs.ai_usage_events (feature, created_at desc);

create index if not exists ai_usage_events_user_created_idx
  on tongs.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_workspace_created_idx
  on tongs.ai_usage_events (workspace_id, created_at desc)
  where workspace_id is not null;

create index if not exists ai_usage_events_action_idx
  on tongs.ai_usage_events (action_id)
  where action_id is not null;

alter table tongs.ai_usage_events enable row level security;

drop policy if exists ai_usage_events_select_own on tongs.ai_usage_events;
create policy ai_usage_events_select_own
on tongs.ai_usage_events
for select
to authenticated
using (user_id = auth.uid());

revoke all on tongs.ai_usage_events from public;
grant select on tongs.ai_usage_events to authenticated;
grant all on tongs.ai_usage_events to service_role;

commit;
