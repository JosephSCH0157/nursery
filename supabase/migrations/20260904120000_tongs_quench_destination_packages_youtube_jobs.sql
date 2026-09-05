-- Quench guided publishing: fully resolved destination packages and server-only YouTube jobs.
begin;

create table tongs.quench_destination_package_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  executable_destination_id uuid not null references tongs.publishing_executable_destinations(id),
  revision integer not null check (revision > 0),
  state text not null check (state in ('draft','finalized','superseded')),
  contract_version text not null check (contract_version = 'forge.finalized-destination-package.v1'),
  manifest_snapshot_id uuid not null,
  manifest_content_hash text not null check (manifest_content_hash ~ '^[a-f0-9]{64}$'),
  metadata_revision integer not null check (metadata_revision > 0),
  metadata_content_hash text not null check (metadata_content_hash ~ '^[a-f0-9]{64}$'),
  destination_capability_revision_id uuid not null,
  destination_capability_content_hash text not null check (destination_capability_content_hash ~ '^[a-f0-9]{64}$'),
  resolved_package jsonb not null check (jsonb_typeof(resolved_package) = 'object'),
  package_content_hash text not null check (package_content_hash ~ '^[a-f0-9]{64}$'),
  operation_key uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, workpiece_id, executable_destination_id, revision),
  unique (operation_key),
  unique (id, workspace_id, workpiece_id),
  foreign key (workpiece_id, workspace_id) references tongs.episodes(id, workspace_id),
  foreign key (manifest_snapshot_id, workspace_id, workpiece_id)
    references tongs.quench_release_manifest_snapshots(id, workspace_id, workpiece_id),
  foreign key (destination_capability_revision_id, executable_destination_id)
    references tongs.publishing_destination_capability_revisions(id, executable_destination_id)
);

create index quench_destination_package_latest_idx
  on tongs.quench_destination_package_revisions(workspace_id, workpiece_id, executable_destination_id, revision desc);

create table tongs.youtube_publication_jobs (
  id uuid primary key default gen_random_uuid(),
  publication_operation_id uuid not null references tongs.publication_operations(id) on delete cascade,
  publication_attempt_id uuid not null references tongs.publication_attempts(id) on delete cascade,
  finalized_package_id uuid not null references tongs.quench_destination_package_revisions(id),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  state text not null check (state in ('queued','video_upload','provider_processing','thumbnail','captions','scheduled','published','blocked','failed','outcome_unknown')),
  current_stage text not null,
  transferred_bytes bigint not null default 0 check (transferred_bytes >= 0),
  total_bytes bigint not null default 0 check (total_bytes >= 0 and transferred_bytes <= total_bytes),
  provider_processing_state text null,
  external_object_id text null,
  external_url text null,
  retryable boolean not null default false,
  user_action_code text null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_run_at timestamptz not null default now(),
  lease_owner text null,
  lease_expires_at timestamptz null,
  last_heartbeat_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(publication_attempt_id),
  foreign key(finalized_package_id, workspace_id, workpiece_id)
    references tongs.quench_destination_package_revisions(id, workspace_id, workpiece_id)
);

-- Secrets are split from the member-visible job record. This table deliberately has no member policy.
create table tongs.youtube_publication_job_secrets (
  job_id uuid primary key references tongs.youtube_publication_jobs(id) on delete cascade,
  encrypted_resumable_session_uri text null,
  session_encryption_key_version text null,
  session_ciphertext_version text null,
  credential_generation_id uuid null references tongs.publishing_provider_credential_generations(id),
  provider_request_id text null,
  raw_transport_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_transport_evidence) = 'object'),
  updated_at timestamptz not null default now(),
  check ((encrypted_resumable_session_uri is null) = (session_encryption_key_version is null)),
  check ((encrypted_resumable_session_uri is null) = (session_ciphertext_version is null))
);

alter table tongs.quench_destination_package_revisions enable row level security;
alter table tongs.youtube_publication_jobs enable row level security;
alter table tongs.youtube_publication_job_secrets enable row level security;
revoke all on tongs.quench_destination_package_revisions, tongs.youtube_publication_jobs, tongs.youtube_publication_job_secrets from anon, authenticated;

create or replace function tongs.reject_quench_package_mutation()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception 'Quench destination packages are immutable' using errcode='55000'; end; $$;
create trigger trg_quench_destination_packages_immutable before update or delete on tongs.quench_destination_package_revisions
for each row execute function tongs.reject_quench_package_mutation();

create or replace function tongs.finalize_quench_destination_package(
  p_operation_key uuid, p_workspace_id uuid, p_workpiece_id uuid, p_executable_destination_id uuid,
  p_manifest_snapshot_id uuid, p_manifest_content_hash text, p_metadata_revision integer,
  p_metadata_content_hash text, p_destination_capability_revision_id uuid,
  p_resolved_package jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs,extensions as $$
declare v_user uuid:=auth.uid(); v_existing tongs.quench_destination_package_revisions%rowtype;
  v_manifest tongs.quench_release_manifest_snapshots%rowtype; v_destination tongs.publishing_executable_destinations%rowtype;
  v_metadata tongs.workpiece_files%rowtype; v_cap tongs.publishing_destination_capability_revisions%rowtype; v_revision integer; v_hash text; v_id uuid;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  if jsonb_typeof(p_resolved_package)<>'object' or p_resolved_package->>'contract_version'<>'forge.finalized-destination-package.v1' then
    return jsonb_build_object('disposition','invalid','code','destination_package_invalid');
  end if;
  v_hash:=encode(digest(convert_to(p_resolved_package::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from tongs.quench_destination_package_revisions where operation_key=p_operation_key;
  if found then
    if v_existing.package_content_hash=v_hash then return jsonb_build_object('disposition','replayed','finalized_package_id',v_existing.id,'revision',v_existing.revision,'package_content_hash',v_hash); end if;
    return jsonb_build_object('disposition','idempotency_conflict');
  end if;
  select * into v_manifest from tongs.quench_release_manifest_snapshots where id=p_manifest_snapshot_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or v_manifest.manifest_content_hash<>lower(p_manifest_content_hash) then return jsonb_build_object('disposition','blocked','code','manifest_mismatch'); end if;
  select * into v_metadata from tongs.workpiece_files where workpiece_id=p_workpiece_id and path='metadata.json';
  if not found or v_metadata.revision<>p_metadata_revision or lower(v_metadata.hash_value)<>lower(p_metadata_content_hash) then return jsonb_build_object('disposition','blocked','code','metadata_mismatch'); end if;
  select * into v_destination from tongs.publishing_executable_destinations where id=p_executable_destination_id and state='active';
  if not found or not tongs.publishing_destination_grant_is_active(p_workspace_id,p_executable_destination_id) then return jsonb_build_object('disposition','blocked','code','destination_unavailable'); end if;
  select * into v_cap from tongs.publishing_destination_capability_revisions where id=p_destination_capability_revision_id and executable_destination_id=p_executable_destination_id;
  if not found or v_destination.current_capability_revision_id<>v_cap.id then return jsonb_build_object('disposition','blocked','code','capability_changed'); end if;
  -- The complete snapshot must have resolved selections; inheritance is never accepted at finalization.
  if p_resolved_package ? 'inherits' or not (p_resolved_package ?& array['title','description','assets','mode','visibility','timezone']) then
    return jsonb_build_object('disposition','invalid','code','destination_package_unresolved');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||p_workpiece_id::text||p_executable_destination_id::text,0));
  select coalesce(max(revision),0)+1 into v_revision from tongs.quench_destination_package_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and executable_destination_id=p_executable_destination_id;
  insert into tongs.quench_destination_package_revisions(workspace_id,workpiece_id,executable_destination_id,revision,state,contract_version,manifest_snapshot_id,manifest_content_hash,metadata_revision,metadata_content_hash,destination_capability_revision_id,destination_capability_content_hash,resolved_package,package_content_hash,operation_key,created_by)
  values(p_workspace_id,p_workpiece_id,p_executable_destination_id,v_revision,'finalized','forge.finalized-destination-package.v1',p_manifest_snapshot_id,lower(p_manifest_content_hash),p_metadata_revision,lower(p_metadata_content_hash),v_cap.id,v_cap.content_hash,p_resolved_package,v_hash,p_operation_key,v_user) returning id into v_id;
  return jsonb_build_object('disposition','finalized','finalized_package_id',v_id,'revision',v_revision,'package_content_hash',v_hash);
end; $$;

create or replace function tongs.enqueue_youtube_publication_job(p_publication_operation_id uuid,p_publication_attempt_id uuid,p_finalized_package_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_op tongs.publication_operations%rowtype; v_pkg tongs.quench_destination_package_revisions%rowtype; v_id uuid;
begin
  select * into v_op from tongs.publication_operations where id=p_publication_operation_id;
  if not found or v_user is null or not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_pkg from tongs.quench_destination_package_revisions where id=p_finalized_package_id and state='finalized';
  if not found or v_pkg.workspace_id<>v_op.workspace_id or v_pkg.workpiece_id<>v_op.workpiece_id or v_pkg.executable_destination_id<>v_op.executable_destination_id or v_pkg.manifest_snapshot_id<>v_op.manifest_snapshot_id then return jsonb_build_object('disposition','blocked','code','finalized_package_mismatch'); end if;
  insert into tongs.youtube_publication_jobs(publication_operation_id,publication_attempt_id,finalized_package_id,workspace_id,workpiece_id,state,current_stage)
  values(v_op.id,p_publication_attempt_id,v_pkg.id,v_op.workspace_id,v_op.workpiece_id,'queued','queued')
  on conflict(publication_attempt_id) do update set updated_at=tongs.youtube_publication_jobs.updated_at returning id into v_id;
  insert into tongs.youtube_publication_job_secrets(job_id) values(v_id) on conflict do nothing;
  return jsonb_build_object('disposition','queued','job_id',v_id);
end; $$;

create or replace function tongs.read_youtube_publication_progress(p_workspace_id uuid,p_workpiece_id uuid,p_publication_operation_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
  select case when auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then null else
    (select jsonb_build_object('publication_operation_id',j.publication_operation_id,'stage',j.state,'transferred_bytes',j.transferred_bytes,'total_bytes',j.total_bytes,
      'percent',case when j.total_bytes>0 then least(100,floor(j.transferred_bytes*100.0/j.total_bytes)) else 0 end,
      'retryable',j.retryable,'user_action_code',j.user_action_code,'provider_processing_state',j.provider_processing_state,
      'external_object_id',j.external_object_id,'external_url',j.external_url,'updated_at',j.updated_at)
     from tongs.youtube_publication_jobs j where j.workspace_id=p_workspace_id and j.workpiece_id=p_workpiece_id and j.publication_operation_id=p_publication_operation_id)
  end;
$$;

create or replace function tongs.claim_youtube_publication_job(p_worker_id text,p_lease_seconds integer default 600)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_job tongs.youtube_publication_jobs%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_job from tongs.youtube_publication_jobs where state not in('published','scheduled','blocked','failed','outcome_unknown') and next_run_at<=now() and (lease_expires_at is null or lease_expires_at<now()) order by next_run_at,created_at for update skip locked limit 1;
  if not found then return jsonb_build_object('disposition','empty'); end if;
  update tongs.youtube_publication_jobs set lease_owner=p_worker_id,lease_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,840))),last_heartbeat_at=now(),attempt_count=attempt_count+1,updated_at=now() where id=v_job.id;
  return jsonb_build_object('disposition','claimed','job_id',v_job.id,'publication_operation_id',v_job.publication_operation_id,'publication_attempt_id',v_job.publication_attempt_id,'attempt_state',(select state from tongs.publication_attempts where id=v_job.publication_attempt_id),'finalized_package_id',v_job.finalized_package_id,'state',v_job.state,'current_stage',v_job.current_stage,'transferred_bytes',v_job.transferred_bytes,'total_bytes',v_job.total_bytes,'attempt_count',v_job.attempt_count,'external_object_id',v_job.external_object_id,
    'resolved_package',(select resolved_package from tongs.quench_destination_package_revisions where id=v_job.finalized_package_id),
    'connection_id',(select d.connection_id from tongs.publication_operations o join tongs.publishing_executable_destinations d on d.id=o.executable_destination_id where o.id=v_job.publication_operation_id),
    'secret',(select jsonb_build_object('encrypted_resumable_session_uri',s.encrypted_resumable_session_uri,'session_encryption_key_version',s.session_encryption_key_version,'session_ciphertext_version',s.session_ciphertext_version,'credential_generation_id',s.credential_generation_id) from tongs.youtube_publication_job_secrets s where s.job_id=v_job.id));
end; $$;

create or replace function tongs.checkpoint_youtube_publication_job(
  p_job_id uuid,p_worker_id text,p_state text,p_current_stage text,p_transferred_bytes bigint,p_total_bytes bigint,
  p_next_run_at timestamptz,p_provider_processing_state text default null,p_external_object_id text default null,p_external_url text default null,
  p_retryable boolean default false,p_user_action_code text default null,p_encrypted_session_uri text default null,
  p_session_encryption_key_version text default null,p_session_ciphertext_version text default null,p_credential_generation_id uuid default null,
  p_provider_request_id text default null,p_raw_transport_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_job tongs.youtube_publication_jobs%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_job from tongs.youtube_publication_jobs where id=p_job_id for update;
  if not found or v_job.lease_owner<>p_worker_id or v_job.lease_expires_at<now() then return jsonb_build_object('disposition','lease_lost'); end if;
  if p_transferred_bytes<v_job.transferred_bytes or p_total_bytes<v_job.total_bytes then return jsonb_build_object('disposition','invalid','code','upload_progress_must_be_monotonic'); end if;
  update tongs.youtube_publication_jobs set state=p_state,current_stage=p_current_stage,transferred_bytes=p_transferred_bytes,total_bytes=p_total_bytes,
    next_run_at=p_next_run_at,provider_processing_state=coalesce(p_provider_processing_state,provider_processing_state),external_object_id=coalesce(p_external_object_id,external_object_id),external_url=coalesce(p_external_url,external_url),retryable=p_retryable,user_action_code=p_user_action_code,
    lease_owner=null,lease_expires_at=null,last_heartbeat_at=now(),updated_at=now() where id=p_job_id;
  update tongs.youtube_publication_job_secrets set encrypted_resumable_session_uri=coalesce(p_encrypted_session_uri,encrypted_resumable_session_uri),session_encryption_key_version=coalesce(p_session_encryption_key_version,session_encryption_key_version),session_ciphertext_version=coalesce(p_session_ciphertext_version,session_ciphertext_version),credential_generation_id=coalesce(p_credential_generation_id,credential_generation_id),provider_request_id=coalesce(p_provider_request_id,provider_request_id),raw_transport_evidence=raw_transport_evidence||coalesce(p_raw_transport_evidence,'{}'::jsonb),updated_at=now() where job_id=p_job_id;
  return jsonb_build_object('disposition','checkpointed','job_id',p_job_id,'state',p_state);
end; $$;

create or replace function tongs.retry_youtube_publication_stage(p_workspace_id uuid,p_workpiece_id uuid,p_publication_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_job tongs.youtube_publication_jobs%rowtype;
begin
  perform tongs.require_workspace_role(p_workspace_id,'editor');
  select * into v_job from tongs.youtube_publication_jobs
   where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and publication_operation_id=p_publication_operation_id for update;
  if not found then return jsonb_build_object('disposition','not_found'); end if;
  if v_job.state<>'failed' or not v_job.retryable then return jsonb_build_object('disposition','not_retryable','state',v_job.state); end if;
  if v_job.current_stage not in('queued','video_upload','provider_processing','thumbnail','captions') then return jsonb_build_object('disposition','invalid_stage','stage',v_job.current_stage); end if;
  update tongs.youtube_publication_jobs set state=v_job.current_stage,attempt_count=0,next_run_at=now(),lease_owner=null,
    lease_expires_at=null,last_heartbeat_at=null,retryable=false,user_action_code=null,updated_at=now() where id=v_job.id;
  return jsonb_build_object('disposition','retry_queued','job_id',v_job.id,'stage',v_job.current_stage);
end; $$;

grant execute on function tongs.finalize_quench_destination_package(uuid,uuid,uuid,uuid,uuid,text,integer,text,uuid,jsonb) to authenticated;
grant execute on function tongs.enqueue_youtube_publication_job(uuid,uuid,uuid) to authenticated;
grant execute on function tongs.read_youtube_publication_progress(uuid,uuid,uuid) to authenticated;
grant execute on function tongs.retry_youtube_publication_stage(uuid,uuid,uuid) to authenticated;
revoke all on function tongs.claim_youtube_publication_job(text,integer) from public,anon,authenticated;
revoke all on function tongs.checkpoint_youtube_publication_job(uuid,text,text,text,bigint,bigint,timestamptz,text,text,text,boolean,text,text,text,text,uuid,text,jsonb) from public,anon,authenticated;

commit;
