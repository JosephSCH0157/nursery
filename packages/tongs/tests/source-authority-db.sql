\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('61000000-0000-4000-8000-000000000001','source-editor@example.invalid'),
 ('61000000-0000-4000-8000-000000000002','source-viewer@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id)
values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Source authority test',(select id from tongs.orgs where personal_owner_user_id='61000000-0000-4000-8000-000000000001'));
insert into tongs.episodes(id,workspace_id,label)
values('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','Source authority episode');
insert into tongs.workspace_members(workspace_id,user_id,role,created_by)
values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','viewer','61000000-0000-4000-8000-000000000001');
insert into tongs.assets(id,workspace_id,workpiece_id,path,mime_type,bytes,storage_bucket,storage_key,provider,prompt,created_by,asset_kind,status,width,height,content_hash,ready_at)
values('64000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','assets/sources/report.png','image/png',128,'forge-workpieces','workspaces/source-test/report.png','creator-upload','source document','61000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',100,100,repeat('8',64),now());
grant service_role to authenticated;
set local request.jwt.claims='{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $test$
declare v jsonb; v_source uuid; v_rev1 uuid; v_rev2 uuid; v_link uuid; v_link_rev uuid; v_count bigint;
begin
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',null,'gao-orange-report',0,'report','Florida Citrus Production','Analyst','GAO',null,
  'https://example.invalid/gao-orange-report',null,null,null,'{}','{"origin":"creator_entry"}','forge.source.metadata.v1','forge.source.provenance.v1',
  'forge:source:revision-replay-0001',repeat('a',64),'61000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'committed' then raise exception 'source commit failed %',v; end if;
 v_source:=(v#>>'{source,id}')::uuid; v_rev1:=(v#>>'{source_revision,id}')::uuid;
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',null,'ignored-on-replay',99,'other','ignored',null,null,null,'https://ignored.invalid',null,null,null,'{}','{}','ignored','ignored',
  'forge:source:revision-replay-0001',repeat('a',64),'61000000-0000-4000-8000-000000000001');
 if (v#>>'{source_revision,id}')::uuid<>v_rev1 then raise exception 'source replay identity changed %',v; end if;
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',v_source,'gao-orange-report',0,'report','stale',null,null,null,'https://example.invalid/stale',null,null,null,'{}','{}','forge.source.metadata.v1','forge.source.provenance.v1',
  'forge:source:revision-stale-0002',repeat('b',64),'61000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'source_revision_conflict' then raise exception 'stale source revision advanced %',v; end if;
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',v_source,'gao-orange-report',1,'report','Florida Citrus Production, corrected','Analyst','GAO',null,
  'https://example.invalid/gao-orange-report',null,null,null,'{}','{"origin":"creator_edit"}','forge.source.metadata.v1','forge.source.provenance.v1',
  'forge:source:revision-next-0003',repeat('c',64),'61000000-0000-4000-8000-000000000001');
 if (v#>>'{source_revision,revision}')::bigint<>2 then raise exception 'source revision did not advance %',v; end if;
 v_rev2:=(v#>>'{source_revision,id}')::uuid;
 v:=tongs.commit_workpiece_source_link_revision(
  '62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',null,0,v_rev1,1,'script_citation',null,null,
  '{"kind":"range","start":10,"end":42}','{"page":12}','{}',repeat('d',64),'Supports the citrus production claim','{"authority":"creator"}',
  'forge:source:link-replay-0004',repeat('d',64),'61000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'committed' then raise exception 'source link failed %',v; end if;
 v_link:=(v#>>'{link_revision,link_id}')::uuid; v_link_rev:=(v#>>'{link_revision,id}')::uuid;
 if (v#>>'{source_revision,id}')::uuid<>v_rev1 then raise exception 'link did not preserve cited historical source revision'; end if;
 v:=tongs.commit_workpiece_source_link_revision(
  '62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',null,0,v_rev2,2,'ignored',null,null,'{}','{}','{}',null,null,'{}',
  'forge:source:link-replay-0004',repeat('d',64),'61000000-0000-4000-8000-000000000001');
 if (v#>>'{link_revision,id}')::uuid<>v_link_rev then raise exception 'link replay identity changed %',v; end if;
 v:=tongs.read_workpiece_sources('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001');
 if (v#>>'{links,0,source_revision,id}')::uuid<>v_rev1 or v#>>'{links,0,link_revision,citation_anchor_json,kind}'<>'range' then raise exception 'workpiece readback lost exact citation evidence %',v; end if;
 v:=tongs.read_current_source('62000000-0000-4000-8000-000000000001',v_source);
 if (v#>>'{source_revision,id}')::uuid<>v_rev2 then raise exception 'current source readback was stale %',v; end if;
 v:=tongs.adopt_legacy_source(
  '62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','legacy-1','sources/legacy-1.json',4,repeat('e',64),
  'script/script.sources.json',7,repeat('f',64),'webpage','Legacy Source',null,'Example',null,'https://example.invalid/legacy',null,'research_reference',null,null,
  '{"kind":"token","token":"src:legacy-1"}','{}','{}',null,'Adopted current legacy state','forge:source:legacy-adopt-0005',repeat('1',64),'61000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'committed' or v->>'adoption'<>'legacy_current_state' then raise exception 'legacy adoption failed %',v; end if;
 v_rev1:=(v#>>'{source_revision,id}')::uuid;
 v:=tongs.adopt_legacy_source(
  '62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','ignored','ignored',99,repeat('0',64),'ignored',99,repeat('0',64),'other','ignored',null,null,null,'https://ignored.invalid',null,'ignored',null,null,'{}','{}','{}',null,null,
  'forge:source:legacy-adopt-0005',repeat('1',64),'61000000-0000-4000-8000-000000000001');
 if (v#>>'{source_revision,id}')::uuid<>v_rev1 then raise exception 'legacy adoption replay changed identity %',v; end if;
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',null,'uploaded-report',0,'report','Uploaded Report',null,null,null,null,null,'64000000-0000-4000-8000-000000000001',repeat('7',64),'{}','{}','forge.source.metadata.v1','forge.source.provenance.v1',
  'forge:source:asset-hash-reject-0006',repeat('2',64),'61000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'canonical_asset_hash_conflict' then raise exception 'wrong canonical asset hash was accepted %',v; end if;
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',null,'uploaded-report',0,'report','Uploaded Report',null,null,null,null,null,'64000000-0000-4000-8000-000000000001',repeat('8',64),'{}','{}','forge.source.metadata.v1','forge.source.provenance.v1',
  'forge:source:asset-commit-0007',repeat('3',64),'61000000-0000-4000-8000-000000000001');
 if (v#>>'{source_revision,canonical_asset_revision_id}')::uuid<>'64000000-0000-4000-8000-000000000001' or v#>>'{source_revision,canonical_asset_content_hash}'<>repeat('8',64) then raise exception 'canonical asset byte identity was not retained %',v; end if;
 select count(*) into v_count from tongs.source_revisions where workspace_id='62000000-0000-4000-8000-000000000001';
 if v_count<>4 then raise exception 'replay duplicated source revisions %',v_count; end if;
 v:=tongs.commit_source_revision(
  '62000000-0000-4000-8000-000000000001',v_source,'gao-orange-report',2,'report','conflict',null,null,null,'https://example.invalid/conflict',null,null,null,'{}','{}','forge.source.metadata.v1','forge.source.provenance.v1',
  'forge:source:revision-replay-0001',repeat('9',64),'61000000-0000-4000-8000-000000000001');
 if v->>'disposition'<>'operation_identity_conflict' then raise exception 'conflicting operation fingerprint was accepted %',v; end if;
 if exists(select 1 from information_schema.role_table_grants where grantee='authenticated' and table_schema='tongs' and table_name in('sources','source_revisions','workpiece_source_link_revisions') and privilege_type in('INSERT','UPDATE','DELETE')) then raise exception 'direct Source writes leaked'; end if;
end $test$;

reset role;
revoke service_role from authenticated;
set local request.jwt.claims='{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
do $viewer$
declare v jsonb;
begin
 v:=tongs.read_workpiece_sources('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001');
 if jsonb_array_length(v->'links')<1 then raise exception 'viewer could not read Source links'; end if;
 begin
  perform tongs.commit_source_revision('62000000-0000-4000-8000-000000000001',null,'viewer',0,'other','Viewer',null,null,null,'https://example.invalid/viewer',null,null,null,'{}','{}','forge.source.metadata.v1','forge.source.provenance.v1','forge:source:viewer-denied-0006',repeat('6',64),'61000000-0000-4000-8000-000000000002');
  raise exception 'viewer mutation unexpectedly succeeded';
 exception when insufficient_privilege then null;
 end;
 v:=tongs.read_workpiece_sources('62000000-0000-4000-8000-000000000099','63000000-0000-4000-8000-000000000001');
 if v is not null then raise exception 'cross-workspace Source state leaked'; end if;
end $viewer$;

rollback;
