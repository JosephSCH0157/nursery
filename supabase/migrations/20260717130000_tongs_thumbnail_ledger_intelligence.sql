-- Milestone 4: Ledger-backed thumbnail intelligence.
-- Experiments are publication history, not Episode Package authoring history.
begin;

create table tongs.thumbnail_launch_intervals (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, publication_id text not null,
  launch_identity text not null, launch_snapshot_hash text not null, platform text not null, state text not null,
  started_at timestamptz not null, ended_at timestamptz null, predecessor_interval_id uuid null references tongs.thumbnail_launch_intervals(id),
  attribution_json jsonb not null, content_hash text not null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint thumbnail_launch_intervals_state_check check (state in ('active','replaced','retired','restored')),
  constraint thumbnail_launch_intervals_time_check check (ended_at is null or ended_at > started_at),
  constraint thumbnail_launch_intervals_hash_check check (content_hash ~ '^[a-f0-9]{64}$' and launch_snapshot_hash ~ '^[a-f0-9]{64}$'),
  constraint thumbnail_launch_intervals_json_check check (jsonb_typeof(attribution_json) = 'object'),
  unique (workspace_id, publication_id, launch_identity, started_at)
);
create unique index thumbnail_launch_intervals_one_open_uidx on tongs.thumbnail_launch_intervals(workspace_id, publication_id) where ended_at is null;
create index thumbnail_launch_intervals_publication_idx on tongs.thumbnail_launch_intervals(workspace_id, publication_id, started_at desc);

create table tongs.thumbnail_performance_observations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  publication_id text not null, provider text not null, provider_schema_version text not null, provider_observation_id text not null,
  supersedes_observation_id uuid null references tongs.thumbnail_performance_observations(id), source_payload_hash text not null,
  observed_from timestamptz not null, observed_to timestamptz not null, collected_at timestamptz not null, timezone text not null,
  traffic_source text null, audience_segment text null, metrics_json jsonb not null, raw_observation jsonb not null,
  content_hash text not null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint thumbnail_performance_time_check check (observed_to > observed_from),
  constraint thumbnail_performance_hash_check check (content_hash ~ '^[a-f0-9]{64}$' and source_payload_hash ~ '^[a-f0-9]{64}$'),
  constraint thumbnail_performance_json_check check (jsonb_typeof(metrics_json) = 'object' and jsonb_typeof(raw_observation) = 'object'),
  unique (workspace_id, provider, provider_observation_id)
);
create index thumbnail_performance_publication_idx on tongs.thumbnail_performance_observations(workspace_id, publication_id, observed_to desc);

create table tongs.thumbnail_ledger_analyses (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  analysis_identity text not null, analysis_type text not null, launch_identities text[] not null default '{}', observation_ids uuid[] not null default '{}',
  analysis_version text not null, evidence_class text not null, confidence text not null, analysis_json jsonb not null,
  content_hash text not null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint thumbnail_ledger_analysis_type_check check (analysis_type in ('comparable_window','creative_projection','historical_observation','expectation_integrity','experiment_result')),
  constraint thumbnail_ledger_evidence_check check (evidence_class in ('measured_fact','historical_observation','heuristic_guidance','unknown_limitation')),
  constraint thumbnail_ledger_confidence_check check (confidence in ('insufficient','low','moderate','high')),
  constraint thumbnail_ledger_analysis_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint thumbnail_ledger_analysis_json_check check (jsonb_typeof(analysis_json) = 'object'),
  unique (workspace_id, analysis_identity, content_hash)
);
create index thumbnail_ledger_analyses_workspace_idx on tongs.thumbnail_ledger_analyses(workspace_id, created_at desc);

create table tongs.thumbnail_launch_experiments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  publication_id text not null, experiment_identity text not null, revision integer not null,
  launch_snapshot_hashes text[] not null, hypothesis text not null, primary_metric text not null, guardrail_metrics text[] not null,
  window_kind text not null, stopping_conditions text[] not null, state text not null, experiment_json jsonb not null,
  content_hash text not null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint thumbnail_experiment_snapshots_check check (cardinality(launch_snapshot_hashes) >= 2),
  constraint thumbnail_experiment_state_check check (state in ('draft','active','completed','aborted')),
  constraint thumbnail_experiment_window_check check (window_kind in ('first_24h','first_72h','first_7d','equal_impressions','traffic_source')),
  constraint thumbnail_experiment_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  unique(workspace_id, experiment_identity, revision)
);
create index thumbnail_launch_experiments_publication_idx on tongs.thumbnail_launch_experiments(workspace_id, publication_id, created_at desc);

create table tongs.thumbnail_ledger_ingestion_cursors (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  provider text not null, publication_id text not null, cursor_identity text not null, cursor_json jsonb not null,
  status text not null, last_success_at timestamptz null, last_error text null, recorded_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  constraint thumbnail_cursor_status_check check (status in ('current','stale','disconnected','error')),
  unique(workspace_id, provider, publication_id, cursor_identity, recorded_at)
);

create or replace function tongs.reject_thumbnail_ledger_mutation() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if current_setting('tongs.thumbnail_ledger_controlled_update', true) = 'on' then return new; end if;
  raise exception 'Thumbnail Ledger history is append-only; append a correction or revision.' using errcode = '55000';
end; $$;

do $$ declare t text; begin foreach t in array array['thumbnail_launch_intervals','thumbnail_performance_observations','thumbnail_ledger_analyses','thumbnail_launch_experiments','thumbnail_ledger_ingestion_cursors'] loop
  execute format('create trigger trg_%I_immutable before update or delete on tongs.%I for each row execute function tongs.reject_thumbnail_ledger_mutation()', t, t);
  execute format('alter table tongs.%I enable row level security', t);
  execute format('create policy %I on tongs.%I for select to authenticated using (tongs.has_workspace_role(workspace_id, ''viewer''))', t || '_select', t);
  execute format('create policy %I on tongs.%I for insert to authenticated with check (tongs.has_workspace_role(workspace_id, ''editor'') and created_by = auth.uid())', t || '_insert', t);
  execute format('grant select, insert on tongs.%I to authenticated', t);
  execute format('grant all on tongs.%I to service_role', t);
end loop; end $$;

create or replace function tongs.append_thumbnail_launch_interval(p_workspace_id uuid, p_workpiece_id uuid, p_publication_id text,
  p_launch_identity text, p_launch_snapshot_hash text, p_platform text, p_state text, p_started_at timestamptz,
  p_attribution_json jsonb, p_content_hash text) returns table(interval_id uuid, disposition text)
language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_existing uuid; v_prior uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  perform tongs.assert_workspace_role(p_workspace_id,'editor');
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'workpiece does not belong to workspace' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||btrim(p_publication_id),0));
  select id into v_existing from tongs.thumbnail_launch_intervals where workspace_id=p_workspace_id and publication_id=btrim(p_publication_id) and launch_identity=btrim(p_launch_identity) and started_at=p_started_at;
  if v_existing is not null then return query select v_existing,'existing'::text; return; end if;
  select id into v_prior from tongs.thumbnail_launch_intervals where workspace_id=p_workspace_id and publication_id=btrim(p_publication_id) and ended_at is null for update;
  if v_prior is not null then perform set_config('tongs.thumbnail_ledger_controlled_update','on',true); update tongs.thumbnail_launch_intervals set ended_at=p_started_at,state='replaced' where id=v_prior; perform set_config('tongs.thumbnail_ledger_controlled_update','off',true); end if;
  insert into tongs.thumbnail_launch_intervals(workspace_id,workpiece_id,publication_id,launch_identity,launch_snapshot_hash,platform,state,started_at,predecessor_interval_id,attribution_json,content_hash,created_by)
  values(p_workspace_id,p_workpiece_id,btrim(p_publication_id),btrim(p_launch_identity),p_launch_snapshot_hash,btrim(p_platform),p_state,p_started_at,v_prior,p_attribution_json,p_content_hash,v_user) returning id into v_existing;
  return query select v_existing,'created'::text;
end $$;

create or replace function tongs.ingest_thumbnail_performance_observation(p_workspace_id uuid,p_publication_id text,p_provider text,
  p_provider_schema_version text,p_provider_observation_id text,p_supersedes_observation_id uuid,p_source_payload_hash text,
  p_observed_from timestamptz,p_observed_to timestamptz,p_collected_at timestamptz,p_timezone text,p_traffic_source text,
  p_audience_segment text,p_metrics_json jsonb,p_raw_observation jsonb,p_content_hash text) returns table(observation_id uuid,disposition text)
language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  select id into v_id from tongs.thumbnail_performance_observations where workspace_id=p_workspace_id and provider=p_provider and provider_observation_id=p_provider_observation_id;
  if v_id is not null then return query select v_id,'existing'::text; return; end if;
  insert into tongs.thumbnail_performance_observations(workspace_id,publication_id,provider,provider_schema_version,provider_observation_id,supersedes_observation_id,source_payload_hash,observed_from,observed_to,collected_at,timezone,traffic_source,audience_segment,metrics_json,raw_observation,content_hash,created_by)
  values(p_workspace_id,p_publication_id,p_provider,p_provider_schema_version,p_provider_observation_id,p_supersedes_observation_id,p_source_payload_hash,p_observed_from,p_observed_to,p_collected_at,p_timezone,p_traffic_source,p_audience_segment,p_metrics_json,p_raw_observation,p_content_hash,v_user) returning id into v_id;
  return query select v_id,'created'::text;
end $$;

create or replace function tongs.append_thumbnail_ledger_analysis(p_workspace_id uuid,p_analysis_identity text,p_analysis_type text,
  p_launch_identities text[],p_observation_ids uuid[],p_analysis_version text,p_evidence_class text,p_confidence text,p_analysis_json jsonb,p_content_hash text)
returns table(analysis_id uuid,disposition text) language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  select id into v_id from tongs.thumbnail_ledger_analyses where workspace_id=p_workspace_id and analysis_identity=p_analysis_identity and content_hash=p_content_hash;
  if v_id is not null then return query select v_id,'existing'::text; return; end if;
  insert into tongs.thumbnail_ledger_analyses(workspace_id,analysis_identity,analysis_type,launch_identities,observation_ids,analysis_version,evidence_class,confidence,analysis_json,content_hash,created_by)
  values(p_workspace_id,p_analysis_identity,p_analysis_type,coalesce(p_launch_identities,'{}'),coalesce(p_observation_ids,'{}'),p_analysis_version,p_evidence_class,p_confidence,p_analysis_json,p_content_hash,v_user) returning id into v_id;
  return query select v_id,'created'::text; end $$;

create or replace function tongs.append_thumbnail_launch_experiment(p_workspace_id uuid,p_publication_id text,p_experiment_identity text,
  p_launch_snapshot_hashes text[],p_hypothesis text,p_primary_metric text,p_guardrail_metrics text[],p_window_kind text,p_stopping_conditions text[],p_state text,p_experiment_json jsonb,p_content_hash text)
returns table(experiment_id uuid,revision integer) language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid(); v_revision int; v_id uuid;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_experiment_identity,0));
  select coalesce(max(revision),0)+1 into v_revision from tongs.thumbnail_launch_experiments where workspace_id=p_workspace_id and experiment_identity=p_experiment_identity;
  insert into tongs.thumbnail_launch_experiments(workspace_id,publication_id,experiment_identity,revision,launch_snapshot_hashes,hypothesis,primary_metric,guardrail_metrics,window_kind,stopping_conditions,state,experiment_json,content_hash,created_by)
  values(p_workspace_id,p_publication_id,p_experiment_identity,v_revision,p_launch_snapshot_hashes,p_hypothesis,p_primary_metric,p_guardrail_metrics,p_window_kind,p_stopping_conditions,p_state,p_experiment_json,p_content_hash,v_user) returning id into v_id;
  return query select v_id,v_revision; end $$;

create or replace function tongs.list_thumbnail_ledger_intelligence(p_workspace_id uuid,p_limit int default 100)
returns table(launch_intervals jsonb,performance_observations jsonb,analyses jsonb,experiments jsonb,freshness jsonb)
language plpgsql security definer set search_path=tongs,public as $$ begin perform tongs.assert_workspace_role(p_workspace_id,'viewer'); return query select
  coalesce((select jsonb_agg(to_jsonb(x) order by started_at desc) from (select * from tongs.thumbnail_launch_intervals where workspace_id=p_workspace_id order by started_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(x) order by collected_at desc) from (select * from tongs.thumbnail_performance_observations where workspace_id=p_workspace_id order by collected_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select * from tongs.thumbnail_ledger_analyses where workspace_id=p_workspace_id order by created_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from (select * from tongs.thumbnail_launch_experiments where workspace_id=p_workspace_id order by created_at desc limit least(greatest(p_limit,1),500))x),'[]'::jsonb),
  coalesce((select to_jsonb(x) from (select max(last_success_at) last_collected_at,case when bool_or(status='disconnected') then 'disconnected' when max(last_success_at)<now()-interval '48 hours' then 'stale' else 'current' end state from tongs.thumbnail_ledger_ingestion_cursors where workspace_id=p_workspace_id)x),'{"last_collected_at":null,"state":"unavailable"}'::jsonb); end $$;

revoke all on function tongs.append_thumbnail_launch_interval(uuid,uuid,text,text,text,text,text,timestamptz,jsonb,text) from public;
revoke all on function tongs.ingest_thumbnail_performance_observation(uuid,text,text,text,text,uuid,text,timestamptz,timestamptz,timestamptz,text,text,text,jsonb,jsonb,text) from public;
revoke all on function tongs.append_thumbnail_ledger_analysis(uuid,text,text,text[],uuid[],text,text,text,jsonb,text) from public;
revoke all on function tongs.append_thumbnail_launch_experiment(uuid,text,text,text[],text,text,text[],text,text[],text,jsonb,text) from public;
revoke all on function tongs.list_thumbnail_ledger_intelligence(uuid,int) from public;
grant execute on function tongs.append_thumbnail_launch_interval(uuid,uuid,text,text,text,text,text,timestamptz,jsonb,text),tongs.ingest_thumbnail_performance_observation(uuid,text,text,text,text,uuid,text,timestamptz,timestamptz,timestamptz,text,text,text,jsonb,jsonb,text),tongs.append_thumbnail_ledger_analysis(uuid,text,text,text[],uuid[],text,text,text,jsonb,text),tongs.append_thumbnail_launch_experiment(uuid,text,text,text[],text,text,text[],text,text[],text,jsonb,text),tongs.list_thumbnail_ledger_intelligence(uuid,int) to authenticated,service_role;
commit;
