begin;

alter table tongs.assets
  drop constraint assets_asset_kind_check,
  add constraint assets_asset_kind_check check(asset_kind in(
    'thumbnail_image','thumbnail_composite','image_map_json','image_map_candidate_image',
    'broll_candidate_video','broll_candidate_poster','reference_clip_video',
    'reference_clip_poster','reference_visual_image','source_desk_audio','source_desk_video'
  ));

alter table tongs.assets
  drop constraint assets_kind_shape_check,
  add constraint assets_kind_shape_check check(
    (asset_kind in('thumbnail_image','thumbnail_composite','broll_candidate_poster','reference_clip_poster','reference_visual_image') and mime_type like 'image/%')
    or (asset_kind='image_map_json' and mime_type='application/json' and prompt is null)
    or (asset_kind='image_map_candidate_image' and mime_type like 'image/%' and (prompt is not null or provider='creator_upload'))
    or (asset_kind in('broll_candidate_video','reference_clip_video','source_desk_video') and mime_type like 'video/%')
    or (asset_kind='source_desk_audio' and mime_type like 'audio/%')
  );

alter table tongs.assets
  add constraint assets_source_desk_duration_check check(
    asset_kind not in('source_desk_audio','source_desk_video')
    or (
      status <> 'ready'
      or (
        jsonb_typeof(metadata_json->'duration_ms')='number'
        and (metadata_json->>'duration_ms')::bigint > 0
      )
    )
  );

create index assets_source_desk_workpiece_ready_idx
  on tongs.assets(workpiece_id,asset_kind,created_at desc)
  where status='ready' and asset_kind in('source_desk_audio','source_desk_video');

alter table tongs.assets enable row level security;
revoke insert,update,delete on tongs.assets from authenticated;
grant select on tongs.assets to authenticated;

create or replace function tongs.register_source_desk_timed_asset(
  p_workspace_id uuid,p_workpiece_id uuid,p_path text,p_mime_type text,p_bytes bigint,
  p_storage_bucket text,p_storage_key text,p_content_hash text,p_duration_ms bigint,
  p_width integer,p_height integer,p_operation_id text,p_actor_id uuid,p_source_asset_id uuid default null
) returns tongs.assets
language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_kind text; v_asset tongs.assets%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Source Desk asset registration requires service authority' using errcode='42501'; end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'Workpiece identity mismatch' using errcode='22023'; end if;
  v_kind:=case when p_mime_type like 'audio/%' then 'source_desk_audio' when p_mime_type like 'video/%' then 'source_desk_video' else null end;
  if v_kind is null or p_duration_ms<=0 or p_bytes<=0 or p_content_hash!~'^[0-9a-f]{64}$' then raise exception 'Invalid verified timed-media evidence' using errcode='22023'; end if;
  insert into tongs.assets(workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,request_id,
    created_by,asset_kind,status,metadata_json,width,height,operation_id,operation_fingerprint,content_hash,ready_at)
  values(p_workspace_id,p_workpiece_id,p_path,p_mime_type,p_bytes,p_storage_bucket,p_storage_key,'creator-upload',p_operation_id,
    p_actor_id,v_kind,'ready',jsonb_strip_nulls(jsonb_build_object('duration_ms',p_duration_ms,'inspection_authority','tongs-service.v1','source_asset_id',p_source_asset_id)),
    p_width,p_height,p_operation_id,p_content_hash,p_content_hash,now())
  on conflict(storage_bucket,storage_key) do update set
    path=excluded.path,mime_type=excluded.mime_type,bytes=excluded.bytes,asset_kind=excluded.asset_kind,status='ready',
    metadata_json=excluded.metadata_json,width=excluded.width,height=excluded.height,operation_id=excluded.operation_id,
    operation_fingerprint=excluded.operation_fingerprint,content_hash=excluded.content_hash,ready_at=excluded.ready_at
  returning * into v_asset;
  return v_asset;
end $$;

revoke all on function tongs.register_source_desk_timed_asset(uuid,uuid,text,text,bigint,text,text,text,bigint,integer,integer,text,uuid,uuid) from public,authenticated;
grant execute on function tongs.register_source_desk_timed_asset(uuid,uuid,text,text,bigint,text,text,text,bigint,integer,integer,text,uuid,uuid) to service_role;

commit;
