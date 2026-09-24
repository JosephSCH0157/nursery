\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
  ('91000000-0000-4000-8000-000000000001','evidence-claim-editor@example.invalid'),
  ('91000000-0000-4000-8000-000000000002','evidence-claim-outsider@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id)
values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Evidence claim test',(select id from tongs.orgs where personal_owner_user_id='91000000-0000-4000-8000-000000000001'));
insert into tongs.episodes(id,workspace_id,label)
values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Evidence claim episode');
insert into tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,created_by)
values('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',1,'script/script.md',1,repeat('1',64),repeat('2',64),repeat('3',64),'Crude oil is the largest gasoline price component.','test.v1','91000000-0000-4000-8000-000000000001');
insert into tongs.workpiece_script_approval_sequences values('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',1,now());

grant service_role to authenticated;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $test$
declare
  v jsonb; source_rev uuid; link_rev uuid; plan_id uuid; plan_rev bigint;
  stat_opp uuid:='95000000-0000-4000-8000-000000000001';
  timeline_opp uuid:='95000000-0000-4000-8000-000000000002';
  first_revision uuid; replay_revision uuid; readback jsonb;
begin
  v:=tongs.commit_source_revision('92000000-0000-4000-8000-000000000001',null,'claim-source',0,'document','Gasoline components',null,null,null,'https://example.invalid/gasoline',null,null,null,'{}','{}','v1','v1','forge:source:claim-source-op',repeat('a',64),'91000000-0000-4000-8000-000000000001');
  source_rev:=(v#>>'{source_revision,id}')::uuid;
  v:=tongs.commit_workpiece_source_link_revision('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null,0,source_rev,1,'research','94000000-0000-4000-8000-000000000001',1,'{"span_text":"largest gasoline price component"}','{}','{}',repeat('b',64),'Supports the component claim','{}','forge:source:claim-link-op',repeat('b',64),'91000000-0000-4000-8000-000000000001');
  link_rev:=(v#>>'{link_revision,id}')::uuid;
  v:=tongs.commit_reference_visual_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',null,0,'94000000-0000-4000-8000-000000000001','forge.reference-visual.v1',jsonb_build_array(
    jsonb_build_object('opportunity_id',stat_opp,'source_status','unresolved','visual_subtype','stat_card','context_focus','Crude oil is the largest component of gasoline prices.','editorial_reason','Show the sourced share','desired_material','Gasoline component graphic','search_terms','[]'::jsonb,'placement_hint','on claim','duration_target_ms',5000),
    jsonb_build_object('opportunity_id',timeline_opp,'source_status','unresolved','visual_subtype','timeline','context_focus','Gasoline milestones','editorial_reason','Show dated milestones','desired_material','Timeline','search_terms','[]'::jsonb,'placement_hint','after claim','duration_target_ms',5000)
  ),'claim-plan-op',repeat('c',64),'91000000-0000-4000-8000-000000000001');
  plan_id:=(v#>>'{plan_revision,id}')::uuid; plan_rev:=(v#>>'{plan_revision,revision}')::bigint;
  v:=tongs.commit_reference_visual_source_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,jsonb_build_array(jsonb_build_object('source_revision_id',source_rev,'workpiece_source_link_revision_id',link_rev)),plan_id,plan_rev,0,'claim-stat-set',repeat('d',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' then raise exception 'stat source set %',v; end if;
  v:=tongs.commit_reference_visual_source_set('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',timeline_opp,jsonb_build_array(jsonb_build_object('source_revision_id',source_rev,'workpiece_source_link_revision_id',link_rev)),plan_id,plan_rev,0,'claim-timeline-set',repeat('e',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' then raise exception 'timeline source set %',v; end if;

  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000009',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","source_set_member_id":"99999999-9999-4999-8999-999999999999","evidence_role":"primary","origin":"creator_entered","numeric_value":52,"unit":"percent","label":"Stale member","raw_excerpt":"Supported excerpt","citation_anchor":{"exact":"Supported excerpt"},"document_locator":{"kind":"html_text","ordinal":7},"category":"stat_card"}','creator_confirmed','claim-stale-member',repeat('9',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'current_source_set_member_required' then raise exception 'stale source member accepted %',v; end if;

  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000001',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","numeric_value":52,"unit":"percent","label":"Crude oil share","raw_excerpt":"Crude oil accounted for 52 percent of the retail gasoline price.","citation_anchor":{"exact":"Crude oil accounted for 52 percent of the retail gasoline price."},"document_locator":{"kind":"html_text","ordinal":8},"category":"stat_card"}','creator_confirmed','claim-first',repeat('1',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' then raise exception 'first evidence %',v; end if;
  first_revision:=(v->>'canonical_evidence_revision_id')::uuid;
  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000002',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","numeric_value":52,"unit":" PERCENT ","label":"Ignored replay label","raw_excerpt":"  Crude oil accounted for 52 percent of the retail gasoline price.  ","citation_anchor":{"exact":"Crude oil accounted for 52 percent of the retail gasoline price."},"document_locator":{"ordinal":8,"kind":"html_text"},"category":"stat_card"}','creator_confirmed','claim-replay',repeat('2',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'replay' then raise exception 'identical claim did not replay %',v; end if;
  replay_revision:=(v->>'canonical_evidence_revision_id')::uuid;
  if replay_revision<>first_revision or (select count(*) from tongs.reference_visual_evidence_claims where opportunity_id=stat_opp)<>1 then raise exception 'replay changed canonical identity %',v; end if;
  if (select count(*) from tongs.reference_visual_evidence_sequences s join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id where e.opportunity_id=stat_opp)<>1 then raise exception 'replay created duplicate sequence'; end if;

  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000003',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","numeric_value":52,"unit":"percent","label":"Different locator","raw_excerpt":"Crude oil accounted for 52 percent of the retail gasoline price.","citation_anchor":{"exact":"Crude oil accounted for 52 percent of the retail gasoline price."},"document_locator":{"kind":"html_text","ordinal":9},"category":"stat_card"}','creator_confirmed','claim-distinct',repeat('3',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' then raise exception 'different locator collapsed %',v; end if;

  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000004',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","unit":"percent","label":"Missing number","raw_excerpt":"Supported excerpt","citation_anchor":{"exact":"Supported excerpt"},"document_locator":{"kind":"html_text","ordinal":10},"category":"stat_card"}','creator_confirmed','claim-null',repeat('4',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'numeric_stat_value_required' then raise exception 'null numeric accepted %',v; end if;
  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000005',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","numeric_value":52,"label":"Missing unit","raw_excerpt":"Supported excerpt","citation_anchor":{"exact":"Supported excerpt"},"document_locator":{"kind":"html_text","ordinal":11},"category":"stat_card"}','creator_confirmed','claim-unit',repeat('5',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'numeric_stat_unit_required' then raise exception 'missing unit accepted %',v; end if;
  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000006',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","numeric_value":2025,"unit":"year","label":"2025 Annual Report","raw_excerpt":"2025 Annual Report","citation_anchor":{"exact":"2025 Annual Report"},"document_locator":{"kind":"html_text","ordinal":12},"category":"stat_card"}','creator_confirmed','claim-year',repeat('6',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'numeric_stat_date_not_measure' then raise exception 'date-only numeric accepted %',v; end if;
  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',timeline_opp,'96000000-0000-4000-8000-000000000007',0,source_rev,link_rev,'{"evidence_intent":"dated_timeline","evidence_role":"supporting","origin":"creator_entered","label":"September 6, 2024 milestone","raw_excerpt":"The milestone occurred on September 6, 2024.","citation_anchor":{"exact":"The milestone occurred on September 6, 2024."},"document_locator":{"kind":"html_text","ordinal":13},"category":"timeline"}','creator_confirmed','claim-timeline',repeat('7',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' then raise exception 'dated timeline rejected %',v; end if;

  readback:=tongs.read_current_reference_visual_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
  if jsonb_array_length((select x->'evidence' from jsonb_array_elements(readback->'opportunities') x where x#>>'{opportunity_revision,opportunity_id}'=stat_opp::text))<>2 then raise exception 'canonical readback did not return distinct representatives %',readback; end if;
end $test$;

reset role;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
do $isolation$ begin
  if exists(select 1 from tongs.reference_visual_evidence_claims where workspace_id='92000000-0000-4000-8000-000000000001') then raise exception 'cross-workspace claim read leaked'; end if;
  begin
    perform tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000008',0,null,null,'{}','creator_confirmed','claim-outsider',repeat('8',64),'91000000-0000-4000-8000-000000000002');
    raise exception 'cross-workspace mutation succeeded';
  exception when insufficient_privilege then null; end;
end $isolation$;

rollback;
