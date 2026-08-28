\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('71000000-0000-4000-8000-000000000001','asset-authority-editor@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id)
values('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Asset authority test',
  (select id from tongs.orgs where personal_owner_user_id='71000000-0000-4000-8000-000000000001'));
insert into tongs.episodes(id,workspace_id,label) values
 ('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','Asset episode A'),
 ('73000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','Asset episode B');

set local role service_role;
insert into tongs.assets(id,workspace_id,workpiece_id,asset_scope,workspace_reuse_policy,path,mime_type,bytes,storage_bucket,storage_key,provider,created_by,asset_kind,status,width,height,content_hash,ready_at,provenance_classification) values
 ('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','workpiece','not_applicable','assets/visuals/foo.png','image/png',10,'forge-workpieces','workpieces/episode-a/foo-a.png','creator_upload','71000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',100,100,repeat('a',64),now(),'canonical_native'),
 ('74000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','workpiece','not_applicable','assets/visuals/foo.png','image/png',11,'forge-workpieces','workpieces/episode-a/foo-b.png','creator_upload','71000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',100,100,repeat('b',64),now(),'canonical_native'),
 ('74000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001',null,'workspace','allowed','assets/global/logo.png','image/png',12,'forge-workpieces','workspaces/asset-test/logo.png','creator_upload','71000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',100,100,repeat('c',64),now(),'canonical_native'),
 ('74000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000001',null,'workspace','restricted','assets/global/restricted.png','image/png',13,'forge-workpieces','workspaces/asset-test/restricted.png','creator_upload','71000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',100,100,repeat('d',64),now(),'canonical_native');

insert into tongs.asset_legacy_reference_evidence(id,workspace_id,expected_workpiece_id,source_surface,source_record_key,path_assertion,created_by)
values('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','hammer.visuals','path-only','assets/visuals/foo.png','71000000-0000-4000-8000-000000000001');
insert into tongs.asset_legacy_reference_evidence(id,workspace_id,expected_workpiece_id,source_surface,source_record_key,path_assertion,content_hash_assertion,created_by)
values('75000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','hammer.visuals','exact-hash','assets/visuals/foo.png',repeat('a',64),'71000000-0000-4000-8000-000000000001');

set local request.jwt.claims='{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $proof$
declare v jsonb;
begin
  v:=tongs.resolve_canonical_asset_authority('72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','image_map_candidate_image',repeat('a',64),'forge-workpieces','workpieces/episode-a/foo-a.png','assets/visuals/foo.png');
  if v->>'state'<>'ready' or v->>'canonical_asset_id'<>'74000000-0000-4000-8000-000000000001' then raise exception 'exact asset did not resolve %',v; end if;
  v:=tongs.resolve_canonical_asset_authority('72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002');
  if v->>'code'<>'canonical_asset_workpiece_mismatch' then raise exception 'cross-workpiece asset resolved %',v; end if;
  v:=tongs.resolve_canonical_asset_authority('72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000002');
  if v->>'state'<>'ready' then raise exception 'allowed workspace asset did not resolve %',v; end if;
  v:=tongs.resolve_canonical_asset_authority('72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000002');
  if v->>'code'<>'canonical_asset_workspace_reuse_not_allowed' then raise exception 'restricted workspace asset resolved %',v; end if;
  v:=tongs.resolve_canonical_asset_authority('72000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001',null,null,repeat('b',64));
  if v->>'code'<>'canonical_asset_hash_mismatch' then raise exception 'wrong hash validated %',v; end if;
  update tongs.assets set content_hash=repeat('f',64) where id='74000000-0000-4000-8000-000000000001';
  if exists(select 1 from tongs.assets where id='74000000-0000-4000-8000-000000000001' and content_hash=repeat('f',64)) then
    raise exception 'authenticated asset mutation was permitted';
  end if;
end
$proof$;

set local request.jwt.claims='{"sub":"71000000-0000-4000-8000-000000000001","role":"service_role"}';
set local role service_role;
do $legacy$
declare v jsonb; n bigint;
begin
  v:=tongs.resolve_legacy_asset_reference_exact('75000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'asset_relationship_unverified' then raise exception 'path-only evidence resolved %',v; end if;
  v:=tongs.resolve_legacy_asset_reference_exact('75000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'legacy_resolved' then raise exception 'exact legacy evidence did not resolve %',v; end if;
  select count(*) into n from tongs.canonical_asset_ambiguous_evidence_report where workspace_id='72000000-0000-4000-8000-000000000001' and ambiguity_kind='same_path_different_content';
  if n<>1 then raise exception 'same-path different-hash ambiguity was not reported'; end if;
  begin
    update tongs.assets set content_hash=repeat('f',64) where id='74000000-0000-4000-8000-000000000001';
    raise exception 'ready canonical evidence mutated';
  exception when sqlstate '55000' then null;
  end;
end
$legacy$;

rollback;
