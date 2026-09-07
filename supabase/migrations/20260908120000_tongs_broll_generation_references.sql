begin;

alter table tongs.assets drop constraint assets_asset_kind_check;
alter table tongs.assets add constraint assets_asset_kind_check check(asset_kind in(
  'thumbnail_image','thumbnail_composite','image_map_json','image_map_candidate_image',
  'broll_candidate_video','broll_candidate_poster','broll_generation_reference',
  'reference_clip_video','reference_clip_poster','reference_visual_image',
  'source_desk_audio','source_desk_video','hammer_audio_master','hammer_video_master'
));
alter table tongs.assets drop constraint assets_kind_shape_check;
alter table tongs.assets add constraint assets_kind_shape_check check(
  (asset_kind in('thumbnail_image','thumbnail_composite','broll_candidate_poster','broll_generation_reference','reference_clip_poster','reference_visual_image') and mime_type like'image/%') or
  (asset_kind='image_map_json' and mime_type='application/json' and prompt is null) or
  (asset_kind='image_map_candidate_image' and mime_type like'image/%' and(prompt is not null or provider='creator_upload')) or
  (asset_kind in('broll_candidate_video','reference_clip_video','source_desk_video','hammer_video_master') and mime_type like'video/%') or
  (asset_kind in('source_desk_audio','hammer_audio_master') and mime_type like'audio/%')
);

create unique index assets_broll_generation_reference_ordinal_idx
on tongs.assets(workspace_id,workpiece_id,operation_id,((metadata_json->>'ordinal')::integer))
where operation_id is not null and asset_kind='broll_generation_reference';

create or replace function tongs.commit_broll_generation_references(
  p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_operation_id text,
  p_operation_fingerprint text,p_references jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.broll_operation_receipts%rowtype; item jsonb; existing tongs.assets%rowtype; committed jsonb:='[]'::jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'B-roll reference commit requires service authority' using errcode='42501'; end if;
  if jsonb_typeof(p_references)<>'array' or jsonb_array_length(p_references) not between 1 and 3 then return jsonb_build_object('disposition','invalid_reference_count'); end if;
  select * into op from tongs.broll_operation_receipts where operation_id=p_operation_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id for update;
  if not found then return jsonb_build_object('disposition','operation_not_found'); end if;
  if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
  for item in select value from jsonb_array_elements(p_references) loop
    if (item->>'ordinal')::integer not between 0 and 2 or item->>'mime_type' not in('image/jpeg','image/png','image/webp') or (item->>'byte_size')::bigint<=0 or item->>'content_hash'!~'^[0-9a-f]{64}$' then
      return jsonb_build_object('disposition','invalid_reference_evidence');
    end if;
    select * into existing from tongs.assets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and operation_id=p_operation_id and asset_kind='broll_generation_reference' and (metadata_json->>'ordinal')::integer=(item->>'ordinal')::integer;
    if found then
      if existing.content_hash<>item->>'content_hash' or existing.storage_key<>item->>'storage_key' then return jsonb_build_object('disposition','reference_replay_conflict'); end if;
    else
      insert into tongs.assets(workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,request_id,created_by,asset_kind,status,metadata_json,operation_id,operation_fingerprint,content_hash,ready_at)
      values(p_workspace_id,p_workpiece_id,item->>'path',item->>'mime_type',(item->>'byte_size')::bigint,item->>'storage_bucket',item->>'storage_key','creator-upload',p_operation_id,p_actor_id,'broll_generation_reference','ready',jsonb_strip_nulls(jsonb_build_object('ordinal',(item->>'ordinal')::integer,'file_name',item->>'file_name','stage_label',item->>'stage_label','beat_id',p_beat_id)),p_operation_id,p_operation_fingerprint,item->>'content_hash',now()) returning * into existing;
    end if;
    committed:=committed||jsonb_build_array(jsonb_build_object('asset_id',existing.id,'ordinal',(item->>'ordinal')::integer,'content_hash',existing.content_hash));
  end loop;
  return jsonb_build_object('disposition','committed','references',committed);
end$$;

revoke all on function tongs.commit_broll_generation_references(uuid,uuid,uuid,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function tongs.commit_broll_generation_references(uuid,uuid,uuid,text,text,jsonb,uuid) to service_role;

commit;
