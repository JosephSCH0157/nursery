begin;

alter table if exists tongs.ai_usage_events
  add column if not exists policy_enforced boolean;

update tongs.ai_usage_events
set policy_enforced = true
where policy_enforced is null;

alter table if exists tongs.ai_usage_events
  alter column policy_enforced set default true;

alter table if exists tongs.ai_usage_events
  alter column policy_enforced set not null;

create index if not exists ai_usage_events_policy_enforced_created_idx
  on tongs.ai_usage_events (policy_enforced, created_at desc);

commit;
