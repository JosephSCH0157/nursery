begin;

alter table if exists tongs.ai_usage_events
  add column if not exists key_source text;

alter table if exists tongs.ai_usage_events
  add column if not exists effective_ai_key_source text;

alter table if exists tongs.ai_usage_events
  add column if not exists key_resolution_status text;

alter table if exists tongs.ai_usage_events
  add column if not exists effective_billing_lane text;

alter table if exists tongs.ai_usage_events
  add column if not exists policy_decision_type text;

alter table if exists tongs.ai_usage_events
  add column if not exists policy_reason_code text;

alter table if exists tongs.ai_usage_events
  add column if not exists policy_snapshot jsonb;

update tongs.ai_usage_events
set key_source = case when lane = 'byo' then 'byo' else 'forge' end
where key_source is null;

update tongs.ai_usage_events
set effective_ai_key_source = case
  when lane = 'byo' then 'user_byo'
  else 'forge_managed'
end
where effective_ai_key_source is null;

update tongs.ai_usage_events
set key_resolution_status = 'available'
where key_resolution_status is null;

update tongs.ai_usage_events
set effective_billing_lane = lane
where effective_billing_lane is null;

update tongs.ai_usage_events
set policy_decision_type = case
  when status = 'success' then 'ALLOW'
  else null
end
where policy_decision_type is null;

update tongs.ai_usage_events
set policy_snapshot = '{}'::jsonb
where policy_snapshot is null;

alter table if exists tongs.ai_usage_events
  alter column key_source set default 'forge';

alter table if exists tongs.ai_usage_events
  alter column key_source set not null;

alter table if exists tongs.ai_usage_events
  alter column policy_snapshot set default '{}'::jsonb;

alter table if exists tongs.ai_usage_events
  alter column policy_snapshot set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_key_source_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_key_source_check
      check (key_source in ('forge', 'byo', 'org_shared'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_effective_ai_key_source_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_effective_ai_key_source_check
      check (
        effective_ai_key_source is null
        or effective_ai_key_source in ('forge_managed', 'user_byo', 'org_shared')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_key_resolution_status_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_key_resolution_status_check
      check (
        key_resolution_status is null
        or key_resolution_status in ('available', 'missing_required_key', 'provider_not_supported', 'policy_denied')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_effective_billing_lane_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_effective_billing_lane_check
      check (
        effective_billing_lane is null
        or effective_billing_lane in ('forge', 'byo')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_policy_decision_type_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_policy_decision_type_check
      check (
        policy_decision_type is null
        or policy_decision_type in ('ALLOW', 'SOFT_DENY', 'HARD_DENY')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_policy_snapshot_object_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_policy_snapshot_object_check
      check (jsonb_typeof(policy_snapshot) = 'object');
  end if;
end $$;

create index if not exists ai_usage_events_provider_lane_decision_idx
  on tongs.ai_usage_events (provider, effective_billing_lane, policy_decision_type, created_at desc);

create index if not exists ai_usage_events_key_source_created_idx
  on tongs.ai_usage_events (key_source, created_at desc);

commit;
