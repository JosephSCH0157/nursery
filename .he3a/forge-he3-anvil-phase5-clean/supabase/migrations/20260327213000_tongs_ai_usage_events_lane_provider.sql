begin;

alter table if exists tongs.ai_usage_events
  add column if not exists lane text;

alter table if exists tongs.ai_usage_events
  add column if not exists provider text;

alter table if exists tongs.ai_usage_events
  add column if not exists correlation_id text;

update tongs.ai_usage_events
set lane = 'forge'
where lane is null;

alter table if exists tongs.ai_usage_events
  alter column lane set default 'forge';

alter table if exists tongs.ai_usage_events
  alter column lane set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_usage_events_lane_check'
      and conrelid = 'tongs.ai_usage_events'::regclass
  ) then
    alter table tongs.ai_usage_events
      add constraint ai_usage_events_lane_check
      check (lane in ('forge', 'byo'));
  end if;
end $$;

create index if not exists ai_usage_events_lane_created_idx
  on tongs.ai_usage_events (lane, created_at desc);

create index if not exists ai_usage_events_correlation_idx
  on tongs.ai_usage_events (correlation_id)
  where correlation_id is not null;

commit;
