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

  v:=tongs.reset_reference_visual_evidence(
    '92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,
    (select opportunity_revision_id from tongs.reference_visual_plan_membership where plan_revision_id=plan_id and opportunity_id=stat_opp),1,
    '97000000-0000-4000-8000-000000000001','claim-reset',repeat('8',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'committed' or v->>'replay'<>'false' then raise exception 'reset failed %',v; end if;
  if (select count(*) from tongs.reference_visual_evidence_resets where opportunity_id=stat_opp)<>1
    or (select count(*) from tongs.reference_visual_evidence_claims where opportunity_id=stat_opp)<>2
    or (select count(*) from tongs.reference_visual_evidence_sequences s join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id where e.opportunity_id=stat_opp)<>2
    then raise exception 'reset rewrote historical evidence authority'; end if;
  readback:=tongs.read_current_reference_visual_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
  if jsonb_array_length((select x->'evidence' from jsonb_array_elements(readback->'opportunities') x where x#>>'{opportunity_revision,opportunity_id}'=stat_opp::text))<>0
    or jsonb_array_length((select x->'sources' from jsonb_array_elements(readback->'opportunities') x where x#>>'{opportunity_revision,opportunity_id}'=stat_opp::text))<>1
    then raise exception 'reset readback did not clear evidence and preserve Sources %',readback; end if;
  v:=tongs.reset_reference_visual_evidence(
    '92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,
    (select opportunity_revision_id from tongs.reference_visual_plan_membership where plan_revision_id=plan_id and opportunity_id=stat_opp),1,
    '97000000-0000-4000-8000-000000000001','claim-reset',repeat('8',64),'91000000-0000-4000-8000-000000000001');
  if v->>'replay'<>'true' or (select count(*) from tongs.reference_visual_evidence_resets where opportunity_id=stat_opp)<>1 then raise exception 'reset replay duplicated history %',v; end if;

  v:=tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',stat_opp,'96000000-0000-4000-8000-000000000008',0,source_rev,link_rev,'{"evidence_intent":"numeric_stat","evidence_role":"primary","origin":"creator_entered","numeric_value":52,"unit":"percent","label":"Reactivated label","raw_excerpt":"Crude oil accounted for 52 percent of the retail gasoline price.","citation_anchor":{"exact":"Crude oil accounted for 52 percent of the retail gasoline price."},"document_locator":{"kind":"html_text","ordinal":8},"category":"stat_card"}','creator_confirmed','claim-reactivate',repeat('f',64),'91000000-0000-4000-8000-000000000001');
  if v->>'disposition'<>'replay' or (v->>'canonical_evidence_revision_id')::uuid<>first_revision
    or (select count(*) from tongs.reference_visual_evidence_claims where opportunity_id=stat_opp)<>2
    or (select count(*) from tongs.reference_visual_evidence_claim_activations where opportunity_id=stat_opp)<>1
    then raise exception 'identical post-reset claim did not reactivate canonical identity %',v; end if;
  readback:=tongs.read_current_reference_visual_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
  if jsonb_array_length((select x->'evidence' from jsonb_array_elements(readback->'opportunities') x where x#>>'{opportunity_revision,opportunity_id}'=stat_opp::text))<>1 then raise exception 'reactivated claim absent from readback %',readback; end if;
end $test$;

do $dependent_setup$
declare v jsonb;source_rev uuid;link_rev uuid;plan_id uuid;plan_rev bigint;opp_rev uuid;evidence_rev uuid;recipe_rev uuid;source_use_rev uuid;
begin
 select current_plan_revision_id,current_plan_revision into plan_id,plan_rev from tongs.reference_visual_plan_sequences where workspace_id='92000000-0000-4000-8000-000000000001'and workpiece_id='93000000-0000-4000-8000-000000000001';
 select m.opportunity_revision_id into opp_rev from tongs.reference_visual_plan_membership m where m.plan_revision_id=plan_id and m.opportunity_id='95000000-0000-4000-8000-000000000002';
 select e.source_revision_id,e.workpiece_source_link_revision_id,e.id into source_rev,link_rev,evidence_rev from tongs.reference_visual_evidence_sequences s join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id where e.opportunity_id='95000000-0000-4000-8000-000000000002';
 v:=tongs.commit_reference_visual_source_use('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','97500000-0000-4000-8000-000000000001',0,opp_rev,source_rev,link_rev,'facts_data_only',true,'Preserve this authority across reset','{}','claim-source-use',repeat('a',64),'91000000-0000-4000-8000-000000000001');source_use_rev:=(v#>>'{source_use_revision,id}')::uuid;if source_use_rev is null then raise exception 'source use setup %',v;end if;
 v:=tongs.commit_reference_visual_rights_declaration('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','97600000-0000-4000-8000-000000000001',0,'creator_owned','{"creator_acknowledged_responsibility":true}','claim-rights',repeat('b',64),'91000000-0000-4000-8000-000000000001');if v#>>'{rights_declaration_revision,id}' is null then raise exception 'rights setup %',v;end if;
 v:=tongs.commit_reference_visual_recipe('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','97700000-0000-4000-8000-000000000001',0,'creator_edited','timeline','Gasoline milestone',null,'{"layout":"timeline"}',array[evidence_rev],'','16:9','Gasoline milestone timeline','{}','{}','{}','forge_timeline_v3','claim-recipe',repeat('c',64),'91000000-0000-4000-8000-000000000001');recipe_rev:=(v#>>'{recipe_revision,id}')::uuid;if recipe_rev is null then raise exception 'recipe setup %',v;end if;
 v:=tongs.begin_reference_visual_render_v2('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',opp_rev,recipe_rev,source_use_rev,null,'forge_timeline_v3','3','claim-render',repeat('d',64),'91000000-0000-4000-8000-000000000001');if v->>'disposition'<>'reserved'then raise exception 'render setup %',v;end if;
end $dependent_setup$;

reset role;set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"service_role"}';set local role service_role;
do $dependent_render$ declare v jsonb;begin v:=tongs.commit_reference_visual_render('claim-render',repeat('d',64),'assets/reference-visual/timeline.png','image/png',1024,repeat('e',64),'forge-workpieces','reference-visual/timeline.png',1920,1080,'{"canonical_svg_hash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}');if v->>'disposition'<>'committed'then raise exception 'render commit setup %',v;end if;end $dependent_render$;

set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';set local role authenticated;
do $dependent_reset$
declare v jsonb;readback jsonb;opp jsonb;plan_id uuid;plan_rev bigint;opp_rev uuid;opp_revision bigint;candidate uuid;reset_id uuid;evidence_count bigint;sequence_count bigint;claim_count bigint;duplicate_count bigint;recipe_count bigint;candidate_count bigint;selection_count bigint;
begin
 select current_plan_revision_id,current_plan_revision into plan_id,plan_rev from tongs.reference_visual_plan_sequences where workspace_id='92000000-0000-4000-8000-000000000001'and workpiece_id='93000000-0000-4000-8000-000000000001';
 select m.opportunity_revision_id,o.revision into opp_rev,opp_revision from tongs.reference_visual_plan_membership m join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id where m.plan_revision_id=plan_id and m.opportunity_id='95000000-0000-4000-8000-000000000002';
 select id into candidate from tongs.reference_visual_candidate_revisions where opportunity_id='95000000-0000-4000-8000-000000000002';
 v:=tongs.select_reference_visual_candidate('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002',candidate,plan_id,plan_rev,0,'claim-select',repeat('f',64),'91000000-0000-4000-8000-000000000001');if v#>>'{selection,id}' is null then raise exception 'selection setup %',v;end if;
 select count(*)into evidence_count from tongs.reference_visual_evidence_revisions where opportunity_id='95000000-0000-4000-8000-000000000002';select count(*)into sequence_count from tongs.reference_visual_evidence_sequences s join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id where e.opportunity_id='95000000-0000-4000-8000-000000000002';select count(*)into claim_count from tongs.reference_visual_evidence_claims where opportunity_id='95000000-0000-4000-8000-000000000002';select count(*)into duplicate_count from tongs.reference_visual_evidence_duplicate_reconciliations where opportunity_id='95000000-0000-4000-8000-000000000002';select count(*)into recipe_count from tongs.reference_visual_recipe_revisions where opportunity_id='95000000-0000-4000-8000-000000000002';select count(*)into candidate_count from tongs.reference_visual_candidate_revisions where opportunity_id='95000000-0000-4000-8000-000000000002';select count(*)into selection_count from tongs.reference_visual_selections where opportunity_id='95000000-0000-4000-8000-000000000002';
 v:=tongs.reset_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002',opp_rev,opp_revision,'97800000-0000-4000-8000-000000000001','claim-dependent-reset',repeat('0',64),'91000000-0000-4000-8000-000000000001');reset_id:=(v->>'reset_id')::uuid;if v->>'replay'<>'false'then raise exception 'dependent reset %',v;end if;
 readback:=tongs.read_current_reference_visual_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');select x into opp from jsonb_array_elements(readback->'opportunities')x where x#>>'{opportunity_revision,opportunity_id}'='95000000-0000-4000-8000-000000000002';
 if jsonb_array_length(opp->'evidence')<>0 or opp->'recipe'<>'null'::jsonb or jsonb_array_length(opp->'candidates')<>0 or opp->'selection'<>'null'::jsonb then raise exception 'reset left dependent state current %',opp;end if;
 if jsonb_array_length(opp->'sources')<>1 or opp->'source_use'='null'::jsonb or opp->'rights_declaration'='null'::jsonb then raise exception 'reset cleared preserved authority %',opp;end if;
 if evidence_count<>(select count(*)from tongs.reference_visual_evidence_revisions where opportunity_id='95000000-0000-4000-8000-000000000002')or sequence_count<>(select count(*)from tongs.reference_visual_evidence_sequences s join tongs.reference_visual_evidence_revisions e on e.id=s.current_evidence_revision_id where e.opportunity_id='95000000-0000-4000-8000-000000000002')or claim_count<>(select count(*)from tongs.reference_visual_evidence_claims where opportunity_id='95000000-0000-4000-8000-000000000002')or duplicate_count<>(select count(*)from tongs.reference_visual_evidence_duplicate_reconciliations where opportunity_id='95000000-0000-4000-8000-000000000002')or recipe_count<>(select count(*)from tongs.reference_visual_recipe_revisions where opportunity_id='95000000-0000-4000-8000-000000000002')or candidate_count<>(select count(*)from tongs.reference_visual_candidate_revisions where opportunity_id='95000000-0000-4000-8000-000000000002')or selection_count<>(select count(*)from tongs.reference_visual_selections where opportunity_id='95000000-0000-4000-8000-000000000002')then raise exception 'reset mutated history';end if;
 v:=tongs.reset_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002',opp_rev,opp_revision,'97800000-0000-4000-8000-000000000001','claim-dependent-reset',repeat('0',64),'91000000-0000-4000-8000-000000000001');if(v->>'reset_id')::uuid<>reset_id or v->>'replay'<>'true'then raise exception 'dependent reset replay %',v;end if;
end $dependent_reset$;

reset role;
set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
do $isolation$ begin
  if exists(select 1 from tongs.reference_visual_evidence_claims where workspace_id='92000000-0000-4000-8000-000000000001') then raise exception 'cross-workspace claim read leaked'; end if;
  if exists(select 1 from tongs.reference_visual_evidence_claim_activations where workspace_id='92000000-0000-4000-8000-000000000001') then raise exception 'cross-workspace activation read leaked'; end if;
  begin
    perform tongs.commit_reference_visual_evidence('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000008',0,null,null,'{}','creator_confirmed','claim-outsider',repeat('8',64),'91000000-0000-4000-8000-000000000002');
    raise exception 'cross-workspace mutation succeeded';
  exception when insufficient_privilege then null; end;
end $isolation$;

rollback;
