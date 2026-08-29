begin;

alter table tongs.reference_clip_candidate_revisions
  add column delivery_kind text not null default 'local_asset',
  add column external_provider text,
  add column external_media_id text,
  add column external_url text,
  add column embed_url text,
  add column start_ms bigint,
  add column end_ms bigint,
  add column external_metadata_json jsonb not null default '{}'::jsonb;

alter table tongs.reference_clip_candidate_revisions
  alter column asset_id drop not null,
  alter column asset_content_hash drop not null,
  alter column asset_path drop not null,
  alter column storage_bucket drop not null,
  alter column storage_key drop not null,
  alter column mime_type drop not null,
  alter column duration_ms drop not null,
  drop constraint reference_clip_candidate_revisions_asset_content_hash_check,
  drop constraint reference_clip_candidate_revisions_mime_type_check,
  drop constraint reference_clip_candidate_revisions_duration_ms_check,
  add constraint reference_clip_candidate_revisions_delivery_kind_check check(delivery_kind in('local_asset','youtube_external_reference')),
  add constraint reference_clip_candidate_revisions_delivery_shape_check check(
    (delivery_kind='local_asset' and asset_id is not null and asset_content_hash~'^[0-9a-f]{64}$' and asset_path is not null and storage_bucket is not null and storage_key is not null and mime_type like 'video/%' and duration_ms>0 and external_provider is null and external_media_id is null and external_url is null and embed_url is null and start_ms is null and end_ms is null)
    or
    (delivery_kind='youtube_external_reference' and asset_id is null and asset_content_hash is null and asset_path is null and storage_bucket is null and storage_key is null and mime_type is null and poster_asset_id is null and external_provider='youtube' and external_media_id~'^[A-Za-z0-9_-]{11}$' and external_url~'^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$' and embed_url~'^https://www[.]youtube-nocookie[.]com/embed/[A-Za-z0-9_-]{11}$' and start_ms>=0 and end_ms>start_ms and duration_ms=end_ms-start_ms)
  );

alter table tongs.reference_clip_operation_receipts drop constraint reference_clip_operation_receipts_operation_type_check;
alter table tongs.reference_clip_operation_receipts add constraint reference_clip_operation_receipts_operation_type_check check(operation_type in('plan_commit','source_fulfillment','candidate_commit','selection','youtube_reference_commit'));

create or replace function tongs.commit_youtube_reference_clip_candidate(
 p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_expected_opportunity_revision_id uuid,
 p_video_id text,p_canonical_url text,p_embed_url text,p_start_ms bigint,p_end_ms bigint,p_metadata_json jsonb,
 p_rights jsonb,p_provenance jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare receipt tongs.reference_clip_operation_receipts%rowtype;o tongs.reference_clip_opportunity_revisions%rowtype;c tongs.reference_clip_candidates%rowtype;r tongs.reference_clip_candidate_revisions%rowtype;h text;ih text;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 select * into receipt from tongs.reference_clip_operation_receipts where operation_id=p_operation_id;
 if found then if receipt.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return receipt.receipt_json;end if;
 select rv.* into o from tongs.reference_clip_plan_sequences ps join tongs.reference_clip_plan_membership m on m.plan_revision_id=ps.current_plan_revision_id join tongs.reference_clip_opportunity_revisions rv on rv.id=m.opportunity_revision_id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id and m.opportunity_id=p_opportunity_id;
 if not found or o.id is distinct from p_expected_opportunity_revision_id then return jsonb_build_object('disposition','opportunity_revision_conflict');end if;
 if o.source_status<>'linked' or o.source_revision_id is null or o.workpiece_source_link_revision_id is null then return jsonb_build_object('disposition','linked_source_revision_required');end if;
 if p_video_id!~'^[A-Za-z0-9_-]{11}$' or p_canonical_url<>('https://www.youtube.com/watch?v='||p_video_id) or p_embed_url<>('https://www.youtube-nocookie.com/embed/'||p_video_id) then return jsonb_build_object('disposition','youtube_identity_invalid');end if;
 if p_start_ms<0 or p_end_ms<=p_start_ms or p_end_ms-p_start_ms>3600000 then return jsonb_build_object('disposition','youtube_range_invalid');end if;
 insert into tongs.reference_clip_candidates(workspace_id,workpiece_id,opportunity_id,created_by)values(p_workspace_id,p_workpiece_id,p_opportunity_id,p_actor_id)returning * into c;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('opportunity_revision_id',o.id,'source_revision_id',o.source_revision_id,'source_link_revision_id',o.workpiece_source_link_revision_id,'delivery_kind','youtube_external_reference','video_id',p_video_id,'canonical_url',p_canonical_url,'embed_url',p_embed_url,'start_ms',p_start_ms,'end_ms',p_end_ms,'metadata',coalesce(p_metadata_json,'{}'),'rights',p_rights,'provenance',p_provenance)::text,'UTF8'),'sha256'),'hex');
 ih:=encode(extensions.digest(convert_to(jsonb_build_object('candidate_id',c.id,'revision',1,'content_hash',h)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_clip_candidate_revisions(candidate_id,workspace_id,workpiece_id,opportunity_id,revision,opportunity_revision_id,opportunity_revision,source_revision_id,source_revision,workpiece_source_link_revision_id,workpiece_source_link_revision,asset_id,asset_content_hash,asset_path,storage_bucket,storage_key,mime_type,duration_ms,poster_asset_id,rights_basis,rights_holder,license_identifier,license_url,territories,expires_at,attribution_required,attribution_text,rights_evidence_json,provenance_json,content_hash,immutable_revision_hash,created_by,delivery_kind,external_provider,external_media_id,external_url,embed_url,start_ms,end_ms,external_metadata_json)
 values(c.id,p_workspace_id,p_workpiece_id,p_opportunity_id,1,o.id,o.revision,o.source_revision_id,o.source_revision,o.workpiece_source_link_revision_id,o.workpiece_source_link_revision,null,null,null,null,null,null,p_end_ms-p_start_ms,null,case p_rights->>'basis' when 'fair_use_claimed' then 'fair_use_claim' else coalesce(p_rights->>'basis','unknown') end,p_rights->>'rights_holder',p_rights->>'license_identifier',p_rights->>'license_url',array(select jsonb_array_elements_text(coalesce(p_rights->'territories','[]'))),nullif(p_rights->>'expires_at','')::timestamptz,coalesce((p_rights->>'attribution_required')::boolean,false),p_rights->>'attribution_text',p_rights,coalesce(p_provenance,'{}')||jsonb_build_object('delivery_kind','youtube_external_reference'),h,ih,p_actor_id,'youtube_external_reference','youtube',p_video_id,p_canonical_url,p_embed_url,p_start_ms,p_end_ms,coalesce(p_metadata_json,'{}'))returning * into r;
 result:=jsonb_build_object('disposition','committed','candidate_revision',to_jsonb(r));
 insert into tongs.reference_clip_operation_receipts(operation_id,operation_fingerprint,operation_type,workspace_id,workpiece_id,opportunity_id,state,normalized_inputs_json,result_candidate_revision_id,receipt_json,created_by)values(p_operation_id,p_operation_fingerprint,'youtube_reference_commit',p_workspace_id,p_workpiece_id,p_opportunity_id,'committed',jsonb_build_object('video_id',p_video_id,'start_ms',p_start_ms,'end_ms',p_end_ms),r.id,result,p_actor_id);
 return result;
end$$;

create or replace function tongs.read_reference_clip_visual_package(p_workspace_id uuid,p_workpiece_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer')then null else jsonb_build_object('contract_version','forge.reference-clips.hammer.v3','workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'clips',coalesce((select jsonb_agg(jsonb_build_object('opportunity_id',o.opportunity_id,'opportunity_revision_id',o.id,'opportunity_revision',o.revision,'plan_revision_id',q.current_plan_revision_id,'plan_revision',q.current_plan_revision,'placement_hint',o.placement_hint,'duration_target_ms',o.duration_target_ms,'script_anchor',o.citation_anchor_json,'media_range',o.media_range_json,'source_revision_id',c.source_revision_id,'source_revision',c.source_revision,'source_link_revision_id',c.workpiece_source_link_revision_id,'source_link_revision',c.workpiece_source_link_revision,'candidate_revision_id',c.id,'candidate_revision',c.revision,'delivery_kind',c.delivery_kind,'asset_id',c.asset_id,'asset_content_hash',c.asset_content_hash,'asset_path',c.asset_path,'storage_bucket',c.storage_bucket,'storage_key',c.storage_key,'mime_type',c.mime_type,'duration_ms',c.duration_ms,'poster_asset_id',c.poster_asset_id,'external_provider',c.external_provider,'external_media_id',c.external_media_id,'external_url',c.external_url,'embed_url',c.embed_url,'start_ms',c.start_ms,'end_ms',c.end_ms,'external_metadata',c.external_metadata_json,'rights',c.rights_evidence_json,'provenance',c.provenance_json)order by m.ordinal,sm.ordinal)from tongs.reference_clip_plan_sequences q join tongs.reference_clip_plan_membership m on m.plan_revision_id=q.current_plan_revision_id join tongs.reference_clip_opportunity_revisions o on o.id=m.opportunity_revision_id and o.source_status='linked' join lateral(select x.* from tongs.reference_clip_selection_set_revisions x where x.workspace_id=q.workspace_id and x.workpiece_id=q.workpiece_id and x.opportunity_id=m.opportunity_id and x.plan_revision_id=q.current_plan_revision_id order by x.revision desc limit 1)ss on true join tongs.reference_clip_selection_set_members sm on sm.selection_set_revision_id=ss.id join tongs.reference_clip_candidate_revisions c on c.id=sm.candidate_revision_id where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id),'[]'::jsonb))end$$;

revoke all on function tongs.commit_youtube_reference_clip_candidate(uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,jsonb,jsonb,jsonb,text,text,uuid)from public,anon;
grant execute on function tongs.commit_youtube_reference_clip_candidate(uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,jsonb,jsonb,jsonb,text,text,uuid)to authenticated,service_role;
revoke all on function tongs.read_reference_clip_visual_package(uuid,uuid)from public,anon;
grant execute on function tongs.read_reference_clip_visual_package(uuid,uuid)to authenticated,service_role;

commit;
