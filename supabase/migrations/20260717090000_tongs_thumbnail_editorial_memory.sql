-- Milestone 2: workspace-scoped thumbnail editorial memory.
-- Launch facts and interpretations are append-only. Editing an interpretation appends a revision.

begin;

create table if not exists tongs.thumbnail_launch_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  launch_identity text not null,
  launch_snapshot_hash text not null,
  published_at timestamptz null,
  destination text null,
  fact_json jsonb not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  constraint thumbnail_launch_facts_identity_check check (length(btrim(launch_identity)) > 0),
  constraint thumbnail_launch_facts_hash_check check (launch_snapshot_hash ~ '^[a-f0-9]{64}$'),
  constraint thumbnail_launch_facts_json_check check (jsonb_typeof(fact_json) = 'object')
);

create unique index if not exists thumbnail_launch_facts_workspace_identity_uidx
  on tongs.thumbnail_launch_facts (workspace_id, launch_identity);
create index if not exists thumbnail_launch_facts_workspace_recorded_idx
  on tongs.thumbnail_launch_facts (workspace_id, recorded_at desc);
create index if not exists thumbnail_launch_facts_workpiece_idx
  on tongs.thumbnail_launch_facts (workpiece_id, recorded_at desc);

create table if not exists tongs.thumbnail_memory_interpretations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  interpretation_key text not null,
  revision integer not null,
  supersedes_id uuid null references tongs.thumbnail_memory_interpretations(id),
  observation_type text not null,
  evidence_launch_identities text[] not null default '{}',
  interpretation_json jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  constraint thumbnail_memory_interpretations_key_check check (length(btrim(interpretation_key)) > 0),
  constraint thumbnail_memory_interpretations_revision_check check (revision > 0),
  constraint thumbnail_memory_interpretations_type_check check (observation_type in ('fatigue', 'repetition', 'style_cluster', 'editorial_note')),
  constraint thumbnail_memory_interpretations_json_check check (jsonb_typeof(interpretation_json) = 'object')
);

create unique index if not exists thumbnail_memory_interpretations_workspace_key_revision_uidx
  on tongs.thumbnail_memory_interpretations (workspace_id, interpretation_key, revision);
create index if not exists thumbnail_memory_interpretations_workspace_created_idx
  on tongs.thumbnail_memory_interpretations (workspace_id, created_at desc);

create or replace function tongs.reject_thumbnail_memory_mutation()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Thumbnail editorial memory is append-only; append a new revision instead.' using errcode = '55000';
end;
$$;

drop trigger if exists trg_thumbnail_launch_facts_immutable on tongs.thumbnail_launch_facts;
create trigger trg_thumbnail_launch_facts_immutable before update or delete on tongs.thumbnail_launch_facts
for each row execute function tongs.reject_thumbnail_memory_mutation();
drop trigger if exists trg_thumbnail_memory_interpretations_immutable on tongs.thumbnail_memory_interpretations;
create trigger trg_thumbnail_memory_interpretations_immutable before update or delete on tongs.thumbnail_memory_interpretations
for each row execute function tongs.reject_thumbnail_memory_mutation();

alter table tongs.thumbnail_launch_facts enable row level security;
alter table tongs.thumbnail_memory_interpretations enable row level security;

drop policy if exists thumbnail_launch_facts_select_if_workspace_viewer on tongs.thumbnail_launch_facts;
drop policy if exists thumbnail_launch_facts_insert_if_workspace_editor on tongs.thumbnail_launch_facts;
drop policy if exists thumbnail_memory_interpretations_select_if_workspace_viewer on tongs.thumbnail_memory_interpretations;
drop policy if exists thumbnail_memory_interpretations_insert_if_workspace_editor on tongs.thumbnail_memory_interpretations;

create policy thumbnail_launch_facts_select_if_workspace_viewer on tongs.thumbnail_launch_facts
for select to authenticated using (tongs.has_workspace_role(workspace_id, 'viewer'));
create policy thumbnail_launch_facts_insert_if_workspace_editor on tongs.thumbnail_launch_facts
for insert to authenticated with check (tongs.has_workspace_role(workspace_id, 'editor') and recorded_by = auth.uid());
create policy thumbnail_memory_interpretations_select_if_workspace_viewer on tongs.thumbnail_memory_interpretations
for select to authenticated using (tongs.has_workspace_role(workspace_id, 'viewer'));
create policy thumbnail_memory_interpretations_insert_if_workspace_editor on tongs.thumbnail_memory_interpretations
for insert to authenticated with check (tongs.has_workspace_role(workspace_id, 'editor') and created_by = auth.uid());

create or replace function tongs.append_thumbnail_launch_fact(
  p_workspace_id uuid, p_workpiece_id uuid, p_launch_identity text,
  p_launch_snapshot_hash text, p_published_at timestamptz, p_destination text, p_fact_json jsonb
) returns table (fact_id uuid, disposition text)
language plpgsql security definer set search_path = tongs, public as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform tongs.assert_workspace_role(p_workspace_id, 'editor');
  if not exists (select 1 from tongs.episodes e where e.id = p_workpiece_id and e.workspace_id = p_workspace_id) then
    raise exception 'workpiece does not belong to workspace' using errcode = '22023';
  end if;
  select f.id into v_id from tongs.thumbnail_launch_facts f
    where f.workspace_id = p_workspace_id and f.launch_identity = btrim(p_launch_identity);
  if v_id is not null then return query select v_id, 'existing'::text; return; end if;
  insert into tongs.thumbnail_launch_facts
    (workspace_id, workpiece_id, launch_identity, launch_snapshot_hash, published_at, destination, fact_json, recorded_by)
  values (p_workspace_id, p_workpiece_id, btrim(p_launch_identity), p_launch_snapshot_hash,
    p_published_at, nullif(btrim(coalesce(p_destination, '')), ''), jsonb_strip_nulls(p_fact_json), v_user)
  returning id into v_id;
  return query select v_id, 'created'::text;
end;
$$;

create or replace function tongs.append_thumbnail_memory_interpretation(
  p_workspace_id uuid, p_interpretation_key text, p_observation_type text,
  p_evidence_launch_identities text[], p_interpretation_json jsonb
) returns table (interpretation_id uuid, revision integer)
language plpgsql security definer set search_path = tongs, public as $$
declare v_user uuid := auth.uid(); v_prior_id uuid; v_revision integer; v_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform tongs.assert_workspace_role(p_workspace_id, 'editor');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || btrim(p_interpretation_key), 0));
  select i.id, i.revision into v_prior_id, v_revision from tongs.thumbnail_memory_interpretations i
    where i.workspace_id = p_workspace_id and i.interpretation_key = btrim(p_interpretation_key)
    order by i.revision desc limit 1;
  v_revision := coalesce(v_revision, 0) + 1;
  insert into tongs.thumbnail_memory_interpretations
    (workspace_id, interpretation_key, revision, supersedes_id, observation_type,
      evidence_launch_identities, interpretation_json, created_by)
  values (p_workspace_id, btrim(p_interpretation_key), v_revision, v_prior_id, p_observation_type,
    coalesce(p_evidence_launch_identities, '{}'), jsonb_strip_nulls(p_interpretation_json), v_user)
  returning id into v_id;
  return query select v_id, v_revision;
end;
$$;

create or replace function tongs.list_thumbnail_memory_projection(p_workspace_id uuid, p_limit integer default 100)
returns table (launch_facts jsonb, active_interpretations jsonb)
language plpgsql security definer set search_path = tongs, public as $$
begin
  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');
  return query
  select
    coalesce((select jsonb_agg(to_jsonb(f) order by f.recorded_at desc) from
      (select id, workpiece_id, launch_identity, launch_snapshot_hash, published_at, destination, fact_json, recorded_at
       from tongs.thumbnail_launch_facts where workspace_id = p_workspace_id
       order by recorded_at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) f), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from
      (select distinct on (interpretation_key) id, interpretation_key, revision, supersedes_id,
        observation_type, evidence_launch_identities, interpretation_json, created_at
       from tongs.thumbnail_memory_interpretations where workspace_id = p_workspace_id
       order by interpretation_key, revision desc) i), '[]'::jsonb);
end;
$$;

revoke all on table tongs.thumbnail_launch_facts, tongs.thumbnail_memory_interpretations from public;
grant select, insert on table tongs.thumbnail_launch_facts, tongs.thumbnail_memory_interpretations to authenticated;
grant all on table tongs.thumbnail_launch_facts, tongs.thumbnail_memory_interpretations to service_role;
revoke all on function tongs.append_thumbnail_launch_fact(uuid, uuid, text, text, timestamptz, text, jsonb) from public;
revoke all on function tongs.append_thumbnail_memory_interpretation(uuid, text, text, text[], jsonb) from public;
revoke all on function tongs.list_thumbnail_memory_projection(uuid, integer) from public;
grant execute on function tongs.append_thumbnail_launch_fact(uuid, uuid, text, text, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function tongs.append_thumbnail_memory_interpretation(uuid, text, text, text[], jsonb) to authenticated, service_role;
grant execute on function tongs.list_thumbnail_memory_projection(uuid, integer) to authenticated, service_role;

commit;
