\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
 ('92000000-0000-4000-8000-000000000001','topic-editor@example.invalid'),
 ('92000000-0000-4000-8000-000000000002','topic-viewer@example.invalid');
insert into tongs.workspaces(id,created_by,name,org_id)
values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Topic discovery test',(select id from tongs.orgs where personal_owner_user_id='92000000-0000-4000-8000-000000000001'));
insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','editor','92000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002','viewer','92000000-0000-4000-8000-000000000001')
on conflict(workspace_id,user_id) do update set role=excluded.role;

set local request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
do $permissions$
declare v jsonb;
begin
 if has_table_privilege('authenticated','tongs.barstock_discovery_runs','select') then raise exception 'authenticated received direct discovery table access';end if;
 v:=tongs.get_my_barstock_discovery_context('93000000-0000-4000-8000-000000000001');
 if v->>'outcome'<>'found' then raise exception 'viewer could not read context: %',v;end if;
 v:=tongs.set_my_barstock_discovery_preferences('93000000-0000-4000-8000-000000000001',0,'Technology','{}','',null,null,true,true);
 if v->>'outcome'<>'denied' then raise exception 'viewer mutated preferences: %',v;end if;
end
$permissions$;

reset role;
set local request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $claim$
declare v jsonb;
begin
 v:=tongs.set_my_barstock_discovery_preferences('93000000-0000-4000-8000-000000000001',0,'Technology',array['privacy'],'Creator technology','English','United States',true,true);
 if v->>'outcome'<>'saved' then raise exception 'preference setup failed: %',v;end if;
 v:=tongs.claim_barstock_discovery_refresh('93000000-0000-4000-8000-000000000001',1,'manual','topic-run-primary','lease-primary');
 if v->>'outcome'<>'claimed' then raise exception 'initial claim failed: %',v;end if;
end
$claim$;

reset role;
set local request.jwt.claims='{"role":"service_role"}';
set local role service_role;
do $complete$
declare v jsonb; run_id uuid;
begin
 select id into run_id from tongs.barstock_discovery_runs where operation_key='topic-run-primary';
 v:=tongs.record_barstock_discovery_provider_call(run_id,'lease-primary','brave','query-1');
 if v->>'outcome'<>'recorded' then raise exception 'provider call was not recorded: %',v;end if;
 v:=tongs.complete_barstock_discovery_refresh(run_id,'lease-primary',jsonb_build_array(jsonb_build_object(
   'fingerprint','story-fingerprint-1','headline','A current technology event','summary','A sourced account of the event.','suggested_angle','What does this change for creators?','timeliness_reason','Reported during the current review window.','evidence_class','limited','contradiction_state','none','sources',jsonb_build_array(jsonb_build_object(
   'original_url','https://example.invalid/story','canonical_url','https://example.invalid/story','title','Primary story','publisher','Example','published_at',now(),'retrieved_at',now(),'supporting_excerpt','Supporting evidence.','excerpt_hash',repeat('a',64),'extraction_status','complete','authority_class','reputable_secondary','syndication_cluster','cluster-1'))
 )),jsonb_build_object('provider','brave','customer_credit_debit',false));
 if v->>'outcome'<>'completed' then raise exception 'completion failed: %',v;end if;
end
$complete$;

reset role;
set local request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $accept_and_budget$
declare v jsonb; revision_id uuid; spark_id uuid; workpiece_id uuid;
begin
 v:=tongs.get_my_barstock_discovery_context('93000000-0000-4000-8000-000000000001');
 revision_id:=(v#>>'{stories,0,revision,id}')::uuid;
 v:=tongs.accept_barstock_discovery_story('93000000-0000-4000-8000-000000000001',revision_id,'accept-topic-story-0001');
 if v->>'outcome'<>'created' then raise exception 'acceptance failed: %',v;end if;
 spark_id:=(v->>'spark_id')::uuid; workpiece_id:=(v->>'workpiece_id')::uuid;
 v:=tongs.accept_barstock_discovery_story('93000000-0000-4000-8000-000000000001',revision_id,'accept-topic-story-0001');
 if v->>'outcome'<>'existing' or (v->>'spark_id')::uuid<>spark_id or (v->>'workpiece_id')::uuid<>workpiece_id then raise exception 'acceptance replay changed identity: %',v;end if;
 v:=tongs.claim_barstock_discovery_refresh('93000000-0000-4000-8000-000000000001',1,'manual','topic-run-budget-block','lease-budget');
 if v->>'outcome'<>'budget_blocked' then raise exception 'rolling six-hour budget was bypassed: %',v;end if;
end
$accept_and_budget$;

reset role;
do $acceptance_storage$
declare a tongs.barstock_discovery_acceptances%rowtype;
begin
 select * into a from tongs.barstock_discovery_acceptances where operation_key='accept-topic-story-0001';
 if (select count(*) from tongs.barstock_sparks where id=a.spark_id)<>1 or (select count(*) from tongs.episodes where id=a.workpiece_id)<>1 then raise exception 'acceptance did not create exactly one Spark and Episode';end if;
 if (select count(*) from tongs.workpiece_source_link_revisions where workpiece_id=a.workpiece_id)<>1 then raise exception 'accepted evidence was not preserved';end if;
end
$acceptance_storage$;
-- Isolate lease recovery from the completed paid run while retaining the same authority contract.
update tongs.barstock_discovery_runs set first_provider_call_at=now()-interval '7 hours' where operation_key='topic-run-primary';
set local request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select tongs.claim_barstock_discovery_refresh('93000000-0000-4000-8000-000000000001',1,'manual','topic-run-recovery','lease-old');
reset role;
update tongs.barstock_discovery_runs set lease_expires_at=now()-interval '1 minute' where operation_key='topic-run-recovery';
set local request.jwt.claims='{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $recovery$
declare v jsonb;
begin
 v:=tongs.claim_barstock_discovery_refresh('93000000-0000-4000-8000-000000000001',1,'manual','topic-run-recovery','lease-new');
 if v->>'outcome'<>'claimed' or coalesce((v->>'recovered')::boolean,false) is not true then raise exception 'expired lease did not recover: %',v;end if;
end
$recovery$;
reset role;
do $recovery_count$
begin
 if (select attempt_count from tongs.barstock_discovery_runs where operation_key='topic-run-recovery')<>2 then raise exception 'lease recovery attempt was not bounded';end if;
end
$recovery_count$;

rollback;
