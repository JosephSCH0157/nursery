begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('57000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aggregate-one@example.test','',now(),now(),now()),
('57000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aggregate-two@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name) values
('57000000-0000-4000-8000-000000000020','Aggregate workspace one'),
('57000000-0000-4000-8000-000000000021','Aggregate workspace two');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

insert into tongs.restricted_beta_cost_evidence_revisions(id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,hard_cap_scope,notes) values
('57000000-0000-4000-8000-000000000030','openai.text.hearth_chat',9,'synthetic_test','complete','isolated fake OpenAI',now()-interval '1 minute',now()+interval '1 day','one fake attempt','synthetic'),
('57000000-0000-4000-8000-000000000031','runway.video',9,'synthetic_test','complete','isolated fake Runway',now()-interval '1 minute',now()+interval '1 day','one fake submission','synthetic');
insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason)
values('57000000-0000-4000-8000-000000000040','test',9,'active',1000,0,2,60,3600,'isolated shared-capacity proof only');
insert into tongs.restricted_beta_policy_capabilities(id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes) values
('57000000-0000-4000-8000-000000000041','57000000-0000-4000-8000-000000000040','openai.text.hearth_chat','covered','57000000-0000-4000-8000-000000000030',1,1,600,100,0,'["interactive","retry","recovery"]','fake-openai','synthetic'),
('57000000-0000-4000-8000-000000000042','57000000-0000-4000-8000-000000000040','runway.video','covered','57000000-0000-4000-8000-000000000031',1,1,500,0,0,'["interactive","recovery"]','fake-runway','synthetic');

do $$ declare result jsonb; begin
 result:=tongs.reserve_restricted_beta_exposure('57000000-0000-4000-8000-000000000050','57000000-0000-4000-8000-000000000040','openai.text.hearth_chat','aggregate-openai-operation','57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000020',repeat('a',64),'fake-openai','test_customer','opaque-openai','simulated','interactive',800,600,0,0,0,0,1,'aggregate-openai-reserved');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'OpenAI hold failed: %',result; end if;
 -- Lease expiry is not a release event. The migration-level test also proves
 -- the aggregate query contains no created-at rolling-window filter.
 perform pg_sleep(2);
 result:=tongs.reserve_restricted_beta_exposure('57000000-0000-4000-8000-000000000051','57000000-0000-4000-8000-000000000040','runway.video','aggregate-runway-operation','57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000021',repeat('b',64),'fake-runway','test_customer','opaque-runway','simulated','interactive',700,500,0,0,0,0,60,'aggregate-runway-reserved');
 if result->>'reason'<>'aggregate_exposure_exhausted' then raise exception 'cross-route/user/workspace capacity was exceeded: %',result; end if;
 result:=tongs.begin_restricted_beta_attempt('57000000-0000-4000-8000-000000000050','aggregate-openai-attempt',1::smallint,'interactive');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'attempt did not authorize: %',result; end if;
 result:=tongs.record_restricted_beta_exposure_outcome('57000000-0000-4000-8000-000000000050','aggregate-openai-ambiguous','ambiguous',null,null,0,0,'{"transmitted":"unknown"}');
 result:=tongs.begin_restricted_beta_attempt('57000000-0000-4000-8000-000000000050','aggregate-openai-resubmit',1::smallint,'retry');
 if result->>'reason'<>'reconciliation_only' then raise exception 'ambiguous operation could resubmit: %',result; end if;
 result:=tongs.record_restricted_beta_exposure_outcome('57000000-0000-4000-8000-000000000050','aggregate-openai-recovery','supplier_recovery',null,100,0,0,'{}');
 result:=tongs.begin_restricted_beta_attempt('57000000-0000-4000-8000-000000000050','aggregate-openai-after-recovery',1::smallint,'retry');
 if result->>'reason'<>'reconciliation_only' then raise exception 'supplier recovery reopened provider execution: %',result; end if;
 result:=tongs.reserve_restricted_beta_exposure('57000000-0000-4000-8000-000000000051','57000000-0000-4000-8000-000000000040','runway.video','aggregate-runway-operation','57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000021',repeat('b',64),'fake-runway','test_customer','opaque-runway','simulated','interactive',700,500,0,0,0,0,60,'aggregate-runway-after-recovery');
 if result->>'reason'<>'aggregate_exposure_exhausted' then raise exception 'partial recovery incorrectly released full capacity: %',result; end if;
 result:=tongs.record_restricted_beta_exposure_outcome('57000000-0000-4000-8000-000000000050','aggregate-openai-reconciled','reconciled',500,null,0,0,'{"authoritative":true}');
 result:=tongs.reserve_restricted_beta_exposure('57000000-0000-4000-8000-000000000051','57000000-0000-4000-8000-000000000040','runway.video','aggregate-runway-operation','57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000021',repeat('b',64),'fake-runway','test_customer','opaque-runway','simulated','interactive',700,500,0,0,0,0,60,'aggregate-runway-after-reconcile');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'authoritative reconcile did not release capacity: %',result; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='57000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if has_table_privilege('authenticated','tongs.paid_operation_aggregate_bindings','select')
    or has_table_privilege('authenticated','tongs.paid_execution_aggregate_assignments','select') then raise exception 'aggregate financial data exposed'; end if;
 begin perform tongs.read_paid_execution_aggregate_admin(); raise exception 'customer accessed aggregate operator report'; exception when insufficient_privilege then null; end;
end $$;

rollback;
