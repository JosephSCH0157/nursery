-- Replay-safe bridge from Tongs-verified storage bytes to canonical B-roll assets.
begin;

alter table tongs.broll_operation_receipts
  drop constraint if exists broll_operation_receipts_state_check,
  add constraint broll_operation_receipts_state_check check(state in(
    'pending','provider_or_upload_completed','asset_verified','video_asset_verified',
    'poster_asset_verified','committed','candidate_committed','selected','failed'
  ));

create unique index if not exists assets_broll_operation_kind_unique_idx
  on tongs.assets(workspace_id,workpiece_id,operation_id,asset_kind)
  where operation_id is not null and asset_kind in('broll_candidate_video','broll_candidate_poster');

create or replace function tongs.commit_broll_operation_asset(
  p_operation_id text,
  p_operation_fingerprint text,
  p_asset_kind text,
  p_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_content_hash text,
  p_storage_bucket text,
  p_storage_key text,
  p_width integer,
  p_height integer,
  p_duration_ms bigint,
  p_provider text,
  p_provider_request_id text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  v_op tongs.broll_operation_receipts%rowtype;
  v_asset tongs.assets%rowtype;
  v_expected_kind text;
  v_next_state text;
begin
  if auth.role()<>'service_role' then
    raise exception 'B-roll asset commit requires Tongs service authority' using errcode='42501';
  end if;
  select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if v_op.operation_type<>'candidate_acquire' then return jsonb_build_object('disposition','candidate_acquisition_operation_required'); end if;
  if p_asset_kind not in('broll_candidate_video','broll_candidate_poster') then return jsonb_build_object('disposition','unsupported_broll_asset_kind'); end if;
  if p_byte_size<=0 or p_content_hash!~'^[0-9a-f]{64}$' or p_width<=0 or p_height<=0 then return jsonb_build_object('disposition','invalid_verified_media_evidence'); end if;
  if p_asset_kind='broll_candidate_video' and (p_mime_type not like 'video/%' or coalesce(p_duration_ms,0)<=0) then return jsonb_build_object('disposition','invalid_verified_video_evidence'); end if;
  if p_asset_kind='broll_candidate_poster' and p_mime_type not like 'image/%' then return jsonb_build_object('disposition','invalid_verified_poster_evidence'); end if;
  v_expected_kind:=p_asset_kind;
  select * into v_asset from tongs.assets
    where workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id
      and operation_id=p_operation_id and asset_kind=v_expected_kind for update;
  if found then
    if v_asset.operation_fingerprint<>p_operation_fingerprint or v_asset.content_hash<>p_content_hash
      or v_asset.storage_bucket<>p_storage_bucket or v_asset.storage_key<>p_storage_key
      or v_asset.bytes<>p_byte_size or v_asset.mime_type<>p_mime_type then
      return jsonb_build_object('disposition','asset_replay_conflict');
    end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op),'asset',to_jsonb(v_asset));
  end if;
  if p_asset_kind='broll_candidate_video' and v_op.state<>'provider_or_upload_completed' then return jsonb_build_object('disposition','provider_or_upload_result_required'); end if;
  if p_asset_kind='broll_candidate_poster' and v_op.state<>'video_asset_verified' then return jsonb_build_object('disposition','video_asset_verification_required'); end if;
  insert into tongs.assets(
    workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,
    provider_request_id,request_id,created_by,asset_kind,status,metadata_json,width,height,
    operation_id,operation_fingerprint,content_hash,ready_at
  ) values(
    v_op.workspace_id,v_op.workpiece_id,p_path,p_mime_type,p_byte_size,p_storage_bucket,p_storage_key,p_provider,
    p_provider_request_id,p_operation_id,v_op.created_by,p_asset_kind,'ready',
    jsonb_strip_nulls(jsonb_build_object('duration_ms',p_duration_ms,'inspection_authority','tongs-service.v1')),
    p_width,p_height,p_operation_id,p_operation_fingerprint,p_content_hash,now()
  ) returning * into v_asset;
  v_next_state:=case when p_asset_kind='broll_candidate_video' then 'video_asset_verified' else 'poster_asset_verified' end;
  update tongs.broll_operation_receipts set
    state=v_next_state,
    verified_asset_id=case when p_asset_kind='broll_candidate_video' then v_asset.id else verified_asset_id end,
    verified_poster_asset_id=case when p_asset_kind='broll_candidate_poster' then v_asset.id else verified_poster_asset_id end,
    failed_stage=null,failure_code=null,failure_message=null,updated_at=now()
  where operation_id=p_operation_id returning * into v_op;
  return jsonb_build_object('disposition',v_next_state,'operation',to_jsonb(v_op),'asset',to_jsonb(v_asset));
end $$;

create or replace function tongs.begin_broll_operation(p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_operation_type text,p_operation_id text,p_operation_fingerprint text,p_inputs jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'operation actor must match authenticated creator' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint or v_op.workspace_id<>p_workspace_id or v_op.workpiece_id<>p_workpiece_id or v_op.beat_id is distinct from p_beat_id or v_op.operation_type<>p_operation_type then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  if v_op.state='failed' then update tongs.broll_operation_receipts set state=case when verified_poster_asset_id is not null then 'poster_asset_verified' when verified_asset_id is not null then 'video_asset_verified' when provider_response_json is not null then 'provider_or_upload_completed' else 'pending' end,failed_stage=null,failure_code=null,failure_message=null,updated_at=now() where operation_id=p_operation_id returning * into v_op; end if;
  return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
 end if;
 insert into tongs.broll_operation_receipts(operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,beat_id,normalized_inputs_json,created_by)
 values(p_operation_id,p_operation_fingerprint,p_operation_type,'pending',p_workspace_id,p_workpiece_id,p_beat_id,p_inputs,p_actor_id) returning * into v_op;
 return jsonb_build_object('disposition','reserved','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.commit_broll_candidate(p_operation_id text,p_operation_fingerprint text,p_prompt_revision_id uuid,p_source_kind text,p_license_json jsonb,p_provenance_json jsonb,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_op tongs.broll_operation_receipts%rowtype; v_asset tongs.assets%rowtype; v_prompt tongs.broll_prompt_revisions%rowtype; v_candidate tongs.broll_candidates%rowtype; v_rev tongs.broll_candidate_revisions%rowtype; v_hash text; v_immutable text; v_result jsonb; v_poster_required boolean;
begin
 select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
 if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
 if not tongs.has_workspace_role(v_op.workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
 if auth.uid() is distinct from p_actor_id then raise exception 'candidate actor must match authenticated creator' using errcode='42501'; end if;
 if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
 if v_op.state='candidate_committed' then return v_op.receipt_json; end if;
 v_poster_required:=coalesce((v_op.normalized_inputs_json->>'poster_required')::boolean,false);
 if v_op.state not in('video_asset_verified','poster_asset_verified') then return jsonb_build_object('disposition','video_asset_verification_required'); end if;
 if v_poster_required and v_op.state<>'poster_asset_verified' then return jsonb_build_object('disposition','poster_asset_verification_required'); end if;
 select * into v_asset from tongs.assets where id=v_op.verified_asset_id and status='ready' and asset_kind='broll_candidate_video';
 if not found then return jsonb_build_object('disposition','verified_video_asset_required'); end if;
 if p_source_kind='generated' and p_prompt_revision_id is null then return jsonb_build_object('disposition','prompt_revision_required'); end if;
 if p_prompt_revision_id is not null then select * into v_prompt from tongs.broll_prompt_revisions where id=p_prompt_revision_id and workspace_id=v_op.workspace_id and workpiece_id=v_op.workpiece_id and beat_id=v_op.beat_id; if not found then return jsonb_build_object('disposition','prompt_revision_conflict'); end if; end if;
 insert into tongs.broll_candidates(workspace_id,workpiece_id,beat_id,created_by) values(v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,p_actor_id) returning * into v_candidate;
 v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('asset_id',v_asset.id,'asset_hash',v_asset.content_hash,'poster_asset_id',v_op.verified_poster_asset_id,'prompt_hash',v_prompt.content_hash,'source_kind',p_source_kind,'license',p_license_json,'provenance',p_provenance_json)::text,'UTF8'),'sha256'),'hex');
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('candidate_id',v_candidate.id,'content_hash',v_hash,'revision',1,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.broll_candidate_revisions(candidate_id,workspace_id,workpiece_id,beat_id,revision,prompt_revision_id,prompt_revision,prompt_content_hash,asset_id,asset_content_hash,asset_path,storage_bucket,storage_key,mime_type,duration_ms,width,height,poster_asset_id,source_kind,provider,provider_request_id,source_url,license_json,provenance_json,content_hash,immutable_revision_hash,created_by)
 values(v_candidate.id,v_op.workspace_id,v_op.workpiece_id,v_op.beat_id,1,v_prompt.id,v_prompt.revision,v_prompt.content_hash,v_asset.id,v_asset.content_hash,v_asset.path,v_asset.storage_bucket,v_asset.storage_key,v_asset.mime_type,(v_asset.metadata_json->>'duration_ms')::bigint,v_asset.width,v_asset.height,v_op.verified_poster_asset_id,p_source_kind,v_asset.provider,v_asset.provider_request_id,p_provenance_json->>'source_url',p_license_json,p_provenance_json,v_hash,v_immutable,p_actor_id) returning * into v_rev;
 v_result:=jsonb_build_object('disposition','committed','candidate_revision',to_jsonb(v_rev));
 update tongs.broll_operation_receipts set state='candidate_committed',result_candidate_revision_id=v_rev.id,receipt_json=v_result,updated_at=now() where operation_id=p_operation_id;
 return v_result;
end $$;

revoke all on function tongs.commit_broll_operation_asset(text,text,text,text,text,bigint,text,text,text,integer,integer,bigint,text,text) from public,anon,authenticated;
grant execute on function tongs.commit_broll_operation_asset(text,text,text,text,text,bigint,text,text,text,integer,integer,bigint,text,text) to service_role;

commit;
