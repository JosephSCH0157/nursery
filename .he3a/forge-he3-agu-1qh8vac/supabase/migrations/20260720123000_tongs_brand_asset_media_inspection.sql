-- Canonical media inspection for self-contained brand video assets.
alter table tongs.brand_asset_revisions
  add column if not exists has_audio boolean null;

drop function if exists tongs.finalize_brand_asset_revision(uuid,uuid,text,text,bigint,int,int,bigint);

create or replace function tongs.finalize_brand_asset_revision(
  p_workspace_id uuid,
  p_revision_id uuid,
  p_operation_id text,
  p_content_hash text,
  p_bytes bigint,
  p_width int default null,
  p_height int default null,
  p_duration_ms bigint default null,
  p_has_audio boolean default null
) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_row tongs.brand_asset_revisions%rowtype;
begin
  perform tongs.assert_workspace_role(p_workspace_id,'editor');
  select * into v_row from tongs.brand_asset_revisions where id=p_revision_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'asset revision not found' using errcode='P0002'; end if;
  if v_row.operation_id<>p_operation_id then raise exception 'operation identity mismatch' using errcode='22023'; end if;
  if v_row.state='ready' then
    if v_row.content_hash<>p_content_hash or v_row.bytes<>p_bytes then raise exception 'ready asset readback mismatch' using errcode='22023'; end if;
    return to_jsonb(v_row);
  end if;
  if p_content_hash!~'^[a-f0-9]{64}$' or p_bytes<=0 then raise exception 'verified hash and bytes are required' using errcode='22023'; end if;
  if v_row.role in ('video_intro','video_outro') and (p_width is null or p_height is null or p_duration_ms is null or p_has_audio is null) then
    raise exception 'canonical video inspection is required before finalization' using errcode='22023';
  end if;
  perform set_config('tongs.brand_controlled_transition','on',true);
  update tongs.brand_asset_revisions set state='ready',content_hash=p_content_hash,bytes=p_bytes,width=p_width,height=p_height,duration_ms=p_duration_ms,has_audio=p_has_audio,ready_at=now(),failure_message=null where id=p_revision_id;
  perform set_config('tongs.brand_controlled_transition','off',true);
  return (select to_jsonb(ar) from tongs.brand_asset_revisions ar where ar.id=p_revision_id);
end $$;

revoke all on function tongs.finalize_brand_asset_revision(uuid,uuid,text,text,bigint,int,int,bigint,boolean) from public;
grant execute on function tongs.finalize_brand_asset_revision(uuid,uuid,text,text,bigint,int,int,bigint,boolean) to authenticated,service_role;

comment on column tongs.brand_asset_revisions.has_audio is
  'True/false only after canonical server inspection; null means not canonically inspected.';

create or replace function tongs.get_brand_asset_revision_for_inspection(
  p_revision_id uuid
) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_row tongs.brand_asset_revisions%rowtype;
begin
  select * into v_row from tongs.brand_asset_revisions where id=p_revision_id;
  if not found then raise exception 'asset revision not found' using errcode='P0002'; end if;
  perform tongs.assert_workspace_role(v_row.workspace_id,'editor');
  return to_jsonb(v_row);
end $$;

revoke all on function tongs.get_brand_asset_revision_for_inspection(uuid) from public;
grant execute on function tongs.get_brand_asset_revision_for_inspection(uuid) to authenticated,service_role;
