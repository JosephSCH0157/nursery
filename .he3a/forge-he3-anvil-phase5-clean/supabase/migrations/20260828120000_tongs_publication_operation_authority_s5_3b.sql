-- S5-3B: durable publication operation, attempts, and receipts.
-- Provider HTTP execution remains deliberately absent.
begin;

create table tongs.publication_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key uuid not null unique,
  authority_fingerprint text not null check(authority_fingerprint ~ '^[a-f0-9]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  manifest_snapshot_id uuid not null,
  manifest_content_hash text not null check(manifest_content_hash ~ '^[a-f0-9]{64}$'),
  release_decision_id uuid not null,
  release_decision_scope_id uuid not null references tongs.quench_destination_scopes(id),
  release_decision_revision integer not null check(release_decision_revision > 0),
  release_decision_content_hash text not null check(release_decision_content_hash ~ '^[a-f0-9]{64}$'),
  executable_destination_id uuid not null references tongs.publishing_executable_destinations(id),
  destination_capability_revision_id uuid not null,
  destination_capability_revision integer not null check(destination_capability_revision > 0),
  destination_capability_content_hash text not null check(destination_capability_content_hash ~ '^[a-f0-9]{64}$'),
  publication_intent_contract_version text not null,
  publication_intent_snapshot jsonb not null check(jsonb_typeof(publication_intent_snapshot) = 'object'),
  publication_intent_content_hash text not null check(publication_intent_content_hash ~ '^[a-f0-9]{64}$'),
  established_by uuid not null references auth.users(id),
  established_at timestamptz not null default now(),
  unique(id, workspace_id, workpiece_id),
  foreign key(workpiece_id, workspace_id) references tongs.episodes(id, workspace_id),
  foreign key(manifest_snapshot_id, workspace_id, workpiece_id)
    references tongs.quench_release_manifest_snapshots(id, workspace_id, workpiece_id),
  foreign key(release_decision_id, workspace_id, workpiece_id, release_decision_scope_id)
    references tongs.quench_release_decision_revisions(id, workspace_id, workpiece_id, destination_scope_id),
  foreign key(destination_capability_revision_id, executable_destination_id)
    references tongs.publishing_destination_capability_revisions(id, executable_destination_id)
);

create table tongs.publication_attempts (
  id uuid primary key default gen_random_uuid(),
  publication_operation_id uuid not null references tongs.publication_operations(id) on delete cascade,
  attempt_number integer not null check(attempt_number > 0),
  state text not null check(state in('reserved','preparing_execution','submitting','succeeded','confirmed_failure','recoverable_failure','blocked','outcome_unknown')),
  side_effect_possible boolean not null default false,
  credential_generation_id uuid null references tongs.publishing_provider_credential_generations(id),
  adapter_id text null,
  adapter_version text null,
  provider_request_id text null,
  provider_upload_session_id text null,
  external_object_id text null,
  external_url text null,
  failure_code text null,
  failure_detail_json jsonb null check(failure_detail_json is null or jsonb_typeof(failure_detail_json) = 'object'),
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(publication_operation_id, attempt_number),
  unique(id, publication_operation_id),
  check((state in('succeeded','confirmed_failure','recoverable_failure','blocked','outcome_unknown')) = (finished_at is not null)),
  check(not side_effect_possible or state in('submitting','succeeded','confirmed_failure','outcome_unknown')),
  check(state <> 'outcome_unknown' or side_effect_possible)
);

create unique index publication_attempts_one_active_idx
  on tongs.publication_attempts(publication_operation_id)
  where state in('reserved','preparing_execution','submitting');

create table tongs.publication_receipts (
  id uuid primary key default gen_random_uuid(),
  publication_operation_id uuid not null,
  publication_attempt_id uuid not null unique,
  outcome text not null check(outcome in('succeeded','confirmed_failure','recoverable_failure','blocked','outcome_unknown')),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  manifest_snapshot_id uuid not null,
  manifest_content_hash text not null check(manifest_content_hash ~ '^[a-f0-9]{64}$'),
  release_decision_id uuid not null,
  release_decision_revision integer not null,
  executable_destination_id uuid not null,
  destination_capability_revision_id uuid not null,
  credential_generation_id uuid null,
  provider text not null,
  adapter_id text null,
  adapter_version text null,
  provider_request_id text null,
  provider_upload_session_id text null,
  external_object_id text null,
  external_url text null,
  normalized_provider_evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(normalized_provider_evidence) = 'object'),
  observed_at timestamptz not null default now(),
  foreign key(publication_operation_id, workspace_id, workpiece_id)
    references tongs.publication_operations(id, workspace_id, workpiece_id),
  foreign key(publication_attempt_id, publication_operation_id)
    references tongs.publication_attempts(id, publication_operation_id)
);

create table tongs.publication_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  publication_operation_id uuid not null references tongs.publication_operations(id) on delete cascade,
  publication_attempt_id uuid not null,
  event_kind text not null check(event_kind in('reconciliation_required','reconciliation_observation','reconciliation_resolved')),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json) = 'object'),
  recorded_by uuid null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key(publication_attempt_id, publication_operation_id)
    references tongs.publication_attempts(id, publication_operation_id)
);

create or replace function tongs.reject_publication_immutable_mutation()
returns trigger language plpgsql set search_path = pg_catalog, tongs as $$
begin raise exception 'Publication authority history is immutable' using errcode = '55000'; end; $$;

create trigger trg_publication_operations_immutable before update or delete on tongs.publication_operations
for each row execute function tongs.reject_publication_immutable_mutation();
create trigger trg_publication_receipts_immutable before update or delete on tongs.publication_receipts
for each row execute function tongs.reject_publication_immutable_mutation();
create trigger trg_publication_reconciliation_events_immutable before update or delete on tongs.publication_reconciliation_events
for each row execute function tongs.reject_publication_immutable_mutation();

create or replace function tongs.validate_publication_attempt_transition()
returns trigger language plpgsql set search_path = pg_catalog, tongs as $$
begin
  if tg_op = 'DELETE' then raise exception 'Publication attempt identity is immutable' using errcode = '55000'; end if;
  if old.id <> new.id or old.publication_operation_id <> new.publication_operation_id or old.attempt_number <> new.attempt_number or old.created_at <> new.created_at then
    raise exception 'Publication attempt identity is immutable' using errcode = '55000';
  end if;
  if old.state = new.state then raise exception 'Publication attempt transition must advance state' using errcode = '23514'; end if;
  if not (
    (old.state = 'reserved' and new.state in('preparing_execution','blocked','recoverable_failure')) or
    (old.state = 'preparing_execution' and new.state in('submitting','blocked','recoverable_failure','confirmed_failure')) or
    (old.state = 'submitting' and new.state in('succeeded','confirmed_failure','outcome_unknown'))
  ) then raise exception 'Invalid publication attempt transition' using errcode = '23514'; end if;
  if old.side_effect_possible and not new.side_effect_possible then raise exception 'Publication side-effect evidence cannot be cleared' using errcode = '55000'; end if;
  if old.credential_generation_id is not null and old.credential_generation_id is distinct from new.credential_generation_id then raise exception 'Publication attempt credential evidence is immutable once recorded' using errcode='55000'; end if;
  if old.provider_request_id is not null and old.provider_request_id is distinct from new.provider_request_id then raise exception 'Publication provider request identity is immutable once recorded' using errcode='55000'; end if;
  if old.provider_upload_session_id is not null and old.provider_upload_session_id is distinct from new.provider_upload_session_id then raise exception 'Publication provider session identity is immutable once recorded' using errcode='55000'; end if;
  new.updated_at := now(); return new;
end; $$;

create trigger trg_publication_attempt_transition before update or delete on tongs.publication_attempts
for each row execute function tongs.validate_publication_attempt_transition();

create or replace function tongs.establish_publication_operation(
  p_operation_key uuid, p_workspace_id uuid, p_workpiece_id uuid,
  p_manifest_snapshot_id uuid, p_manifest_content_hash text,
  p_release_decision_id uuid, p_release_decision_revision integer,
  p_executable_destination_id uuid, p_destination_capability_revision_id uuid,
  p_publication_intent_contract_version text, p_publication_intent_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, tongs, extensions as $$
declare
  v_user uuid := auth.uid(); v_existing tongs.publication_operations%rowtype;
  v_manifest tongs.quench_release_manifest_snapshots%rowtype; v_decision tongs.quench_release_decision_revisions%rowtype;
  v_scope tongs.quench_destination_scopes%rowtype;
  v_destination tongs.publishing_executable_destinations%rowtype; v_cap tongs.publishing_destination_capability_revisions%rowtype;
  v_intent_hash text; v_fingerprint text; v_id uuid;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then raise exception 'Not authorized to establish publication' using errcode = '42501'; end if;
  if jsonb_typeof(p_publication_intent_snapshot) <> 'object' or length(btrim(p_publication_intent_contract_version)) = 0 then return jsonb_build_object('disposition','invalid','code','publication_intent_invalid'); end if;
  v_intent_hash:=encode(digest(convert_to(p_publication_intent_snapshot::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from tongs.publication_operations where operation_key=p_operation_key;
  if found then
    if v_existing.workspace_id<>p_workspace_id or v_existing.workpiece_id<>p_workpiece_id or v_existing.manifest_snapshot_id<>p_manifest_snapshot_id or v_existing.manifest_content_hash<>lower(p_manifest_content_hash) or v_existing.release_decision_id<>p_release_decision_id or v_existing.release_decision_revision<>p_release_decision_revision or v_existing.executable_destination_id<>p_executable_destination_id or v_existing.destination_capability_revision_id<>p_destination_capability_revision_id or v_existing.publication_intent_contract_version<>p_publication_intent_contract_version or v_existing.publication_intent_content_hash<>v_intent_hash then return jsonb_build_object('disposition','publication_operation_idempotency_conflict'); end if;
    return jsonb_build_object('disposition','replayed','publication_operation_id',v_existing.id,'authority_fingerprint',v_existing.authority_fingerprint);
  end if;
  select * into v_manifest from tongs.quench_release_manifest_snapshots where id=p_manifest_snapshot_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or v_manifest.manifest_content_hash<>lower(p_manifest_content_hash) then return jsonb_build_object('disposition','blocked','code','publication_manifest_mismatch'); end if;
  if not v_manifest.ready_for_quench or v_manifest.canonical_readiness_status<>'ready' or coalesce(v_manifest.parsed_manifest_json->'packaging_media_readiness'->>'state','unresolved')<>'ready' then return jsonb_build_object('disposition','blocked','code','publication_media_not_ready'); end if;
  select * into v_decision from tongs.quench_release_decision_revisions where id=p_release_decision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and revision=p_release_decision_revision;
  if not found or v_decision.manifest_snapshot_id<>v_manifest.id or v_decision.manifest_content_hash<>v_manifest.manifest_content_hash or v_decision.intent_state='cancelled' then return jsonb_build_object('disposition','blocked','code','publication_release_decision_mismatch'); end if;
  select * into v_scope from tongs.quench_destination_scopes where id=v_decision.destination_scope_id;
  select * into v_destination from tongs.publishing_executable_destinations where id=p_executable_destination_id;
  if not found or v_destination.state<>'active' or not tongs.publishing_destination_grant_is_active(p_workspace_id,p_executable_destination_id) then return jsonb_build_object('disposition','blocked','code','publication_destination_unavailable'); end if;
  if v_scope.platform<>coalesce(p_publication_intent_snapshot->>'platform','') or (v_destination.provider='google' and v_scope.platform<>'youtube') or (v_destination.provider='rss_host' and v_scope.platform<>'rss') then return jsonb_build_object('disposition','blocked','code','publication_destination_decision_mismatch'); end if;
  select * into v_cap from tongs.publishing_destination_capability_revisions where id=p_destination_capability_revision_id and executable_destination_id=p_executable_destination_id;
  if not found or v_destination.current_capability_revision_id<>v_cap.id then return jsonb_build_object('disposition','blocked','code','publication_capability_revision_mismatch'); end if;
  if v_scope.platform='youtube' and coalesce(v_cap.capabilities_json->'video_upload','false'::jsonb)<>'true'::jsonb then return jsonb_build_object('disposition','blocked','code','publication_capability_incompatible'); end if;
  v_fingerprint:=encode(digest(convert_to(jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'manifest_snapshot_id',v_manifest.id,'manifest_hash',v_manifest.manifest_content_hash,'decision_id',v_decision.id,'decision_revision',v_decision.revision,'decision_hash',v_decision.decision_content_hash,'destination_id',v_destination.id,'capability_id',v_cap.id,'capability_revision',v_cap.revision,'capability_hash',v_cap.content_hash,'intent_contract',p_publication_intent_contract_version,'intent_hash',v_intent_hash)::text,'UTF8'),'sha256'),'hex');
  insert into tongs.publication_operations(operation_key,authority_fingerprint,workspace_id,workpiece_id,manifest_snapshot_id,manifest_content_hash,release_decision_id,release_decision_scope_id,release_decision_revision,release_decision_content_hash,executable_destination_id,destination_capability_revision_id,destination_capability_revision,destination_capability_content_hash,publication_intent_contract_version,publication_intent_snapshot,publication_intent_content_hash,established_by)
  values(p_operation_key,v_fingerprint,p_workspace_id,p_workpiece_id,v_manifest.id,v_manifest.manifest_content_hash,v_decision.id,v_decision.destination_scope_id,v_decision.revision,v_decision.decision_content_hash,v_destination.id,v_cap.id,v_cap.revision,v_cap.content_hash,p_publication_intent_contract_version,p_publication_intent_snapshot,v_intent_hash,v_user) returning id into v_id;
  return jsonb_build_object('disposition','established','publication_operation_id',v_id,'authority_fingerprint',v_fingerprint);
exception when unique_violation then
  select * into v_existing from tongs.publication_operations where operation_key=p_operation_key;
  if found and v_existing.authority_fingerprint=v_fingerprint then return jsonb_build_object('disposition','replayed','publication_operation_id',v_existing.id,'authority_fingerprint',v_existing.authority_fingerprint); end if;
  return jsonb_build_object('disposition','publication_operation_idempotency_conflict');
end; $$;

create or replace function tongs.claim_publication_attempt(p_publication_operation_id uuid, p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, tongs as $$
declare v_user uuid:=auth.uid(); v_op tongs.publication_operations%rowtype; v_latest tongs.publication_attempts%rowtype; v_number integer; v_id uuid; v_destination tongs.publishing_executable_destinations%rowtype;
begin
  select * into v_op from tongs.publication_operations where id=p_publication_operation_id for update;
  if not found then return jsonb_build_object('disposition','blocked','code','publication_operation_missing'); end if;
  if v_user is null or not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'Not authorized to claim publication attempt' using errcode='42501'; end if;
  select * into v_destination from tongs.publishing_executable_destinations where id=v_op.executable_destination_id;
  if not found or v_destination.state<>'active' or v_destination.current_capability_revision_id<>v_op.destination_capability_revision_id or not tongs.publishing_destination_grant_is_active(v_op.workspace_id,v_op.executable_destination_id) then return jsonb_build_object('disposition','blocked','code','publication_operation_blocked'); end if;
  select * into v_latest from tongs.publication_attempts where publication_operation_id=v_op.id order by attempt_number desc limit 1;
  if found then
    if v_latest.state in('reserved','preparing_execution','submitting') then return jsonb_build_object('disposition','blocked','code','publication_attempt_already_active'); end if;
    if v_latest.state='succeeded' then return jsonb_build_object('disposition','blocked','code','publication_operation_already_succeeded'); end if;
    if v_latest.state='outcome_unknown' then return jsonb_build_object('disposition','blocked','code','publication_external_reconciliation_required'); end if;
    if not p_retry or v_latest.state not in('confirmed_failure','recoverable_failure') then return jsonb_build_object('disposition','blocked','code','publication_safe_retry_unavailable'); end if;
    v_number:=v_latest.attempt_number+1;
  else
    if p_retry then return jsonb_build_object('disposition','blocked','code','publication_safe_retry_unavailable'); end if;
    v_number:=1;
  end if;
  insert into tongs.publication_attempts(publication_operation_id,attempt_number,state) values(v_op.id,v_number,'reserved') returning id into v_id;
  return jsonb_build_object('disposition','claimed','publication_operation_id',v_op.id,'publication_attempt_id',v_id,'attempt_number',v_number,'state','reserved');
exception when unique_violation then return jsonb_build_object('disposition','blocked','code','publication_attempt_already_active'); end; $$;

create or replace function tongs.record_publication_attempt_transition(
  p_attempt_id uuid, p_expected_state text, p_new_state text, p_side_effect_possible boolean,
  p_credential_generation_id uuid default null, p_adapter_id text default null, p_adapter_version text default null,
  p_provider_request_id text default null, p_provider_upload_session_id text default null,
  p_external_object_id text default null, p_external_url text default null,
  p_failure_code text default null, p_failure_detail_json jsonb default null,
  p_normalized_provider_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_attempt tongs.publication_attempts%rowtype; v_op tongs.publication_operations%rowtype; v_destination tongs.publishing_executable_destinations%rowtype; v_terminal boolean;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_attempt from tongs.publication_attempts where id=p_attempt_id for update;
  if not found then return jsonb_build_object('disposition','blocked','code','publication_attempt_missing'); end if;
  if v_attempt.state<>p_expected_state then return jsonb_build_object('disposition','conflict','code','publication_attempt_state_conflict','state',v_attempt.state); end if;
  update tongs.publication_attempts set state=p_new_state,side_effect_possible=side_effect_possible or p_side_effect_possible,
    credential_generation_id=coalesce(p_credential_generation_id,credential_generation_id),adapter_id=coalesce(p_adapter_id,adapter_id),adapter_version=coalesce(p_adapter_version,adapter_version),
    provider_request_id=coalesce(p_provider_request_id,provider_request_id),provider_upload_session_id=coalesce(p_provider_upload_session_id,provider_upload_session_id),external_object_id=coalesce(p_external_object_id,external_object_id),external_url=coalesce(p_external_url,external_url),
    failure_code=p_failure_code,failure_detail_json=p_failure_detail_json,started_at=coalesce(started_at,case when p_new_state='preparing_execution' then now() end),finished_at=case when p_new_state in('succeeded','confirmed_failure','recoverable_failure','blocked','outcome_unknown') then now() else null end
  where id=p_attempt_id returning * into v_attempt;
  v_terminal:=v_attempt.state in('succeeded','confirmed_failure','recoverable_failure','blocked','outcome_unknown');
  if v_terminal then
    select * into v_op from tongs.publication_operations where id=v_attempt.publication_operation_id;
    select * into v_destination from tongs.publishing_executable_destinations where id=v_op.executable_destination_id;
    insert into tongs.publication_receipts(publication_operation_id,publication_attempt_id,outcome,workspace_id,workpiece_id,manifest_snapshot_id,manifest_content_hash,release_decision_id,release_decision_revision,executable_destination_id,destination_capability_revision_id,credential_generation_id,provider,adapter_id,adapter_version,provider_request_id,provider_upload_session_id,external_object_id,external_url,normalized_provider_evidence)
    values(v_op.id,v_attempt.id,v_attempt.state,v_op.workspace_id,v_op.workpiece_id,v_op.manifest_snapshot_id,v_op.manifest_content_hash,v_op.release_decision_id,v_op.release_decision_revision,v_op.executable_destination_id,v_op.destination_capability_revision_id,v_attempt.credential_generation_id,v_destination.provider,v_attempt.adapter_id,v_attempt.adapter_version,v_attempt.provider_request_id,v_attempt.provider_upload_session_id,v_attempt.external_object_id,v_attempt.external_url,coalesce(p_normalized_provider_evidence,'{}'::jsonb));
    if v_attempt.state='outcome_unknown' then insert into tongs.publication_reconciliation_events(publication_operation_id,publication_attempt_id,event_kind,evidence_json) values(v_op.id,v_attempt.id,'reconciliation_required',jsonb_build_object('failure_code',v_attempt.failure_code,'provider_request_id',v_attempt.provider_request_id,'provider_upload_session_id',v_attempt.provider_upload_session_id)); end if;
  end if;
  return jsonb_build_object('disposition','recorded','publication_operation_id',v_attempt.publication_operation_id,'publication_attempt_id',v_attempt.id,'state',v_attempt.state);
end; $$;

create or replace function tongs.read_publication_operation(p_publication_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.publication_operations%rowtype; v_state text;
begin
  select * into v_op from tongs.publication_operations where id=p_publication_operation_id;
  if not found then return jsonb_build_object('disposition','missing'); end if;
  if auth.uid() is null or not tongs.has_workspace_role(v_op.workspace_id,'viewer') then raise exception 'Not authorized to read publication operation' using errcode='42501'; end if;
  select case a.state when 'reserved' then 'reserved' when 'preparing_execution' then 'executing' when 'submitting' then 'executing' when 'succeeded' then 'succeeded' when 'confirmed_failure' then 'retryable_failure' when 'recoverable_failure' then 'retryable_failure' when 'blocked' then 'blocked' when 'outcome_unknown' then 'outcome_unknown' else 'reserved' end into v_state from tongs.publication_attempts a where a.publication_operation_id=v_op.id order by a.attempt_number desc limit 1;
  return jsonb_build_object('disposition','found','operation_state',coalesce(v_state,'reserved'),'authority',to_jsonb(v_op),'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.attempt_number),'[]'::jsonb) from tongs.publication_attempts a where a.publication_operation_id=v_op.id),'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.observed_at),'[]'::jsonb) from tongs.publication_receipts r where r.publication_operation_id=v_op.id));
end; $$;

create or replace function tongs.read_publication_operations_for_manifest(p_workspace_id uuid,p_workpiece_id uuid,p_manifest_snapshot_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
  select case when auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
    'publication_operation_id',o.id,'operation_key',o.operation_key,'authority_fingerprint',o.authority_fingerprint,
    'manifest_snapshot_id',o.manifest_snapshot_id,'release_decision_id',o.release_decision_id,'release_decision_revision',o.release_decision_revision,
    'executable_destination_id',o.executable_destination_id,'destination_capability_revision_id',o.destination_capability_revision_id,
    'operation_state',coalesce((select case a.state when 'reserved' then 'reserved' when 'preparing_execution' then 'executing' when 'submitting' then 'executing' when 'succeeded' then 'succeeded' when 'confirmed_failure' then 'retryable_failure' when 'recoverable_failure' then 'retryable_failure' when 'blocked' then 'blocked' when 'outcome_unknown' then 'outcome_unknown' end from tongs.publication_attempts a where a.publication_operation_id=o.id order by a.attempt_number desc limit 1),'reserved'),
    'established_at',o.established_at
  ) order by o.established_at desc),'[]'::jsonb) end from tongs.publication_operations o
  where o.workspace_id=p_workspace_id and o.workpiece_id=p_workpiece_id and o.manifest_snapshot_id=p_manifest_snapshot_id;
$$;

do $$ declare n text; begin foreach n in array array['publication_operations','publication_attempts','publication_receipts','publication_reconciliation_events'] loop
  execute format('alter table tongs.%I enable row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated',n);
  execute format('grant select on tongs.%I to authenticated',n);
end loop; end; $$;

create policy publication_operations_viewer on tongs.publication_operations for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy publication_attempts_viewer on tongs.publication_attempts for select to authenticated using(exists(select 1 from tongs.publication_operations o where o.id=publication_operation_id and tongs.has_workspace_role(o.workspace_id,'viewer')));
create policy publication_receipts_viewer on tongs.publication_receipts for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy publication_reconciliation_events_viewer on tongs.publication_reconciliation_events for select to authenticated using(exists(select 1 from tongs.publication_operations o where o.id=publication_operation_id and tongs.has_workspace_role(o.workspace_id,'viewer')));

grant all on tongs.publication_operations,tongs.publication_attempts,tongs.publication_receipts,tongs.publication_reconciliation_events to service_role;
revoke all on function tongs.establish_publication_operation(uuid,uuid,uuid,uuid,text,uuid,integer,uuid,uuid,text,jsonb) from public,anon;
grant execute on function tongs.establish_publication_operation(uuid,uuid,uuid,uuid,text,uuid,integer,uuid,uuid,text,jsonb) to authenticated,service_role;
revoke all on function tongs.claim_publication_attempt(uuid,boolean) from public,anon;
grant execute on function tongs.claim_publication_attempt(uuid,boolean) to authenticated,service_role;
revoke all on function tongs.record_publication_attempt_transition(uuid,text,text,boolean,uuid,text,text,text,text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function tongs.record_publication_attempt_transition(uuid,text,text,boolean,uuid,text,text,text,text,text,text,text,jsonb,jsonb) to service_role;
revoke all on function tongs.read_publication_operation(uuid) from public,anon;
grant execute on function tongs.read_publication_operation(uuid) to authenticated,service_role;
revoke all on function tongs.read_publication_operations_for_manifest(uuid,uuid,uuid) from public,anon;
grant execute on function tongs.read_publication_operations_for_manifest(uuid,uuid,uuid) to authenticated,service_role;

comment on table tongs.publication_operations is 'Immutable exact manifest, decision, destination, capability, and publication-intent authority.';
comment on table tongs.publication_attempts is 'Sequential execution attempts beneath one immutable publication operation; outcome_unknown forbids blind retry.';
comment on table tongs.publication_receipts is 'Immutable evidence of intended publication authority and one terminal observed attempt outcome.';
commit;
