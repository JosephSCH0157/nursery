-- Forward-only: discard intent is independent of transcript/history mutations.
begin;
create table tongs.hammer_cleanup_review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id),
  workpiece_id uuid not null references tongs.episodes(id),
  canonical_recording_id uuid not null references tongs.canonical_recordings(id),
  recording_revision_id uuid not null references tongs.recording_revisions(id),
  contract_version text not null check(contract_version='hammer-cleanup-review-v1'),
  basis_fingerprint text not null check(basis_fingerprint ~ '^[0-9a-f]{64}$'),
  candidate_fingerprint text not null check(candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  decision text not null default 'discard' check(decision='discard'),
  basis_descriptor jsonb not null check(jsonb_typeof(basis_descriptor)='object' and octet_length(basis_descriptor::text)<=1572864),
  candidate_descriptor jsonb not null check(jsonb_typeof(candidate_descriptor)='object' and octet_length(candidate_descriptor::text)<=262144),
  evidence_tokens jsonb not null check(jsonb_typeof(evidence_tokens)='object' and octet_length(evidence_tokens::text)<=32768),
  authored_by uuid not null references auth.users(id),
  authored_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,basis_fingerprint,candidate_fingerprint,decision)
);
alter table tongs.hammer_cleanup_review_decisions enable row level security;
revoke all on tongs.hammer_cleanup_review_decisions from public,anon,authenticated,service_role;
grant select on tongs.hammer_cleanup_review_decisions to authenticated,service_role;
create policy cleanup_review_viewer on tongs.hammer_cleanup_review_decisions for select to authenticated using (
  tongs.has_workspace_role(workspace_id,'viewer') and exists (
    select 1 from tongs.recording_revisions r join tongs.episodes e on e.id=r.workpiece_id
    where r.id=recording_revision_id and r.workspace_id=hammer_cleanup_review_decisions.workspace_id
      and r.workpiece_id=hammer_cleanup_review_decisions.workpiece_id
      and r.canonical_recording_id=hammer_cleanup_review_decisions.canonical_recording_id and e.workspace_id=r.workspace_id));
create function tongs.reject_cleanup_review_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'cleanup_review_immutable' using errcode='55000'; end $$;
create trigger cleanup_review_immutable before update or delete on tongs.hammer_cleanup_review_decisions
for each row execute function tongs.reject_cleanup_review_mutation();

-- Service-only. p_actor is supplied ONLY after verification of the user bearer.
-- This helper has no public execute grant and does not alter JWT/session settings.
create function tongs.read_cleanup_review_basis(p_actor uuid,p_workspace uuid,p_workpiece uuid,p_revision uuid,p_write boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare r tongs.recording_revisions%rowtype; c tongs.canonical_recordings%rowtype; e tongs.episodes%rowtype;
  t tongs.workpiece_files%rowtype; m tongs.workpiece_files%rowtype; h tongs.workpiece_files%rowtype; role_rank integer;
begin
  select case when w.created_by=p_actor then 40 else tongs.workspace_role_rank(wm.role) end into role_rank
    from tongs.workspaces w left join tongs.workspace_members wm on wm.workspace_id=w.id and wm.user_id=p_actor where w.id=p_workspace;
  if p_actor is null or coalesce(role_rank,0)<(case when p_write then 20 else 10 end) then raise exception 'cleanup_review_forbidden' using errcode='42501'; end if;
  -- Lock order: revision, episode, recording, then registry paths lexically.
  select * into r from tongs.recording_revisions where id=p_revision and workspace_id=p_workspace and workpiece_id=p_workpiece for update;
  select * into e from tongs.episodes where id=p_workpiece and workspace_id=p_workspace for share;
  if r.id is null or e.id is null or r.status is distinct from 'active' or e.active_revision_id is distinct from r.id or e.canonical_recording_id is distinct from r.canonical_recording_id then
    raise exception 'cleanup_review_identity_conflict' using errcode='40001'; end if;
  select * into c from tongs.canonical_recordings where id=r.canonical_recording_id and workpiece_id=p_workpiece and workspace_id=p_workspace for share;
  if c.id is null or c.media_id is null or r.revision_transcript_path is null then raise exception 'cleanup_review_basis_unavailable' using errcode='40001'; end if;
  perform 1 from tongs.workpiece_files where workpiece_id=p_workpiece and path in(r.revision_transcript_path,c.media_path,r.history_path) order by path for share;
  select * into t from tongs.workpiece_files where workpiece_id=p_workpiece and path=r.revision_transcript_path;
  select * into m from tongs.workpiece_files where workpiece_id=p_workpiece and path=c.media_path;
  select * into h from tongs.workpiece_files where workpiece_id=p_workpiece and path=r.history_path;
  if t.workpiece_id is null or m.workpiece_id is null or t.hash_value is null or m.hash_value is null or t.bytes is null or m.bytes is null
    or t.storage_key is null or m.storage_key is null or t.updated_at is null or m.updated_at is null
    or lower(t.hash_value)!~'^[0-9a-f]{64}$' or lower(m.hash_value)!~'^[0-9a-f]{64}$'
    or t.hash_algo is distinct from 'sha256' or m.hash_algo is distinct from 'sha256' or t.content_type is distinct from 'application/json' or t.bytes<=0 or t.bytes>2097152 or m.bytes<=0
    or t.storage_bucket is distinct from 'forge-workpieces' or m.storage_bucket is distinct from 'forge-workpieces'
    or (r.history_path is not null and h.workpiece_id is null) then raise exception 'cleanup_review_evidence_unavailable' using errcode='40001'; end if;
  return jsonb_build_object('workspace_id',p_workspace,'workpiece_id',p_workpiece,'canonical_recording_id',c.id,'recording_revision_id',r.id,
    'media_id',c.media_id,'revision_updated_at',r.updated_at::text,'media_path',c.media_path,'history_path',r.history_path,
    'transcript',to_jsonb(t),'media',to_jsonb(m),'history',case when h.workpiece_id is null then null else to_jsonb(h) end);
end $$;
create function tongs.commit_cleanup_review_discard(p_actor uuid,p_workspace uuid,p_workpiece uuid,p_revision uuid,
  p_basis_hash text,p_candidate_hash text,p_basis jsonb,p_candidate jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare current_evidence jsonb; d tongs.hammer_cleanup_review_decisions%rowtype;
begin
  current_evidence:=tongs.read_cleanup_review_basis(p_actor,p_workspace,p_workpiece,p_revision,true);
  if current_evidence is distinct from p_evidence then raise exception 'cleanup_review_stale_basis' using errcode='40001'; end if;
  if p_basis->>'contract_version' is distinct from 'hammer-cleanup-review-v1' or p_basis->>'generator_version' is distinct from 'hammer-cleanup-generator-v1'
    or p_basis->>'workspace_id' is distinct from p_workspace::text or p_basis->>'workpiece_id' is distinct from p_workpiece::text
    or p_basis->>'recording_revision_id' is distinct from p_revision::text
    or p_basis->>'canonical_recording_id' is distinct from current_evidence->>'canonical_recording_id'
    or p_basis#>>'{media,media_id}' is distinct from current_evidence->>'media_id'
    or p_basis#>>'{media,sha256}' is distinct from lower(current_evidence#>>'{media,hash_value}')
    or p_basis#>>'{media,bytes}' is distinct from current_evidence#>>'{media,bytes}'
    or p_candidate->>'kind' is distinct from p_basis->>'kind' then raise exception 'cleanup_review_descriptor_invalid' using errcode='22023'; end if;
  insert into tongs.hammer_cleanup_review_decisions(workspace_id,workpiece_id,canonical_recording_id,recording_revision_id,contract_version,
    basis_fingerprint,candidate_fingerprint,basis_descriptor,candidate_descriptor,evidence_tokens,authored_by)
  values(p_workspace,p_workpiece,(current_evidence->>'canonical_recording_id')::uuid,p_revision,'hammer-cleanup-review-v1',
    p_basis_hash,p_candidate_hash,p_basis,p_candidate,p_evidence,p_actor) on conflict do nothing returning * into d;
  if d.id is not null then return jsonb_build_object('outcome','committed','receipt',to_jsonb(d)); end if;
  select * into d from tongs.hammer_cleanup_review_decisions where workspace_id=p_workspace and workpiece_id=p_workpiece
    and recording_revision_id=p_revision and basis_fingerprint=p_basis_hash and candidate_fingerprint=p_candidate_hash;
  if d.id is null or d.basis_descriptor is distinct from p_basis or d.candidate_descriptor is distinct from p_candidate then
    raise exception 'cleanup_review_idempotency_conflict' using errcode='40001'; end if;
  return jsonb_build_object('outcome','already_committed','receipt',to_jsonb(d));
end $$;
revoke all on function tongs.reject_cleanup_review_mutation() from public,anon,authenticated;
revoke all on function tongs.read_cleanup_review_basis(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function tongs.commit_cleanup_review_discard(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function tongs.read_cleanup_review_basis(uuid,uuid,uuid,uuid,boolean) to service_role;
grant execute on function tongs.commit_cleanup_review_discard(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb) to service_role;
commit;
